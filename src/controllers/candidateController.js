const Candidate = require('../models/Candidate');
const { HiringRequest } = require('../models/HiringRequest');
const { cloudinary } = require('../config/cloudinary');
const { extractPublicIdFromUrl } = require('../utils/cloudinaryHelper');

// Upload resume to Cloudinary
exports.uploadResume = async (req, res) => {
    try {
        const { hiringRequestId } = req.params;

        console.log('📤 Upload resume request for hiring request:', hiringRequestId);

        // Verify hiring request exists
        const hiringRequest = await HiringRequest.findById(hiringRequestId);
        if (!hiringRequest) {
            return res.status(404).json({ message: 'Hiring request not found' });
        }

        // Check if file is uploaded
        if (!req.file) {
            console.log('❌ No file in request');
            return res.status(400).json({ message: 'No file uploaded' });
        }

        console.log('📄 File received:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
            path: req.file.path
        });

        // File is already uploaded to Cloudinary by multer middleware
        // req.file.path contains the Cloudinary URL
        const resumeUrl = req.file.path;

        // Extract public_id from the Cloudinary URL
        const { extractPublicIdFromUrl } = require('../utils/cloudinaryHelper');
        const resumePublicId = extractPublicIdFromUrl(resumeUrl);

        console.log('✅ Resume uploaded successfully to Cloudinary');
        console.log('📎 Public ID:', resumePublicId);
        console.log('📎 Resume URL:', resumeUrl);

        res.status(200).json({
            message: 'Resume uploaded successfully',
            resumeUrl: resumeUrl,
            resumePublicId: resumePublicId
        });

    } catch (error) {
        console.error('❌ Error uploading resume:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Create new candidate
exports.createCandidate = async (req, res) => {
    try {
        const {
            hiringRequestId,
            resumeUrl,
            resumePublicId,
            candidateName,
            email,
            mobile,
            source,
            referralName,
            profilePulledBy,
            currentCTC,
            expectedCTC,
            preference,
            totalExperience,
            qualification,
            currentCompany,
            pastExperience,
            currentLocation,
            preferredLocation,
            tatToJoin,
            noticePeriod,
            status,
            remark
        } = req.body;

        // Verify hiring request exists
        const hiringRequest = await HiringRequest.findById(hiringRequestId);
        if (!hiringRequest) {
            return res.status(404).json({ message: 'Hiring request not found' });
        }

        // Check for duplicate email in same hiring request
        const existingCandidate = await Candidate.findOne({ hiringRequestId, email });
        if (existingCandidate) {
            return res.status(400).json({ message: 'Candidate with this email already exists for this hiring request' });
        }

        // Create candidate
        const candidate = new Candidate({
            hiringRequestId,
            resumeUrl,
            resumePublicId,
            uploadedBy: req.user._id,
            candidateName,
            email,
            mobile,
            source,
            referralName,
            profilePulledBy,
            currentCTC,
            expectedCTC,
            preference,
            totalExperience,
            qualification,
            currentCompany,
            pastExperience,
            currentLocation,
            preferredLocation,
            tatToJoin,
            noticePeriod,
            status: status || 'Interested',
            remark,
            statusHistory: [{
                status: status || 'Interested',
                changedBy: req.user._id,
                changedAt: new Date(),
                remark
            }]
        });

        await candidate.save();

        const populatedCandidate = await Candidate.findById(candidate._id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails');

        res.status(201).json({
            message: 'Candidate created successfully',
            candidate: populatedCandidate
        });

    } catch (error) {
        console.error('Error creating candidate:', error);
        if (error.code === 11000) {
            return res.status(400).json({ message: 'Candidate with this email already exists for this hiring request' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all candidates for a hiring request
exports.getCandidatesByHiringRequest = async (req, res) => {
    try {
        const { hiringRequestId } = req.params;

        const candidates = await Candidate.find({ hiringRequestId })
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails')
            .sort({ uploadedAt: -1 });

        res.status(200).json({
            count: candidates.length,
            candidates
        });

    } catch (error) {
        console.error('Error fetching candidates:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get single candidate by ID
exports.getCandidateById = async (req, res) => {
    try {
        const { id } = req.params;

        const candidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails')
            .populate('statusHistory.changedBy', 'firstName lastName');

        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        res.status(200).json(candidate);

    } catch (error) {
        console.error('Error fetching candidate:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update candidate
exports.updateCandidate = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        // Check if email is being changed and if it conflicts
        if (updateData.email && updateData.email !== candidate.email) {
            const existingCandidate = await Candidate.findOne({
                hiringRequestId: candidate.hiringRequestId,
                email: updateData.email,
                _id: { $ne: id }
            });
            if (existingCandidate) {
                return res.status(400).json({ message: 'Another candidate with this email already exists for this hiring request' });
            }
        }

        // Track status change
        if (updateData.status && updateData.status !== candidate.status) {
            candidate.statusHistory.push({
                status: updateData.status,
                changedBy: req.user._id,
                changedAt: new Date(),
                remark: updateData.remark || ''
            });
        }

        // Update fields
        Object.keys(updateData).forEach(key => {
            if (key !== 'statusHistory' && key !== 'uploadedBy' && key !== 'uploadedAt') {
                candidate[key] = updateData[key];
            }
        });

        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails');

        res.status(200).json({
            message: 'Candidate updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating candidate:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete candidate
exports.deleteCandidate = async (req, res) => {
    try {
        const { id } = req.params;

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        // Delete resume from Cloudinary
        if (candidate.resumePublicId) {
            try {
                await cloudinary.uploader.destroy(candidate.resumePublicId, { resource_type: 'raw' });
            } catch (cloudinaryError) {
                console.error('Error deleting from Cloudinary:', cloudinaryError);
                // Continue with deletion even if Cloudinary fails
            }
        }

        await Candidate.findByIdAndDelete(id);

        res.status(200).json({ message: 'Candidate deleted successfully' });

    } catch (error) {
        console.error('Error deleting candidate:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update candidate status
exports.updateCandidateStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remark } = req.body;

        if (!status) {
            return res.status(400).json({ message: 'Status is required' });
        }

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        // Add to status history
        candidate.statusHistory.push({
            status,
            changedBy: req.user._id,
            changedAt: new Date(),
            remark: remark || ''
        });

        candidate.status = status;
        if (remark) candidate.remark = remark;

        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('statusHistory.changedBy', 'firstName lastName');

        res.status(200).json({
            message: 'Status updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get distinct candidate sources
exports.getCandidateSources = async (req, res) => {
    try {
        const sources = await Candidate.distinct('source');
        // Ensure default sources are included if not present in DB
        const defaultSources = ['Job Portal', 'Referral'];
        const allSources = [...new Set([...defaultSources, ...sources])];

        res.status(200).json(allSources.sort());
    } catch (error) {
        console.error('Error fetching sources:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
