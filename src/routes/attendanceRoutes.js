const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/authorize');
const { 
    getTodayStatus, 
    clockIn, 
    clockOut, 
    getMyAttendance,
    getAttendanceByMonth,
    approveAttendance,
    getPendingRequests,

    updateAttendance,
    createAttendance
} = require('../controllers/attendanceController');

router.use(protect); // All routes protected

router.get('/today', getTodayStatus);
router.post('/clock-in', authorize('attendance.clock_in'), clockIn);
router.post('/clock-out', authorize('attendance.clock_in'), clockOut);
router.get('/me', getMyAttendance);
router.get('/history', getAttendanceByMonth);
router.get('/approvals', getPendingRequests);
router.put('/:id/approve', approveAttendance);
router.post('/', createAttendance);
router.put('/:id', updateAttendance);

module.exports = router;
