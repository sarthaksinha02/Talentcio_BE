const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Project = require('../models/Project');

// Simple in-memory cache — avoids re-running all DB queries on every page visit
// TTL: 30 seconds. Cache key includes today's date so it auto-resets at midnight.
const cache = { key: null, data: null, expiresAt: 0 };
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

// @desc    Get Dashboard Statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cacheKey = today.toISOString();
        const now = Date.now();

        // Serve from cache if still fresh
        if (cache.key === cacheKey && now < cache.expiresAt) {
            return res.json(cache.data);
        }

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
                .select('firstName lastName employmentType roles')
                .populate('roles', 'name')
                .lean(),
            Attendance.find({ date: { $gte: today, $lt: tomorrow } })
                .select('user status clockIn clockOut location clockOutLocation')
                .lean(),
            Project.find({})
                .sort({ updatedAt: -1 })
                .limit(10)
                .select('name isActive status dueDate')
                .lean()
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

        const result = {
            stats: { totalEmployees, presentToday, absentToday, pendingRequests },
            recentActivity: dailyStatusList,
            projects: projectsFormatted
        };

        // Store in cache
        cache.key = cacheKey;
        cache.data = result;
        cache.expiresAt = now + CACHE_TTL_MS;

        res.json(result);

    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: 'Server Error fetching dashboard data' });
    }
};

// Call this whenever attendance/project data changes to force a fresh fetch
const invalidateDashboardCache = () => {
    cache.expiresAt = 0;
};

module.exports = {
    getDashboardStats,
    invalidateDashboardCache
};
