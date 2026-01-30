const Timesheet = require('../models/Timesheet');
const Project = require('../models/Project');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { startOfMonth, endOfMonth, format } = require('date-fns');
const WorkLog = require('../models/WorkLog');

// @desc    Get Current Month Timesheet
// @route   GET /api/timesheet/current
// @access  Private
const getCurrentTimesheet = async (req, res) => {
    try {
        const currentMonth = format(new Date(), 'yyyy-MM');

        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated (req.user missing)' });
        }

        let timesheet = await Timesheet.findOne({
            user: req.user._id,
            month: currentMonth
        });

        if (!timesheet) {
            // Create a draft if it doesn't exist
            timesheet = await Timesheet.create({
                user: req.user._id,
                company: req.user.company,
                month: currentMonth,
                status: 'DRAFT',
                rejectionReason: ''
            });
        }

        // Populate User and Supervisor (Explicitly fetch to ensure data availability)
        let fullUser = null;
        try {
            fullUser = await User.findById(req.user._id)
                .select('firstName lastName email employeeCode')
                .populate('reportingManagers', 'firstName lastName email');
        } catch (err) {
            console.error('Error populating user details:', err);
            // Fallback to basic req.user info if fetch fails
            fullUser = {
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                email: req.user.email,
                employeeCode: req.user.employeeCode
            };
        }

        // Fetch WorkLogs for this month (Single Source of Truth)
        const [year, month] = currentMonth.split('-');
        const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const end = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));

        const workLogs = await WorkLog.find({
            user: req.user._id,
            date: { $gte: start, $lte: end }
        }).populate({
            path: 'task',
            populate: {
                path: 'module',
                populate: { path: 'project' }
            }
        }).sort({ date: 1 });

        const entries = workLogs.map(log => ({
            _id: log._id,
            date: log.date,
            project: log.task?.module?.project || { name: 'Unknown Project' },
            module: log.task?.module,
            task: log.task,
            taskName: log.task?.name,
            hours: log.hours,
            description: log.description,
            status: log.status,
            rejectionReason: log.rejectionReason
        }));

        // Fetch Attendance for context (unchanged)
        const attendance = await Attendance.find({
            user: req.user._id,
            date: { $gte: start, $lte: end }
        }).select('date clockInIST clockOutIST duration clockIn clockOut');

        res.json({
            ...timesheet.toObject(),
            userDetails: fullUser, // Distinct key to avoid collision
            user: fullUser,        // Backup
            entries,
            attendanceLog: attendance
        });
    } catch (error) {
        console.error('getCurrentTimesheet Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Add Entry to Timesheet
// @route   POST /api/timesheet/entry
// @access  Private
const addEntry = async (req, res) => {
    // Deprecated/Placeholder logic
    try {
        return res.status(400).json({ message: 'Please log work through the Tasks/Attendance page.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Submit Timesheet
// @route   POST /api/timesheet/submit
// @access  Private
const submitTimesheet = async (req, res) => {
    const { month } = req.body;
    try {
        const timesheet = await Timesheet.findOne({
            user: req.user._id,
            month: month
        });

        if (!timesheet) {
            return res.status(404).json({ message: 'Timesheet not found' });
        }

        timesheet.status = 'SUBMITTED';
        await timesheet.save();

        res.json(timesheet);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get All Projects (for dropdown)
// @route   GET /api/timesheet/projects
// @access  Private
const getProjects = async (req, res) => {
    try {
        const projects = await Project.find({ company: req.user.company, isActive: true });
        res.json(projects);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create Dummy Project (Helper)
// @route   POST /api/timesheet/projects
// @access  Private (Admin)
const createProject = async (req, res) => {
    try {
        const project = await Project.create({
            ...req.body,
            company: req.user.company
        });
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};


// @desc    Get Specific User's Timesheet (Manager/Admin)
// @route   GET /api/timesheet/user/:userId
// @access  Private
const getUserTimesheet = async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const currentMonth = req.query.month || format(new Date(), 'yyyy-MM');

        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

        // 1. Check Permissions
        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isManager = targetUser.reportingManagers?.some(m => m.toString() === req.user._id.toString());
        const hasRole = (name) => req.user.roles && req.user.roles.some(r => r.name === name);
        const hasPermission = (key) => req.user.roles && req.user.roles.some(r => r.permissions && r.permissions.some(p => p.key === key));

        const isAdmin = hasRole('Admin') || hasPermission('timesheet.approve');

        if (!isManager && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized to view this timesheet' });
        }

        let timesheet = await Timesheet.findOne({
            user: targetUserId,
            month: currentMonth
        });

        // Fetch WorkLogs
        const [year, month] = currentMonth.split('-');
        const currentMonthIdx = parseInt(month) - 1;

        let start, end;
        if (!isNaN(currentMonthIdx)) {
            start = startOfMonth(new Date(parseInt(year), currentMonthIdx));
            end = endOfMonth(new Date(parseInt(year), currentMonthIdx));
        } else {
            start = startOfMonth(new Date());
            end = endOfMonth(new Date());
        }

        const workLogs = await WorkLog.find({
            user: targetUserId,
            date: { $gte: start, $lte: end }
        }).populate({
            path: 'task',
            populate: {
                path: 'module',
                populate: { path: 'project' }
            }
        }).sort({ date: 1 });

        const entries = workLogs.map(log => ({
            _id: log._id,
            date: log.date,
            project: log.task?.module?.project || { name: 'Unknown Project' },
            module: log.task?.module,
            task: log.task,
            taskName: log.task?.name,
            hours: log.hours,
            description: log.description,
            status: log.status,
            rejectionReason: log.rejectionReason
        }));

        let responseData = timesheet ? timesheet.toObject() : {
            month: currentMonth,
            status: 'NOT_STARTED'
        };

        // Ensure user is attached
        let fullTargetUser = null;
        try {
            fullTargetUser = await User.findById(targetUserId)
                .select('firstName lastName email employeeCode')
                .populate('reportingManagers', 'firstName lastName email');
        } catch (err) {
            console.error('Error fetching target user details:', err);
            // Fallback to what we already fetched
            fullTargetUser = targetUser;
        }

        responseData.userDetails = fullTargetUser;
        responseData.user = fullTargetUser;
        responseData.entries = entries;

        const attendance = await Attendance.find({
            user: targetUserId,
            date: { $gte: start, $lte: end }
        }).select('date clockInIST clockOutIST clockIn clockOut duration');

        responseData.attendanceLog = attendance;

        res.json(responseData);

    } catch (error) {
        console.error('getUserTimesheet Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Pending Timesheets (Manager View)
// @route   GET /api/timesheet/approvals
// @access  Private
const getPendingTimesheets = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ message: 'Unauthorized' });

        // Find subordinates (where I am one of the reporting managers)
        const subordinates = await User.find({ reportingManagers: req.user._id }).select('_id');
        const subordinateIds = subordinates.map(u => u._id);

        const timesheets = await Timesheet.find({
            user: { $in: subordinateIds },
            status: 'SUBMITTED'
        }).populate('user', 'firstName lastName email employeeCode')
            .sort({ month: -1 });

        res.json(timesheets);
    } catch (error) {
        console.error('getPendingTimesheets Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Approve/Reject Timesheet
// @route   PUT /api/timesheet/:id/approve
// @access  Private
const approveTimesheet = async (req, res) => {
    const { status, reason, type = 'FULL', rejectedEntryIds = [] } = req.body;
    try {
        const timesheet = await Timesheet.findById(req.params.id)
            .populate('user', 'reportingManagers');

        if (!timesheet) {
            return res.status(404).json({ message: 'Timesheet not found' });
        }

        const targetUser = timesheet.user;
        const isManager = targetUser.reportingManagers?.some(m => m.toString() === req.user._id.toString());

        const hasRole = (name) => req.user.roles && req.user.roles.some(r => r.name === name);
        const hasPermission = (key) => req.user.roles && req.user.roles.some(r => r.permissions && r.permissions.some(p => p.key === key));
        const isAdmin = hasRole('Admin') || hasPermission('timesheet.approve');

        if (!isManager && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const [year, month] = timesheet.month.split('-');
        const start = startOfMonth(new Date(parseInt(year), parseInt(month) - 1));
        const end = endOfMonth(new Date(parseInt(year), parseInt(month) - 1));

        if (status === 'REJECTED' && type === 'PARTIAL') {
            timesheet.status = 'REJECTED';
            timesheet.approver = req.user._id;
            timesheet.rejectionReason = "Partial Rejection: " + reason;

            if (rejectedEntryIds.length > 0) {
                await WorkLog.updateMany(
                    { _id: { $in: rejectedEntryIds } },
                    { $set: { status: 'REJECTED', rejectionReason: reason } }
                );
            }

        } else {
            timesheet.status = status;
            timesheet.approver = req.user._id;
            if (reason) timesheet.rejectionReason = reason;

            const entryStatus = status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
            const updateDoc = { status: entryStatus };
            if (status === 'REJECTED') updateDoc.rejectionReason = reason;

            await WorkLog.updateMany(
                {
                    user: targetUser._id,
                    date: { $gte: start, $lte: end }
                },
                { $set: updateDoc }
            );
        }

        await timesheet.save();
        res.json(timesheet);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update Timesheet Entry (Regularize)
// @route   PUT /api/timesheet/entry/:entryId
// @access  Private
const updateEntry = async (req, res) => {
    const { hours, description } = req.body;
    try {
        const workLog = await WorkLog.findById(req.params.entryId).populate('user');

        if (!workLog) {
            return res.status(404).json({ message: 'Entry (WorkLog) not found' });
        }

        const owner = workLog.user;
        const requestor = req.user;

        const isOwner = owner._id.toString() === requestor._id.toString();
        const isManager = owner.reportingManagers?.some(m => m.toString() === requestor._id.toString());
        const isAdmin = requestor.roles && requestor.roles.some(r => r.name === 'Admin');

        if (!isOwner && !isManager && !isAdmin) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const month = format(workLog.date, 'yyyy-MM');
        const timesheet = await Timesheet.findOne({ user: owner._id, month });

        if (timesheet && (timesheet.status === 'SUBMITTED' || timesheet.status === 'APPROVED')) {
            if (!isManager && !isAdmin) {
                return res.status(400).json({ message: 'Cannot edit submitted/approved timesheets' });
            }
        }

        if (hours !== undefined) workLog.hours = hours;
        if (description !== undefined) workLog.description = description;

        if (workLog.status === 'REJECTED') {
            workLog.status = 'PENDING';
            workLog.rejectionReason = undefined;
        }

        await workLog.save();
        res.json(workLog);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getCurrentTimesheet,
    getUserTimesheet,
    addEntry,
    updateEntry,
    submitTimesheet,
    getProjects,
    createProject,
    getPendingTimesheets,
    approveTimesheet
};
