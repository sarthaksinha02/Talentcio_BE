const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware'); // Assuming this exists
const { getDossier, updateSection, addDocument, getDossierHistory, deleteDocument } = require('../controllers/dossierController');
const { upload } = require('../config/cloudinary');

// All routes require login
router.use(protect);

router.get('/:userId', getDossier);
router.patch('/:userId/:section', updateSection); // section: personal, contact, employment...
router.post('/:userId/documents', upload.single('file'), addDocument);
router.delete('/:userId/documents/:docId', deleteDocument);
router.get('/:userId/history', getDossierHistory);

module.exports = router;
