const Attendance = require('../models/Attendance');
const Timesheet = require('../models/Timesheet');
const User = require('../models/User');
const Project = require('../models/Project');
const { startOfDay, endOfDay, format } = require('date-fns');

// @desc    Update Attendance (Regularize)
// @route   PUT /api/attendance/:id
// @access  Private
const updateAttendance = async (req, res) => {
    const { clockIn, clockOut } = req.body;
    try {
        const attendance = await Attendance.findById(req.params.id);

        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        // Authorization: User can edit their own (if policy allows) or Admin/Manager
        const isOwner = attendance.user.toString() === req.user._id.toString();
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');

        // Check for specific permission
        const hasUpdatePermission = req.user.roles.some(r => r.permissions.some(p => p.key === 'attendance.update_self'));

        if (isOwner && !isAdmin && !hasUpdatePermission) {
            return res.status(403).json({ message: 'You do not have permission to edit your attendance.' });
        }

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to edit this attendance record.' });
        }

        if (attendance.approvalStatus === 'APPROVED' && !req.user.roles.includes('Admin')) {
            return res.status(403).json({ message: 'Cannot edit an approved attendance record.' });
        }

        // Location Check for Regularization
        const location = req.body?.location;
        if (clockIn || clockOut) {
            if (!req.user.roles.includes('Admin')) { // Even for regularization, we might want to track location if possible, but strictly require for non-Admins?
                // Actually, if it's "manual", we usually don't have location. 
                // But if they are using it as a bypass, we should at least log it.
            }
        }

        // Check if Timesheet is locked
        const month = attendance.date.toISOString().slice(0, 7); // YYYY-MM
        const timesheet = await Timesheet.findOne({ user: attendance.user, month });

        if (timesheet && (timesheet.status === 'SUBMITTED' || timesheet.status === 'APPROVED')) {
            return res.status(400).json({ message: 'Cannot edit attendance for a submitted or approved timesheet.' });
        }

        // Check Joining Date Restriction
        if (req.user.joiningDate && !isAdmin) {
            // Use new Date(clockIn) or existing attendance.date
            const targetDate = clockIn ? new Date(clockIn) : attendance.date;

            const joiningStart = startOfDay(new Date(req.user.joiningDate));
            const targetStart = startOfDay(targetDate);

            if (targetStart < joiningStart) {
                return res.status(400).json({ message: 'Cannot edit attendance before joining date.' });
            }
        }

        if (clockIn) {
            attendance.clockIn = new Date(clockIn);
            attendance.clockInIST = new Date(clockIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        }

        if (clockOut) {
            attendance.clockOut = new Date(clockOut);
            attendance.clockOutIST = new Date(clockOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        }

        if (location && typeof location.lat === 'number') {
            attendance.location = {
                lat: location.lat,
                lng: location.lng,
                accuracy: location.accuracy
            };
        }

        await attendance.save();
        res.json(attendance);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create Manual Attendance Entry
// @route   POST /api/attendance
// @access  Private
const createAttendance = async (req, res) => {
    const { date, clockIn, clockOut, userId } = req.body;
    try {
        if (!date) {
            return res.status(400).json({ message: 'Date is required' });
        }

        if (!clockIn || !clockOut) {
            return res.status(400).json({ message: 'Both Check-In and Check-Out times are required for manual entry.' });
        }

        // If creating a 'PRESENT' entry (which requires both clockIn and clockOut), location is required
        if (clockIn && clockOut) {
            const location = req.body?.location;
            if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
                return res.status(400).json({ message: 'Device location is required to manually create a PRESENT status.' });
            }
            if (typeof location.accuracy !== 'number' || location.accuracy <= 0 || location.accuracy > 300) {
                return res.status(400).json({ message: 'Low location accuracy. Precise location is required for manual attendance.' });
            }
            // Validate coordinate ranges
            if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
                return res.status(400).json({ message: 'Invalid location coordinates provided. Latitude must be between -90 and 90, and longitude between -180 and 180.' });
            }
        }

        const attendanceDate = new Date(date);

        // Authorization
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');
        const hasUpdatePermission = req.user.roles.some(r => r.permissions.some(p => p.key === 'attendance.update_self'));

        if (!isAdmin && !hasUpdatePermission) {
            return res.status(403).json({ message: 'You do not have permission to create attendance records.' });
        }

        // Target User
        let targetUserId = req.user._id;
        if (userId && isAdmin) {
            targetUserId = userId;
        }

        // Check lock status via Timesheet
        const month = attendanceDate.toISOString().slice(0, 7); // YYYY-MM
        const timesheet = await Timesheet.findOne({ user: targetUserId, month });

        if (timesheet && (timesheet.status === 'SUBMITTED' || timesheet.status === 'APPROVED')) {
            if (!isAdmin) {
                return res.status(400).json({ message: 'Cannot add attendance to a submitted or approved timesheet.' });
            }
        }

        // Check Joining Date Restriction
        const targetUser = await User.findById(targetUserId); // Need to fetch target user if overridden
        if (targetUser?.joiningDate && !isAdmin) {
            const joiningStart = startOfDay(new Date(targetUser.joiningDate));
            const attendanceStart = startOfDay(attendanceDate);
            if (attendanceStart < joiningStart) {
                return res.status(400).json({ message: 'Cannot create attendance before joining date.' });
            }
        }

        // Check duplicate
        const start = startOfDay(attendanceDate);
        const end = endOfDay(attendanceDate);

        const existing = await Attendance.findOne({
            user: targetUserId,
            date: { $gte: start, $lte: end }
        });

        if (existing) {
            return res.status(400).json({ message: 'Attendance record already exists for this date.' });
        }

        // Create
        const newAttendance = new Attendance({
            user: targetUserId,
            date: attendanceDate,
            status: 'PRESENT',
            clockIn: clockIn ? new Date(clockIn) : null,
            clockOut: clockOut ? new Date(clockOut) : null,
            clockInIST: clockIn ? new Date(clockIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
            clockOutIST: clockOut ? new Date(clockOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
            location: req.body.location ? {
                lat: req.body.location.lat,
                lng: req.body.location.lng,
                accuracy: req.body.location.accuracy
            } : undefined,
            isManualEntry: true
        });

        await newAttendance.save();
        res.status(201).json(newAttendance);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};


// Helper to get time in IST
const getISTTime = () => {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

// Helper to get Start of Day in IST (returned as a Date object)
const getStartOfDayIST = () => {
    const now = new Date();
    // Create date string for IST
    const istString = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    return new Date(istString); // This gives 00:00:00 of that day in local server time, effectively normalizing the "day" bucket
};

// @desc    Get today's attendance status
// @route   GET /api/attendance/today
// @access  Private
const getTodayStatus = async (req, res) => {
    try {
        const today = getStartOfDayIST();

        const attendance = await Attendance.findOne({
            user: req.user._id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        res.json(attendance || { status: 'Not Clocked In' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Clock In
// @route   POST /api/attendance/clock-in
// @access  Private
const clockIn = async (req, res) => {
    console.log('[DEBUG] Clock-In Request:', { body: req.body, user: req.user?._id });
    try {
        const today = getStartOfDayIST();

        // Check Joining Date
        if (req.user.joiningDate && today < new Date(req.user.joiningDate)) {
            return res.status(400).json({ message: 'Cannot clock in before joining date.' });
        }

        // Check if already exists for today (IST)
        let attendance = await Attendance.findOne({
            user: req.user._id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (attendance && attendance.clockIn) {
            return res.status(400).json({ message: 'Already clocked in for today' });
        }

        if (!attendance) {
            attendance = new Attendance({
                user: req.user._id,
                date: today,
                status: 'PRESENT'
            });
        }

        // strictly require location data
        const location = req.body?.location;
        if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
            return res.status(400).json({ message: 'Device location is strictly required to clock in. Please enable location services.' });
        }

        // Validate accuracy (Reject accuracy > 300m or missing)
        // Ensure accuracy is a clear number and not 0 (which might be a default/error)
        if (typeof location.accuracy !== 'number' || location.accuracy <= 0 || location.accuracy > 300) {
            return res.status(400).json({ message: 'Low location accuracy detected. Please turn on your system GPS for a precise clock-in.' });
        }

        // Validate coordinate ranges
        if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
            return res.status(400).json({ message: 'Invalid location coordinates provided. Latitude must be between -90 and 90, and longitude between -180 and 180.' });
        }

        attendance.clockIn = new Date();
        attendance.clockInIST = getISTTime();
        attendance.ipAddress = req.ip;

        // Save full location including accuracy
        attendance.location = {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy
        };

        attendance.userAgent = req.headers['user-agent'] || 'Unknown';

        await attendance.save();

        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Clock Out
// @route   POST /api/attendance/clock-out
// @access  Private
const clockOut = async (req, res) => {
    try {
        const today = getStartOfDayIST();

        // Check Joining Date
        if (req.user.joiningDate && today < new Date(req.user.joiningDate)) {
            return res.status(400).json({ message: 'Cannot clock out before joining date.' });
        }

        let attendance = await Attendance.findOne({
            user: req.user._id,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (!attendance || !attendance.clockIn) {
            return res.status(400).json({ message: 'You have not clocked in yet' });
        }

        if (attendance.clockOut) {
            return res.status(400).json({ message: 'Already clocked out for today' });
        }

        const now = new Date();
        attendance.clockOut = now;
        attendance.clockOutIST = getISTTime();

        // strictly require location data
        const location = req.body?.location;
        if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
            return res.status(400).json({ message: 'Device location is strictly required to clock out. Please enable location services.' });
        }

        // Validate accuracy
        if (typeof location.accuracy !== 'number' || location.accuracy <= 0 || location.accuracy > 300) {
            return res.status(400).json({ message: 'Low location accuracy detected. Please turn on your system GPS for a precise clock-out.' });
        }

        // Validate coordinate ranges
        if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
            return res.status(400).json({ message: 'Invalid location coordinates provided. Latitude must be between -90 and 90, and longitude between -180 and 180.' });
        }

        // Capture check out location specifically
        attendance.clockOutLocation = {
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy
        };

        // Add clock-out location to the attendance record (as an array or separate field if preferred, but usually we just update the same location field or keep the initial one, let's keep the initial one but we ensure the check passes)
        // If we want to capture check out location specifically, we'd need a schema change. Assuming the main requirement is just that they MUST have location on to trigger the endpoint.

        await attendance.save();

        // --- AUTO SYNC TO TIMESHEET ---
        try {
            // 1. Calculate Hours
            const durationMs = now - new Date(attendance.clockIn);
            const hours = parseFloat((durationMs / (1000 * 60 * 60)).toFixed(2)); // Round to 2 decimals

            if (hours > 0) {
                // 2. Find or Create "General Work" Project
                let generalProject = await Project.findOne({
                    name: 'General Work'
                });

                if (!generalProject) {
                    generalProject = await Project.create({
                        name: 'General Work',
                        description: 'Default project for attendance logs',
                        isActive: true
                    });
                }

                // 3. Find/Create Timesheet
                const month = format(now, 'yyyy-MM');
                let timesheet = await Timesheet.findOne({
                    user: req.user._id,
                    month: month
                });

                if (!timesheet) {
                    timesheet = new Timesheet({
                        user: req.user._id,
                        month: month,
                        entries: []
                    });
                }

                // 4. Upsert Entry
                // Check if entry for today & general project exists
                const existingIndex = timesheet.entries.findIndex(
                    e => e.date.toISOString().split('T')[0] === now.toISOString().split('T')[0]
                        && e.project.toString() === generalProject._id.toString()
                );

                if (existingIndex > -1) {
                    timesheet.entries[existingIndex].hours = hours; // Update hours
                } else {
                    timesheet.entries.push({
                        date: now,
                        project: generalProject._id,
                        hours: hours,
                        description: 'Auto-logged from Attendance'
                    });
                }

                await timesheet.save();
                console.log(`Auto-logged ${hours} hours to timesheet for user ${req.user._id}`);
            }
        } catch (syncError) {
            console.error('Timesheet Sync Error:', syncError);
            // Don't fail the clock-out request, just log error and flag it
            attendance.timesheetSyncError = true;
            await attendance.save();
        }
        // ------------------------------

        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Attendance History (My Attendance)
// @route   GET /api/attendance/me
// @access  Private
const getMyAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.find({ user: req.user._id })
            .sort({ date: -1 })
            .limit(30);

        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Attendance by Month
// @route   GET /api/attendance/history
// @access  Private
const getAttendanceByMonth = async (req, res) => {
    const { year, month, userId } = req.query; // 1-indexed month (1 = Jan)

    if (!year || !month) {
        return res.status(400).json({ message: 'Year and month are required' });
    }

    try {
        let targetUserId = req.user._id;

        // processing for view other user
        if (userId && userId !== req.user._id.toString()) {
            // Check Authorization
            const isAdmin = req.user.roles.some(r => r.name === 'Admin');

            // Allow if Admin
            if (isAdmin) {
                targetUserId = userId;
            } else {
                // Allow if Manager
                const targetUser = await User.findById(userId);
                if (targetUser && targetUser.reportingManagers.some(m => m.toString() === req.user._id.toString())) {
                    targetUserId = userId;
                } else {
                    return res.status(403).json({ message: 'Not authorized to view this user\'s attendance' });
                }
            }
        }

        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

        const attendance = await Attendance.find({
            user: targetUserId,
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).sort({ date: 1 });

        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const approveAttendance = async (req, res) => {
    const { status, reason } = req.body; // 'APPROVED' or 'REJECTED'
    try {
        const attendance = await Attendance.findById(req.params.id)
            .populate('user', 'reportingManagers firstName lastName');

        if (!attendance) {
            return res.status(404).json({ message: 'Attendance record not found' });
        }

        // Check Permissions: Admin OR One of Reporting Managers
        const targetUser = attendance.user;
        const isManager = targetUser.reportingManagers?.some(
            managerId => managerId.toString() === req.user._id.toString()
        );

        // Helper to check permissions
        const hasPermission = (key) => req.user.roles.some(r => r.permissions.some(p => p.key === key));
        const isAdmin = req.user.roles.some(r => r.name === 'Admin') || hasPermission('attendance.approve');

        if (!isManager && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to approve this attendance' });
        }

        attendance.approvalStatus = status;
        attendance.approvedBy = req.user._id;
        if (reason) attendance.rejectionReason = reason;

        await attendance.save();
        res.json(attendance);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Pending Attendance Requests (For Manager)
// @route   GET /api/attendance/approvals
// @access  Private
const getPendingRequests = async (req, res) => {
    try {
        // Find users who have this user as ONE OF their reporting managers
        const User = require('../models/User');
        const subordinates = await User.find({ reportingManagers: req.user._id }).select('_id');
        const subordinateIds = subordinates.map(u => u._id);

        const requests = await Attendance.find({
            user: { $in: subordinateIds },
            approvalStatus: 'PENDING'
        })
            .populate('user', 'firstName lastName email employeeCode')
            .sort({ date: -1 });

        res.json(requests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Team Attendance Report (For Excel Export)
// @route   GET /api/attendance/team-report
// @access  Private
const getTeamAttendanceReport = async (req, res) => {
    const { year, month } = req.query;
    try {
        if (!year || !month) return res.status(400).json({ message: 'Year and month required' });

        // 1. Find Subordinates & Self if Admin/Manager
        const User = require('../models/User');

        let teamIds = [];
        if (req.user.roles.some(r => r.name === 'Admin')) {
            const allUsers = await User.find({}).select('_id');
            teamIds = allUsers.map(u => u._id);
        } else {
            const subordinates = await User.find({ reportingManagers: req.user._id }).select('_id');
            teamIds = subordinates.map(u => u._id);
        }

        if (teamIds.length === 0) {
            return res.json({ teamMembers: [], attendanceRecords: [] });
        }

        // 2. Fetch Users
        const teamMembers = await User.find({ _id: { $in: teamIds } })
            .select('firstName lastName employeeCode joiningDate email')
            .sort({ firstName: 1 });

        // 3. Fetch Attendance
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

        const attendanceRecords = await Attendance.find({
            user: { $in: teamIds },
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }).sort({ date: 1 });

        // 4. Fetch Approved Leaves
        const Leave = require('../models/LeaveRequest');
        const leaveRecords = await Leave.find({
            user: { $in: teamIds },
            status: 'Approved',
            $or: [
                { startDate: { $lte: endDate }, endDate: { $gte: startDate } }
            ]
        });

        // 5. Fetch Holidays
        const Holiday = require('../models/Holiday');
        const holidays = await Holiday.find({
            date: {
                $gte: startDate,
                $lte: endDate
            }
        });

        res.json({
            teamMembers,
            attendanceRecords,
            leaveRecords,
            holidays
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getTodayStatus,
    clockIn,
    clockOut,
    getMyAttendance,
    getAttendanceByMonth,
    approveAttendance,
    getPendingRequests,
    updateAttendance,
    createAttendance,
    getTeamAttendanceReport
};
