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

    // Competing Offer Details
    inHandOffer: {
        type: Boolean,
        default: false
    },
    offerCompany: {
        type: String,
        trim: true
    },
    offerCTC: {
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
        },
        role: {
            type: String,
            trim: true
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
    lastWorkingDay: {
        type: Date
    },

    // Status Tracking
    status: {
        type: String,
        enum: ['Interested', 'Not Interested', 'Not Relevant', 'Not Picking', 'Pre-Screened', 'In Interview'],
        required: true,
        default: 'Interested'
    },
    statusHistory: [{
        status: {
            type: String,
            enum: ['Interested', 'Not Interested', 'Not Relevant', 'Not Picking', 'Pre-Screened', 'In Interview'],
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

    // Interview Tracking
    interviewRounds: [{
        levelName: { // e.g., '1', '2', 'L1 - Technical', 'HR Round'
            type: String,
            required: true
        },
        assignedTo: [{ // Users assigned to evaluate this round
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        status: { // State of this specific round
            type: String,
            enum: ['Pending', 'Scheduled', 'Passed', 'Failed', 'Skipped'],
            default: 'Pending'
        },
        scheduledDate: Date,
        feedback: String,
        rating: { // Numeric rating out of 10 (only for Passed rounds)
            type: Number,
            min: 1,
            max: 10
        },
        evaluatedBy: { // User who actually submitted the pass/fail
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        evaluatedAt: Date
    }],

    // Hiring Decision
    decision: {
        type: String,
        enum: ['Hired', 'Shortlisted', 'Rejected', 'On Hold', 'None'],
        default: 'None'
    },

    // Phase 2 Client Decision
    phase2Decision: {
        type: String,
        enum: ['Hired', 'Shortlisted', 'Rejected', 'On Hold', 'None'],
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



module.exports = mongoose.model('Candidate', candidateSchema);
