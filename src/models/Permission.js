const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    module: {
        type: String,
        required: true
    },
    description: String,
    isSystem: {
        type: Boolean,
        default: false
    },
    isDeprecated: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);
