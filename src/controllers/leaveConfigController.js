const LeaveConfig = require('../models/LeaveConfig');

// @desc    Get all leave policies
// @route   GET /api/leaves/config
// @access  Public (Authenticated)
const getLeavePolicies = async (req, res) => {
    try {
        const policies = await LeaveConfig.find({ isActive: true });
        res.json(policies);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create or Update a leave policy
// @route   POST /api/leaves/config
// @access  Private (Admin)
const updateLeavePolicy = async (req, res) => {
    const {
        leaveType, name, description, employeeTypes, isPaid,
        accrualType, accrualAmount, carryForward, maxCarryForward,
        encashmentAllowed, maxLimitPerYear,
        sandwichRule, allowNegativeBalance, proofRequiredAbove, allowBackdated, proRata
    } = req.body;

    try {
        let policy = await LeaveConfig.findOne({ leaveType });

        if (policy) {
            // Update existing
            policy.name = name || policy.name;
            policy.description = description || policy.description;
            policy.employeeTypes = employeeTypes || policy.employeeTypes;
            policy.isPaid = isPaid !== undefined ? isPaid : policy.isPaid;
            policy.accrualType = accrualType || policy.accrualType;
            policy.accrualAmount = accrualAmount !== undefined ? accrualAmount : policy.accrualAmount;
            policy.carryForward = carryForward !== undefined ? carryForward : policy.carryForward;
            policy.maxCarryForward = maxCarryForward !== undefined ? maxCarryForward : policy.maxCarryForward;
            policy.encashmentAllowed = encashmentAllowed !== undefined ? encashmentAllowed : policy.encashmentAllowed;
            policy.maxLimitPerYear = maxLimitPerYear !== undefined ? maxLimitPerYear : policy.maxLimitPerYear;

            // Rules
            policy.sandwichRule = sandwichRule !== undefined ? sandwichRule : policy.sandwichRule;
            policy.allowNegativeBalance = allowNegativeBalance !== undefined ? allowNegativeBalance : policy.allowNegativeBalance;
            policy.proofRequiredAbove = proofRequiredAbove !== undefined ? proofRequiredAbove : policy.proofRequiredAbove;
            policy.allowBackdated = allowBackdated !== undefined ? allowBackdated : policy.allowBackdated;
            policy.proRata = proRata !== undefined ? proRata : policy.proRata;

            await policy.save();
            return res.json(policy);
        } else {
            // Create New
            policy = await LeaveConfig.create({
                leaveType, name, description, employeeTypes, isPaid,
                accrualType, accrualAmount, carryForward, maxCarryForward,
                encashmentAllowed, maxLimitPerYear,
                sandwichRule, allowNegativeBalance, proofRequiredAbove, allowBackdated, proRata
            });
            return res.status(201).json(policy);
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Seed Default Policies
// @route   POST /api/leaves/config/seed
// @access  Private (Admin)
const seedDefaultPolicies = async (req, res) => {
    try {
        const defaults = [
            { leaveType: 'CL', name: 'Casual Leave', isPaid: true, accrualType: 'Monthly', accrualAmount: 1, maxLimitPerYear: 12, carryForward: false },
            { leaveType: 'SL', name: 'Sick Leave', isPaid: true, accrualType: 'Yearly', accrualAmount: 8, maxLimitPerYear: 8, carryForward: false },
            { leaveType: 'EL', name: 'Earned Leave', isPaid: true, accrualType: 'Monthly', accrualAmount: 1.25, maxLimitPerYear: 15, carryForward: true, maxCarryForward: 30, encashmentAllowed: true }, // Approx 15/year logic varies
            { leaveType: 'LOP', name: 'Loss of Pay', isPaid: false, accrualType: 'None', maxLimitPerYear: 0, carryForward: false },
            { leaveType: 'WFH', name: 'Work From Home', isPaid: true, accrualType: 'Policy', maxLimitPerYear: 0, carryForward: false }
        ];

        for (const def of defaults) {
            const exists = await LeaveConfig.findOne({ leaveType: def.leaveType });
            if (!exists) {
                await LeaveConfig.create(def);
            }
        }

        res.json({ message: 'Default policies seeded' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const { runMonthlyAccrual, runYearlyProcessing } = require('../services/accrualService');

// @desc    Trigger Monthly Accrual
// @route   POST /api/leaves/accrual/monthly
// @access  Admin
const triggerMonthlyAccrual = async (req, res) => {
    try {
        const result = await runMonthlyAccrual();
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to run monthly accrual' });
    }
};

// @desc    Trigger Yearly Processing
// @route   POST /api/leaves/accrual/yearly
// @access  Admin
const triggerYearlyAccrual = async (req, res) => {
    try {
        const { year } = req.body;
        const result = await runYearlyProcessing(year);
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to run yearly processing' });
    }
};

// @desc    Delete a leave policy
// @route   DELETE /api/leaves/config/:id
// @access  Private (Admin)
const deleteLeavePolicy = async (req, res) => {
    try {
        const policy = await LeaveConfig.findById(req.params.id);

        if (!policy) {
            return res.status(404).json({ message: 'Policy not found' });
        }

        await policy.deleteOne();
        res.json({ message: 'Policy removed' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = {
    getLeavePolicies,
    updateLeavePolicy,
    deleteLeavePolicy,
    seedDefaultPolicies,
    triggerMonthlyAccrual,
    triggerYearlyAccrual
};
