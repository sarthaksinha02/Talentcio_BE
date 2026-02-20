const express = require('express');
const router = express.Router();
const taController = require('../controllers/talentAcquisitionController');
const { protect } = require('../middlewares/authMiddleware');

// Base path: /api/ta

router.post('/hiring-request', protect, taController.createHiringRequest);
router.get('/hiring-request', protect, taController.getHiringRequests);
router.get('/hiring-request/:id', protect, taController.getHiringRequestById);
router.put('/hiring-request/:id', protect, taController.updateHiringRequest);
router.patch('/hiring-request/:id/approve', protect, taController.approveHiringRequest);
router.patch('/hiring-request/:id/reject', protect, taController.rejectHiringRequest);
router.patch('/hiring-request/:id/close', protect, taController.closeHiringRequest);

module.exports = router;
