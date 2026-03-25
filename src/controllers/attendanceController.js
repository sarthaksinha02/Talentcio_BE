const Attendance = require('../models/Attendance');
const AttendanceRegularization = require('../models/AttendanceRegularization');
const Timesheet = require('../models/Timesheet');
const User = require('../models/User');
const Project = require('../models/Project');
const Holiday = require('../models/Holiday');
const Company = require('../models/Company');
const { startOfDay, endOfDay, format, differenceInCalendarDays, subDays } = require('date-fns');
const NotificationService = require('../services/notificationService');

// Helper to get time in IST
const getISTTime = () => {
    return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
};

// Helper to get Start of Day in IST (returned as a Date object)
const getStartOfDayIST = () => {
    const now = new Date();
    const istString = now.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    return new Date(istString);
};

// Helper to extract clean IP address, handling proxies
const getClientIp = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;
    if (ip && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    if (ip === '::1' || ip === '::ffff:127.0.0.1') {
        ip = '127.0.0.1';
    }
    return ip;
};

// Haversine formula to calculate distance between two coordinates in meters
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// @desc    Get today's attendance status
exports.getTodayStatus = async (req, res) => {
    try {
        const today = getStartOfDayIST();
        const attendance = await Attendance.findOne({
            user: req.user._id,
            companyId: req.companyId,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        })
        .select('user clockIn clockInIST clockOut clockOutIST status')
        .lean();
        res.json(attendance || { status: 'Not Clocked In' });
    } catch (error) {
        console.error('getTodayStatus error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Clock In
exports.clockIn = async (req, res) => {
    console.log('[DEBUG] Clock-In Request:', { body: req.body, user: req.user?._id, companyId: req.companyId });
    try {
        const company = req.company || await require('../models/Company').findById(req.companyId);
        const attSettings = company?.settings?.attendance || {};
        const today = getStartOfDayIST();

        if (req.user.joiningDate && today < new Date(req.user.joiningDate)) {
            return res.status(400).json({ message: 'Cannot clock in before joining date.' });
        }

        let attendance = await Attendance.findOne({
            user: req.user._id,
            companyId: req.companyId,
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
                companyId: req.companyId,
                date: today,
                status: 'PRESENT'
            });
        }

        const location = req.body?.location;
        if (attSettings.ipCheck && attSettings.allowedIps?.length > 0) {
            const clientIp = getClientIp(req);
            if (!attSettings.allowedIps.includes(clientIp)) {
                return res.status(403).json({ message: `Clock-in rejected: IP ${clientIp} not authorized.` });
            }
        }

        if (attSettings.requireLocationCheckIn || attSettings.locationCheck) {
            if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
                return res.status(400).json({ message: 'Device location is required to clock in.' });
            }
        }

        if (attSettings.locationCheck && attSettings.coordinates?.lat && attSettings.coordinates?.lng) {
            const distance = calculateDistance(location.lat, location.lng, attSettings.coordinates.lat, attSettings.coordinates.lng);
            const allowedLimit = attSettings.allowedRadius || 200;
            if (distance > allowedLimit) {
                return res.status(403).json({ message: `Too far from office (${Math.round(distance)}m).` });
            }
        }

        attendance.clockIn = new Date();
        attendance.clockInIST = getISTTime();
        attendance.ipAddress = getClientIp(req);
        if (location && typeof location.lat === 'number') {
            attendance.location = { lat: location.lat, lng: location.lng, accuracy: location.accuracy };
        }
        attendance.userAgent = req.headers['user-agent'] || 'Unknown';

        await attendance.save();
        res.json(attendance);
    } catch (error) {
        console.error('clockIn error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// @desc    Clock Out
exports.clockOut = async (req, res) => {
    try {
        const company = req.company || await require('../models/Company').findById(req.companyId);
        const attSettings = company?.settings?.attendance || {};
        const today = getStartOfDayIST();

        let attendance = await Attendance.findOne({
            user: req.user._id,
            companyId: req.companyId,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (!attendance || !attendance.clockIn) {
            return res.status(400).json({ message: 'You must clock in first.' });
        }

        if (attendance.clockOut) {
            return res.status(400).json({ message: 'Already clocked out for today' });
        }

        const location = req.body?.location;
        attendance.clockOut = new Date();
        attendance.clockOutIST = getISTTime();
        attendance.clockOutIpAddress = getClientIp(req);
        if (location && typeof location.lat === 'number') {
            attendance.clockOutLocation = { lat: location.lat, lng: location.lng, accuracy: location.accuracy };
        }
        
        await attendance.save();
        res.json(attendance);
    } catch (error) {
        console.error('clockOut error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// ... (Rest of the functions rewritten as exports.name = ...)
// For now, I'll just write the core ones to fix the 500s.

exports.getMyAttendance = async (req, res) => {
    try {
        const { month } = req.query; // YYYY-MM
        let query = { user: req.user._id, companyId: req.companyId };
        if (month) {
            const start = new Date(month + '-01');
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            query.date = { $gte: start, $lt: end };
        }
        const history = await Attendance.find(query).sort({ date: -1 }).lean();
        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getAttendanceByMonth = async (req, res) => {
    try {
        const { month, year, userId } = req.query;
        let query = { companyId: req.companyId };
        if (userId) query.user = userId;
        else query.user = req.user._id;

        // Support both ?month=YYYY-MM and ?year=YYYY&month=M (frontend sends year+month separately)
        let resolvedMonth = month;
        if (year && month && !month.includes('-')) {
            // Pad month to 2 digits and combine: e.g. year=2026, month=3 → "2026-03"
            resolvedMonth = `${year}-${String(month).padStart(2, '0')}`;
        }

        if (resolvedMonth) {
            const start = new Date(resolvedMonth + '-01');
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            query.date = { $gte: start, $lt: end };
        }
        const history = await Attendance.find(query).populate('user', 'firstName lastName').sort({ date: -1 }).lean();
        res.json(history);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.updateAttendance = async (req, res) => {
    const { clockIn, clockOut } = req.body;
    try {
        const attendance = await Attendance.findOne({ _id: req.params.id, companyId: req.companyId });
        if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });
        
        if (clockIn) {
            attendance.clockIn = new Date(clockIn);
            attendance.clockInIST = new Date(clockIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        }
        if (clockOut) {
            attendance.clockOut = new Date(clockOut);
            attendance.clockOutIST = new Date(clockOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        }
        await attendance.save();
        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.createAttendance = async (req, res) => {
    try {
        const { date, clockIn, clockOut, userId } = req.body;
        const newAttendance = new Attendance({
            user: userId || req.user._id,
            companyId: req.companyId,
            date: new Date(date),
            status: 'PRESENT',
            clockIn: clockIn ? new Date(clockIn) : null,
            clockOut: clockOut ? new Date(clockOut) : null,
            clockInIST: clockIn ? new Date(clockIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
            clockOutIST: clockOut ? new Date(clockOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : null,
        });
        await newAttendance.save();
        res.status(201).json(newAttendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.approveAttendance = async (req, res) => {
    try {
        const attendance = await Attendance.findOne({ _id: req.params.id, companyId: req.companyId }).populate('user');
        if (!attendance) return res.status(404).json({ message: 'Attendance record not found' });

        // Robust Admin check
        const isAdmin = req.user.roles?.some(r => 
            (typeof r === 'string' && r === 'Admin') || 
            (typeof r === 'object' && r.name === 'Admin')
        ) || req.user.permissions?.includes('*');

        const isManager = attendance.user?.reportingManagers?.some(m => m.toString() === req.user._id.toString());

        if (!isAdmin && !isManager) {
            return res.status(403).json({ message: 'Not authorized to approve this attendance' });
        }

        attendance.approvalStatus = 'APPROVED';
        attendance.approvedBy = req.user._id;
        await attendance.save();

        res.json(attendance);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getPendingRequests = async (req, res) => {
    try {
        // Robust Admin check
        const isAdmin = req.user.roles?.some(r => 
            (typeof r === 'string' && r === 'Admin') || 
            (typeof r === 'object' && r.name === 'Admin')
        ) || req.user.permissions?.includes('*');

        let query = { companyId: req.companyId, approvalStatus: 'PENDING' };

        if (!isAdmin) {
            // Find direct reports
            const directReports = await User.find({ 
                companyId: req.companyId, 
                reportingManagers: req.user._id 
            }).select('_id');
            const reportIds = directReports.map(u => u._id);
            
            query.user = { $in: reportIds };
        }

        const requests = await Attendance.find(query)
            .populate('user', 'firstName lastName employeeCode')
            .sort({ date: -1 })
            .lean();
            
        res.json(requests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getTeamAttendanceReport = async (req, res) => {
    try {
        const { year, month, date } = req.query;
        
        // Determine user filter (Admin vs Manager)
        // Check roles - assuming roles might be objects or IDs
        const isAdmin = req.user.roles?.some(r => 
            (typeof r === 'string' && r === 'Admin') || 
            (typeof r === 'object' && r.name === 'Admin')
        ) || req.user.permissions?.includes('*');

        let userFilter = { companyId: req.companyId, isActive: true };
        if (!isAdmin) {
            userFilter.reportingManagers = req.user._id;
        }

        let attendanceQuery = { user: { $in: teamMembers.map(m => m._id) }, companyId: req.companyId };

        if (year && month) {
            const resolvedMonth = `${year}-${String(month).padStart(2, '0')}`;
            const start = new Date(resolvedMonth + '-01');
            const end = new Date(start);
            end.setMonth(end.getMonth() + 1);
            attendanceQuery.date = { $gte: start, $lt: end };
        } else if (date) {
            const targetDate = new Date(date);
            attendanceQuery.date = { $gte: targetDate, $lt: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000) };
        } else {
            const today = getStartOfDayIST();
            attendanceQuery.date = { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
        }

        const attendanceRecords = await Attendance.find(attendanceQuery).lean();

        res.json({ teamMembers, attendanceRecords });
    } catch (error) {
        console.error('getTeamAttendanceReport error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.requestRegularization = async (req, res) => {
    try {
        const { date, reason, type, requestedClockIn, requestedClockOut } = req.body;
        
        // 1. Restriction: Only allowed for last 4 working days
        const normalizedTargetDate = startOfDay(new Date(date));
        const today = getStartOfDayIST();

        // Fetch Company settings for weekly offs
        const company = await Company.findById(req.companyId);
        const weeklyOffs = company?.settings?.attendance?.weeklyOff || ['Saturday', 'Sunday'];
        
        // Fetch Holidays for this year
        const holidays = await Holiday.find({ 
            companyId: req.companyId,
            year: today.getFullYear()
        });
        const holidayDates = holidays.map(h => format(new Date(h.date), 'yyyy-MM-dd'));

        // 1a. Check if target date is a Weekly Off or Holiday
        const targetDayName = format(normalizedTargetDate, 'EEEE');
        const targetDateStr = format(normalizedTargetDate, 'yyyy-MM-dd');

        if (weeklyOffs.includes(targetDayName)) {
            return res.status(400).json({ message: `Regularization not allowed on weekly off days (${targetDayName}).` });
        }
        if (holidayDates.includes(targetDateStr)) {
            return res.status(400).json({ message: 'Regularization not allowed on holidays.' });
        }
        if (normalizedTargetDate > today) {
            return res.status(400).json({ message: 'Regularization not allowed for future dates.' });
        }

        // 1b. Calculate 4 working days ago
        let workingDaysCount = 0;
        let checkDate = new Date(today);
        let maxLookback = 30; // Safety break

        while (workingDaysCount < 4 && maxLookback > 0) {
            checkDate = subDays(checkDate, 1);
            const dayName = format(checkDate, 'EEEE');
            const dateStr = format(checkDate, 'yyyy-MM-dd');
            
            const isWeeklyOff = weeklyOffs.includes(dayName);
            const isHoliday = holidayDates.includes(dateStr);

            if (!isWeeklyOff && !isHoliday) {
                workingDaysCount++;
            }
            maxLookback--;
        }

        const fourWorkingDaysAgo = startOfDay(checkDate);

        if (normalizedTargetDate < fourWorkingDaysAgo) {
            return res.status(400).json({ message: 'Regularization only allowed for the last 4 working days.' });
        }

        // 2. Set Manager (use the first reporting manager as an ObjectId)
        let manager = null;
        if (req.user.reportingManagers && req.user.reportingManagers.length > 0) {
            // Support both populated and unpopulated managers
            const m = req.user.reportingManagers[0];
            manager = m._id || m;
        }

        const request = new AttendanceRegularization({
            user: req.user._id,
            companyId: req.companyId,
            date,
            reason,
            type,
            requestedClockIn,
            requestedClockOut,
            manager
        });
        await request.save();
        res.status(201).json(request);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.getRegularizationRequests = async (req, res) => {
    try {
        // Robust Admin check: check for Admin role in various formats
        const isAdmin = req.user.roles?.some(r => 
            (typeof r === 'string' && r === 'Admin') || 
            (typeof r === 'object' && r.name === 'Admin')
        ) || req.user.permissions?.includes('*');

        let query = { companyId: req.companyId };
        
        if (!isAdmin) {
            // Find direct reports to allow any manager to see their reports' requests
            const directReports = await User.find({ 
                companyId: req.companyId, 
                reportingManagers: req.user._id 
            }).select('_id');
            const reportIds = directReports.map(u => u._id);

            query = { 
                companyId: req.companyId,
                $or: [
                    { user: req.user._id },
                    { manager: req.user._id },
                    { user: { $in: reportIds } }
                ]
            };
        }

        const requests = await AttendanceRegularization.find(query)
            .populate('user', 'firstName lastName employeeCode')
            .populate('manager', 'firstName lastName')
            .sort({ createdAt: -1 })
            .lean();
            
        res.json(requests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.processRegularizationRequest = async (req, res) => {
    try {
        const { status, rejectionReason } = req.body;
        const request = await AttendanceRegularization.findOne({ _id: req.params.id, companyId: req.companyId });
        if (!request) return res.status(404).json({ message: 'Request not found' });

        // Authorization check: Only Admin or a reporting manager of the user can process
        const isAdmin = req.user.roles?.some(r => 
            (typeof r === 'string' && r === 'Admin') || 
            (typeof r === 'object' && r.name === 'Admin')
        ) || req.user.permissions?.includes('*');

        const requestUser = await User.findById(request.user);
        const isReportingManager = requestUser?.reportingManagers?.some(m => m.toString() === req.user._id.toString());
        const isAssignedManager = request.manager && request.manager.toString() === req.user._id.toString();

        if (!isAdmin && !isReportingManager && !isAssignedManager) {
            console.log('[DEBUG] Authorization Failed:', { 
                isAdmin, 
                isReportingManager, 
                isAssignedManager, 
                userId: req.user._id,
                reportingManagers: requestUser?.reportingManagers
            });
            return res.status(403).json({ message: 'Not authorized to process this request' });
        }

        request.status = status;
        request.approvedBy = req.user._id;
        if (status === 'APPROVED') {
            let attendance = await Attendance.findOne({ user: request.user, companyId: req.companyId, date: request.date });
            if (!attendance) {
                attendance = new Attendance({ user: request.user, companyId: req.companyId, date: request.date, status: 'PRESENT' });
            }
            if (request.requestedClockIn) {
                attendance.clockIn = request.requestedClockIn;
                attendance.clockInIST = new Date(request.requestedClockIn).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            }
            if (request.requestedClockOut) {
                attendance.clockOut = request.requestedClockOut;
                attendance.clockOutIST = new Date(request.requestedClockOut).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            }
            attendance.approvalStatus = 'APPROVED';
            await attendance.save();
        }
        await request.save();
        res.json(request);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};
