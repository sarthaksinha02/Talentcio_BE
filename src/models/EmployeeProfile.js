const mongoose = require('mongoose');

const AddressSchema = new mongoose.Schema({
    type: { type: String, enum: ['Current', 'Permanent'] },
    street: String,
    addressLine2: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    isSameAsCurrent: { type: Boolean, default: false }
});

const WorkHistorySchema = new mongoose.Schema({
    companyName: String,
    designation: String,
    startDate: Date,
    endDate: Date,
    reasonForLeaving: String
});

const EducationSchema = new mongoose.Schema({
    institution: String,
    degree: String,
    fieldOfStudy: String,
    startDate: Date,
    endDate: Date,
    grade: String
});

const employeeProfileSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

    // --- Personal Information ---
    personal: {
        dob: Date,
        gender: { type: String, enum: ['Male', 'Female', 'Other', 'Prefer not to say'] },
        maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'] },
        bloodGroup: String,
        nationality: String,
        shirtSize: String, // For swag
        photo: String, // URL

        // Extended Attributes
        disabilityStatus: { type: Boolean, default: false },
        disabilityDetails: String,
        medicalConditions: { type: String, select: false }, // Confidential
        dietaryPreference: { type: String, enum: ['Veg', 'Non-Veg', 'Vegan', 'Egg'] },
        hobbies: [String]
    },

    // --- Identity & Confidential ---
    identity: {
        aadhaarNumber: { type: String, select: false }, // Private by default
        panNumber: { type: String, select: false },
        passportNumber: { type: String, select: false },
        passportExpiry: Date,
        visaStatus: String,
        visaExpiryDate: Date
    },

    // --- Contact Details ---
    contact: {
        personalEmail: String,
        mobileNumber: String,
        alternateNumber: String,
        addresses: [AddressSchema],
        emergencyContact: {
            name: String,
            relation: String,
            phone: String,
            email: String
        }
    },

    // --- Employment Details ---
    employment: {
        designation: String,
        department: String,
        businessUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUnit' },
        reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        joiningDate: Date,
        confirmationDate: Date,
        status: { type: String, enum: ['Active', 'On Notice', 'Terminated', 'Resigned', 'Retired'] },
        noticePeriodDays: Number,
        workLocation: { type: String, enum: ['Office', 'Remote', 'Hybrid'] },
        branch: String,
        employmentType: {
            type: String,
            enum: ['Full Time', 'Part Time', 'Contract', 'Intern', 'Consultant', 'Freelance', 'Probation'],
            default: 'Full Time'
        }
    },

    // --- Compensation & Benefits ---
    compensation: {
        ctc: { type: Number, select: false }, // Confidential
        salaryBreakup: Map, // Flexible key-value structure
        bankDetails: {
            accountNumber: { type: String, select: false },
            ifscCode: String,
            bankName: String,
            accountHolderName: String
        },
        pfAccountNumber: String,
        uanNumber: String
    },

    // --- Documents ---
    documents: [{
        category: { type: String, enum: ['ID Proof', 'Education', 'Offer Letter', 'Payslips', 'Tax', 'Other', 'Employment', 'Resume', 'Appointment Letter'] },
        title: String,
        fileName: String, // Original filename from upload
        url: String,
        uploadDate: { type: Date, default: Date.now },
        expiryDate: Date,
        verificationStatus: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
    }],

    // --- History ---
    education: [EducationSchema],
    experience: [WorkHistorySchema],
    skills: [String],

    // --- Metadata ---
    tags: [String],
    isConfidential: { type: Boolean, default: false } // VIP profile

}, { timestamps: true });

module.exports = mongoose.model('EmployeeProfile', employeeProfileSchema);
