const HelpdeskQuery = require('../models/HelpdeskQuery');
const QueryType = require('../models/QueryType');
const User = require('../models/User');

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
        const isAdmin = req.user.roles.some(r => r.name === 'Admin' || r.isSystem === true);
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Admins only' });

        const queries = await HelpdeskQuery.find()
            .populate('raisedBy', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .populate('queryType', 'name')
            .sort({ priority: -1, createdAt: -1 });

        res.status(200).json({ success: true, data: queries });
    } catch (error) {
        console.error('Error fetching all queries:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.getEscalatedQueries = async (req, res) => {
    try {
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');
        if (!isAdmin) return res.status(403).json({ success: false, message: 'Admins only' });

        const queries = await HelpdeskQuery.find({ status: 'Escalated' })
            .populate('raisedBy', 'firstName lastName email')
            .populate('assignedTo', 'firstName lastName email')
            .populate('queryType', 'name')
            .sort({ escalatedAt: -1 });

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

        res.status(200).json({ success: true, data: query });
    } catch (error) {
        console.error('Error fetching query:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.updateQueryStatus = async (req, res) => {
    try {
        const query = await HelpdeskQuery.findById(req.params.id);

        if (!query) {
            return res.status(404).json({ success: false, message: 'Query not found' });
        }

        // Only assignee or admin can close
        const isAdmin = req.user.roles.some(r => r.name === 'Admin');
        const isAssignee = query.assignedTo.toString() === req.user._id.toString();

        if (!isAdmin && !isAssignee) {
            return res.status(403).json({ success: false, message: 'Only the assigned person or admin can close this query.' });
        }

        query.status = 'Closed';
        query.closedAt = Date.now();

        await query.save();

        res.status(200).json({ success: true, data: query });
    } catch (error) {
        console.error('Error returning query:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.addComment = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

        const query = await HelpdeskQuery.findById(req.params.id);

        if (!query) return res.status(404).json({ success: false, message: 'Query not found' });

        // If it's the first time assigned person is responding, move it to In Progress
        if (query.status === 'New' && query.assignedTo.toString() === req.user._id.toString()) {
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

        res.status(200).json({ success: true, data: query });
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};
