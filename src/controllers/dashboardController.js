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

        // 1. Total Employees
        const totalEmployees = await User.countDocuments({
            isActive: true
        });

        // 2. Attendance Stats for Today
        const presentToday = await Attendance.countDocuments({
            date: { $gte: today, $lt: tomorrow },
            status: { $in: ['PRESENT', 'HALF_DAY'] }
        });

        // Simple logic: If clocked in before 9:30 AM (Example), count as On Time
        // For now, we'll just track "Present" vs "Total" to calculate "Absent"
        const absentToday = totalEmployees - presentToday;

        // 3. Pending Approvals (Leaves/Attendance)
        // Assuming we look for 'PENDING' status in Attendance (which handles requests)
        const pendingRequests = await Attendance.countDocuments({
            approvalStatus: 'PENDING'
        });

        // 4. Daily Attendance List (All Employees)
        const allUsers = await User.find({
            isActive: true
        }).select('firstName lastName employeeCode department employmentType roles')
          .populate('roles', 'name');

        const todaysAttendance = await Attendance.find({
            date: { $gte: today, $lt: tomorrow }
        });

        // Map users to status
        const dailyStatusList = allUsers.map(user => {
            const record = todaysAttendance.find(a => a.user.toString() === user._id.toString());
            let status = 'ABSENT';
            let checkInTime = null;
            let location = null;
            let clockOutLocation = null;

            if (record) {
                status = record.status || 'PRESENT';
                checkInTime = record.clockIn;
                location = record.location;
                clockOutLocation = record.clockOutLocation;
            }

            // Get the first role name if it exists, otherwise use 'Employee'
            let roleName = 'Employee';
            if (user.roles && user.roles.length > 0) {
                roleName = user.roles[0].name;
            }

            return {
                id: user._id,
                user: {
                    name: `${user.firstName} ${user.lastName}`,
                    role: roleName,
                    employmentType: user.employmentType || 'Employee',
                    avatar: null
                },
                time: checkInTime,
                clockOut: record ? record.clockOut : null,
                status: status,
                location: location,
                clockOutLocation: clockOutLocation
            };
        });

        // 5. All Projects
        const allProjects = await Project.find({})
            .sort({ updatedAt: -1 })
            .limit(10)
            .select('name isActive status dueDate');

        // Map projects to ensure safe structure
        const projectsFormatted = allProjects.map(p => ({
            _id: p._id,
            name: p.name,
            status: p.status || (p.isActive ? 'Active' : 'Inactive'),
            deadline: p.dueDate
        }));

        res.json({
            stats: {
                totalEmployees,
                presentToday,
                absentToday,
                pendingRequests
            },
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
