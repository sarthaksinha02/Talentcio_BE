const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
    hiringRequestId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HiringRequest',
        required: true,
        index: true
    },

    // Resume Information
    resumeUrl: {
        type: String,
        required: true
    },
    resumePublicId: {
        type: String,
        required: true
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    },

    // Candidate Basic Information
    candidateName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    mobile: {
        type: String,
        required: true,
        trim: true
    },

    // Source Information
    source: {
        type: String,
        required: true
    },
    profilePulledBy: {
        type: String,
        trim: true
    },
    referralName: {
        type: String,
        trim: true
    },

    // Compensation Details
    currentCTC: {
        type: Number,
        min: 0
    },
    expectedCTC: {
        type: Number,
        min: 0
    },
    preference: {
        type: String,
        enum: ['Highly Recommended', 'Recommended', 'Neutral / Average', 'Not Recommended', 'Very Poor']
    },

    // Experience & Qualification
    totalExperience: {
        type: Number,
        required: true,
        min: 0
    },
    qualification: {
        type: String,
        trim: true
    },
    currentCompany: {
        type: String,
        trim: true
    },
    pastExperience: [{
        companyName: {
            type: String
        },
        experienceYears: {
            type: Number
        }
    }],

    // Location Details
    currentLocation: {
        type: String,
        trim: true
    },
    preferredLocation: {
        type: String,
        trim: true
    },

    // Availability
    tatToJoin: {
        type: Number,
        min: 0
    },
    noticePeriod: {
        type: Number,
        min: 0
    },

    // Status Tracking
    status: {
        type: String,
        enum: ['Interested', 'Not Interested', 'Not Relevant', 'Not Picking'],
        required: true,
        default: 'Interested'
    },
    statusHistory: [{
        status: {
            type: String,
            enum: ['Interested', 'Not Interested', 'Not Relevant', 'Not Picking']
        },
        changedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        changedAt: {
            type: Date,
            default: Date.now
        },
        remark: String
    }],

    // Hiring Decision
    decision: {
        type: String,
        enum: ['Hired', 'Rejected', 'On Hold', 'None'],
        default: 'None'
    },

    remark: {
        type: String,
        trim: true
    }
}, {
    timestamps: true
});

// Compound index to ensure unique email per hiring request
candidateSchema.index({ hiringRequestId: 1, email: 1 }, { unique: true });

// Add status to history before saving
candidateSchema.pre('save', function () {
    if (this.isModified('status') && !this.isNew) {
        this.statusHistory.push({
            status: this.status,
            changedBy: this.uploadedBy,
            changedAt: new Date(),
            remark: this.remark
        });
    }
});

module.exports = mongoose.model('Candidate', candidateSchema);
