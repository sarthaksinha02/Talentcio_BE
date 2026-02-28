const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Project = require('../models/Project');

// @desc    Get Dashboard Statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Run all independent DB queries in parallel
        const [
            totalEmployees,
            presentToday,
            pendingRequests,
            allUsers,
            todaysAttendance,
            allProjects
        ] = await Promise.all([
            User.countDocuments({ isActive: true }),
            Attendance.countDocuments({
                date: { $gte: today, $lt: tomorrow },
                status: { $in: ['PRESENT', 'HALF_DAY'] }
            }),
            Attendance.countDocuments({ approvalStatus: 'PENDING' }),
            User.find({ isActive: true })
                .select('firstName lastName employeeCode department employmentType roles')
                .populate('roles', 'name'),
            Attendance.find({ date: { $gte: today, $lt: tomorrow } }),
            Project.find({})
                .sort({ updatedAt: -1 })
                .limit(10)
                .select('name isActive status dueDate')
        ]);

        const absentToday = totalEmployees - presentToday;

        // Map users to their today's attendance status
        const dailyStatusList = allUsers.map(user => {
            const record = todaysAttendance.find(a => a.user.toString() === user._id.toString());
            const roleName = user.roles?.length > 0 ? user.roles[0].name : 'Employee';

            return {
                id: user._id,
                user: {
                    name: `${user.firstName} ${user.lastName}`,
                    role: roleName,
                    employmentType: user.employmentType || 'Employee',
                    avatar: null
                },
                time: record ? record.clockIn : null,
                clockOut: record ? record.clockOut : null,
                status: record ? (record.status || 'PRESENT') : 'ABSENT',
                location: record ? record.location : null,
                clockOutLocation: record ? record.clockOutLocation : null
            };
        });

        // Map projects to safe structure
        const projectsFormatted = allProjects.map(p => ({
            _id: p._id,
            name: p.name,
            status: p.status || (p.isActive ? 'Active' : 'Inactive'),
            deadline: p.dueDate
        }));

        res.json({
            stats: { totalEmployees, presentToday, absentToday, pendingRequests },
            recentActivity: dailyStatusList,
            projects: projectsFormatted
        });

    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: 'Server Error fetching dashboard data' });
    }
};

module.exports = {
    getDashboardStats
};
