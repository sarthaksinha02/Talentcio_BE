const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middlewares/authMiddleware');
const { upload } = require('../config/cloudinary');
const onboardingController = require('../controllers/onboardingController');
const OnboardingEmployee = require('../models/OnboardingEmployee');
const jwt = require('jsonwebtoken');

// ==========================================
// Onboarding Token Auth Middleware
// ==========================================
const protectOnboarding = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.type !== 'onboarding') {
                return res.status(401).json({ message: 'Invalid token type' });
            }

            const employee = await OnboardingEmployee.findById(decoded.id);
            if (!employee) {
                return res.status(401).json({ message: 'Employee not found' });
            }

            // Check credential expiry
            if (employee.credentialsExpireAt && new Date() > new Date(employee.credentialsExpireAt)) {
                return res.status(401).json({ message: 'Credentials expired' });
            }

            req.onboardingEmployee = employee;
            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'Session expired. Please login again.', code: 'SESSION_EXPIRED' });
            }
            return res.status(401).json({ message: 'Not authorized' });
        }
    } else {
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

// ==========================================
// HR ADMIN ROUTES (Protected + Admin)
// ==========================================
router.post('/employees', protect, admin, onboardingController.addEmployee);
router.post('/employees/bulk', protect, admin, onboardingController.bulkAddEmployees);
router.get('/employees', protect, admin, onboardingController.getOnboardingList);
router.get('/employees/:id', protect, admin, onboardingController.getOnboardingEmployee);
router.patch('/employees/:id', protect, admin, onboardingController.updateEmployee);
router.post('/employees/:id/regenerate-credentials', protect, admin, onboardingController.regenerateCredentials);
router.post('/employees/:id/send-onboarding-email', protect, admin, onboardingController.sendPreOnboardingEmail);
router.patch('/employees/:id/documents/:docId/flag', protect, admin, onboardingController.flagDocument);
router.patch('/employees/:id/documents/:docId/approve', protect, admin, onboardingController.approveDocument);
router.post('/employees/:id/extension/:extId/resolve', protect, admin, onboardingController.resolveExtensionRequest);
router.get('/employees/:id/download', protect, admin, onboardingController.downloadAllDocuments);
router.get('/employees/:id/offer-letter', protect, admin, onboardingController.generateOfferLetter);
router.get('/employees/:id/declaration', protect, admin, onboardingController.generateDeclaration);
router.post('/employees/:id/transfer-to-active', protect, admin, onboardingController.transferToActiveEmployee);

// --- Settings & Templates ---
router.get('/settings', protect, admin, onboardingController.getOnboardingSettings);
router.post('/settings/templates', protect, admin, onboardingController.updateTemplate);
router.post('/settings/templates/upload', protect, admin, upload.single('document'), onboardingController.uploadAndSetTemplate);
router.post('/settings/templates/dynamic/upload', protect, admin, upload.single('document'), onboardingController.addDynamicTemplate);
router.delete('/settings/templates/dynamic/:templateId', protect, admin, onboardingController.deleteDynamicTemplate);
router.get('/settings/templates/:type/preview', protect, admin, onboardingController.getTemplatePreview);
router.get('/settings/templates/:type/download', protect, admin, onboardingController.downloadTemplate);

// --- Policies ---
router.post('/settings/policies/upload', protect, admin, upload.single('document'), onboardingController.addPolicy);
router.delete('/settings/policies/:policyId', protect, admin, onboardingController.deletePolicy);

// ==========================================
// EMPLOYEE SELF-SERVICE ROUTES (Public / Onboarding Token)
// ==========================================
router.post('/login', onboardingController.employeeLogin);
router.post('/change-password', protectOnboarding, onboardingController.changePassword);
router.get('/my-offer-letter', protectOnboarding, onboardingController.getMyOfferLetter);
router.post('/my-profile/accept-offer', protectOnboarding, onboardingController.acceptOfferLetter);
router.post('/refresh-token', protectOnboarding, onboardingController.refreshToken);
router.get('/my-profile', protectOnboarding, onboardingController.getMyOnboarding);
router.patch('/my-profile/:section', protectOnboarding, onboardingController.saveSection);
router.post('/my-profile/upload/:docId', protectOnboarding, upload.single('document'), onboardingController.uploadDocument);
router.post('/my-profile/upload-cheque', protectOnboarding, upload.single('document'), onboardingController.uploadCheque);
router.post('/my-profile/policies/:policyId/accept', protectOnboarding, onboardingController.acceptPolicy);
router.get('/my-profile/download-template/:templateId', protectOnboarding, onboardingController.downloadTemplateById);
router.post('/my-profile/templates/:templateId/accept', protectOnboarding, onboardingController.acceptTemplate);
router.post('/my-profile/submit', protectOnboarding, onboardingController.submitOnboarding);
router.post('/my-profile/request-extension', protectOnboarding, onboardingController.requestExtension);
router.post('/request-regeneration', onboardingController.requestCredentialRegeneration);

module.exports = router;
