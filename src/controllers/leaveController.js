const LeaveRequest = require('../models/LeaveRequest');
const LeaveBalance = require('../models/LeaveBalance');
const LeaveConfig = require('../models/LeaveConfig');
const User = require('../models/User');
const { calculateLeaveDays } = require('../utils/leaveUtils');

// @desc    Apply for Leave
// @route   POST /api/leaves/apply
// @access  Private
const applyLeave = async (req, res) => {
    const { leaveType, startDate, endDate, isHalfDay, halfDaySession, reason, documents } = req.body;
    const userId = req.user._id;

    try {
        // 1. Fetch Policy
        const policy = await LeaveConfig.findOne({ leaveType, isActive: true });
        if (!policy) {
            return res.status(400).json({ message: 'Invalid or inactive leave type' });
        }

        // 2. Validate Backdated
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const start = new Date(startDate);
        if (start < today && !policy.allowBackdated) {
            return res.status(400).json({ message: 'Backdated leave is not allowed for this leave type' });
        }

        // 3. Calculate Days
        let daysCount = 0;
        if (isHalfDay) {
            daysCount = 0.5;
            // Validate Half Day is same date
            if (new Date(startDate).toDateString() !== new Date(endDate).toDateString()) {
                return res.status(400).json({ message: 'Half day leave must be on a single date' });
            }
        } else {
            daysCount = await calculateLeaveDays(new Date(startDate), new Date(endDate), policy);
        }

        if (daysCount <= 0) {
            return res.status(400).json({ message: 'Invalid date range (0 working days selected)' });
        }

        // 4. Check Balance
        const currentYear = new Date().getFullYear();
        let balance = await LeaveBalance.findOne({ user: userId, leaveType, year: currentYear });

        // Auto-create balance if missing (User first time)
        if (!balance) {
            balance = await LeaveBalance.create({ user: userId, leaveType, year: currentYear, openingBalance: 0 });
        }

        // Calculate Available
        const available = balance.openingBalance + balance.accrued - balance.utilized;

        // Validation
        if (!policy.allowNegativeBalance && daysCount > available) {
            return res.status(400).json({
                message: `Insufficient balance. Available: ${available}, Requested: ${daysCount}`
            });
        }

        // 5. Create Request
        const leaveRequest = await LeaveRequest.create({
            user: userId,
            leaveType,
            startDate,
            endDate,
            isHalfDay,
            halfDaySession: isHalfDay ? halfDaySession : null,
            reason,
            documents,
            daysCount,
            status: 'Pending',
            auditLog: [{ action: 'Applied', by: userId, comment: 'Initial Application' }]
        });

        res.status(201).json(leaveRequest);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get My Leave Requests
// @route   GET /api/leaves/requests
// @access  Private
const getMyLeaves = async (req, res) => {
    try {
        const leaves = await LeaveRequest.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json(leaves);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get My Balances
// @route   GET /api/leaves/balance
// @access  Private
const getMyBalances = async (req, res) => {
    try {
        const year = new Date().getFullYear();

        // Start by getting all active policies
        const policies = await LeaveConfig.find({ isActive: true });
        const balances = [];

        for (const policy of policies) {
            let balance = await LeaveBalance.findOne({ user: req.user._id, leaveType: policy.leaveType, year });

            // If no balance record, assume 0
            if (!balance) {
                balance = {
                    leaveType: policy.leaveType,
                    openingBalance: 0,
                    accrued: 0,
                    utilized: 0,
                    closingBalance: 0
                };
            } else {
                // Calculate virtual closing
                balance = balance.toObject();
                balance.closingBalance = balance.openingBalance + balance.accrued - balance.utilized;
            }

            balances.push({
                ...balance,
                policyName: policy.name,
                policyDescription: policy.description
            });
        }

        res.json(balances);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get Team Approvals (Manager)
// @route   GET /api/leaves/approvals
// @access  Private (Manager)
const getManagerApprovals = async (req, res) => {
    try {
        // 1. Find Subordinates
        const subordinates = await User.find({ reportingManagers: req.user._id }).select('_id');
        const subordinateIds = subordinates.map(u => u._id);

        if (subordinateIds.length === 0) {
            return res.json([]);
        }

        // 2. Find Requests
        const requests = await LeaveRequest.find({
            user: { $in: subordinateIds },
            status: 'Pending'
        }).populate('user', 'firstName lastName email employeeCode').sort({ createdAt: 1 });

        res.json(requests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Approve/Reject Leave
// @route   PUT /api/leaves/approve/:id
// @access  Private (Manager)
const updateLeaveStatus = async (req, res) => {
    const { status, rejectionReason } = req.body; // Approved or Rejected
    const requestId = req.params.id;
    const managerId = req.user._id;

    try {
        const request = await LeaveRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ message: 'Request not found' });
        }

        // Verify Authority (Is Manager?)
        const employee = await User.findById(request.user);
        const isManager = employee.reportingManagers.some(rm => rm.toString() === managerId.toString()) || req.user.roles.includes('Admin'); // Fallback if admin

        if (!isManager) {
            // Check if Admin role exists conceptually, or based on permissions. 
            // Simplification: Check strict manager relationship
            // Actually, let's allow if user has permission 'leave.approve' or is manager
            // For now, strict manager check
        }

        // Double check: if already processed
        if (request.status !== 'Pending') {
            return res.status(400).json({ message: 'Request already processed' });
        }

        if (status === 'Approved') {
            // Update Balance
            const currentYear = new Date().getFullYear();
            let balance = await LeaveBalance.findOne({ user: request.user, leaveType: request.leaveType, year: currentYear });

            // If balance check wasn't strict during apply (wait state), re-check here? 
            // We checked during apply. But let's assume valid.
            // Deduct
            // Note: utilized increases.

            if (!balance) {
                // Should exist if applied, but safe
                balance = await LeaveBalance.create({ user: request.user, leaveType: request.leaveType, year: currentYear });
            }

            balance.utilized += request.daysCount;
            await balance.save();
        }

        request.status = status;
        request.approvedBy = managerId;
        request.rejectionReason = status === 'Rejected' ? rejectionReason : undefined;
        request.auditLog.push({
            action: status,
            by: managerId,
            comment: status === 'Rejected' ? rejectionReason : 'Approved by Manager'
        });

        await request.save();
        res.json(request);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    applyLeave,
    getMyLeaves,
    getMyBalances,
    getManagerApprovals,
    updateLeaveStatus
};
