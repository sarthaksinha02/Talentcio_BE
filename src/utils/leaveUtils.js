const Holiday = require('../models/Holiday');
const { eachDayOfInterval, isWeekend, isSameDay } = require('date-fns');

/**
 * Calculate the number of leave days based on range and policy rules.
 * @param {Date} startDate 
 * @param {Date} endDate 
 * @param {Object} leavePolicy (LeaveConfig)
 * @param {Array} holidays (List of holiday dates, optional optimization)
 * @returns {Number} daysCount
 */
const calculateLeaveDays = async (startDate, endDate, leavePolicy) => {
    // If half day, it's 0.5 regardless of range (usually half day is single date)
    // But we handle that in controller. Here we assume full days range.

    // 1. Get all days in range
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    let count = 0;

    // 2. Fetch Holidays if needed (Optimization: pass holidays if repetitive)
    // We fetch all holidays in year range to be safe
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    const holidayDocs = await Holiday.find({
        date: { $gte: startDate, $lte: endDate }
    });
    const holidayDates = holidayDocs.map(h => new Date(h.date).toDateString());

    // 3. Iterate
    for (const day of days) {
        const isSatSun = isWeekend(day);
        const isHoliday = holidayDates.includes(day.toDateString());
        const isOffDay = isSatSun || isHoliday;

        if (!isOffDay) {
            // Working Day -> Always Counts
            count++;
        } else {
            // Off Day -> Counts only if Sandwich Rule is TRUE
            if (leavePolicy.sandwichRule) {
                count++;
            }
        }
    }

    return count;
};

module.exports = { calculateLeaveDays };
