require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Models (Register Schemas)
require('./src/models/Company');
require('./src/models/Permission');
require('./src/models/Role');
require('./src/models/User');
require('./src/models/AuditLog');
require('./src/models/Attendance');
require('./src/models/Project');
require('./src/models/Project');
require('./src/models/Timesheet');
require('./src/models/LeaveConfig');
require('./src/models/LeaveBalance');
require('./src/models/LeaveRequest');

// Services
const syncPermissions = require('./src/services/permissionSync');

// Routes
const authRoutes = require('./src/routes/authRoutes');
const attendanceRoutes = require('./src/routes/attendanceRoutes');
const timesheetRoutes = require('./src/routes/timesheetRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const projectRoutes = require('./src/routes/projectRoutes');
const dashboardRoutes = require('./src/routes/dashboardRoutes');
const holidayRoutes = require('./src/routes/holidayRoutes');
const leaveRoutes = require('./src/routes/leaveRoutes');

// Database Connection & Init
const initServer = async () => {
    await connectDB();
    await syncPermissions();
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

app.get('/', (req, res) => {
    res.json({ message: 'TalentCio API is running' });
});

// Start Server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log(`Error: ${err.message}`);
    // Close server & exit process
    // server.close(() => process.exit(1));
});
