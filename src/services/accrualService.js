const User = require('../models/User');
const LeaveConfig = require('../models/LeaveConfig');
const LeaveBalance = require('../models/LeaveBalance');

/**
 * Run Monthly Accrual for a specific month/year.
 * Usually runs on 1st of Month.
 */
const runMonthlyAccrual = async () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1-12

    console.log(`Running Monthly Accrual for ${currentMonth}/${currentYear}`);

    const users = await User.find({ isActive: true });
    const configs = await LeaveConfig.find({ isActive: true, accrualType: 'Monthly' });

    let updates = 0;

    for (const user of users) {
        const userEmploymentType = user.employmentType || 'Full Time';

        for (const config of configs) {
            // Filter: skip if this policy is restricted to employment types that don't include this user
            if (config.employeeTypes && config.employeeTypes.length > 0 &&
                !config.employeeTypes.includes(userEmploymentType)) {
                continue;
            }

            let balance = await LeaveBalance.findOne({ user: user._id, leaveType: config.leaveType, year: currentYear });

            if (!balance) {
                // If balance doesn't exist for this year, create it
                balance = await LeaveBalance.create({ user: user._id, leaveType: config.leaveType, year: currentYear });
            }

            // Add Accrual, capped at maxLimitPerYear if set
            const proposedAccrual = balance.accrued + config.accrualAmount;

            if (config.maxLimitPerYear > 0 && proposedAccrual > config.maxLimitPerYear) {
                balance.accrued = config.maxLimitPerYear;
            } else {
                balance.accrued = proposedAccrual;
            }

            // Keep closingBalance in sync
            balance.closingBalance = balance.openingBalance + balance.accrued - balance.utilized;

            await balance.save();
            updates++;
        }
    }

    return { message: `Monthly Accrual Completed. Updated/Created ${updates} records.` };
};

/**
 * Run Yearly Processing (Carry Forward + New Year Initialization)
 * Runs on Jan 1st of newYear.
 */
const runYearlyProcessing = async (newYear) => {
    if (!newYear) newYear = new Date().getFullYear();
    const prevYear = newYear - 1;

    console.log(`Running Yearly Processing for ${newYear} (From ${prevYear})`);

    const users = await User.find({ isActive: true });
    const configs = await LeaveConfig.find({ isActive: true });

    let processed = 0;

    for (const user of users) {
        for (const config of configs) {
            // Get Previous Year Balance
            const prevBalance = await LeaveBalance.findOne({ user: user._id, leaveType: config.leaveType, year: prevYear });

            // Calculate Closing of Prev Year
            let prevClosing = 0;
            if (prevBalance) {
                prevClosing = prevBalance.openingBalance + prevBalance.accrued - prevBalance.utilized - prevBalance.encashed;
            }

            // Calculate Opening for New Year (Carry Forward)
            let newOpening = 0;
            if (config.carryForward) {
                newOpening = prevClosing;
                if (config.maxCarryForward > 0 && newOpening > config.maxCarryForward) {
                    newOpening = config.maxCarryForward;
                }
            }

            // Check if already exists to avoid duplicate logic
            let newBalance = await LeaveBalance.findOne({ user: user._id, leaveType: config.leaveType, year: newYear });

            if (!newBalance) {
                newBalance = new LeaveBalance({
                    user: user._id,
                    leaveType: config.leaveType,
                    year: newYear,
                    openingBalance: newOpening,
                    accrued: 0,
                    utilized: 0,
                    encashed: 0
                });
            } else {
                // Update existing opening? Safe to update if re-running
                newBalance.openingBalance = newOpening;
            }

            // Yearly Credit (SL fixed 8/year)
            if (config.accrualType === 'Yearly') {
                newBalance.accrued = config.accrualAmount;
            }

            await newBalance.save();
            processed++;
        }
    }

    return { message: `Yearly Processing Completed. Processed ${processed} records.` };
};

module.exports = { runMonthlyAccrual, runYearlyProcessing };
