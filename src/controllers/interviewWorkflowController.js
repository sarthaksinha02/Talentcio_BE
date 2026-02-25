const InterviewWorkflow = require('../models/InterviewWorkflow');

// @desc    Create Interview Workflow
// @route   POST /api/ta/interview-workflows
// @access  Private
exports.createInterviewWorkflow = async (req, res) => {
    try {
        const { name, description, rounds } = req.body;
        
        const existingWorkflow = await InterviewWorkflow.findOne({ name });
        if (existingWorkflow) {
            return res.status(400).json({ message: 'Interview workflow with this name already exists' });
        }

        const workflow = new InterviewWorkflow({
            name,
            description,
            rounds,
            createdBy: req.user._id
        });

        await workflow.save();
        res.status(201).json(workflow);
    } catch (error) {
        console.error('Error creating interview workflow:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get All Interview Workflows
// @route   GET /api/ta/interview-workflows
// @access  Private
exports.getInterviewWorkflows = async (req, res) => {
    try {
        const workflows = await InterviewWorkflow.find()
            .populate('rounds.role', 'name description')
            .populate('createdBy', 'firstName lastName email')
            .sort({ createdAt: -1 });
        res.json(workflows);
    } catch (error) {
        console.error('Error fetching interview workflows:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Get Single Interview Workflow
// @route   GET /api/ta/interview-workflows/:id
// @access  Private
exports.getInterviewWorkflowById = async (req, res) => {
    try {
        const workflow = await InterviewWorkflow.findById(req.params.id)
            .populate('rounds.role', 'name description')
            .populate('createdBy', 'firstName lastName email');
        
        if (!workflow) {
            return res.status(404).json({ message: 'Interview workflow not found' });
        }
        res.json(workflow);
    } catch (error) {
        console.error('Error fetching interview workflow:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Update Interview Workflow
// @route   PUT /api/ta/interview-workflows/:id
// @access  Private
exports.updateInterviewWorkflow = async (req, res) => {
    try {
        const { name, description, rounds, isActive } = req.body;
        
        let workflow = await InterviewWorkflow.findById(req.params.id);
        if (!workflow) {
            return res.status(404).json({ message: 'Interview workflow not found' });
        }

        // Check name uniqueness if changed
        if (name && name !== workflow.name) {
            const existingName = await InterviewWorkflow.findOne({ name });
            if (existingName) {
                return res.status(400).json({ message: 'Interview workflow with this name already exists' });
            }
        }

        workflow.name = name || workflow.name;
        workflow.description = description !== undefined ? description : workflow.description;
        workflow.rounds = rounds || workflow.rounds;
        workflow.isActive = isActive !== undefined ? isActive : workflow.isActive;

        await workflow.save();
        
        // Populate to match GET outputs
        const updatedWorkflow = await InterviewWorkflow.findById(workflow._id)
            .populate('rounds.role', 'name description')
            .populate('createdBy', 'firstName lastName email');
            
        res.json(updatedWorkflow);
    } catch (error) {
        console.error('Error updating interview workflow:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// @desc    Delete Interview Workflow
// @route   DELETE /api/ta/interview-workflows/:id
// @access  Private
exports.deleteInterviewWorkflow = async (req, res) => {
    try {
        const workflow = await InterviewWorkflow.findById(req.params.id);
        if (!workflow) {
            return res.status(404).json({ message: 'Interview workflow not found' });
        }

        await workflow.deleteOne();
        res.json({ message: 'Interview workflow removed' });
    } catch (error) {
        console.error('Error deleting interview workflow:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
