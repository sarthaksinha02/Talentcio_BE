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
    year: {
        type: Number,
        required: true
    }
}, { timestamps: true });

// Ensure unique holiday name per year
holidaySchema.index({ name: 1, year: 1 }, { unique: true });

// For month-based filtering
holidaySchema.index({ date: 1 });

module.exports = mongoose.model('Holiday', holidaySchema);
