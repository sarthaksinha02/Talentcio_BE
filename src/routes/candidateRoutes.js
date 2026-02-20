const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const { protect } = require('../middlewares/authMiddleware');
const { upload } = require('../config/cloudinary');

// Base path: /api/ta/candidates

// Upload resume
router.post('/upload-resume/:hiringRequestId', protect, upload.single('resume'), candidateController.uploadResume);

// Get discrete sources
router.get('/sources', protect, candidateController.getCandidateSources);

// CRUD operations
router.post('/', protect, candidateController.createCandidate);
router.get('/:hiringRequestId', protect, candidateController.getCandidatesByHiringRequest);
router.get('/candidate/:id', protect, candidateController.getCandidateById);
router.put('/:id', protect, candidateController.updateCandidate);
router.delete('/:id', protect, candidateController.deleteCandidate);

// Status update
router.patch('/:id/status', protect, candidateController.updateCandidateStatus);

module.exports = router;
