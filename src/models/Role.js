const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    permissions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission'
    }],
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    isSystem: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

// Ensure role names are unique per company
roleSchema.index({ name: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);
