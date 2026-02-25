const express = require('express');
const router = express.Router();
const taController = require('../controllers/talentAcquisitionController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/authorize');

// Base path: /api/ta

router.post('/hiring-request', protect, authorize('ta.create'), taController.createHiringRequest);
router.get('/hiring-request', protect, taController.getHiringRequests);
router.get('/hiring-request/:id', protect, taController.getHiringRequestById);
router.put('/hiring-request/:id', protect, authorize('ta.edit'), taController.updateHiringRequest);
router.patch('/hiring-request/:id/approve', protect, authorize(['ta.hiring_request.manage', 'ta.super_approve']), taController.approveHiringRequest);
router.patch('/hiring-request/:id/reject', protect, authorize(['ta.hiring_request.manage', 'ta.super_approve']), taController.rejectHiringRequest);
router.patch('/hiring-request/:id/close', protect, authorize('ta.hiring_request.manage'), taController.closeHiringRequest);

module.exports = router;
