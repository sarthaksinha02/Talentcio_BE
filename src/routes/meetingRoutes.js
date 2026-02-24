const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
    getMeetings,
    getMeetingById,
    createMeeting,
    updateMeeting,
    deleteMeeting
} = require('../controllers/meetingController');

// All meeting routes require authentication
router.use(protect);

router.get('/', getMeetings);
router.get('/:id', getMeetingById);
router.post('/', createMeeting);
router.put('/:id', updateMeeting);
router.delete('/:id', deleteMeeting);

module.exports = router;
