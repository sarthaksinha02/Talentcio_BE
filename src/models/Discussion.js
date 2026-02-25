const mongoose = require('mongoose');

const discussionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    discussion: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['inprogress', 'on-hold', 'mark as complete'],
        default: 'inprogress'
    },
    dueDate: {
        type: Date
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Discussion', discussionSchema);
