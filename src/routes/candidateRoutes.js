const express = require('express');
const router = express.Router();
const candidateController = require('../controllers/candidateController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/authorize');
const { upload } = require('../config/cloudinary');

// Base path: /api/ta/candidates

// Upload resume
router.post('/upload-resume/:hiringRequestId', protect, authorize('ta.create'), upload.single('resume'), candidateController.uploadResume);

// Get discrete sources
router.get('/sources', protect, authorize('ta.view'), candidateController.getCandidateSources);

// CRUD operations
router.post('/', protect, authorize('ta.create'), candidateController.createCandidate);
router.get('/:hiringRequestId', protect, authorize('ta.view'), candidateController.getCandidatesByHiringRequest);
router.get('/candidate/:id', protect, authorize('ta.view'), candidateController.getCandidateById);
router.put('/:id', protect, authorize('ta.edit'), candidateController.updateCandidate);
router.delete('/:id', protect, authorize('ta.delete'), candidateController.deleteCandidate);

// Status update
router.patch('/:id/status', protect, authorize('ta.edit'), candidateController.updateCandidateStatus);

module.exports = router;
