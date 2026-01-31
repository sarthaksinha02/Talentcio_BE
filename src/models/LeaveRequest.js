const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    leaveType: {
        type: String,
        required: true,
        enum: ['CL', 'SL', 'EL', 'LOP', 'WFH']
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isHalfDay: {
        type: Boolean,
        default: false
    },
    halfDaySession: {
        type: String,
        enum: ['First Half', 'Second Half', null],
        default: null
    },
    reason: {
        type: String,
        required: true
    },
    documents: [{
        type: String // URLs to uploaded files
    }],
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
        default: 'Pending'
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rejectionReason: String,

    // Calculated fields
    daysCount: {
        type: Number,
        required: true,
        min: 0.5
    },

    // Audit Trail
    auditLog: [{
        action: String, // 'Applied', 'Approved', 'Rejected', 'Cancelled'
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        comment: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
