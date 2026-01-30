const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Holiday name is required'],
        trim: true
    },
    date: {
        type: Date,
        required: [true, 'Holiday date is required']
    },
    isOptional: {
        type: Boolean,
        default: false
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    year: {
        type: Number,
        required: true
    }
}, { timestamps: true });

// Ensure unique holiday name per year per company (optional but good practice)
holidaySchema.index({ company: 1, name: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Holiday', holidaySchema);
