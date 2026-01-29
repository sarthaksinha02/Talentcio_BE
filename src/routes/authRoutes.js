const express = require('express');
const router = express.Router();
const { registerCompany, loginUser } = require('../controllers/authController');
const { getMyself } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/register-company', registerCompany);
router.post('/login', loginUser);
router.get('/profile', protect, getMyself);

module.exports = router;
