const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    clockIn: {
        type: Date
    },
    clockOut: {
        type: Date
    },
    clockInIST: String, // Explicit IST time string
    clockOutIST: String, // Explicit IST time string
    status: {
        type: String,
        enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE'],
        default: 'ABSENT'
    },
    ipAddress: String,
    location: {
        lat: Number,
        lng: Number
    },
    notes: String,
    approvalStatus: { 
        type: String, 
        enum: ['PENDING', 'APPROVED', 'REJECTED'], 
        default: 'PENDING' 
    },
    approvedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    rejectionReason: String
}, { timestamps: true });

// Ensure one entry per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
