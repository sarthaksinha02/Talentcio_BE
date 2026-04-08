require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const connectDB = require('./db');
const requestTiming = require('./src/middlewares/requestTiming');

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
    'https://telentcio.vercel.app',
    'https://talentcio.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5000'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        const isAllowed = allowedOrigins.some(allowed =>
            origin === allowed || origin.includes('localhost') || origin.includes('127.0.0.1')
        );
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log('Blocked by CORS:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-tenant-id']
};

// Setup Socket.IO
const io = new Server(server, {
    cors: corsOptions
});

// Expose io to routes
app.set('io', io);

// Socket Event Listeners
io.on('connection', (socket) => {
    // console.log(`User connected to socket: ${socket.id}`);

    // Join a private room for the user to receive targeted notifications
    socket.on('join_user_room', (userId) => {
        if (userId) {
            socket.join(userId.toString());
            // console.log(`Socket ${socket.id} joined personal room ${userId}`);
        }
    });

    // Join a specific query room for real-time ticket updates
    socket.on('join_query', (queryId) => {
        socket.join(queryId);
        // console.log(`Socket ${socket.id} joined room ${queryId}`);
    });

    socket.on('disconnect', () => {
        // console.log(`User disconnected from socket: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 5000;

// Log slow MongoDB queries so we can identify true database bottlenecks.
const originalExec = mongoose.Query.prototype.exec;
mongoose.Query.prototype.exec = async function (...args) {
    const start = process.hrtime.bigint();
    try {
        return await originalExec.apply(this, args);
    } finally {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        if (durationMs >= 100) {
            const query = typeof this.getQuery === 'function' ? this.getQuery() : {};
            const options = this.options || {};
            console.log(`[MONGO] ${this.model?.modelName || 'UnknownModel'}.${this.op} ${durationMs.toFixed(1)}ms query=${JSON.stringify(query)} options=${JSON.stringify(options)}`);
        }
    }
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestTiming);

// Models (Register Schemas)
require('./src/models/Permission');
require('./src/models/Role');
require('./src/models/User');
require('./src/models/EmployeeProfile');
require('./src/models/AuditLog');
require('./src/models/Attendance');
require('./src/models/Project');
require('./src/models/Project');
require('./src/models/Timesheet');
require('./src/models/LeaveConfig');
require('./src/models/LeaveBalance');
require('./src/models/LeaveRequest');
require('./src/models/Candidate');
require('./src/models/InterviewWorkflow');
require('./src/models/Notification');
require('./src/models/Company');
require('./src/models/Plan');
require('./src/models/ActivityLog');
require('./src/models/SuperAdminUser');
require('./src/models/OnboardingEmployee');

// Services
const syncPermissions = require('./src/services/permissionSync');
const startEscalationCron = require('./src/services/escalationCron');
const startAutoCheckoutCron = require('./src/services/attendanceAutoCheckoutCron');
const cleanupStaleIndexes = require('./src/services/indexCleanup');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const timesheetRoutes = require('./src/routes/timesheetRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const projectRoutes = require('./src/routes/projectRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const holidayRoutes = require('./src/routes/holidayRoutes');
const leaveRoutes = require('./src/routes/leaveRoutes');
const dossierRoutes = require('./src/routes/dossierRoutes');
const talentAcquisitionRoutes = require('./src/routes/talentAcquisitionRoutes');
const candidateRoutes = require('./src/routes/candidateRoutes');
const workflowRoutes = require('./src/routes/workflowRoutes');
const meetingRoutes = require('./src/routes/meetingRoutes');
const helpdeskRoutes = require('./src/routes/helpdeskRoutes');
const interviewWorkflowRoutes = require('./src/routes/interviewWorkflowRoutes');
const notificationRoutes = require('./src/routes/notificationRoutes');
const discussionRoutes = require('./src/routes/discussionRoutes');
const onboardingRoutes = require('./src/routes/onboardingRoutes');

// Super Admin Routes
const superAdminAuthRoutes = require('./src/routes/superAdminRoutes');
const companyRoutes = require('./src/routes/companyRoutes');
const globalUserRoutes = require('./src/routes/globalUserRoutes');
const analyticsRoutes = require('./src/routes/analyticsRoutes');
const planRoutes = require('./src/routes/planRoutes');
const superAdminMiscRoutes = require('./src/routes/superAdminMiscRoutes');

// Multi-tenant Middleware
const tenantMiddleware = require('./src/middlewares/tenantMiddleware');

// Database Connection & Init
const initServer = async () => {
    await connectDB();
    await cleanupStaleIndexes();
    await syncPermissions();
    startEscalationCron(io); // Start the background Helpdesk escalation job
    startAutoCheckoutCron(); // Start the background auto-checkout job
};
initServer();

// Mount Routes (Tenant-Facing)
app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/superadmin')) return next();
    tenantMiddleware(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/timesheet', timesheetRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/dossier', dossierRoutes);
app.use('/api/ta', talentAcquisitionRoutes);
app.use('/api/ta/candidates', candidateRoutes);
app.use('/api/ta/interview-workflows', interviewWorkflowRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/helpdesk', helpdeskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/discussions', discussionRoutes);
app.use('/api/onboarding', onboardingRoutes);

// Super Admin API Namespace
app.use('/api/superadmin/auth', superAdminAuthRoutes);
app.use('/api/superadmin/companies', companyRoutes);
app.use('/api/superadmin/users', globalUserRoutes);
app.use('/api/superadmin/analytics', analyticsRoutes);
app.use('/api/superadmin/plans', planRoutes);
app.use('/api/superadmin', superAdminMiscRoutes);

app.get('/', (req, res) => {
    res.json({ message: 'TalentCio API is running' });
});

// Start Server
server.listen(PORT, () => {
    console.log(`Server & Socket.IO running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    // server.close(() => process.exit(1));
});
