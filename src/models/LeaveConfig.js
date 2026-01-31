const mongoose = require('mongoose');

const leaveConfigSchema = new mongoose.Schema({
    leaveType: {
        type: String,
        required: true,
        enum: ['CL', 'SL', 'EL', 'LOP', 'WFH'],
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    description: String,
    employeeTypes: [{
        type: String, // 'Full Time', 'Consultant', 'All'
        default: 'All'
    }],
    isPaid: {
        type: Boolean,
        default: true
    },
    accrualType: {
        type: String,
        enum: ['Monthly', 'Yearly', 'Policy', 'None'],
        default: 'Monthly'
    },
    accrualAmount: {
        type: Number,
        default: 0
    },
    carryForward: {
        type: Boolean,
        default: false
    },
    maxCarryForward: {
        type: Number,
        default: 0
    },
    encashmentAllowed: {
        type: Boolean,
        default: false
    },
    maxLimitPerYear: {
        type: Number,
        default: 0
    },
    // Rules
    sandwichRule: {
        type: Boolean,
        default: false
    },
    allowNegativeBalance: {
        type: Boolean,
        default: false
    },
    proofRequiredAbove: {
        type: Number,
        default: 0 // 0 means never
    },
    allowBackdated: {
        type: Boolean,
        default: true
    },
    proRata: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('LeaveConfig', leaveConfigSchema);
