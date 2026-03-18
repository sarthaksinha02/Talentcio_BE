const HelpdeskQuery = require('../models/HelpdeskQuery');
const QueryType = require('../models/QueryType');
const User = require('../models/User');
const NotificationService = require('../services/notificationService');


// === QUERY TYPE MANAGEMENT ===

exports.getQueryTypes = async (req, res) => {
    try {
        const types = await QueryType.find()
            .populate('assignedRole', 'name')
            .populate('assignedPerson', 'firstName lastName email')
            .populate('escalationRole', 'name')
            .populate('escalationPerson', 'firstName lastName email')
            .sort({ name: 1 });
        res.status(200).json({ success: true, data: types });
    } catch (error) {
        console.error('Error fetching query types:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.addQueryType = async (req, res) => {
    try {
        if (!req.user.roles.some(r => r.name === 'Admin')) return res.status(403).json({ success: false, message: 'Admins only' });

        const {
            name, assignedRole, assignedPerson,
            enableEscalation, escalationDays, escalationRole, escalationPerson
        } = req.body;

        const newType = new QueryType({
            name, assignedRole, assignedPerson,
            enableEscalation, escalationDays, escalationRole, escalationPerson
        });
        await newType.save();

        res.status(201).json({ success: true, data: newType });
    } catch (error) {
        console.error('Error adding query type:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.updateQueryType = async (req, res) => {
    try {
        if (!req.user.roles.some(r => r.name === 'Admin')) return res.status(403).json({ success: false, message: 'Admins only' });

        const {
            name, assignedRole, assignedPerson, isActive,
            enableEscalation, escalationDays, escalationRole, escalationPerson
        } = req.body;
        const type = await QueryType.findById(req.params.id);

        if (!type) return res.status(404).json({ success: false, message: 'Type not found' });

        if (name) type.name = name;
        if (assignedRole !== undefined) type.assignedRole = assignedRole ? assignedRole : null;
        if (assignedPerson) type.assignedPerson = assignedPerson;
        if (isActive !== undefined) type.isActive = isActive;
        if (enableEscalation !== undefined) type.enableEscalation = enableEscalation;
        if (escalationDays !== undefined) type.escalationDays = escalationDays;
        if (escalationRole !== undefined) type.escalationRole = escalationRole ? escalationRole : null;
        if (escalationPerson !== undefined) type.escalationPerson = escalationPerson ? escalationPerson : null;

        await type.save();
        res.status(200).json({ success: true, data: type });
    } catch (error) {
        console.error('Error updating query type:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.deleteQueryType = async (req, res) => {
    try {
        if (!req.user.roles.some(r => r.name === 'Admin')) return res.status(403).json({ success: false, message: 'Admins only' });

        await QueryType.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: 'Type deleted' });
    } catch (error) {
        console.error('Error deleting query type:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};


// === TICKET MANAGEMENT ===

exports.createQuery = async (req, res) => {
    try {
        const { subject, description, queryTypeId, priority } = req.body;

        const qType = await QueryType.findById(queryTypeId);
        if (!qType || !qType.isActive) return res.status(400).json({ success: false, message: 'Invalid or inactive query type.' });

        const newQuery = new HelpdeskQuery({
            subject,
            description,
            queryType: qType._id,
            priority: priority || 'Medium',
            raisedBy: req.user._id,
            assignedTo: qType.assignedPerson,
            status: 'New'
        });

        await newQuery.save();

        if (qType.assignedPerson) {
            const io = req.app.get('io');
            await NotificationService.createNotification(io, {
                user: qType.assignedPerson,
                title: 'New Helpdesk Query',
                message: `You have been assigned a new ${priority || 'Medium'} priority query: "${subject}"`,
                type: 'Alert',
                link: '/helpdesk'
            });
        }

        res.status(201).json({
            success: true,
            data: newQuery
        });

    } catch (error) {
        console.error('Error creating query:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getMyQueries = async (req, res) => {
    try {
        const queries = await HelpdeskQuery.find({ raisedBy: req.user._id })
            .populate('queryType', 'name')
            .populate('assignedTo', 'firstName lastName email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: queries });
    } catch (error) {
        console.error('Error fetching queries:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getAssignedQueries = async (req, res) => {
    try {
        const queries = await HelpdeskQuery.find({ assignedTo: req.user._id })
            .populate('raisedBy', 'firstName lastName email')
            .populate('queryType', 'name')
            .sort({ priority: -1, createdAt: 1 }); // High priority first, then oldest

        res.status(200).json({ success: true, data: queries });
    } catch (error) {
        console.error('Error fetching assigned queries:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getAllQueries = async (req, res) => {
    try {
        const isAdmin = req.user.roles.some(r => (r.name || r) === 'Admin' || r.isSystem === true);
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Admins only' });

        const queries = await HelpdeskQuery.find()
            .populate('raisedBy', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .populate('queryType', 'name')
            .sort({ priority: -1, createdAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: queries });
    } catch (error) {
        console.error('Error fetching all queries:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getEscalatedQueries = async (req, res) => {
    try {
        const isAdmin = req.user.roles.some(r => (r.name || r) === 'Admin' || r.isSystem === true);
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Admins only' });

        const queries = await HelpdeskQuery.find({ status: 'Escalated' })
            .populate('raisedBy', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .populate('queryType', 'name')
            .sort({ escalatedAt: -1 })
            .lean();

        res.status(200).json({ success: true, data: queries });
    } catch (error) {
        console.error('Error fetching escalated queries:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getQueryById = async (req, res) => {
    try {
        const { id } = req.params;

        // Prevent CastError if someone goes to /helpdesk/new (which shouldn't happen anymore but just in case)
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(404).json({ success: false, message: 'Invalid Query ID format' });
        }

        const query = await HelpdeskQuery.findById(id)
            .populate('raisedBy', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .populate('comments.user', 'firstName lastName roles')
            .populate('queryType', 'name');

        if (!query) {
            return res.status(404).json({ success: false, message: 'Query not found' });
        }

        const isAdmin = req.user.roles.some(r => (r.name || r) === 'Admin' || r.isSystem === true);
        const isAssignee = query.assignedTo?._id?.toString() === req.user._id.toString() || query.assignedTo?.toString() === req.user._id.toString();
        const isRaiser = query.raisedBy?._id?.toString() === req.user._id.toString() || query.raisedBy?.toString() === req.user._id.toString();

        if (!isAdmin && !isAssignee && !isRaiser) {
            return res.status(403).json({ success: false, message: 'Unauthorized to view this query.' });
        }

        res.status(200).json({ success: true, data: query });
    } catch (error) {
        console.error('Error fetching query:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.updateQueryStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const query = await HelpdeskQuery.findOne({ _id: req.params.id, companyId: req.companyId }).populate('queryType');

        if (!query) {
            return res.status(404).json({ success: false, message: 'Query not found' });
        }

        const isAdmin = req.user.roles.some(r => (r.name || r) === 'Admin' || r.isSystem === true);
        const isAssignee = query.assignedTo?.toString() === req.user._id.toString();
        const isRaiser = query.raisedBy?.toString() === req.user._id.toString();

        // Security logic based on target status
        if (status === 'Closed') {
            if (!isAdmin && !isAssignee && !isRaiser) {
                return res.status(403).json({ success: false, message: 'Unauthorized to close this query.' });
            }
            query.closedAt = Date.now();
        } else if (status === 'In Progress' || status === 'Pending') {
            if (!isAdmin && !isAssignee) {
                return res.status(403).json({ success: false, message: 'Only assignee or admin can change status to ' + status });
            }
        } else if (status === 'Escalated') {
            if (!isAdmin && !isRaiser && !isAssignee) {
                return res.status(403).json({ success: false, message: 'Unauthorized to escalate.' });
            }
            if (!query.escalatedAt) query.escalatedAt = Date.now();
            
            // Manual Reassignment logic (mirroring cron behavior)
            const qType = query.queryType;
            if (qType && qType.enableEscalation && qType.escalationPerson) {
                const oldAssignee = query.assignedTo;
                const newAssignee = qType.escalationPerson;
                
                if (newAssignee.toString() !== (oldAssignee?._id?.toString() || oldAssignee?.toString())) {
                    query.assignedTo = newAssignee;
                    
                    // Notify the new assignee specifically
                    const io = req.app.get('io');
                    await NotificationService.createNotification(io, {
                        user: newAssignee,
                        title: 'Manual Escalation Assigned',
                        message: `An escalated query "${query.subject}" has been assigned to you.`,
                        type: 'Alert',
                        link: `/helpdesk/${query._id}`
                    });
                }
            }
        } else {
            return res.status(400).json({ success: false, message: 'Invalid status transition.' });
        }

        query.status = status;
        await query.save();

        // Notify User if status changed by someone else
        if (req.user._id.toString() !== query.raisedBy?.toString()) {
            const io = req.app.get('io');
            await NotificationService.createNotification(io, {
                user: query.raisedBy,
                title: 'Helpdesk Query Updated',
                message: `Your helpdesk query "${query.subject}" status is now ${status}.`,
                type: 'Info',
                link: `/helpdesk/${query._id}`
            });
        }

        res.status(200).json({ success: true, data: query });
    } catch (error) {
        console.error('Error updating query status:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.addComment = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

        const query = await HelpdeskQuery.findOne({ _id: req.params.id, companyId: req.companyId });

        if (!query) return res.status(404).json({ success: false, message: 'Query not found' });

        const isAdmin = req.user.roles.some(r => (r.name || r) === 'Admin' || r.isSystem === true);
        const isAssignee = query.assignedTo?.toString() === req.user._id.toString();
        const isRaiser = query.raisedBy?.toString() === req.user._id.toString();

        if (!isAdmin && !isAssignee && !isRaiser) {
            return res.status(403).json({ success: false, message: 'Unauthorized to comment on this query.' });
        }

        // Status Transition Logic
        if (query.status === 'New' && (isAssignee || isAdmin)) {
            query.status = 'In Progress';
        } else if (query.status === 'Pending' && isRaiser) {
            // Raiser replied to a pending request
            query.status = 'In Progress';
        }

        query.comments.push({
            user: req.user._id,
            text
        });

        await query.save();
        await query.populate('comments.user', 'firstName lastName roles');

        // Socket.IO Emission
        const io = req.app.get('io');
        if (io) {
            io.to(query._id.toString()).emit('new_comment', query.comments);
        }

        // Notify the other party
        const notifyTarget = isRaiser ? query.assignedTo : query.raisedBy;
        if (notifyTarget) {
            await NotificationService.createNotification(io, {
                user: notifyTarget,
                title: 'New Comment on Query',
                message: `${req.user.firstName} commented on "${query.subject}"`,
                type: 'Info',
                link: `/helpdesk/${query._id}`
            });
        }

        res.status(200).json({ success: true, data: query });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
