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
    const isAdmin = viewer.roles.some(r => r.name === 'Admin');

    const canViewSensitive = isAdmin || permissions.includes('dossier.view.sensitive');

    if (!canViewSensitive && !isSelf) {
        // Redact sensitive info
        delete profileObj.compensation;
        delete profileObj.identity;
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
            .select('+identity.aadhaarNumber +identity.panNumber +identity.passportNumber +compensation.ctc +compensation.bankDetails.accountNumber')
            .populate({
                path: 'user',
                select: 'firstName lastName email employeeCode roles department joiningDate employmentType',
                populate: { path: 'roles', select: 'name' }
            })
            .populate('employment.businessUnit', 'name')
            .populate('employment.reportingManager', 'firstName lastName')
            .populate('company', 'name');

        if (!profile) {
            // Create a skeleton profile if it doesn't exist (Lazy Initialization)
            profile = new EmployeeProfile({
                user: userId,
                company: req.user.company,
                personal: {},
                contact: {},
                employment: {
                    department: targetUser.department,
                    reportingManager: targetUser.reportingManagers?.[0]
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
            if (changed) {
                await profile.save();
                await profile.populate('employment.reportingManager', 'firstName lastName');
            }
        }

        const filteredProfile = filterProfileFields(profile, req.user, isSelf);
        res.status(200).json(filteredProfile);

    } catch (error) {
        console.error('Get Dossier Error:', error);
        res.status(500).json({ message: 'Server Error' });
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

        if (isSelf && !isAdmin && ['employment', 'compensation', 'identity'].includes(section)) {
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
