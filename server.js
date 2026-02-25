require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const connectDB = require('./db');

const app = express();
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
    cors: {
        origin: "*", // Or specific frontend domains in production
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    }
});

// Expose io to routes
app.set('io', io);

// Socket Event Listeners
io.on('connection', (socket) => {
    // console.log(`User connected to socket: ${socket.id}`);

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

// Middleware
app.use(cors());
app.use(express.json());

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

// Services
const syncPermissions = require('./src/services/permissionSync');
const startEscalationCron = require('./src/services/escalationCron');

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

// Database Connection & Init
const initServer = async () => {
    await connectDB();
    await syncPermissions();
    startEscalationCron(); // Start the background Helpdesk escalation job
};
initServer();

// Mount Routes
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
