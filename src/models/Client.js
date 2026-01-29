const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    businessUnit: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BusinessUnit'
    },
    email: String,
    phone: String,
    location: String
}, { timestamps: true });

module.exports = mongoose.model('Client', clientSchema);
