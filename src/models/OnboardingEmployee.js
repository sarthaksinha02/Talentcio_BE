const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const documentSchema = new mongoose.Schema({
    type: { type: String, required: true }, // e.g., 'aadhaar_front', 'pan', 'passport', '10th_marksheet', etc.
    label: { type: String, required: true },
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
    status: {
        type: String,
        enum: ['Pending', 'Uploaded', 'Approved', 'Re-upload Required'],
        default: 'Pending'
    },
    rejectionReason: { type: String, default: '' },
    uploadedAt: Date
}, { _id: true });

const auditEntrySchema = new mongoose.Schema({
    action: { type: String, required: true }, // LOGIN, SAVE, SUBMIT, PASSWORD_CHANGE, DOCUMENT_UPLOAD, etc.
    timestamp: { type: Date, default: Date.now },
    ip: { type: String, default: '' },
    details: { type: String, default: '' }
}, { _id: false });

const onboardingEmployeeSchema = new mongoose.Schema({
    // --- Identity & Credentials ---
    tempEmployeeId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    tempPassword: {
        type: String,
        required: true
    },
    isPasswordChanged: {
        type: Boolean,
        default: false
    },
    passwordChangedAt: Date,
    credentialsExpireAt: Date,

    // --- Basic Info (set by HR) ---
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: '', trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    designation: { type: String, default: '' },
    department: { type: String, default: '' },
    joiningDate: { type: Date },
    documentDeadline: { type: Date },
    workLocation: { type: String, default: '' },
    address: { type: String, default: '' },
    probationPeriod: { type: String, default: '6 months' },

    // --- Salary / Compensation ---
    salary: {
        annualCTC: { type: String, default: '' },
        basic: { type: String, default: '' },
        hra: { type: String, default: '' },
        specialAllowance: { type: String, default: '' },
        monthlyGross: { type: String, default: '' },
        monthlyCTC: { type: String, default: '' }
    },

    // --- Letter generation tracking ---
    letterGenerated: { type: Boolean, default: false },
    letterGeneratedAt: { type: Date },

    // --- Status ---
    offerStatus: {
        type: String,
        enum: ['Pending', 'Accepted', 'Rejected'],
        default: 'Pending'
    },
    status: {
        type: String,
        enum: ['Pending', 'In Progress', 'Submitted', 'Reviewed'],
        default: 'Pending'
    },

    // --- Section 1: Personal & Contact Details ---
    personalDetails: {
        fullName: { type: String, default: '' },
        dateOfBirth: { type: Date },
        gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
        bloodGroup: { type: String, default: '' },
        personalEmail: { type: String, default: '' },
        personalMobile: { type: String, default: '' },
        currentAddress: {
            line1: { type: String, default: '' },
            line2: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            pincode: { type: String, default: '' },
            country: { type: String, default: 'India' }
        },
        permanentAddress: {
            line1: { type: String, default: '' },
            line2: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            pincode: { type: String, default: '' },
            country: { type: String, default: 'India' }
        },
        sameAsCurrent: { type: Boolean, default: false },
        linkedinUrl: { type: String, default: '' },
        portfolioUrl: { type: String, default: '' },
        isComplete: { type: Boolean, default: false }
    },

    // --- Section 2: Emergency Contact ---
    emergencyContact: {
        contactName: { type: String, default: '' },
        relationship: { type: String, default: '' },
        phoneNumber: { type: String, default: '' },
        address: { type: String, default: '' },
        isComplete: { type: Boolean, default: false }
    },

    // --- Section 3: Documents ---
    documents: [documentSchema],

    // --- Section 4: Bank / Payroll Details ---
    bankDetails: {
        bankName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        confirmAccountNumber: { type: String, default: '' },
        ifscCode: { type: String, default: '' },
        branchName: { type: String, default: '' },
        accountType: { type: String, enum: ['Savings', 'Current', ''], default: '' },
        cancelledChequeUrl: { type: String, default: '' },
        cancelledChequePublicId: { type: String, default: '' },
        isComplete: { type: Boolean, default: false }
    },

    // --- Section 5: Offer Letter Declaration ---
    offerDeclaration: {
        hasReadOfferLetter: { type: Boolean, default: false },
        hasProvidedTrueInfo: { type: Boolean, default: false },
        agreesToOriginalVerification: { type: Boolean, default: false },
        eSignName: { type: String, default: '' },
        eSignDate: { type: Date },
        isComplete: { type: Boolean, default: false }
    },

    // --- Submission ---
    submittedAt: { type: Date },

    // --- Offer Letter (uploaded by HR) ---
    offerLetterUrl: { type: String, default: '' },
    offerLetterPublicId: { type: String, default: '' },

    // --- Audit ---
    auditLog: [auditEntrySchema],

    // --- Multi-tenant ---
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Compound index for tenant isolation
onboardingEmployeeSchema.index({ companyId: 1, tempEmployeeId: 1 }, { unique: true });
onboardingEmployeeSchema.index({ companyId: 1, email: 1 });
onboardingEmployeeSchema.index({ companyId: 1, status: 1 });

// Hash password before save
onboardingEmployeeSchema.pre('save', async function () {
    if (!this.isModified('tempPassword')) return;
    const salt = await bcrypt.genSalt(10);
    this.tempPassword = await bcrypt.hash(this.tempPassword, salt);
});

onboardingEmployeeSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.tempPassword);
};

// Generate Temp Employee ID
onboardingEmployeeSchema.statics.generateTempId = async function (companyId) {
    const year = new Date().getFullYear();
    const count = await this.countDocuments({ companyId });
    return `EMP-${year}-${String(count + 1).padStart(4, '0')}`;
};

module.exports = mongoose.model('OnboardingEmployee', onboardingEmployeeSchema);
