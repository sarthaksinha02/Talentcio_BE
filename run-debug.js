require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }), 'users');
    const HRR = mongoose.model('HRR', new mongoose.Schema({}, { strict: false }), 'hiringrequests');
    const Candidate = mongoose.model('Cand', new mongoose.Schema({}, { strict: false }), 'candidates');

    // Get all users
    const users = await User.find({}, '_id firstName lastName email').lean();
    const hrrs = await HRR.find({}, 'requestId createdBy ownership approvalChain').lean();
    const candidates = await Candidate.find({}, 'hiringRequestId candidateName interviewRounds').lean();

    console.log('\n====== HIRING REQUESTS ======');
    hrrs.forEach(h => {
        console.log(`${h.requestId}:`);
        console.log(`  createdBy: ${h.createdBy}`);
        console.log(`  hiringManager: ${h.ownership?.hiringManager}`);
        console.log(`  recruiter: ${h.ownership?.recruiter}`);
        console.log(`  interviewPanel: ${JSON.stringify(h.ownership?.interviewPanel)}`);
        console.log(`  approvalChain approvers: ${JSON.stringify(h.approvalChain?.map(l => l.approvers))}`);
    });

    console.log('\n====== USERS ======');
    for (const user of users) {
        const taCount = hrrs.filter(h =>
            String(h.createdBy) === String(user._id) ||
            String(h.ownership?.hiringManager) === String(user._id) ||
            String(h.ownership?.recruiter) === String(user._id)
        ).length;

        const panelCount = hrrs.filter(h =>
            (h.ownership?.interviewPanel || []).some(id => String(id) === String(user._id))
        ).length;

        const interviewCount = candidates.filter(c =>
            c.interviewRounds?.some(r => (r.assignedTo || []).some(id => String(id) === String(user._id)))
        ).length;

        const isTAParticipant = taCount > 0 || panelCount > 0 || interviewCount > 0;

        if (isTAParticipant) {
            console.log(`\n⚠  ${user.firstName} ${user.lastName} (${user.email}) -> isTAParticipant: TRUE`);
            console.log(`   taCount=${taCount}, panelCount=${panelCount}, interviewCount=${interviewCount}`);
        } else {
            console.log(`   ${user.firstName} ${user.lastName} (${user.email}) -> isTAParticipant: false`);
        }
    }

    await mongoose.disconnect();
}).catch(e => { console.error(e.message); process.exit(1); });
