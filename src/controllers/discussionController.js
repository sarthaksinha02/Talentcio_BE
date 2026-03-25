const mongoose = require('mongoose');
const Discussion = require('../models/Discussion');

exports.createDiscussion = async (req, res) => {
    try {
        const { title, discussion, status, dueDate } = req.body;
        const newDiscussion = new Discussion({
            companyId: req.companyId,
            title,
            discussion,
            status: status || 'inprogress',
            dueDate,
            createdBy: req.user._id
        });
        await newDiscussion.save();

        const populatedDiscussion = await Discussion.findById(newDiscussion._id)
            .populate('createdBy', 'firstName lastName email profilePicture');

        res.status(201).json({ message: 'Discussion created successfully', discussion: populatedDiscussion });
    } catch (error) {
        console.error('Error creating discussion:', error);
        res.status(500).json({ message: 'Error creating discussion', error: error.message });
    }
};

exports.getDiscussions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const total = await Discussion.countDocuments({ companyId: req.companyId });

        let discussions = await Discussion.aggregate([
            { $match: { companyId: new mongoose.Types.ObjectId(req.companyId) } },
            {
                $addFields: {
                    isCompleted: { $cond: { if: { $eq: ["$status", "mark as complete"] }, then: 1, else: 0 } }
                }
            },
            { $sort: { isCompleted: 1, createdAt: -1 } },
            { $skip: skip },
            { $limit: limit }
        ]);

        discussions = await Discussion.populate(discussions, { path: 'createdBy', select: 'firstName lastName email profilePicture' });

        res.status(200).json({
            discussions,
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total
        });
    } catch (error) {
        console.error('Error fetching discussions:', error);
        res.status(500).json({ message: 'Error fetching discussions', error: error.message });
    }
};

exports.getDiscussionById = async (req, res) => {
    try {
        const discussion = await Discussion.findOne({ _id: req.params.id, companyId: req.companyId })
            .populate('createdBy', 'firstName lastName email profilePicture');
        if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
        res.status(200).json(discussion);
    } catch (error) {
        console.error('Error fetching discussion:', error);
        res.status(500).json({ message: 'Error fetching discussion', error: error.message });
    }
};

exports.updateDiscussion = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, discussion, status, dueDate } = req.body;

        const updatedDiscussion = await Discussion.findOneAndUpdate({ _id: id, companyId: req.companyId },
            { title, discussion, status, dueDate },
            { new: true, runValidators: true }
        ).populate('createdBy', 'firstName lastName email profilePicture');

        if (!updatedDiscussion) return res.status(404).json({ message: 'Discussion not found' });
        res.status(200).json({ message: 'Discussion updated successfully', discussion: updatedDiscussion });
    } catch (error) {
        console.error('Error updating discussion:', error);
        res.status(500).json({ message: 'Error updating discussion', error: error.message });
    }
};

exports.deleteDiscussion = async (req, res) => {
    try {
        const discussion = await Discussion.findOneAndDelete({ _id: req.params.id, companyId: req.companyId });
        if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
        res.status(200).json({ message: 'Discussion deleted successfully' });
    } catch (error) {
        console.error('Error deleting discussion:', error);
        res.status(500).json({ message: 'Error deleting discussion', error: error.message });
    }
};
