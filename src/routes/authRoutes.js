const express = require('express');
const router = express.Router();
const { register, loginUser, uploadProfilePicture, verifyOtpAndResetPassword, resendOtp } = require('../controllers/authController');
const { getMyself } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');

const { upload } = require('../config/cloudinary');

router.post('/register', register);
router.post('/login', loginUser);
router.post('/verify-otp-reset', verifyOtpAndResetPassword);
router.post('/resend-otp', resendOtp);
router.post('/upload-profile-picture', protect, upload.single('image'), uploadProfilePicture);
router.get('/profile', protect, getMyself);
router.get('/verify-workspace', (req, res) => {
    // If req.company exists, it's a valid tenant.
    // If not, but it reached here, it's the root domain (bypassed in tenantMiddleware).
    if (req.company) {
        res.status(200).json({
            valid: true,
            name: req.company.name,
            type: 'tenant'
        });
    } else {
        // Root domain access - allow the frontend to proceed to landing/login
        res.status(200).json({
            valid: true,
            name: 'HRCODE',
            type: 'root'
        });
    }
});

module.exports = router;
