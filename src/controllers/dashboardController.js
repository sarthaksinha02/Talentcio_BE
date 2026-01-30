const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Project = require('../models/Project'); // Optional, if we want project stats

// @desc    Get Dashboard Statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const companyId = req.user.company;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // 1. Total Employees
        const totalEmployees = await User.countDocuments({
            company: companyId,
            isActive: true
        });

        // 2. Attendance Stats for Today
        const presentToday = await Attendance.countDocuments({
            company: companyId,
            date: { $gte: today, $lt: tomorrow },
            status: { $in: ['PRESENT', 'HALF_DAY'] }
        });

        // Simple logic: If clocked in before 9:30 AM (Example), count as On Time
        // For now, we'll just track "Present" vs "Total" to calculate "Absent"
        const absentToday = totalEmployees - presentToday;

        // 3. Pending Approvals (Leaves/Attendance)
        // Assuming we look for 'PENDING' status in Attendance (which handles requests)
        const pendingRequests = await Attendance.countDocuments({
            company: companyId,
            approvalStatus: 'PENDING'
        });

        // 4. Recent Activity (Last 5 Check-ins)
        const recentActivity = await Attendance.find({
            company: companyId,
            clockIn: { $exists: true }
        })
            .sort({ clockIn: -1 })
            .limit(5)
            .populate('user', 'firstName lastName employeeCode department');

        // Transform Recent Activity
        const recentActivityFormatted = recentActivity.map(record => ({
            id: record._id,
            user: {
                name: `${record.user.firstName} ${record.user.lastName}`,
                role: record.user.department || 'Employee', // Fallback
                avatar: null // Placeholder
            },
            time: record.clockIn,
            status: record.status
        }));

        res.json({
            stats: {
                totalEmployees,
                presentToday,
                absentToday,
                pendingRequests
            },
            recentActivity: recentActivityFormatted
        });

    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: 'Server Error fetching dashboard data' });
    }
};

module.exports = {
    getDashboardStats
};
