const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware'); // Assuming this exists
const { getDossier, updateSection, addDocument, getDossierHistory, deleteDocument, submitHRIS, approveHRIS, rejectHRIS, exportHRISExcel, getHRISRequests, verifyDocument, verifyAllDocuments, submitDocuments, proxyPdf } = require('../controllers/dossierController');
const { upload } = require('../config/cloudinary');

// All routes require login
router.use(protect);

router.get('/requests', getHRISRequests);
router.get('/export-excel', exportHRISExcel); // Admin only recommended, but controller handles roles
router.get('/proxy-pdf', proxyPdf); // Needs to be before generic :userId routes

router.patch('/:userId/submit-hris', submitHRIS);
router.patch('/:userId/approve-hris', approveHRIS);
router.patch('/:userId/reject-hris', rejectHRIS);

const uploadMiddleware = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('Multer/Cloudinary Middleware Error:', err);
            return res.status(500).json({ message: 'File Upload Error', error: err.message });
        }
        next();
    });
};

router.post('/:userId/documents', uploadMiddleware, addDocument);
router.patch('/:userId/documents/:docId/verify', verifyDocument);
router.patch('/:userId/documents/verify-all', verifyAllDocuments);
router.patch('/:userId/documents/submit', submitDocuments);
router.delete('/:userId/documents/:docId', deleteDocument);
router.get('/:userId/history', getDossierHistory);

router.patch('/:userId/:section', updateSection); // section: personal, contact, employment...
router.get('/:userId', getDossier);

module.exports = router;
