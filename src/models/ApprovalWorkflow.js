const mongoose = require('mongoose');

const ApprovalWorkflowSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: String,

    // Levels of approval
    levels: [{
        levelCheck: { type: Number, required: true }, // 1, 2, 3...
        role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
        approvers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Multiple users
        isFinal: { type: Boolean, default: false }
    }],

    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

module.exports = mongoose.model('ApprovalWorkflow', ApprovalWorkflowSchema);
