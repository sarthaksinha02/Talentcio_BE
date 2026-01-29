const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client'
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    description: String,
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    startDate: Date,
    dueDate: Date
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
