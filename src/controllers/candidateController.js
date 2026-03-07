const Candidate = require('../models/Candidate');
const { HiringRequest } = require('../models/HiringRequest');
const { cloudinary } = require('../config/cloudinary');
const { extractPublicIdFromUrl } = require('../utils/cloudinaryHelper');
const mongoose = require('mongoose');

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
            inHandOffer,
            offerCompany,
            offerCTC,
            preference,
            totalExperience,
            qualification,
            currentCompany,
            pastExperience,
            currentLocation,
            preferredLocation,
            tatToJoin,
            noticePeriod,
            lastWorkingDay,
            status,
            remark
        } = req.body;

        // Verify hiring request exists
        const hiringRequest = await HiringRequest.findById(hiringRequestId);
        if (!hiringRequest) {
            return res.status(404).json({ message: 'Hiring request not found' });
        }

        // Check for duplicate email in same hiring request
        const existingByEmail = await Candidate.findOne({ hiringRequestId, email });
        if (existingByEmail) {
            return res.status(400).json({ message: 'A candidate with this email is already added to this hiring request' });
        }

        // Check for duplicate mobile in same hiring request
        const existingByMobile = await Candidate.findOne({ hiringRequestId, mobile });
        if (existingByMobile) {
            return res.status(400).json({ message: 'A candidate with this mobile number is already added to this hiring request' });
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
            inHandOffer: inHandOffer || false,
            offerCompany,
            offerCTC,
            preference,
            totalExperience,
            qualification,
            currentCompany,
            pastExperience,
            currentLocation,
            preferredLocation,
            tatToJoin,
            noticePeriod,
            lastWorkingDay,
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
            return res.status(400).json({ message: 'A candidate with this email is already added to this hiring request' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get all candidates for a hiring request
exports.getCandidatesByHiringRequest = async (req, res) => {
    try {
        const { hiringRequestId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(hiringRequestId)) {
            return res.status(400).json({ message: 'Invalid Hiring Request ID format' });
        }

        // Verify if user has access to see all candidates vs only assigned ones
        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasTaView = userPermissions.includes('ta.view') || userPermissions.includes('*');

        // Check if user is creator/HM/recruiter/approver of the hiring request
        const hiringRequest = await HiringRequest.findById(hiringRequestId);
        const isRequestParticipant = hiringRequest && (
            hiringRequest.createdBy?._id?.toString() === req.user._id.toString() ||
            hiringRequest.ownership?.hiringManager?._id?.toString() === req.user._id.toString() ||
            hiringRequest.ownership?.recruiter?._id?.toString() === req.user._id.toString() ||
            hiringRequest.approvalChain?.some(step =>
                step.approvers?.some(approver => approver._id?.toString() === req.user._id.toString() || approver.toString() === req.user._id.toString())
            )
        );

        let query = { hiringRequestId };

        if (!isAdmin && !hasTaView && !isRequestParticipant) {
            // User is likely just an interviewer. Only show candidates they are assigned to.
            query['interviewRounds.assignedTo'] = req.user._id;
        }

        const candidates = await Candidate.find(query)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails')
            .sort({ uploadedAt: -1 })
            .lean();

        res.status(200).json({
            count: candidates.length,
            candidates
        });

    } catch (error) {
        console.error('Error fetching candidates:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Get shortlisted candidates for a hiring request with pagination
exports.getShortlistedCandidates = async (req, res) => {
    try {
        const { hiringRequestId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(hiringRequestId)) {
            return res.status(400).json({ message: 'Invalid Hiring Request ID format' });
        }

        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const skip = (page - 1) * limit;

        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasTaView = userPermissions.includes('ta.view') || userPermissions.includes('*');

        const hiringRequest = await HiringRequest.findById(hiringRequestId);
        const isRequestParticipant = hiringRequest && (
            hiringRequest.createdBy?._id?.toString() === req.user._id.toString() ||
            hiringRequest.ownership?.hiringManager?._id?.toString() === req.user._id.toString() ||
            hiringRequest.ownership?.recruiter?._id?.toString() === req.user._id.toString() ||
            hiringRequest.approvalChain?.some(step =>
                step.approvers?.some(approver => approver._id?.toString() === req.user._id.toString() || approver.toString() === req.user._id.toString())
            )
        );

        let query = { hiringRequestId, decision: { $in: ['Shortlisted', 'Hired'] } };

        if (!isAdmin && !hasTaView && !isRequestParticipant) {
            query['interviewRounds.assignedTo'] = req.user._id;
        }

        const totalOptions = await Candidate.countDocuments(query);
        const candidates = await Candidate.find(query)
            .populate('uploadedBy', 'firstName lastName')
            .populate('hiringRequestId', 'requestId roleDetails')
            .populate('interviewRounds.assignedTo', 'firstName lastName') // only pull what is necessary
            .select('candidateName email mobile status decision uploadedAt interviewRounds profilePulledBy totalExperience currentCTC expectedCTC location expectedLocation pastExperience currentCompany')
            .sort({ uploadedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        res.status(200).json({
            count: totalOptions,
            totalPages: Math.ceil(totalOptions / limit),
            currentPage: page,
            candidates
        });

    } catch (error) {
        console.error('Error fetching shortlisted candidates:', error);
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
            .populate('statusHistory.changedBy', 'firstName lastName')
            .populate('interviewRounds.assignedTo', 'firstName lastName email')
            .populate('interviewRounds.evaluatedBy', 'firstName lastName')
            .lean();

        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        // Verify if user has access to see this candidate
        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasTaView = userPermissions.includes('ta.view') || userPermissions.includes('*');

        const hiringRequest = candidate.hiringRequestId; // populated object

        const isRequestParticipant = hiringRequest && (
            hiringRequest.createdBy?._id?.toString() === req.user._id.toString() ||
            hiringRequest.ownership?.hiringManager?._id?.toString() === req.user._id.toString() ||
            hiringRequest.ownership?.recruiter?._id?.toString() === req.user._id.toString() ||
            (candidate.hiringRequestId.approvalChain && candidate.hiringRequestId.approvalChain.some(step =>
                step.approvers?.some(approver => approver._id?.toString() === req.user._id.toString() || approver.toString() === req.user._id.toString())
            ))
        );

        // Check if they are assigned to any round for this candidate
        const isAssignedInterviewer = candidate.interviewRounds?.some(round =>
            round.assignedTo?.some(ass => ass._id?.toString() === req.user._id.toString() || ass.toString() === req.user._id.toString())
        );

        if (!isAdmin && !hasTaView && !isRequestParticipant && !isAssignedInterviewer) {
            return res.status(403).json({ message: 'Forbidden: You do not have permission to view this candidate' });
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
            'profilePulledBy', 'currentCTC', 'expectedCTC', 'inHandOffer', 'offerCompany', 'offerCTC',
            'preference', 'totalExperience', 'qualification', 'currentCompany', 'pastExperience',
            'currentLocation', 'preferredLocation', 'tatToJoin', 'noticePeriod',
            'status', 'remark', 'decision', 'phase2Decision', 'phase3Decision', 'lastWorkingDay', 'resumeUrl', 'resumePublicId'
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

// Update candidate remark
exports.updateCandidateRemark = async (req, res) => {
    try {
        const { id } = req.params;
        const { remark } = req.body;

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        candidate.remark = remark;
        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails');

        res.status(200).json({
            message: 'Remark updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating remark:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update candidate internal remark (separate from sourcing remark)
exports.updateCandidateInternalRemark = async (req, res) => {
    try {
        const { id } = req.params;
        const { internalRemark } = req.body;

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        candidate.internalRemark = internalRemark;
        await candidate.save();

        res.status(200).json({
            message: 'Internal remark updated successfully',
            internalRemark: candidate.internalRemark
        });

    } catch (error) {
        console.error('Error updating internal remark:', error);
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

// Update candidate Phase 2 decision
exports.updatePhase2Decision = async (req, res) => {
    try {
        const { id } = req.params;
        const { phase2Decision } = req.body;

        if (!phase2Decision) {
            return res.status(400).json({ message: 'Phase 2 Decision is required' });
        }

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        candidate.phase2Decision = phase2Decision;
        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails');

        res.status(200).json({
            message: 'Phase 2 Decision updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating Phase 2 decision:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Update candidate Phase 3 decision (Offer & Onboarding)
exports.updatePhase3Decision = async (req, res) => {
    try {
        const { id } = req.params;
        const { phase3Decision } = req.body;

        if (!phase3Decision) {
            return res.status(400).json({ message: 'Phase 3 Decision is required' });
        }

        const candidate = await Candidate.findById(id);
        if (!candidate) {
            return res.status(404).json({ message: 'Candidate not found' });
        }

        candidate.phase3Decision = phase3Decision;
        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('uploadedBy', 'firstName lastName email')
            .populate('hiringRequestId', 'requestId roleDetails');

        res.status(200).json({
            message: 'Phase 3 Decision updated successfully',
            candidate: updatedCandidate
        });

    } catch (error) {
        console.error('Error updating Phase 3 decision:', error);
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
        const { levelName, assignedTo, scheduledDate, phase } = req.body;

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
            scheduledDate,
            phase: phase || 1
        };

        candidate.interviewRounds.push(newRound);
        await candidate.save();

        const updatedCandidate = await Candidate.findById(id)
            .populate('hiringRequestId', 'requestId')
            .populate('interviewRounds.assignedTo', 'firstName lastName email')
            .populate('interviewRounds.evaluatedBy', 'firstName lastName');

        // Create notification for assigned interviewers
        if (assignedTo && assignedTo.length > 0) {
            const Notification = require('../models/Notification');
            const notifications = assignedTo.map(userId => ({
                user: userId,
                title: 'New Interview Assigned',
                message: `You have been assigned to evaluate ${candidate.candidateName} for the ${levelName} round.`,
                type: 'Interview',
                link: `/ta/hiring-request/${candidate.hiringRequestId._id || candidate.hiringRequestId}/candidate/${candidate._id}/view`,
                metadata: {
                    candidateId: candidate._id,
                    roundId: candidate.interviewRounds[candidate.interviewRounds.length - 1]._id
                }
            }));
            await Notification.insertMany(notifications);
        }

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
        const { levelName, assignedTo, scheduledDate, phase } = req.body;

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
        if (phase !== undefined) round.phase = phase;

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

// Get current user's scheduled interviews
exports.getMyScheduledInterviews = async (req, res) => {
    try {
        const userId = req.user._id;

        // Find all candidates that have an interview round assigned to the current user
        // and its status is 'Scheduled' or 'Pending'
        const candidates = await Candidate.find({
            'interviewRounds': {
                $elemMatch: {
                    assignedTo: userId,
                    status: { $in: ['Pending', 'Scheduled'] }
                }
            }
        })
            .populate('hiringRequestId', 'requestId roleDetails')
            .select('candidateName email mobile interviewRounds hiringRequestId');

        // Extract and flatten the specific rounds assigned to the user
        const scheduledInterviews = [];

        candidates.forEach(candidate => {
            candidate.interviewRounds.forEach(round => {
                // Check if this specific round is assigned to the requested user and is pending
                const isAssigned = round.assignedTo.some(id => id.toString() === userId.toString());
                if (isAssigned && ['Pending', 'Scheduled'].includes(round.status)) {
                    scheduledInterviews.push({
                        candidateId: candidate._id,
                        candidateName: candidate.candidateName,
                        candidateEmail: candidate.email,
                        candidateMobile: candidate.mobile,
                        role: candidate.hiringRequestId?.roleDetails?.title || 'Unknown Role',
                        hiringRequestId: candidate.hiringRequestId?._id,
                        roundId: round._id,
                        levelName: round.levelName,
                        scheduledDate: round.scheduledDate,
                        status: round.status
                    });
                }
            });
        });

        // Sort by date (oldest/nearest first), pushing null dates to the end
        scheduledInterviews.sort((a, b) => {
            if (!a.scheduledDate) return 1;
            if (!b.scheduledDate) return -1;
            return new Date(a.scheduledDate) - new Date(b.scheduledDate);
        });

        res.status(200).json(scheduledInterviews);
    } catch (error) {
        console.error('Error fetching user interviews:', error);
        res.status(500).json({ message: 'Server error fetching scheduled interviews', error: error.message });
    }
};

// Get all candidates pulled by a specific user for the User TA Dashboard
exports.getCandidatesByPulledBy = async (req, res) => {
    try {
        const { userName } = req.params;

        // Optionally, check if the current user has access to view this.
        // For now, if they can reach this route (requires 'ta.view' or implicit access), allow it.
        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasTaView = userPermissions.includes('ta.view') || userPermissions.includes('*');

        // We assume userName is the literal string stored in `profilePulledBy`
        // Mongoose query
        const query = { profilePulledBy: userName };

        const candidates = await Candidate.find(query)
            .populate('hiringRequestId', 'requestId roleDetails')
            .populate('uploadedBy', 'firstName lastName email')
            .sort({ uploadedAt: -1 })
            .lean();

        res.status(200).json({
            count: candidates.length,
            candidates
        });

    } catch (error) {
        console.error('Error fetching candidates by pulled by:', error);
        res.status(500).json({ message: 'Server error fetching candidates', error: error.message });
    }
};

// Evaluate an interview round (Pass/Fail) or edit feedback for an already-evaluated round
exports.evaluateInterviewRound = async (req, res) => {
    try {
        const { id, roundId } = req.params;
        const { status, feedback, rating } = req.body; // status: 'Passed' or 'Failed'; rating: 1-10 (for Passed)

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

        // Save rating only when the round is Passed
        if (status === 'Passed' && rating !== undefined && rating !== null && rating !== '') {
            const parsedRating = parseInt(rating, 10);
            if (parsedRating >= 1 && parsedRating <= 10) {
                round.rating = parsedRating;
            }
        } else if (status === 'Failed') {
            round.rating = undefined; // Clear rating if changed to Failed
        }

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
