const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    firstName: String,
    lastName: String,
    roles: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role'
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    department: String,
    employmentType: {
        type: String,
        enum: ['Full Time', 'Part Time', 'Contract', 'Intern', 'Consultant', 'Freelance', 'Probation'],
        default: 'Full Time'
    },
    profilePicture: {
        type: String,
        default: ''
    },
    workLocation: {
        type: String,
        default: 'Headquarters' // Default value
    },
    employeeCode: String,
    reportingManagers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    joiningDate: Date,
    employeeProfile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmployeeProfile'
    },
    dossierStatus: {
        type: String,
        enum: ['Incomplete', 'Pending Verification', 'Verified'],
        default: 'Incomplete'
    },
    tokenVersion: {
        type: Number,
        default: 0
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        index: true
    },
    isPasswordResetRequired: {
        type: Boolean,
        default: true
    },
    otp: {
        type: String,
        default: null
    },
    otpExpires: {
        type: Date,
        default: null
    }
}, { timestamps: true });

// Encrypt password before save
// Encrypt password before save
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (err) {
        throw err;
    }
});

userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
