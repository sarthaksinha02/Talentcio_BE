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

        // Update fields securely (prevent mass assignment)
        const allowedUpdates = [
            'candidateName', 'email', 'mobile', 'source', 'referralName', 
            'profilePulledBy', 'currentCTC', 'expectedCTC', 'preference', 
            'totalExperience', 'qualification', 'currentCompany', 'pastExperience', 
            'currentLocation', 'preferredLocation', 'tatToJoin', 'noticePeriod', 
            'status', 'remark', 'decision'
        ];

        allowedUpdates.forEach(field => {
            if (updateData[field] !== undefined) {
                candidate[field] = updateData[field];
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

// Update candidate decision
exports.updateCandidateDecision = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision } = req.body;

        if (!decision) {
            return res.status(400).json({ message: 'Decision is required' });
        }

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        candidate.decision = decision;
        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails');

        res.status(200).json({
            message: 'Decision updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating decision:', error);
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

// --- INTERVIEW ROUNDS MANAGEMENT ---

// Add a new interview round
exports.addInterviewRound = async (req, res) => {
    try {
        const { id } = req.params;
        const { levelName, assignedTo, scheduledDate } = req.body;

        if (!levelName) {
            return res.status(400).json({ message: 'Level name is required' });
        }

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        const newRound = {
            levelName,
            assignedTo: assignedTo || [],
            status: 'Pending',
            scheduledDate
        };

        candidate.interviewRounds.push(newRound);
        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('interviewRounds.assignedTo', 'firstName lastName email')
            .populate('interviewRounds.evaluatedBy', 'firstName lastName');

        res.status(201).json({
            message: 'Interview round added successfully',
            round: updatedCandidate.interviewRounds[updatedCandidate.interviewRounds.length - 1],
            candidate: updatedCandidate
        });
    } catch (error) {
        console.error('Error adding interview round:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update an existing interview round (e.g., reschedule, change assignment)
exports.updateInterviewRound = async (req, res) => {
    try {
        const { id, roundId } = req.params;
        const { levelName, assignedTo, scheduledDate } = req.body;

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        const round = candidate.interviewRounds.id(roundId);
        if (!round) {
            return res.status(404).json({ message: 'Interview round not found' });
        }

        if (levelName) round.levelName = levelName;
        if (assignedTo !== undefined) round.assignedTo = assignedTo;
        if (scheduledDate !== undefined) round.scheduledDate = scheduledDate;

        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('interviewRounds.assignedTo', 'firstName lastName email')
            .populate('interviewRounds.evaluatedBy', 'firstName lastName');

        res.status(200).json({
            message: 'Interview round updated successfully',
            round: updatedCandidate.interviewRounds.id(roundId),
            candidate: updatedCandidate
        });
    } catch (error) {
        console.error('Error updating interview round:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Delete an interview round
exports.deleteInterviewRound = async (req, res) => {
    try {
        const { id, roundId } = req.params;

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        const round = candidate.interviewRounds.id(roundId);
        if (!round) {
            return res.status(404).json({ message: 'Interview round not found' });
        }

        candidate.interviewRounds.pull(roundId);
        await candidate.save();

        res.status(200).json({ message: 'Interview round deleted successfully' });
    } catch (error) {
        console.error('Error deleting interview round:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Evaluate an interview round (Pass/Fail)
exports.evaluateInterviewRound = async (req, res) => {
    try {
        const { id, roundId } = req.params;
        const { status, feedback } = req.body; // status should be 'Passed' or 'Failed'

        if (!['Passed', 'Failed'].includes(status)) {
            return res.status(400).json({ message: 'Status must be Passed or Failed' });
        }

        if (!feedback) {
            return res.status(400).json({ message: 'Feedback is required for evaluation' });
        }

        const candidate = await Candidate.findById(id).populate('interviewRounds.assignedTo');
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        const round = candidate.interviewRounds.id(roundId);
        if (!round) {
            return res.status(404).json({ message: 'Interview round not found' });
        }

        // Authorization check: User must be an assigned evaluator or have super approve
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasSuperApprove = userPermissions.includes('ta.super_approve') || userPermissions.includes('*');
        const isAssigned = round.assignedTo.some(user => user._id.toString() === req.user._id.toString());

        if (!isAssigned && !hasSuperApprove) {
            return res.status(403).json({ message: 'Forbidden: You are not authorized to evaluate this round' });
        }

        round.status = status;
        round.feedback = feedback;
        round.evaluatedBy = req.user._id;
        round.evaluatedAt = new Date();

        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('interviewRounds.assignedTo', 'firstName lastName email')
            .populate('interviewRounds.evaluatedBy', 'firstName lastName');

        res.status(200).json({
            message: `Round evaluated as ${status}`,
            round: updatedCandidate.interviewRounds.id(roundId),
            candidate: updatedCandidate
        });
    } catch (error) {
        console.error('Error evaluating interview round:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
