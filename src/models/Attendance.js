const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
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
        lng: Number,
        accuracy: Number
    },
    clockOutLocation: {
        lat: Number,
        lng: Number,
        accuracy: Number
    },
    userAgent: String,
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
    rejectionReason: String,
    timesheetSyncError: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Ensure one entry per user per day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Dashboard: "today's attendance" filter — Attendance.find({ date: { $gte, $lt } })
attendanceSchema.index({ date: 1 });

// Dashboard: present/absent count — Attendance.countDocuments({ date:..., status:... })
attendanceSchema.index({ date: 1, status: 1 });

// Dashboard: pending approvals — Attendance.countDocuments({ approvalStatus: 'PENDING' })
attendanceSchema.index({ approvalStatus: 1 });

// Attendance page: user's own history sorted by date
attendanceSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
