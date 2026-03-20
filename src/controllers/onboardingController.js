const OnboardingEmployee = require('../models/OnboardingEmployee');
const Company = require('../models/Company');
const { sendEmail } = require('../services/emailService');
const NotificationService = require('../services/notificationService');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { cloudinary } = require('../config/cloudinary');
const archiver = require('archiver');
const axios = require('axios');
const Docxtemplater = require('docxtemplater');
const PizZip = require('pizzip');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

// ==========================================
// HR ADMIN ENDPOINTS
// ==========================================

// Generate a random alphanumeric password
const generateTempPassword = (length = 10) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

// --- Add a new onboarding employee ---
exports.addEmployee = async (req, res) => {
    try {
        const { firstName, lastName, email, phone, designation, department, joiningDate, documentDeadline, offerLetterUrl, offerLetterPublicId } = req.body;

        if (!firstName || !email) {
            return res.status(400).json({ message: 'First name and email are required' });
        }

        // Check duplicate email within same company
        const existing = await OnboardingEmployee.findOne({ email, companyId: req.companyId });
        if (existing) {
            return res.status(400).json({ message: 'An onboarding entry with this email already exists' });
        }

        const tempEmployeeId = await OnboardingEmployee.generateTempId(req.companyId);
        const rawPassword = generateTempPassword();

        // Default document slots
        const defaultDocuments = [
            { type: 'aadhaar_front', label: 'Aadhaar Card (Front)' },
            { type: 'aadhaar_back', label: 'Aadhaar Card (Back)' },
            { type: 'pan', label: 'PAN Card' },
            { type: 'passport', label: 'Passport (Optional)' },
            { type: '10th_marksheet', label: '10th Marksheet / Certificate' },
            { type: '12th_marksheet', label: '12th Marksheet / Certificate' },
            { type: 'graduation', label: 'Graduation Marksheet / Certificate' },
            { type: 'relieving_letter', label: 'Previous Employer Relieving Letter' },
            { type: 'experience_certificate', label: 'Experience Certificate' },
            { type: 'passport_photo', label: 'Recent Passport-Size Photograph' }
        ];

        const employee = new OnboardingEmployee({
            tempEmployeeId,
            tempPassword: rawPassword,
            firstName,
            lastName: lastName || '',
            email,
            phone: phone || '',
            designation: designation || '',
            department: department || '',
            joiningDate: joiningDate || undefined,
            documentDeadline: documentDeadline || undefined,
            credentialsExpireAt: documentDeadline || undefined,
            offerLetterUrl: offerLetterUrl || '',
            offerLetterPublicId: offerLetterPublicId || '',
            documents: defaultDocuments,
            companyId: req.companyId,
            createdBy: req.user._id,
            auditLog: [{ action: 'CREATED', details: `Created by ${req.user.firstName || 'Admin'}` }]
        });

        await employee.save();

        // Send credentials via email
        const portalUrl = `${req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173'}/pre-onboarding/login`;
        const deadlineStr = documentDeadline ? new Date(documentDeadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not specified';

        await sendEmail({
            to: email,
            subject: `Welcome to the Team! Your Pre-Onboarding Portal Access - ${tempEmployeeId}`,
            html: `
                <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 32px; text-align: center;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Welcome Aboard! 🎉</h1>
                        <p style="color: #e0e7ff; margin-top: 8px;">Your pre-onboarding portal is ready</p>
                    </div>
                    <div style="padding: 32px;">
                        <p>Hello <strong>${firstName}</strong>,</p>
                        <p>We're excited to have you join us! Please use the credentials below to log in to your Pre-Onboarding Portal and complete your profile before your joining date.</p>
                        
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
                            <p style="margin: 4px 0;"><strong>Employee ID:</strong> <code style="background: #e0e7ff; padding: 2px 8px; border-radius: 4px; font-size: 16px;">${tempEmployeeId}</code></p>
                            <p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background: #e0e7ff; padding: 2px 8px; border-radius: 4px; font-size: 16px;">${rawPassword}</code></p>
                            <p style="margin: 4px 0;"><strong>Submission Deadline:</strong> ${deadlineStr}</p>
                        </div>

                        <div style="text-align: center; margin: 24px 0;">
                            <a href="${portalUrl}" style="background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; display: inline-block;">Open Pre-Onboarding Portal</a>
                        </div>

                        <p style="color: #64748b; font-size: 13px;">⚠️ You will be asked to change your password on first login. Please keep your credentials confidential.</p>
                    </div>
                    <div style="background: #f1f5f9; padding: 16px; text-align: center; color: #94a3b8; font-size: 12px;">
                        © ${new Date().getFullYear()} TalentCio. All rights reserved.
                    </div>
                </div>
            `
        });

        res.status(201).json({
            message: 'Onboarding employee added successfully. Credentials sent via email.',
            employee: {
                _id: employee._id,
                tempEmployeeId: employee.tempEmployeeId,
                firstName: employee.firstName,
                lastName: employee.lastName,
                email: employee.email,
                status: employee.status,
                joiningDate: employee.joiningDate,
                documentDeadline: employee.documentDeadline
            }
        });

    } catch (error) {
        console.error('Error adding onboarding employee:', error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Duplicate entry. This employee may already exist.' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Bulk add employees ---
exports.bulkAddEmployees = async (req, res) => {
    try {
        const { employees } = req.body;
        if (!employees || !Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({ message: 'An array of employees is required' });
        }

        const results = [];
        const errors = [];

        for (const emp of employees) {
            try {
                const existing = await OnboardingEmployee.findOne({ email: emp.email, companyId: req.companyId });
                if (existing) {
                    errors.push({ email: emp.email, reason: 'Already exists' });
                    continue;
                }

                const tempEmployeeId = await OnboardingEmployee.generateTempId(req.companyId);
                const rawPassword = generateTempPassword();

                const defaultDocuments = [
                    { type: 'aadhaar_front', label: 'Aadhaar Card (Front)' },
                    { type: 'aadhaar_back', label: 'Aadhaar Card (Back)' },
                    { type: 'pan', label: 'PAN Card' },
                    { type: 'passport', label: 'Passport (Optional)' },
                    { type: '10th_marksheet', label: '10th Marksheet / Certificate' },
                    { type: '12th_marksheet', label: '12th Marksheet / Certificate' },
                    { type: 'graduation', label: 'Graduation Marksheet / Certificate' },
                    { type: 'relieving_letter', label: 'Previous Employer Relieving Letter' },
                    { type: 'experience_certificate', label: 'Experience Certificate' },
                    { type: 'passport_photo', label: 'Recent Passport-Size Photograph' }
                ];

                const employee = new OnboardingEmployee({
                    tempEmployeeId,
                    tempPassword: rawPassword,
                    firstName: emp.firstName,
                    lastName: emp.lastName || '',
                    email: emp.email,
                    phone: emp.phone || '',
                    designation: emp.designation || '',
                    department: emp.department || '',
                    joiningDate: emp.joiningDate || undefined,
                    documentDeadline: emp.documentDeadline || undefined,
                    credentialsExpireAt: emp.documentDeadline || undefined,
                    documents: defaultDocuments,
                    companyId: req.companyId,
                    createdBy: req.user._id,
                    auditLog: [{ action: 'CREATED', details: 'Bulk created' }]
                });

                await employee.save();

                // Send email
                const portalUrl = `${req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:5173'}/pre-onboarding/login`;
                await sendEmail({
                    to: emp.email,
                    subject: `Welcome! Your Pre-Onboarding Portal Access - ${tempEmployeeId}`,
                    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:10px;"><h2 style="color:#2563eb;">Welcome Aboard, ${emp.firstName}!</h2><p>Your Employee ID: <strong>${tempEmployeeId}</strong></p><p>Your Temporary Password: <strong>${rawPassword}</strong></p><p><a href="${portalUrl}">Click here to login</a></p><p style="color:#666;font-size:13px;">You will be required to change your password on first login.</p></div>`
                });

                results.push({ email: emp.email, tempEmployeeId, status: 'Created' });
            } catch (innerErr) {
                errors.push({ email: emp.email, reason: innerErr.message });
            }
        }

        res.status(201).json({ message: `Processed ${results.length + errors.length} employees`, created: results, errors });
    } catch (error) {
        console.error('Error in bulk add:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Get all onboarding employees ---
exports.getOnboardingList = async (req, res) => {
    try {
        const { status, page = 1, limit = 20, search } = req.query;
        let query = { companyId: req.companyId };

        if (status && status !== 'All') query.status = status;
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { tempEmployeeId: { $regex: search, $options: 'i' } }
            ];
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [employees, total] = await Promise.all([
            OnboardingEmployee.find(query)
                .select('-tempPassword -auditLog')
                .populate('createdBy', 'firstName lastName')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            OnboardingEmployee.countDocuments(query)
        ]);

        // Get stats
        const stats = await OnboardingEmployee.aggregate([
            { $match: { companyId: require('mongoose').Types.ObjectId.createFromHexString(req.companyId.toString()) } },
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const statusCounts = { Pending: 0, 'In Progress': 0, Submitted: 0, Reviewed: 0 };
        stats.forEach(s => { statusCounts[s._id] = s.count; });

        res.status(200).json({
            employees,
            total,
            totalPages: Math.ceil(total / limitNum),
            currentPage: pageNum,
            stats: statusCounts
        });
    } catch (error) {
        console.error('Error fetching onboarding list:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Get single onboarding employee ---
exports.getOnboardingEmployee = async (req, res) => {
    try {
        const employee = await OnboardingEmployee.findOne({ _id: req.params.id, companyId: req.companyId })
            .select('-tempPassword')
            .populate('createdBy', 'firstName lastName')
            .lean();

        if (!employee) return res.status(404).json({ message: 'Onboarding employee not found' });

        res.status(200).json(employee);
    } catch (error) {
        console.error('Error fetching onboarding employee:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Flag a document for re-upload ---
exports.flagDocument = async (req, res) => {
    try {
        const { id, docId } = req.params;
        const { reason } = req.body;

        const employee = await OnboardingEmployee.findOne({ _id: id, companyId: req.companyId });
        if (!employee) return res.status(404).json({ message: 'Not found' });

        const doc = employee.documents.id(docId);
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        doc.status = 'Re-upload Required';
        doc.rejectionReason = reason || 'Please re-upload this document';

        // If the form was submitted, reopen it
        if (employee.status === 'Submitted' || employee.status === 'Reviewed') {
            employee.status = 'In Progress';
            employee.submittedAt = null;
            // Also reopen the declaration section to ensure re-signing
            if (employee.offerDeclaration) {
                employee.offerDeclaration.isComplete = false;
            }
        }

        employee.auditLog.push({ action: 'DOCUMENT_FLAGGED', details: `${doc.label} flagged: ${reason}` });
        await employee.save();

        // Send notification email to the employee
        await sendEmail({
            to: employee.email,
            subject: `Action Required: Re-upload ${doc.label}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e0e0e0;border-radius:10px;"><h2 style="color:#dc2626;">Document Re-upload Required</h2><p>Hello ${employee.firstName},</p><p>Your document <strong>${doc.label}</strong> requires re-upload.</p><p><strong>Reason:</strong> ${reason}</p><p>Please log in to your Pre-Onboarding Portal and upload the corrected document.</p></div>`
        });

        res.status(200).json({ message: 'Document flagged for re-upload', document: doc });
    } catch (error) {
        console.error('Error flagging document:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Approve a document ---
exports.approveDocument = async (req, res) => {
    try {
        const { id, docId } = req.params;

        const employee = await OnboardingEmployee.findOne({ _id: id, companyId: req.companyId });
        if (!employee) return res.status(404).json({ message: 'Not found' });

        const doc = employee.documents.id(docId);
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        doc.status = 'Approved';
        doc.rejectionReason = '';

        // Check if all uploaded docs are approved, then mark as Reviewed
        const allReviewed = employee.documents.every(d =>
            d.status === 'Approved' || d.status === 'Pending' // Pending means optional and not uploaded
        );
        if (allReviewed && employee.status === 'Submitted') {
            employee.status = 'Reviewed';
        }

        employee.auditLog.push({ action: 'DOCUMENT_APPROVED', details: `${doc.label} approved` });
        await employee.save();

        res.status(200).json({ message: 'Document approved', document: doc });
    } catch (error) {
        console.error('Error approving document:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Download all documents as ZIP ---
exports.downloadAllDocuments = async (req, res) => {
    try {
        const employee = await OnboardingEmployee.findOne({ _id: req.params.id, companyId: req.companyId }).lean();
        if (!employee) return res.status(404).json({ message: 'Not found' });

        const uploadedDocs = employee.documents.filter(d => d.url);
        if (uploadedDocs.length === 0) {
            return res.status(400).json({ message: 'No documents uploaded yet' });
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename=${employee.tempEmployeeId}_documents.zip`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        for (const doc of uploadedDocs) {
            try {
                const response = await axios.get(doc.url, { responseType: 'stream' });
                const ext = doc.url.split('.').pop().split('?')[0] || 'pdf';
                archive.append(response.data, { name: `${doc.label.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}` });
            } catch (downloadErr) {
                console.error(`Error downloading ${doc.label}:`, downloadErr.message);
            }
        }

        // Add bank cheque if present
        if (employee.bankDetails?.cancelledChequeUrl) {
            try {
                const response = await axios.get(employee.bankDetails.cancelledChequeUrl, { responseType: 'stream' });
                archive.append(response.data, { name: 'Cancelled_Cheque.pdf' });
            } catch (e) { /* skip */ }
        }

        await archive.finalize();
    } catch (error) {
        console.error('Error generating ZIP:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


// ==========================================
// EMPLOYEE SELF-SERVICE ENDPOINTS
// ==========================================

// --- Employee Login ---
exports.employeeLogin = async (req, res) => {
    try {
        const { tempEmployeeId, password } = req.body;

        if (!tempEmployeeId || !password) {
            return res.status(400).json({ message: 'Employee ID and password are required' });
        }

        // Find across all companies (employee may not know their company)
        const employee = await OnboardingEmployee.findOne({ tempEmployeeId });
        if (!employee) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Check expiry
        if (employee.credentialsExpireAt && new Date() > new Date(employee.credentialsExpireAt)) {
            return res.status(401).json({ message: 'Your credentials have expired. Please contact HR.' });
        }

        // Verify password
        const isMatch = await employee.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Generate JWT (15 min expiry for session timeout)
        const token = jwt.sign(
            { id: employee._id, type: 'onboarding', companyId: employee.companyId },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Log the login
        employee.auditLog.push({
            action: 'LOGIN',
            ip: req.ip || req.headers['x-forwarded-for'] || '',
            details: 'Employee logged in'
        });

        // Update status if first time
        if (employee.status === 'Pending') {
            employee.status = 'In Progress';
        }

        await employee.save();

        res.status(200).json({
            token,
            isPasswordChanged: employee.isPasswordChanged,
            employee: {
                _id: employee._id,
                tempEmployeeId: employee.tempEmployeeId,
                firstName: employee.firstName,
                lastName: employee.lastName,
                status: employee.status,
                documentDeadline: employee.documentDeadline,
                joiningDate: employee.joiningDate
            }
        });
    } catch (error) {
        console.error('Error in employee login:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Refresh token (for extending session) ---
exports.refreshToken = async (req, res) => {
    try {
        const token = jwt.sign(
            { id: req.onboardingEmployee._id, type: 'onboarding', companyId: req.onboardingEmployee.companyId },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );
        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Change Password (first login) ---
exports.changePassword = async (req, res) => {
    try {
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const employee = req.onboardingEmployee;
        employee.tempPassword = newPassword;
        employee.isPasswordChanged = true;
        employee.passwordChangedAt = new Date();
        employee.auditLog.push({ action: 'PASSWORD_CHANGE', details: 'Password changed on first login' });

        await employee.save();

        // Generate a new token
        const token = jwt.sign(
            { id: employee._id, type: 'onboarding', companyId: employee.companyId },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.status(200).json({ message: 'Password changed successfully', token });
    } catch (error) {
        console.error('Error changing password:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Get my onboarding profile ---
exports.getMyOnboarding = async (req, res) => {
    try {
        const employee = await OnboardingEmployee.findById(req.onboardingEmployee._id)
            .select('-tempPassword -auditLog')
            .lean();

        if (!employee) return res.status(404).json({ message: 'Not found' });

        res.status(200).json(employee);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Save a section (auto-save) ---
exports.saveSection = async (req, res) => {
    try {
        const { section } = req.params;
        const data = req.body;
        const employee = req.onboardingEmployee;

        if (employee.submittedAt && employee.status === 'Submitted') {
            return res.status(400).json({ message: 'Form is already submitted and read-only' });
        }

        const allowedSections = ['personalDetails', 'emergencyContact', 'bankDetails', 'offerDeclaration'];
        if (!allowedSections.includes(section)) {
            return res.status(400).json({ message: 'Invalid section' });
        }

        // Merge the update
        const update = {};
        for (const key of Object.keys(data)) {
            update[`${section}.${key}`] = data[key];
        }

        await OnboardingEmployee.findByIdAndUpdate(employee._id, { $set: update });

        employee.auditLog.push({ action: 'SAVE', details: `Section ${section} saved` });
        if (employee.status === 'Pending') {
            employee.status = 'In Progress';
        }
        await employee.save();

        res.status(200).json({ message: 'Section saved' });
    } catch (error) {
        console.error('Error saving section:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Upload a document ---
exports.uploadDocument = async (req, res) => {
    try {
        const { docId } = req.params;
        const employee = req.onboardingEmployee;

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Validate file size (5MB)
        if (req.file.size > 5 * 1024 * 1024) {
            return res.status(400).json({ message: 'File size exceeds 5MB limit' });
        }

        const doc = employee.documents.id(docId);
        if (!doc) return res.status(404).json({ message: 'Document slot not found' });

        // Delete old file from Cloudinary if replacing
        if (doc.publicId) {
            try {
                await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'raw' });
            } catch (e) { /* ignore */ }
        }

        const { extractPublicIdFromUrl } = require('../utils/cloudinaryHelper');

        doc.url = req.file.path;
        doc.publicId = extractPublicIdFromUrl(req.file.path);
        doc.status = 'Uploaded';
        doc.rejectionReason = '';
        doc.uploadedAt = new Date();

        employee.auditLog.push({ action: 'DOCUMENT_UPLOAD', details: `${doc.label} uploaded` });
        if (employee.status === 'Pending') employee.status = 'In Progress';

        await employee.save();

        res.status(200).json({ message: 'Document uploaded', document: doc });
    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Upload cancelled cheque ---
exports.uploadCheque = async (req, res) => {
    try {
        const employee = req.onboardingEmployee;

        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const { extractPublicIdFromUrl } = require('../utils/cloudinaryHelper');

        // Delete old if present
        if (employee.bankDetails?.cancelledChequePublicId) {
            try {
                await cloudinary.uploader.destroy(employee.bankDetails.cancelledChequePublicId, { resource_type: 'raw' });
            } catch (e) { /* ignore */ }
        }

        employee.bankDetails.cancelledChequeUrl = req.file.path;
        employee.bankDetails.cancelledChequePublicId = extractPublicIdFromUrl(req.file.path);

        employee.auditLog.push({ action: 'DOCUMENT_UPLOAD', details: 'Cancelled cheque uploaded' });
        await employee.save();

        res.status(200).json({
            message: 'Cheque uploaded',
            url: employee.bankDetails.cancelledChequeUrl
        });
    } catch (error) {
        console.error('Error uploading cheque:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// --- Submit the entire onboarding form ---
exports.submitOnboarding = async (req, res) => {
    try {
        const employee = await OnboardingEmployee.findById(req.onboardingEmployee._id).populate('createdBy', 'firstName lastName email');
        if (!employee) return res.status(404).json({ message: 'Not found' });

        if (employee.submittedAt) {
            return res.status(400).json({ message: 'Already submitted' });
        }

        // Validate all required sections are complete
        const errors = [];
        if (!employee.personalDetails?.isComplete) errors.push('Personal Details incomplete');
        if (!employee.emergencyContact?.isComplete) errors.push('Emergency Contact incomplete');
        if (!employee.bankDetails?.isComplete) errors.push('Bank Details incomplete');
        if (!employee.offerDeclaration?.isComplete) errors.push('Offer Declaration incomplete');

        // Check at least mandatory docs are uploaded
        const mandatoryDocTypes = ['aadhaar_front', 'aadhaar_back', 'pan', 'passport_photo'];
        for (const docType of mandatoryDocTypes) {
            const doc = employee.documents.find(d => d.type === docType);
            if (doc && (!doc.url || doc.status === 'Pending')) {
                errors.push(`${doc.label} not uploaded`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: 'Incomplete submission', errors });
        }

        employee.status = 'Submitted';
        employee.submittedAt = new Date();
        employee.auditLog.push({ action: 'SUBMIT', details: 'Onboarding form submitted' });

        await employee.save();

        // Notify HR (creator) via in-app notification
        if (employee.createdBy && employee.createdBy._id) {
            const io = req.app.get('io');
            await NotificationService.createNotification(io, {
                user: employee.createdBy._id,
                title: 'Onboarding Submission Received',
                message: `${employee.firstName} ${employee.lastName} (${employee.tempEmployeeId}) has submitted their pre-onboarding documents.`,
                type: 'Info',
                link: '/onboarding'
            });

            // Notify HR via email
            if (employee.createdBy.email) {
                await sendEmail({
                    to: employee.createdBy.email,
                    subject: `Onboarding Submitted: ${employee.firstName} ${employee.lastName}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                            <h2 style="color: #2563eb;">Onboarding Submission Received</h2>
                            <p>Hello <strong>${employee.createdBy.firstName}</strong>,</p>
                            <p><strong>${employee.firstName} ${employee.lastName}</strong> (${employee.tempEmployeeId}) has completed and submitted their pre-onboarding portal form and documents.</p>
                            <p>Please log in to the HR Portal to review the submission.</p>
                            <div style="margin-top: 24px; text-align: center;">
                                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/onboarding" style="background: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold;">Review Submission</a>
                            </div>
                        </div>
                    `
                });
            }
        }

        res.status(200).json({
            message: 'Onboarding form submitted successfully',
            submittedAt: employee.submittedAt
        });
    } catch (error) {
        console.error('Error submitting onboarding:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ==========================================
// ONBOARDING SETTINGS & TEMPLATES
// ==========================================

// GET /api/onboarding/settings
exports.getOnboardingSettings = async (req, res) => {
    try {
        const company = await Company.findById(req.companyId).select('settings.onboarding');
        res.json(company.settings.onboarding || { offerLetterTemplateUrl: '', declarationTemplateUrl: '' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch settings', error: error.message });
    }
};

// POST /api/onboarding/settings/templates
exports.updateTemplate = async (req, res) => {
    try {
        const { type, url } = req.body; // type: 'offerLetter' or 'declaration'
        const field = type === 'offerLetter' ? 'settings.onboarding.offerLetterTemplateUrl' : 'settings.onboarding.declarationTemplateUrl';

        await Company.findByIdAndUpdate(req.companyId, { [field]: url });
        res.json({ message: 'Template updated successfully!', url });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update template', error: error.message });
    }
};

// POST /api/onboarding/settings/templates/upload
exports.uploadAndSetTemplate = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const { type } = req.body; // 'offerLetter' or 'declaration'
        if (!['offerLetter', 'declaration'].includes(type)) {
            return res.status(400).json({ message: 'Invalid template type. Use offerLetter or declaration.' });
        }

        const url = req.file.path; // Cloudinary URL
        const field = type === 'offerLetter' ? 'settings.onboarding.offerLetterTemplateUrl' : 'settings.onboarding.declarationTemplateUrl';

        await Company.findByIdAndUpdate(req.companyId, { [field]: url });

        res.status(200).json({
            message: `${type === 'offerLetter' ? 'Offer Letter' : 'Declaration'} template uploaded and set successfully!`,
            url
        });
    } catch (error) {
        console.error('Error uploading template:', error);
        res.status(500).json({ message: 'Failed to upload template', error: error.message });
    }
};

const DUMMY_PREVIEW_DATA = {
    offer_date: 'June 30, 2025',
    employee_full_name: 'Johnathan Doe',
    employee_first_name: 'Johnathan',
    employee_last_name: 'Doe',
    employee_permanent_address: 'Permanent Address, India',
    employee_address: 'Permanent Address, India',
    employee_city: 'New Delhi',
    designation: 'Senior Software Engineer',
    department: 'Information Technology',
    joining_date: 'June 10, 2025',
    work_location: 'Gurugram (Hybrid)',
    probation_period: '6 months',
    annual_ctc: '₹ 25,00,000',
    basic_salary: '₹ 1,00,000',
    hra: '₹ 40,000',
    special_allowance: '₹ 68,333',
    monthly_gross: '₹ 2,08,333',
    monthly_ctc: '₹ 2,08,333',
    hr_name: 'Sarah Smith',
    hr_designation: 'HR Director',
    declaration_date: 'March 20, 2026',
    employee_signature_name: 'Johnathan Doe',
    employee_id: 'TEMP_123456'
};

// GET /api/onboarding/settings/templates/:type/preview
exports.getTemplatePreview = async (req, res) => {
    try {
        const { type } = req.params; // 'offerLetter' or 'declaration'
        const company = await Company.findById(req.companyId).select('settings.onboarding').lean();

        const customUrl = type === 'offerLetter' ? company?.settings?.onboarding?.offerLetterTemplateUrl : company?.settings?.onboarding?.declarationTemplateUrl;
        const defaultPath = type === 'offerLetter' ?
            path.join(__dirname, '../../templates/offer_letter_template.docx') :
            path.join(__dirname, '../../templates/declaration_template.docx');

        const { withData } = req.query;

        const content = await getTemplateContent(customUrl, defaultPath);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '—'
        });

        if (withData !== 'false') {
            doc.render(DUMMY_PREVIEW_DATA);
        }

        const buffer = doc.getZip().generate({ type: 'nodebuffer' });

        // Serve the populated .docx as a file for the frontend to render with docx-preview
        const filename = `Preview_${type}.docx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `inline; filename=${filename}`);
        res.send(buffer);
    } catch (error) {
        console.error('Error generating template preview:', error);
        res.status(500).json({ message: 'Failed to generate preview', error: error.message });
    }
};

// GET /api/onboarding/settings/templates/:type/download
exports.downloadTemplate = async (req, res) => {
    try {
        const { type } = req.params; // 'offerLetter' or 'declaration'
        const company = await Company.findById(req.companyId).select('settings.onboarding').lean();

        const customUrl = type === 'offerLetter' ? company?.settings?.onboarding?.offerLetterTemplateUrl : company?.settings?.onboarding?.declarationTemplateUrl;
        const defaultPath = type === 'offerLetter' ?
            path.join(__dirname, '../../templates/offer_letter_template.docx') :
            path.join(__dirname, '../../templates/declaration_template.docx');

        const content = await getTemplateContent(customUrl, defaultPath);

        const filename = `${type === 'offerLetter' ? 'OfferLetter' : 'Declaration'}_Template.docx`;
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

        // If content is already a buffer (from axios arraybuffer or fs.readFileSync)
        res.send(Buffer.from(content, 'binary'));
    } catch (error) {
        console.error('Error downloading template:', error);
        res.status(500).json({ message: 'Failed to download template', error: error.message });
    }
};

// ==========================================
// DOCUMENT GENERATION ENDPOINTS
// ==========================================

const getTemplateContent = async (customUrl, defaultPath) => {
    try {
        if (customUrl && typeof customUrl === 'string' && customUrl.startsWith('http')) {
            console.log('Fetching custom template from:', customUrl);
            const response = await axios.get(customUrl, { responseType: 'arraybuffer' });
            return response.data;
        }
    } catch (err) {
        console.error('Failed to fetch remote template, falling back to default:', err.message);
    }

    if (!fs.existsSync(defaultPath)) {
        throw new Error(`Default template not found at ${defaultPath}. Please run the template generation script.`);
    }
    return fs.readFileSync(defaultPath, 'binary');
};

const formatDate = (date) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const formatCurrency = (val) => {
    if (!val) return '—';
    const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return val;
    return '₹ ' + num.toLocaleString('en-IN');
};

// --- Generate & download Offer Letter ---
exports.generateOfferLetter = async (req, res) => {
    try {
        const [employee, company] = await Promise.all([
            OnboardingEmployee.findOne({ _id: req.params.id, companyId: req.companyId })
                .populate('createdBy', 'firstName lastName designation')
                .lean(),
            Company.findById(req.companyId).select('settings.onboarding').lean()
        ]);

        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const customUrl = company?.settings?.onboarding?.offerLetterTemplateUrl;
        const defaultPath = path.join(__dirname, '../../templates/offer_letter_template.docx');

        const content = await getTemplateContent(customUrl, defaultPath);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '—'
        });

        const fullName = employee.personalDetails?.fullName || `${employee.firstName} ${employee.lastName}`.trim();
        const permAddr = employee.personalDetails?.permanentAddress || employee.personalDetails?.currentAddress || {};
        const hrUser = employee.createdBy || {};

        doc.render({
            offer_date: formatDate(new Date()),
            employee_full_name: fullName,
            employee_first_name: employee.firstName,
            employee_last_name: employee.lastName,
            employee_permanent_address: [permAddr.line1, permAddr.line2].filter(Boolean).join(', ') || '—',
            employee_address: [permAddr.line1, permAddr.line2].filter(Boolean).join(', ') || '—',
            employee_city: permAddr.city || '—',
            designation: employee.designation || '—',
            department: employee.department || '—',
            joining_date: formatDate(employee.joiningDate),
            work_location: employee.workLocation || '—',
            probation_period: employee.probationPeriod || '6 months',
            annual_ctc: formatCurrency(employee.salary?.annualCTC),
            basic_salary: formatCurrency(employee.salary?.basic),
            hra: formatCurrency(employee.salary?.hra),
            special_allowance: formatCurrency(employee.salary?.specialAllowance),
            monthly_gross: formatCurrency(employee.salary?.monthlyGross),
            monthly_ctc: formatCurrency(employee.salary?.monthlyCTC),
            hr_name: hrUser.firstName ? `${hrUser.firstName} ${hrUser.lastName || ''}`.trim() : 'Authorized Signatory',
            hr_designation: hrUser.designation || 'HR Manager',
            declaration_date: formatDate(new Date()),
            employee_signature_name: fullName,
            employee_id: employee.tempEmployeeId
        });

        const buffer = doc.getZip().generate({ type: 'nodebuffer' });

        // Track generation
        await OnboardingEmployee.findByIdAndUpdate(employee._id, {
            letterGenerated: true,
            letterGeneratedAt: new Date(),
            $push: { auditLog: { action: 'OFFER_LETTER_GENERATED', details: `Offer letter generated by ${hrUser.firstName || 'Admin'}` } }
        });

        const safeName = fullName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename=OfferLetter_${safeName}.docx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);

    } catch (error) {
        console.error('Error generating offer letter:', error);
        res.status(500).json({ message: 'Failed to generate offer letter', error: error.message });
    }
};

// --- Generate & download Declaration ---
exports.generateDeclaration = async (req, res) => {
    try {
        const [employee, company] = await Promise.all([
            OnboardingEmployee.findOne({ _id: req.params.id, companyId: req.companyId })
                .populate('createdBy', 'firstName lastName designation')
                .lean(),
            Company.findById(req.companyId).select('settings.onboarding').lean()
        ]);

        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const customUrl = company?.settings?.onboarding?.declarationTemplateUrl;
        const defaultPath = path.join(__dirname, '../../templates/declaration_template.docx');

        const content = await getTemplateContent(customUrl, defaultPath);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '—'
        });

        const fullName = employee.personalDetails?.fullName || `${employee.firstName} ${employee.lastName}`.trim();
        const hrUser = employee.createdBy || {};

        doc.render({
            declaration_date: formatDate(new Date()),
            employee_full_name: fullName,
            employee_id: employee.tempEmployeeId,
            designation: employee.designation || '—',
            department: employee.department || '—',
            joining_date: formatDate(employee.joiningDate),
            work_location: employee.workLocation || '—',
            employee_signature_name: fullName,
            hr_name: hrUser.firstName ? `${hrUser.firstName} ${hrUser.lastName || ''}`.trim() : 'Authorized Signatory',
            hr_designation: hrUser.designation || 'HR Manager'
        });

        const buffer = doc.getZip().generate({ type: 'nodebuffer' });

        // Audit log
        await OnboardingEmployee.findByIdAndUpdate(employee._id, {
            $push: { auditLog: { action: 'DECLARATION_GENERATED', details: `Declaration generated by ${hrUser.firstName || 'Admin'}` } }
        });

        const safeName = fullName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename=Declaration_${safeName}.docx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);

    } catch (error) {
        console.error('Error generating declaration:', error);
        res.status(500).json({ message: 'Failed to generate declaration', error: error.message });
    }
};

// ==========================================
// EMPLOYEE SELF-SERVICE EXTENSIONS
// ==========================================

// --- Get My Offer Letter ---
exports.getMyOfferLetter = async (req, res) => {
    try {
        const [employee, company] = await Promise.all([
            OnboardingEmployee.findById(req.onboardingEmployee._id)
                .populate('createdBy', 'firstName lastName designation')
                .lean(),
            Company.findById(req.onboardingEmployee.companyId).select('settings.onboarding').lean()
        ]);

        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        const customUrl = company?.settings?.onboarding?.offerLetterTemplateUrl;
        const defaultPath = path.join(__dirname, '../../templates/offer_letter_template.docx');

        const content = await getTemplateContent(customUrl, defaultPath);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
            nullGetter: () => '—'
        });

        const fullName = employee.personalDetails?.fullName || `${employee.firstName} ${employee.lastName}`.trim();
        const permAddr = employee.personalDetails?.permanentAddress || employee.personalDetails?.currentAddress || {};
        const hrUser = employee.createdBy || {};

        doc.render({
            offer_date: formatDate(new Date()),
            employee_full_name: fullName,
            employee_first_name: employee.firstName,
            employee_permanent_address: [permAddr.line1, permAddr.line2].filter(Boolean).join(', ') || '—',
            employee_city: permAddr.city || '—',
            designation: employee.designation || '—',
            department: employee.department || '—',
            joining_date: formatDate(employee.joiningDate),
            work_location: employee.workLocation || '—',
            probation_period: employee.probationPeriod || '6 months',
            annual_ctc: formatCurrency(employee.salary?.annualCTC),
            basic_salary: formatCurrency(employee.salary?.basic),
            hra: formatCurrency(employee.salary?.hra),
            special_allowance: formatCurrency(employee.salary?.specialAllowance),
            monthly_gross: formatCurrency(employee.salary?.monthlyGross),
            monthly_ctc: formatCurrency(employee.salary?.monthlyCTC),
            hr_name: hrUser.firstName ? `${hrUser.firstName} ${hrUser.lastName || ''}`.trim() : 'Authorized Signatory',
            hr_designation: hrUser.designation || 'HR Manager',
            declaration_date: formatDate(new Date()),
            employee_signature_name: fullName,
            employee_id: employee.tempEmployeeId
        });

        const buffer = doc.getZip().generate({ type: 'nodebuffer' });

        await OnboardingEmployee.findByIdAndUpdate(employee._id, {
            $push: { auditLog: { action: 'OFFER_LETTER_DOWNLOADED', details: 'Employee downloaded offer letter.' } }
        });

        const safeName = fullName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename=OfferLetter_${safeName}.docx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.send(buffer);
    } catch (error) {
        console.error('Error downloading offer letter:', error);
        res.status(500).json({ message: 'Failed to download offer letter', error: error.message });
    }
};

// --- Accept Offer Letter ---
exports.acceptOfferLetter = async (req, res) => {
    try {
        const employee = await OnboardingEmployee.findByIdAndUpdate(req.onboardingEmployee._id, {
            offerStatus: 'Accepted',
            status: 'In Progress',
            $push: { auditLog: { action: 'OFFER_ACCEPTED', details: 'Employee accepted the offer letter terms.' } }
        }, { new: true });

        res.status(200).json({ message: 'Offer accepted successfully!', offerStatus: employee.offerStatus });
    } catch (error) {
        console.error('Error accepting offer letter:', error);
        res.status(500).json({ message: 'Failed to accept offer letter', error: error.message });
    }
};
