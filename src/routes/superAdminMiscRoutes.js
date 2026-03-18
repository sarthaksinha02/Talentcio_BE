const express = require('express');
const router = express.Router();
const { protectSuperAdmin } = require('../middlewares/superAdminAuth');
const { getLogs } = require('../controllers/activityLogController');
const { listAllModules } = require('../controllers/moduleController');

router.use(protectSuperAdmin);
router.get('/logs', getLogs);
router.get('/modules', listAllModules);

module.exports = router;
