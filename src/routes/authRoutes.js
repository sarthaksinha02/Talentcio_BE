const express = require('express');
const router = express.Router();
const { register, loginUser, uploadProfilePicture } = require('../controllers/authController');
const { getMyself } = require('../controllers/userController');
const { protect } = require('../middlewares/authMiddleware');

const { upload } = require('../config/cloudinary');

router.post('/register', register);
router.post('/login', loginUser);
router.post('/upload-profile-picture', protect, upload.single('image'), uploadProfilePicture);
router.get('/profile', protect, getMyself);

module.exports = router;
