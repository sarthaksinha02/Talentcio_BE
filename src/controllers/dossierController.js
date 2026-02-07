const EmployeeProfile = require('../models/EmployeeProfile');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { cloudinary } = require('../config/cloudinary');
const { extractPublicIdFromUrl } = require('../utils/cloudinaryHelper');

// Helper to check permissions (Simplified for now, ideally strictly middleware)
// But we need granular field filtering here
const filterProfileFields = (profile, viewer, isSelf) => {
    let profileObj = profile.toObject();
    const permissions = viewer.permissions || [];
    // Safe check for roles array
    const roles = Array.isArray(viewer.roles) ? viewer.roles : [];
    const isAdmin = roles.some(r => r && r.name === 'Admin');

    const canViewSensitive = isAdmin || permissions.includes('dossier.view.sensitive');

    if (!canViewSensitive && !isSelf) {
        // Redact sensitive info
        delete profileObj.compensation;
        delete profileObj.identity;
        delete profileObj.family; // New family section is sensitive
        // Filter documents to remove sensitive ones if needed
    }

    return profileObj;
};

exports.getDossier = async (req, res) => {
    try {
        const { userId } = req.params;
        const viewerId = req.user._id.toString();
        const isSelf = userId === viewerId;

        // Verify existence
        const targetUser = await User.findById(userId);
        if (!targetUser) return res.status(404).json({ message: 'User not found' });

        let profile = await EmployeeProfile.findOne({ user: userId })
            .select('+identity.aadhaarNumber +identity.panNumber +identity.passportNumber +compensation.ctc +compensation.bankDetails.accountNumber +personal.medicalConditions')
            .populate({
                path: 'user',
                select: 'firstName lastName email employeeCode roles department joiningDate employmentType',
                populate: { path: 'roles', select: 'name' }
            })
            .populate('employment.businessUnit', 'name')
            .populate('employment.reportingManager', 'firstName lastName')
            .populate('company', 'name');

        if (!profile) {
            // Safety Check: Ensure Company ID exists
            const companyId = targetUser.company || req.user.company;

            if (!companyId) {
                console.error(`[CRITICAL] Cannot create dossier: User ${userId} has no company assigned.`);
                return res.status(400).json({
                    message: 'Data Error: User has no company assigned. Please contact support.',
                    code: 'MISSING_COMPANY'
                });
            }

            // Create a skeleton profile if it doesn't exist (Lazy Initialization)
            profile = new EmployeeProfile({
                user: userId,
                company: companyId,
                personal: {
                    firstName: targetUser.firstName,
                    lastName: targetUser.lastName
                },
                contact: {
                    personalEmail: targetUser.email
                },
                employment: {
                    department: targetUser.department,
                    reportingManager: targetUser.reportingManagers?.[0],
                    joiningDate: targetUser.joiningDate
                },
                compensation: {},
                documents: []
            });
            await profile.save();
            await User.findByIdAndUpdate(userId, { employeeProfile: profile._id });

            // Re-fetch to get populated fields
            profile = await EmployeeProfile.findById(profile._id)
                .populate({
                    path: 'user',
                    select: 'firstName lastName email employeeCode roles department joiningDate',
                    populate: { path: 'roles', select: 'name' }
                })
                .populate('employment.businessUnit', 'name')
                .populate('employment.reportingManager', 'firstName lastName')
                .populate('company', 'name');
        } else {
            // Sync missing data for existing profiles
            let changed = false;
            if (!profile.employment?.department && targetUser.department) {
                if (!profile.employment) profile.employment = {};
                profile.employment.department = targetUser.department;
                changed = true;
            }
            if (!profile.employment?.reportingManager && targetUser.reportingManagers?.length > 0) {
                if (!profile.employment) profile.employment = {};
                profile.employment.reportingManager = targetUser.reportingManagers[0];
                changed = true;
            }
            if (!profile.employment?.joiningDate && targetUser.joiningDate) {
                if (!profile.employment) profile.employment = {};
                profile.employment.joiningDate = targetUser.joiningDate;
                changed = true;
            }
            if (changed) {
                await profile.save();
                await profile.populate('employment.reportingManager', 'firstName lastName');
            }
        }

        const filteredProfile = filterProfileFields(profile, req.user, isSelf);
        res.status(200).json(filteredProfile);

    } catch (error) {
        console.error('Get Dossier Error:', error);
        // Return full error in response for easier debugging in Staging/Prod
        res.status(500).json({
            message: 'Server Error',
            error: error.message,
            stack: process.env.NODE_ENV === 'production' ? '🥞' : error.stack
        });
    }
};

exports.submitHRIS = async (req, res) => {
    try {
        const { userId } = req.params;
        const updates = req.body; // Expecting complex object
        const viewerId = req.user._id.toString();
        const isSelf = userId === viewerId;
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');

        if (!isAdmin && !isSelf) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        const profile = await EmployeeProfile.findOne({ user: userId })
            .select('+identity.aadhaarNumber +identity.panNumber +identity.passportNumber +compensation.ctc +compensation.bankDetails.accountNumber');

        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        // Map updates to sections
        if (updates.personal) profile.personal = { ...profile.personal.toObject(), ...updates.personal };
        if (updates.identity) profile.identity = { ...profile.identity.toObject(), ...updates.identity };
        if (updates.contact) profile.contact = { ...profile.contact.toObject(), ...updates.contact };
        if (updates.family) profile.family = { ...profile.family.toObject(), ...updates.family };
        if (updates.employment) profile.employment = { ...profile.employment.toObject(), ...updates.employment };
        if (updates.compensation) {
            profile.compensation = {
                ...profile.compensation.toObject(),
                ...updates.compensation,
                bankDetails: { ...profile.compensation.bankDetails, ...updates.compensation.bankDetails }
            };
        }
        if (updates.education) profile.education = updates.education;
        if (updates.experience) profile.experience = updates.experience;
        if (updates.skills) profile.skills = updates.skills;

        // HRIS Specific Status
        if (updates.hris) {
            profile.hris = {
                ...profile.hris,
                ...updates.hris,
                lastUpdatedAt: new Date()
            };
            if (updates.hris.isDeclared) {
                if (!profile.hris.submittedAt) {
                    profile.hris.submittedAt = new Date();
                    profile.hris.declarationDate = new Date();
                }
                // Set status to Pending Approval when declared
                profile.hris.status = 'Pending Approval';
            }
        }

        await profile.save();

        await AuditLog.create({
            action: 'SUBMIT_HRIS',
            module: 'EmployeeDossier',
            performedBy: req.user._id,
            company: req.user.company,
            details: { targetUser: userId },
            ipAddress: req.ip
        });

        res.status(200).json({ message: 'HRIS Form saved successfully', profile });

    } catch (error) {
        console.error('Submit HRIS Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.updateSection = async (req, res) => {
    try {
        const { userId, section } = req.params;
        const updates = req.body; // Expecting object matching the section structure
        const viewerId = req.user._id.toString();
        const isSelf = userId === viewerId;
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');

        // Permission Check
        if (!isAdmin && !isSelf) {
            return res.status(403).json({ message: 'Not authorized to edit this profile' });
        }

        // Check for specific permission to edit sensitive sections
        const userPermissions = req.user.roles.reduce((acc, role) => acc.concat(role.permissions || []), []);
        const canEditSensitive = userPermissions.some(p => p.key === 'dossier.edit.sensitive');

        if (isSelf && !isAdmin && !canEditSensitive && ['employment', 'compensation', 'identity'].includes(section)) {
            return res.status(403).json({ message: 'You cannot edit this section yourself. Contact HR.' });
        }

        const profile = await EmployeeProfile.findOne({ user: userId })
            .select('+identity.aadhaarNumber +identity.panNumber +identity.passportNumber +compensation.ctc +compensation.bankDetails.accountNumber');
        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        // Update Logic
        if (!profile[section]) {
            // Initialize if missing (rare case due to default schema)
            // profile[section] = {}; 
        }

        // Apply updates intelligently
        Object.keys(updates).forEach(key => {
            let value = updates[key];
            // Handle empty strings for dates/numbers to avoid CastError
            if (value === "") {
                value = null;
            }

            // Nested object handling (simple 1-level for now as per current use cases)
            // If we need deep merge, we'd use a utility, but for these forms it's usually flat per section
            if (profile[section] && typeof profile[section] === 'object') {
                profile[section][key] = value;
            }
        });

        await profile.save();

        // Audit Log
        await AuditLog.create({
            action: 'UPDATE_DOSSIER',
            module: 'EmployeeDossier',
            performedBy: req.user._id,
            company: req.user.company,
            details: { targetUser: userId, section, updates: updates },
            ipAddress: req.ip
        });

        res.status(200).json({ message: 'Updated successfully', sectionData: profile[section] });

    } catch (error) {
        console.error('Update Dossier Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.addDocument = async (req, res) => {
    try {
        console.log('addDocument called for user:', req.params.userId);
        const { userId } = req.params;
        const { category, title, expiryDate } = req.body;

        console.log('Req body:', req.body);
        console.log('Req file:', req.file);

        const fileUrl = req.file ? req.file.path : req.body.url;

        if (!fileUrl) {
            console.error('No file URL found');
            return res.status(400).json({ message: 'No file uploaded or URL provided' });
        }

        const profile = await EmployeeProfile.findOne({ user: userId });
        if (!profile) {
            console.error('Profile not found for user:', userId);
            return res.status(404).json({ message: 'Profile not found' });
        }

        console.log('Pushing document to profile');
        profile.documents.push({
            category,
            title,
            fileName: req.file ? req.file.originalname : (fileUrl.split('/').pop() || 'document'),
            url: fileUrl,
            expiryDate,
            uploadDate: new Date(),
            verificationStatus: 'Pending'
        });

        await profile.save();
        console.log('Profile saved');

        console.log('Creating AuditLog');
        await AuditLog.create({
            action: 'UPLOAD_DOCUMENT',
            module: 'EmployeeDossier',
            performedBy: req.user._id,
            company: req.user.company,
            details: { targetUser: userId, docTitle: title },
            ipAddress: req.ip
        });
        console.log('AuditLog created');

        res.status(201).json(profile.documents);

    } catch (error) {
        console.error('Upload Document Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.deleteDocument = async (req, res) => {
    try {
        const { userId, docId } = req.params;
        const profile = await EmployeeProfile.findOne({ user: userId });

        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        // Find document to get title for audit log
        const doc = profile.documents.id(docId);
        if (!doc) return res.status(404).json({ message: 'Document not found' });

        const docTitle = doc.title;
        const fileUrl = doc.url;

        // cleanup from cloudinary
        if (fileUrl) {
            const publicId = extractPublicIdFromUrl(fileUrl);
            if (publicId) {
                console.log(`Attempting to delete image from Cloudinary. Public ID: ${publicId}`);
                try {
                    const result = await cloudinary.uploader.destroy(publicId);
                    console.log('Cloudinary deletion result:', result);
                } catch (cloudError) {
                    console.error('Cloudinary deletion failed:', cloudError);
                    // We continue to delete the record even if cloud deletion fails, 
                    // but we log it. Optionally, we could prevent deletion or mark for retry.
                }
            } else {
                console.warn('Could not extract public ID from URL:', fileUrl);
            }
        }

        // Remove document
        profile.documents.pull(docId);
        await profile.save();

        await AuditLog.create({
            action: 'DELETE_DOCUMENT',
            module: 'EmployeeDossier',
            performedBy: req.user._id,
            company: req.user.company,
            details: { targetUser: userId, docTitle: docTitle },
            ipAddress: req.ip
        });

        res.status(200).json(profile.documents);

    } catch (error) {
        console.error('Delete Document Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.proxyPdf = async (req, res) => {
    try {
        let { url } = req.query;
        console.log('Proxying URL:', url);

        if (!url || !url.includes('cloudinary')) {
            return res.status(400).json({ message: 'Invalid or missing Cloudinary URL' });
        }

        // Helper to attempt a fetch
        const attemptFetch = async (targetUrl) => {
            console.log('Fetching:', targetUrl);
            return axios({
                method: 'GET',
                url: targetUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Referer': 'https://res.cloudinary.com/'
                },
                validateStatus: (status) => status < 400
            });
        };

        // Extract version
        // Matches /v12345/
        const versionMatch = url.match(/\/upload\/v(\d+)\//);
        const version = versionMatch ? versionMatch[1] : undefined;

        // Helper to generate signed URL
        const getSignedUrl = (targetUrl, type) => {
            const publicId = extractPublicIdFromUrl(targetUrl);
            if (!publicId) return null;

            const resourceType = targetUrl.includes('/video/') ? 'video' : (targetUrl.includes('/raw/') ? 'raw' : 'image');

            return cloudinary.url(publicId, {
                resource_type: resourceType,
                secure: true,
                sign_url: true,
                type: type, // 'authenticated' or 'upload' or 'private'
                version: version, // Crucial for valid signature if versioned
                format: 'pdf' // Validate/Force extension
            });
        };


        // Define fetch candidates
        const candidates = [];

        // 1. Original URL
        candidates.push(url);

        // 2. Alternate Type URL (Swap image <-> raw)
        let alternateUrl = null;
        if (url.includes('/image/upload/')) {
            alternateUrl = url.replace('/image/upload/', '/raw/upload/');
        } else if (url.includes('/raw/upload/')) {
            alternateUrl = url.replace('/raw/upload/', '/image/upload/');
        }
        if (alternateUrl) candidates.push(alternateUrl);

        // 3. Signed Versions of Original (Authenticated & Upload)
        const signedOriginalAuth = getSignedUrl(url, 'authenticated');
        if (signedOriginalAuth) candidates.push(signedOriginalAuth);

        const signedOriginalUpload = getSignedUrl(url, 'upload');
        if (signedOriginalUpload) candidates.push(signedOriginalUpload);

        // 4. Signed Versions of Alternate
        if (alternateUrl) {
            const signedAlternateAuth = getSignedUrl(alternateUrl, 'authenticated');
            if (signedAlternateAuth) candidates.push(signedAlternateAuth);

            const signedAlternateUpload = getSignedUrl(alternateUrl, 'upload');
            if (signedAlternateUpload) candidates.push(signedAlternateUpload);
        }

        // Execute sequentially until success
        let finalResponse;
        let errors = [];

        for (const candidate of candidates) {
            if (!candidate) continue;
            try {
                const res = await attemptFetch(candidate);

                // Check if content length is valid (> 0)
                const len = res.headers['content-length'];
                if (len && parseInt(len) === 0) {
                    throw new Error('Empty response body');
                }

                if (res.status < 400) {
                    finalResponse = res;
                    break;
                }
            } catch (err) {
                // If it's a 404/401, axios might not throw if validateStatus is true (but we set it <400 above)
                // If validateStatus fails, it throws.
                console.warn(`Failed candidate ${candidate}: ${err.message}`);
                errors.push(`${candidate}: ${err.message}`);
            }
        }

        if (!finalResponse) {
            console.error('All proxy attempts failed', errors);
            return res.status(502).json({ message: 'Failed to fetch document', details: errors });
        }

        // Forward headers
        const contentType = finalResponse.headers['content-type'];
        const contentLength = finalResponse.headers['content-length'];

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);

        res.setHeader('Content-Disposition', 'inline');

        finalResponse.data.pipe(res);

    } catch (error) {
        console.error('Proxy Pdf Global Error:', error.message);
        res.status(500).json({ message: 'Proxy Server Error', error: error.message });
    }
};

exports.getDossierHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const logs = await AuditLog.find({
            'details.targetUser': userId,
            module: 'EmployeeDossier'
        })
            .populate('performedBy', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.status(200).json(logs);
    } catch (error) {
        console.error('Fetch History Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Get all pending HRIS requests
// @route   GET /api/dossier/requests
// @access  Private (Admin or Manager)
exports.getHRISRequests = async (req, res) => {
    try {
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');

        let query = { 'hris.status': { $in: ['Pending Approval', 'Approved', 'Rejected'] } };

        // If not admin, only show direct reports (Manager view)
        if (!isAdmin) {
            query['employment.reportingManager'] = req.user._id;
        }

        const requests = await EmployeeProfile.find(query)
            .populate('user', 'firstName lastName employeeCode department');

        const formattedRequests = requests.map(reqProfile => {
            if (!reqProfile.user) return null;
            return {
                _id: reqProfile.user._id,
                firstName: reqProfile.user.firstName,
                lastName: reqProfile.user.lastName,
                employeeCode: reqProfile.user.employeeCode,
                department: reqProfile.user.department,
                employeeProfile: {
                    hris: {
                        submittedAt: reqProfile.hris?.submittedAt,
                        status: reqProfile.hris?.status
                    }
                }
            };
        }).filter(r => r !== null);

        res.status(200).json(formattedRequests);
    } catch (error) {
        console.error('Get HRIS Requests Error:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.approveHRIS = async (req, res) => {
    try {
        const { userId } = req.params;
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');

        // Find profile and populate manager
        const profile = await EmployeeProfile.findOne({ user: userId })
            .populate('employment.reportingManager');

        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        const isManager = profile.employment?.reportingManager?._id.toString() === req.user._id.toString();

        if (!isAdmin && !isManager) {
            return res.status(403).json({ message: 'Not authorized to approve this HRIS' });
        }

        profile.hris.status = 'Approved';
        profile.hris.approvedBy = req.user._id;
        profile.hris.approvalDate = new Date();
        profile.hris.rejectionReason = null;

        await profile.save();

        await AuditLog.create({
            action: 'APPROVE_HRIS',
            module: 'EmployeeDossier',
            performedBy: req.user._id,
            company: req.user.company,
            details: { targetUser: userId },
            ipAddress: req.ip
        });

        res.status(200).json({ message: 'HRIS Approved successfully', hris: profile.hris });
    } catch (error) {
        console.error('Approve HRIS Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.rejectHRIS = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason } = req.body;
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');

        const profile = await EmployeeProfile.findOne({ user: userId })
            .populate('employment.reportingManager');

        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        const isManager = profile.employment?.reportingManager?._id.toString() === req.user._id.toString();

        if (!isAdmin && !isManager) {
            return res.status(403).json({ message: 'Not authorized to reject this HRIS' });
        }

        profile.hris.status = 'Rejected';
        profile.hris.rejectionReason = reason;
        profile.hris.approvedBy = null;
        profile.hris.approvalDate = null;

        await profile.save();

        await AuditLog.create({
            action: 'REJECT_HRIS',
            module: 'EmployeeDossier',
            performedBy: req.user._id,
            company: req.user.company,
            details: { targetUser: userId, reason },
            ipAddress: req.ip
        });

        res.status(200).json({ message: 'HRIS Rejected', hris: profile.hris });
    } catch (error) {
        console.error('Reject HRIS Error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

exports.exportHRISExcel = async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('HRIS Data');

        const query = { company: req.user.company };
        if (req.query.userId) {
            query.user = req.query.userId;
        }

        const profiles = await EmployeeProfile.find(query)
            .sort({ 'hris.approvalDate': -1 })
            .select('+identity.aadhaarNumber +identity.panNumber +identity.passportNumber +compensation.bankDetails.accountNumber +compensation.ctc')
            .populate('user', 'employeeCode firstName lastName email')
            .populate('employment.businessUnit', 'name');

        const formatDate = (date) => date ? new Date(date).toLocaleDateString() : '';

        // --- Configuration: Define Sections and their Columns ---
        const sections = [
            {
                title: 'Employee Details',
                columns: [
                    { header: 'Employee Code', key: 'empCode', width: 15 },
                    { header: 'First Name', key: 'firstName', width: 15 },
                    { header: 'Middle Name', key: 'middleName', width: 15 },
                    { header: 'Last Name', key: 'lastName', width: 15 },
                    { header: 'Gender', key: 'gender', width: 10 },
                    { header: 'Date of Birth', key: 'dob', width: 12 },
                    { header: 'Marital Status', key: 'maritalStatus', width: 15 },
                    { header: 'Nationality', key: 'nationality', width: 15 },
                    { header: 'Blood Group', key: 'bloodGroup', width: 10 },
                    { header: 'Date of Joining', key: 'joiningDate', width: 12 },
                ]
            },
            {
                title: 'Contact Information',
                columns: [
                    { header: 'Personal Email ID', key: 'personalEmail', width: 25 },
                    { header: 'Mobile Number', key: 'mobile', width: 15 },
                    { header: 'Alternate Mobile Number', key: 'altMobile', width: 15 },
                    { header: 'Emergency Contact Name', key: 'emergencyName', width: 20 },
                    { header: 'Emergency Contact Relationship', key: 'emergencyRelation', width: 15 },
                    { header: 'Emergency Contact Number', key: 'emergencyPhone', width: 15 },
                ]
            },
            {
                title: 'Address Details',
                columns: [
                    { header: 'Present', key: 'currAddrFull', width: 40 },
                    { header: 'Permanent', key: 'permAddrFull', width: 40 },
                    { header: 'Mailing', key: 'mailAddrFull', width: 40 },
                ]
            },
            {
                title: 'Bank Account Details',
                columns: [
                    { header: 'Account Holder Name', key: 'accHolder', width: 20 },
                    { header: 'Bank Name', key: 'bankName', width: 20 },
                    { header: 'Branch Name', key: 'branchName', width: 15 },
                    { header: 'Account Number', key: 'accNum', width: 20 },
                    { header: 'IFSC Code', key: 'ifsc', width: 15 },
                ]
            },
            {
                title: 'Government / Identity Details',
                columns: [
                    { header: 'PAN Number', key: 'pan', width: 15 },
                    { header: 'Aadhaar Number', key: 'aadhaar', width: 15 },
                    { header: 'Passport Number', key: 'passport', width: 15 },
                ]
            },
            {
                title: 'Medical Insurance Details',
                columns: [
                    { header: 'father name', key: 'fatherName', width: 20 },
                    { header: 'father occupation', key: 'fatherOcc', width: 20 },
                    { header: 'mother name', key: 'motherName', width: 20 },
                    { header: 'mother occupation', key: 'motherOcc', width: 20 },
                    { header: 'marital status', key: 'famMarital', width: 15 },
                    { header: 'total sibling', key: 'totalSiblings', width: 10 },
                    { header: 'spouse name', key: 'spouseName', width: 20 },
                    { header: 'spouse DOB', key: 'spouseDob', width: 12 },
                    { header: 'childern name', key: 'childNames', width: 25 },
                    { header: 'children DOB', key: 'childDobs', width: 25 },
                ]
            },
            {
                title: 'Educational Qualification',
                columns: [
                    { header: 'college name', key: 'college', width: 20 },
                    { header: 'Course Name', key: 'course', width: 20 },
                    { header: 'University', key: 'university', width: 20 },
                    { header: 'from date', key: 'eduFrom', width: 12 },
                    { header: 'to date', key: 'eduTo', width: 12 },
                    { header: 'Percentage / CGPA', key: 'cgpa', width: 10 },
                ]
            },
            {
                title: 'Work Experience',
                columns: [
                    { header: 'Total Years of Experience', key: 'totalExp', width: 10 },
                    { header: 'Previous Company Name', key: 'prevComp', width: 20 },
                    { header: 'Start Date', key: 'expStart', width: 12 },
                    { header: 'End Date', key: 'expEnd', width: 12 },
                ]
            },
            {
                title: 'Skills',
                columns: [
                    { header: 'Technical Skills', key: 'techSkills', width: 30 },
                    { header: 'Behavioral Skills', key: 'behavSkills', width: 30 },
                    { header: 'Skill you would like to learn', key: 'learnSkills', width: 30 },
                ]
            }
        ];

        // --- Build Headers ---

        let currentColumnIndex = 1;

        // Row 1: Section Headers
        const headerRow1 = sheet.getRow(1);
        headerRow1.font = { bold: true, size: 12 };
        headerRow1.alignment = { horizontal: 'center' };

        // Row 2: Sub Headers
        const headerRow2 = sheet.getRow(2);
        headerRow2.font = { bold: true };
        headerRow2.alignment = { horizontal: 'center', wrapText: true };

        // We need to define columns in ExcelJS to map keys correctly for addRow
        // But with empty separator columns, it's tricky. 
        // Strategy: We will manually map the key to the column object in the sheet
        const sheetColumns = [];

        sections.forEach((section, index) => {
            const startCol = currentColumnIndex;
            const endCol = startCol + section.columns.length - 1;

            // Merge cells for Section Title
            sheet.mergeCells(1, startCol, 1, endCol);
            const titleCell = sheet.getCell(1, startCol);
            titleCell.value = section.title;
            titleCell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD3D3D3' } // Light Gray
            };
            titleCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            // Set Sub Headers and Column Widths
            section.columns.forEach((col, colIdx) => {
                const effectiveCol = startCol + colIdx;
                const cell = sheet.getCell(2, effectiveCol);
                cell.value = col.header;

                // Construct column definition for ExcelJS
                // Note: We need to pad with empty/null columns for separators if we use sheet.columns assignment
                // Instead, we will assign column properties directly
                const column = sheet.getColumn(effectiveCol);
                column.key = col.key;
                column.width = col.width;
            });

            currentColumnIndex = endCol + 2; // +1 for next, +1 for empty separator column
        });

        // --- Populate Data ---
        profiles.forEach(p => {
            const getAddr = (type) => p.contact?.addresses?.find(a => a.type === type) || {};
            const curr = getAddr('Current');
            const perm = getAddr('Permanent');
            // Assuming 'Mailing' schema, fallback to empty
            const mail = p.contact?.addresses?.find(a => a.type === 'Mailing') || {};

            // Calculate total experience
            let totalExpYears = 0;
            if (p.experience && p.experience.length > 0) {
                const msInYear = 1000 * 60 * 60 * 24 * 365.25;
                totalExpYears = p.experience.reduce((acc, exp) => {
                    const start = exp.startDate ? new Date(exp.startDate) : new Date();
                    const end = exp.endDate ? new Date(exp.endDate) : new Date();
                    return acc + (end - start);
                }, 0) / msInYear;
            }

            // Determine max rows needed for this profile (based on array lengths)
            const eduCount = p.education?.length || 0;
            const expCount = p.experience?.length || 0;
            const childCount = p.family?.children?.length || 0;
            const maxRows = Math.max(1, eduCount, expCount, childCount);

            for (let i = 0; i < maxRows; i++) {
                const isFirst = i === 0;

                // Get array items for current row index
                const edu = p.education?.[i] || {};
                const exp = p.experience?.[i] || {};
                const child = p.family?.children?.[i] || {};

                // Helper to safely get date or empty
                const getDate = (d) => d ? formatDate(d) : '';

                // Helper to formatting address (only need to calculate once really, but simple enough)
                const formatFullAddr = (addr) => {
                    if (!addr || !addr.street) return '';
                    const parts = [
                        addr.street,
                        addr.city,
                        addr.state,
                        addr.country,
                        addr.zipCode
                    ];
                    return parts.filter(Boolean).join(', ');
                };

                const rowData = {
                    // --- STATIC FIELDS (Show only on first row) ---
                    empCode: isFirst ? p.user?.employeeCode : '',
                    firstName: isFirst ? p.user?.firstName : '',
                    middleName: '',
                    lastName: isFirst ? p.user?.lastName : '',
                    gender: isFirst ? p.personal?.gender : '',
                    dob: isFirst ? formatDate(p.personal?.dob) : '',
                    maritalStatus: isFirst ? p.personal?.maritalStatus : '',
                    nationality: isFirst ? p.personal?.nationality : '',
                    bloodGroup: isFirst ? p.personal?.bloodGroup : '',
                    joiningDate: isFirst ? formatDate(p.employment?.joiningDate) : '',

                    // Contact
                    personalEmail: isFirst ? p.contact?.personalEmail : '',
                    mobile: isFirst ? p.contact?.mobileNumber : '',
                    altMobile: isFirst ? p.contact?.alternateNumber : '',
                    emergencyName: isFirst ? p.contact?.emergencyContact?.name : '',
                    emergencyRelation: isFirst ? (p.contact?.emergencyContact?.relation || '') : '',
                    emergencyPhone: isFirst ? p.contact?.emergencyContact?.phone : '',

                    // Addresses (Consolidated)
                    currAddrFull: isFirst ? formatFullAddr(curr) : '',
                    permAddrFull: isFirst ? formatFullAddr(perm) : '',
                    mailAddrFull: isFirst ? formatFullAddr(mail) : '',

                    // Bank
                    accHolder: isFirst ? (p.compensation?.bankDetails?.accountHolderName || p.personal?.fullName || `${p.user?.firstName} ${p.user?.lastName}`) : '',
                    bankName: isFirst ? p.compensation?.bankDetails?.bankName : '',
                    branchName: '',
                    accNum: isFirst ? p.compensation?.bankDetails?.accountNumber : '',
                    ifsc: isFirst ? p.compensation?.bankDetails?.ifscCode : '',

                    // Identity
                    pan: isFirst ? p.identity?.panNumber : '',
                    aadhaar: isFirst ? p.identity?.aadhaarNumber : '',
                    passport: isFirst ? p.identity?.passportNumber : '',

                    // Family (Static Parents/Spouse)
                    fatherName: isFirst ? p.family?.fatherName : '',
                    fatherOcc: isFirst ? p.family?.fatherOccupation : '',
                    motherName: isFirst ? p.family?.motherName : '',
                    motherOcc: isFirst ? p.family?.motherOccupation : '',
                    famMarital: isFirst ? p.personal?.maritalStatus : '',
                    totalSiblings: isFirst ? p.family?.totalSiblings : '',
                    spouseName: isFirst ? p.family?.spouseName : '',
                    spouseDob: isFirst ? formatDate(p.family?.spouseDob) : '',

                    // --- ARRAY FIELDS (Spread across rows) ---

                    // Children (One per row)
                    childNames: child.name || '',
                    childDobs: getDate(child.dob),

                    // Education (One per row)
                    college: edu.institution || '',
                    course: edu.courseName || edu.degree || '',
                    university: edu.university || '',
                    eduFrom: getDate(edu.fromDate),
                    eduTo: getDate(edu.toDate),
                    cgpa: edu.grade || '',

                    // Experience (One per row)
                    totalExp: isFirst && totalExpYears > 0 ? totalExpYears.toFixed(1) : '', // Summary field only on first row
                    prevComp: exp.companyName || '',
                    expStart: getDate(exp.startDate),
                    expEnd: getDate(exp.endDate),

                    // Skills (Are arrays but usually comma separated list is better than rows for skills, keeping as comma separated on first row)
                    techSkills: isFirst ? (p.skills?.technical?.join(', ') || '') : '',
                    behavSkills: isFirst ? (p.skills?.behavioral?.join(', ') || '') : '',
                    learnSkills: isFirst ? (p.skills?.learningInterests?.join(', ') || '') : ''
                };

                sheet.addRow(rowData);
            }
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Employee_HRIS_Export.xlsx"');

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Export Excel Error:', error);
        res.status(500).json({ message: 'Failed to generate Excel' });
    }
};
