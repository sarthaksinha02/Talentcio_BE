const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    leaveType: {
        type: String,
        required: true, // CL, SL, EL
        enum: ['CL', 'SL', 'EL', 'LOP', 'WFH']
    },
    year: {
        type: Number,
        required: true
    },
    openingBalance: {
        type: Number,
        default: 0
    },
    accrued: {
        type: Number,
        default: 0
    },
    utilized: {
        type: Number,
        default: 0
    },
    encashed: {
        type: Number,
        default: 0
    },
    // Virtual closing balance is often better calculated on the fly, 
    // but storing it helps with quick queries. We'll update it on every transaction.
    closingBalance: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Compound index to ensure one balance record per type per user per year
leaveBalanceSchema.index({ user: 1, leaveType: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
