const express = require('express');
const router = express.Router();
const { getHolidays, addHoliday, updateHoliday, deleteHoliday } = require('../controllers/holidayController');
const { protect } = require('../middlewares/authMiddleware');

router.route('/')
    .get(protect, getHolidays)
    .post(protect, addHoliday);

router.route('/:id')
    .put(protect, updateHoliday)
    .delete(protect, deleteHoliday);

module.exports = router;
