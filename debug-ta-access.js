/**
 * Debug Script: TA Interviewer Access Check
 * Run with: node debug-ta-access.js <email>
 * Example: node debug-ta-access.js interviewer@company.com
 */
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/talentcio';
const targetEmail = process.argv[2];

if (!targetEmail) {
    console.error('Usage: node debug-ta-access.js <email>');
    process.exit(1);
}

async function main() {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB\n');

    const User = require('./src/models/User');
    const Candidate = require('./src/models/Candidate');
    const { HiringRequest } = require('./src/models/HiringRequest');

    // 1. Get user
    const user = await User.findOne({ email: targetEmail })
        .populate({ path: 'roles', populate: { path: 'permissions' } });

    if (!user) {
        console.error('User not found:', targetEmail);
        process.exit(1);
    }

    console.log('===== USER INFO =====');
    console.log('Name:', user.firstName, user.lastName);
    console.log('ID:', user._id.toString());

    // 2. Check roles and permissions
    const isAdmin = user.roles.some(r => r.name === 'Admin' || r.name === 'HR' || r.name === 'Super Admin');
    const permissions = user.roles.flatMap(role => (role.permissions || []).filter(p => p).map(p => p.key));
    const hasTaView = permissions.includes('ta.view') || permissions.includes('*');

    console.log('\n===== ROLE CHECK =====');
    user.roles.forEach(r => {
        console.log(`  Role: "${r.name}" | Permissions:`, r.permissions?.map(p => p?.key).filter(Boolean));
    });
    console.log('isAdmin:', isAdmin);
    console.log('hasTaView:', hasTaView);
    console.log('All Permissions:', permissions);

    // 3. Check if they are in any HiringRequest as creator/HM/recruiter/approver
    const taParticipantRequests = await HiringRequest.find({
        $or: [
            { createdBy: user._id },
            { 'ownership.hiringManager': user._id },
            { 'ownership.recruiter': user._id },
            { 'approvalChain.approvers': user._id }
        ]
    }).select('requestId');
    console.log('\n===== TA PARTICIPANT =====');
    console.log('Hiring requests where user is creator/HM/recruiter/approver:', taParticipantRequests.map(r => r.requestId));

    // 4. Check interviewRounds.assignedTo
    const assignedCandidates = await Candidate.find({
        'interviewRounds.assignedTo': user._id
    }).select('candidateName hiringRequestId');
    console.log('\n===== INTERVIEWER CHECK =====');
    console.log('Candidates where user is assigned interviewer:', assignedCandidates.length);
    assignedCandidates.forEach(c => {
        console.log(`  - ${c.candidateName} (HRR: ${c.hiringRequestId})`);
    });

    // 5. Summary
    console.log('\n===== DIAGNOSIS =====');
    if (isAdmin) {
        console.warn('⚠  User is ADMIN/HR/Super Admin — will see ALL hiring requests');
    } else if (hasTaView) {
        console.warn('⚠  User has ta.view or * permission — will see ALL hiring requests');
    } else if (taParticipantRequests.length > 0) {
        console.log('✓  User is a TA participant (creator/HM/recruiter/approver) — will see their requests');
    } else if (assignedCandidates.length > 0) {
        console.log('✓  User is an interviewer — will see filtered requests');
    } else {
        console.error('✗  User has NO TA access — should not see the TA tab at all');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
