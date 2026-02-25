const { HiringRequest, HRRAuditLog } = require('../models/HiringRequest');
const ApprovalWorkflow = require('../models/ApprovalWorkflow');
const User = require('../models/User');
const Candidate = require('../models/Candidate');

// Helper to generate Request ID (e.g., HRR-2023-001)
const generateRequestId = async () => {
    const count = await HiringRequest.countDocuments();
    const year = new Date().getFullYear();
    return `HRR-${year}-${String(count + 1).padStart(3, '0')}`;
};

// --- createHiringRequest ---
exports.createHiringRequest = async (req, res) => {
    try {
        const { client, roleDetails, purpose, requirements, hiringDetails, ownership, replacementDetails, interviewWorkflowId } = req.body;
        const submitNow = req.query.submit === 'true';

        // validations...

        const requestId = await generateRequestId();

        let workflow;
        if (req.body.workflowId) {
            workflow = await ApprovalWorkflow.findById(req.body.workflowId).populate('levels.role', 'name');
        }

        if (!workflow) {
            workflow = await ApprovalWorkflow.findOne({ isActive: true })
                .populate('levels.role', 'name');
        }

        const approvals = workflow ? workflow.levels.map(l => ({
            level: l.levelCheck,
            role: l.role._id,
            roleName: l.role.name,
            status: 'Pending',
            approvers: l.approvers || []
        })).sort((a, b) => a.level - b.level) : [];

        const newRequest = new HiringRequest({
            requestId,
            client,
            roleDetails,
            purpose,
            requirements,
            hiringDetails,
            replacementDetails,
            ownership: {
                ...ownership,
                hiringManager: req.user._id // Assumption: The logged in user is the HM or creating on behalf.
            },
            approvalChain: approvals,
            workflowId: workflow?._id, // Save the workflow ID
            interviewWorkflowId: interviewWorkflowId || undefined,
            currentApprovalLevel: approvals.length > 0 ? 1 : 0,
            status: submitNow ? 'Submitted' : 'Draft',
            createdBy: req.user._id
        });

        if (submitNow) {
            // Set status based on workflow type
            if (approvals.length > 0) {
                newRequest.status = 'Pending_Approval'; // Dynamic workflow

                // Notify first level approvers
                const currentStep = approvals[0];
                if (currentStep && currentStep.approvers && currentStep.approvers.length > 0) {
                    const Notification = require('../models/Notification');
                    const notifications = currentStep.approvers.map(approverId => ({
                        user: approverId,
                        title: 'New Hiring Request Approval',
                        message: `Hiring Request ${requestId} for ${roleDetails.title} has been submitted and requires your approval.`,
                        type: 'Approval',
                        link: `/ta/hiring-request/${newRequest._id}/details`
                    }));
                    await Notification.insertMany(notifications);
                }
            } else {
                newRequest.status = 'Pending_L1'; // Legacy workflow
            }
        }

        await newRequest.save();

        await HRRAuditLog.create({
            hiringRequestId: newRequest._id,
            action: submitNow ? 'CREATED_AND_SUBMITTED' : 'CREATED_DRAFT',
            performedBy: req.user._id,
            details: { status: newRequest.status, workflowId: workflow?._id }
        });

        res.status(201).json(newRequest);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- getHiringRequests ---
exports.getHiringRequests = async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};

        if (status) query.status = status;

        // Use permissions to filter what they see
        // Admin/HR sees all. ta.view sees all. Manager sees own.
        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasTaView = userPermissions.includes('ta.view') || userPermissions.includes('*');

        if (!isAdmin && !hasTaView) {
            // Find HRRs where the user is assigned to a candidate's interview round (granular)
            const candidatesWithUserAsInterviewer = await Candidate.find({
                'interviewRounds.assignedTo': req.user._id
            }).select('hiringRequestId');

            const interviewHiringRequestIds = candidatesWithUserAsInterviewer.map(c => c.hiringRequestId);

            query['$or'] = [
                { createdBy: req.user._id },
                { 'ownership.hiringManager': req.user._id },
                { 'ownership.recruiter': req.user._id },
                { _id: { $in: interviewHiringRequestIds } } // Only HRRs where they have a specific candidate interview assignment
            ];
        }

        const requests = await HiringRequest.find(query)
            .populate('ownership.hiringManager', 'firstName lastName')
            .populate('ownership.recruiter', 'firstName lastName')
            .sort({ createdAt: -1 });

        res.status(200).json(requests);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// --- getHiringRequestById ---
exports.getHiringRequestById = async (req, res) => {
    try {
        const request = await HiringRequest.findById(req.params.id)
            .populate('ownership.hiringManager', 'firstName lastName email')
            .populate('ownership.recruiter', 'firstName lastName email')
            .populate('roleDetails.reportingManager', 'firstName lastName')
            .populate('createdBy', 'firstName lastName')
            .populate('workflowId', 'name description') // Populate workflow details
            .populate({
                path: 'approvalChain.role',
                select: 'name'
            })
            .populate({
                path: 'approvalChain.approvers',
                select: 'firstName lastName email'
            })
            .populate({
                path: 'approvalChain.approvedBy',
                select: 'firstName lastName email'
            })
            .populate('approvals.l1.approver', 'firstName lastName')
            .populate('approvals.final.approver', 'firstName lastName')
            .populate('interviewWorkflowId', 'name description rounds');

        if (!request) return res.status(404).json({ message: 'Not found' });

        // Authorization check
        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
        const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
        const hasTaView = userPermissions.includes('ta.view') || userPermissions.includes('*');

        if (!isAdmin && !hasTaView) {
            const isCreator = request.createdBy?._id?.toString() === req.user._id.toString();
            const isHiringManager = request.ownership?.hiringManager?._id?.toString() === req.user._id.toString();
            const isRecruiter = request.ownership?.recruiter?._id?.toString() === req.user._id.toString();

            // Check if user is an assigned interviewer for any candidate in this request (granular check)
            const isInterviewer = await Candidate.exists({
                hiringRequestId: request._id,
                'interviewRounds.assignedTo': req.user._id
            });

            if (!isCreator && !isHiringManager && !isRecruiter && !isInterviewer) {
                return res.status(403).json({ message: 'Forbidden: You do not have permission to view this request' });
            }
        }

        res.status(200).json(request);
    } catch (error) {
        console.error('Error fetching hiring request:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- updateHiringRequest (Edit Draft) ---
exports.updateHiringRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const request = await HiringRequest.findById(id);
        if (!request) return res.status(404).json({ message: 'Not found' });

        if (request.status === 'Closed') {
            return res.status(400).json({ message: 'Cannot edit a closed request' });
        }

        // Apply updates to request securely (prevent mass assignment)
        const allowedUpdates = [
            'client', 'roleDetails', 'purpose', 'requirements',
            'hiringDetails', 'replacementDetails', 'ownership', 'interviewWorkflowId'
        ];

        allowedUpdates.forEach(field => {
            if (updates[field] !== undefined) {
                request[field] = updates[field];
            }
        });

        // Handle workflow changes or initialization
        let workflowChanged = false;
        if (req.body.workflowId && req.body.workflowId !== request.workflowId?.toString()) {
            workflowChanged = true;
        }

        // If workflow is specified (either new or existing), rebuild approval chain
        const workflowId = req.body.workflowId || request.workflowId;
        if (workflowId) {
            const workflow = await ApprovalWorkflow.findById(workflowId).populate('levels.role', 'name');

            if (workflow) {
                request.workflowId = workflow._id;
                request.approvalChain = workflow.levels.map(l => ({
                    level: l.levelCheck,
                    role: l.role._id,
                    roleName: l.role.name,
                    status: 'Pending',
                    approvers: l.approvers || []
                })).sort((a, b) => a.level - b.level);
                request.currentApprovalLevel = 1;
            }
        }

        // If submitting (not just saving as draft)
        if (req.query.submit === 'true') {
            // ALWAYS reset approval chain when re-submitting
            if (request.approvalChain && request.approvalChain.length > 0) {
                // Reset all approval steps to Pending
                request.approvalChain.forEach(step => {
                    step.status = 'Pending';
                    step.approvedBy = undefined;
                    step.date = undefined;
                    step.comments = undefined;
                });
                request.currentApprovalLevel = 1;
                request.status = 'Pending_Approval';
            } else {
                // Legacy mode or no workflow
                request.status = 'Pending_L1';
            }

            // Reset legacy approvals if they exist
            if (request.approvals) {
                if (request.approvals.l1) {
                    request.approvals.l1.status = 'Pending';
                    request.approvals.l1.approver = undefined;
                    request.approvals.l1.date = undefined;
                    request.approvals.l1.comments = undefined;
                }
                if (request.approvals.final) {
                    request.approvals.final.status = 'Pending';
                    request.approvals.final.approver = undefined;
                    request.approvals.final.date = undefined;
                    request.approvals.final.comments = undefined;
                }
            }
        }

        await request.save();

        await HRRAuditLog.create({
            hiringRequestId: request._id,
            action: req.query.submit === 'true' ? 'UPDATED_AND_SUBMITTED' : 'UPDATED',
            performedBy: req.user._id,
            details: { updates, workflowId: request.workflowId, workflowChanged }
        });

        res.status(200).json(request);
    } catch (error) {
        console.error('Error updating hiring request:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- approveHiringRequest ---
exports.approveHiringRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { level, comments } = req.body; // 'L1' or 'Final' for old flow

        // Fetch request with populated approvers for authorization check
        const request = await HiringRequest.findById(id)
            .populate('approvalChain.approvers', '_id firstName lastName email');

        if (!request) return res.status(404).json({ message: 'Not found' });

        let currentLevelIndex; // Declare at function scope for audit log

        // --- Dynamic Workflow Logic ---
        if (request.approvalChain && request.approvalChain.length > 0) {
            currentLevelIndex = request.currentApprovalLevel - 1;
            const currentStep = request.approvalChain[currentLevelIndex];

            if (!currentStep) {
                return res.status(400).json({
                    message: 'Current approval level not found',
                    currentLevel: request.currentApprovalLevel,
                    totalLevels: request.approvalChain.length
                });
            }

            if (currentStep.status !== 'Pending') {
                return res.status(400).json({
                    message: `Current level is already ${currentStep.status}`,
                    currentLevel: request.currentApprovalLevel,
                    levelStatus: currentStep.status
                });
            }

            // Check if user is an authorized approver for this step
            const isAuthorized = currentStep.approvers && currentStep.approvers.some(approver => {
                const approverId = approver._id ? approver._id.toString() : approver.toString();
                return approverId === req.user._id.toString();
            });

            const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
            const hasSuperApprove = userPermissions.includes('ta.super_approve') || userPermissions.includes('*');

            if (!isAuthorized && !hasSuperApprove) {
                return res.status(403).json({
                    message: 'You are not authorized to approve this level',
                    currentLevel: request.currentApprovalLevel,
                    yourId: req.user._id,
                    authorizedApprovers: currentStep.approvers.map(a => a._id || a)
                });
            }

            // Update current step
            currentStep.status = 'Approved';
            currentStep.approvedBy = req.user._id;
            currentStep.date = new Date();
            currentStep.comments = comments;

            // Check if there is a next level
            if (currentLevelIndex + 1 < request.approvalChain.length) {
                request.currentApprovalLevel += 1;
                request.status = 'Pending_Approval';

                // Notify next level approvers
                const nextStep = request.approvalChain[request.currentApprovalLevel - 1];
                if (nextStep && nextStep.approvers && nextStep.approvers.length > 0) {
                    const Notification = require('../models/Notification');
                    const notifications = nextStep.approvers.map(approverId => ({
                        user: approverId,
                        title: 'Hiring Request Approval Pending',
                        message: `Hiring Request ${request.requestId} for ${request.roleDetails.title} has reached your approval level.`,
                        type: 'Approval',
                        link: `/ta/hiring-request/${request._id}/details`
                    }));
                    await Notification.insertMany(notifications);
                }
            } else {
                // All levels approved
                request.status = 'Approved';

                // Notify creator that it is fully approved
                if (request.createdBy) {
                    const Notification = require('../models/Notification');
                    await Notification.create({
                        user: request.createdBy,
                        title: 'Hiring Request Approved',
                        message: `Your Hiring Request ${request.requestId} for ${request.roleDetails.title} has been fully approved.`,
                        type: 'Info',
                        link: `/ta/hiring-request/${request._id}/details`
                    });
                }
            }
        }
        // --- Legacy Logic (L1/Final) ---
        else {
            if (level === 'L1') {
                if (request.status !== 'Pending_L1') {
                    return res.status(400).json({ message: 'Invalid status for L1 Approval' });
                }
                request.approvals.l1 = { status: 'Approved', approver: req.user._id, date: new Date(), comments };
                request.status = 'Pending_Final';
            } else if (level === 'Final') {
                if (request.status !== 'Pending_Final') {
                    return res.status(400).json({ message: 'Invalid status for Final Approval' });
                }
                request.approvals.final = { status: 'Approved', approver: req.user._id, date: new Date(), comments };
                request.status = 'Approved';

                // Notify creator
                if (request.createdBy) {
                    const Notification = require('../models/Notification');
                    await Notification.create({
                        user: request.createdBy,
                        title: 'Hiring Request Approved',
                        message: `Your Hiring Request ${request.requestId} has been fully approved.`,
                        type: 'Info',
                        link: `/ta/hiring-request/${request._id}/details`
                    });
                }
            } else {
                return res.status(400).json({ message: 'Invalid approval level' });
            }
        }

        await request.save();

        await HRRAuditLog.create({
            hiringRequestId: request._id,
            action: `APPROVED_LEVEL_${request.currentApprovalLevel || level}`,
            performedBy: req.user._id,
            details: { comments, previousLevel: currentLevelIndex !== undefined ? currentLevelIndex + 1 : level }
        });

        res.status(200).json(request);

    } catch (error) {
        console.error('Error approving hiring request:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- rejectHiringRequest ---
exports.rejectHiringRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { comments, level } = req.body;

        // Fetch request with populated approvers for authorization check
        const request = await HiringRequest.findById(id)
            .populate('approvalChain.approvers', '_id firstName lastName email');

        if (!request) return res.status(404).json({ message: 'Not found' });

        request.status = 'Rejected';

        // --- Dynamic Workflow Logic ---
        if (request.approvalChain && request.approvalChain.length > 0) {
            const currentLevelIndex = request.currentApprovalLevel - 1;
            const currentStep = request.approvalChain[currentLevelIndex];

            if (currentStep) {
                // Check authorization
                const isAuthorized = currentStep.approvers && currentStep.approvers.some(approver => {
                    const approverId = approver._id ? approver._id.toString() : approver.toString();
                    return approverId === req.user._id.toString();
                });

                const userPermissions = req.user.roles.flatMap(role => (role.permissions || []).map(p => p.key));
                const hasSuperApprove = userPermissions.includes('ta.super_approve') || userPermissions.includes('*');

                if (!isAuthorized && !hasSuperApprove) {
                    return res.status(403).json({
                        message: 'You are not authorized to reject this level',
                        currentLevel: request.currentApprovalLevel,
                        yourId: req.user._id
                    });
                }

                currentStep.status = 'Rejected';
                currentStep.approvedBy = req.user._id;
                currentStep.date = new Date();
                currentStep.comments = comments;
            }
        }
        // --- Legacy Logic ---
        else {
            // Log rejection in the appropriate approval slot if applicable, or just general log
            if (level === 'L1') {
                request.approvals.l1 = { status: 'Rejected', approver: req.user._id, date: new Date(), comments };
            } else if (level === 'Final') {
                request.approvals.final = { status: 'Rejected', approver: req.user._id, date: new Date(), comments };
            }
        }

        await request.save();

        await HRRAuditLog.create({
            hiringRequestId: request._id,
            action: 'REJECTED',
            performedBy: req.user._id,
            details: { comments, level: request.currentApprovalLevel || level }
        });

        res.status(200).json(request);
    } catch (error) {
        console.error('Error rejecting hiring request:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- closeHiringRequest ---
exports.closeHiringRequest = async (req, res) => {
    try {
        const { id } = req.params;

        const request = await HiringRequest.findByIdAndUpdate(
            id,
            { status: 'Closed' },
            { new: true }
        );

        if (!request) return res.status(404).json({ message: 'Not found' });

        await HRRAuditLog.create({
            hiringRequestId: request._id,
            action: 'CLOSED',
            performedBy: req.user._id,
            details: {}
        });

        res.status(200).json(request);

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
