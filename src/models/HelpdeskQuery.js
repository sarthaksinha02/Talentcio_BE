const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const helpdeskQuerySchema = new mongoose.Schema({
    queryId: {
        type: String,
        unique: true,
        required: true
    },
    subject: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    queryType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QueryType',
        required: true
    },
    priority: {
        type: String,
        enum: ['Low', 'Medium', 'High', 'Urgent'],
        default: 'Medium'
    },
    status: {
        type: String,
        enum: ['New', 'In Progress', 'Closed', 'Escalated'],
        default: 'New'
    },
    raisedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    comments: [commentSchema],
    escalatedAt: {
        type: Date
    },
    closedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Pre-save hook to generate queryId
helpdeskQuerySchema.pre('validate', async function () {
    if (this.isNew && !this.queryId) {
        const count = await this.constructor.countDocuments();
        this.queryId = `HD-${1000 + count + 1}`;
    }
});

module.exports = mongoose.model('HelpdeskQuery', helpdeskQuerySchema);
