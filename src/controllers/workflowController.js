const ApprovalWorkflow = require('../models/ApprovalWorkflow');

// --- Create Workflow ---
exports.createWorkflow = async (req, res) => {
    try {
        const { name, description, levels, module } = req.body;

        const workflow = await ApprovalWorkflow.create({
            name,
            description,
            levels: levels.map(l => ({
                levelCheck: l.levelCheck,
                role: l.role,
                approvers: l.approvers || [],
                isFinal: l.isFinal
            })),
            module: module || 'TA', // Default to TA if not provided
            isActive: true, // Default to active
            createdBy: req.user._id
        });

        res.status(201).json(workflow);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- Get All Workflows ---
exports.getWorkflows = async (req, res) => {
    try {
        const query = {};
        if (req.query.module) {
            query.module = req.query.module;
        }

        const workflows = await ApprovalWorkflow.find(query)
            .populate('levels.role', 'name')
            .populate('levels.approvers', 'firstName lastName email');
        res.status(200).json(workflows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- Get Single Workflow ---
exports.getWorkflowById = async (req, res) => {
    try {
        const workflow = await ApprovalWorkflow.findById(req.params.id)
            .populate('levels.role', 'name')
            .populate('levels.approvers', 'firstName lastName email');
        if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
        res.status(200).json(workflow);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- Update Workflow ---
exports.updateWorkflow = async (req, res) => {
    try {
        const workflow = await ApprovalWorkflow.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
        res.status(200).json(workflow);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- Delete Workflow ---
exports.deleteWorkflow = async (req, res) => {
    try {
        const workflow = await ApprovalWorkflow.findByIdAndDelete(req.params.id);
        if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
        res.status(200).json({ message: 'Workflow deleted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};
