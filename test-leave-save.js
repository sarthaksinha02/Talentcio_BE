const mongoose = require('mongoose');
require('dotenv').config();
const LeaveConfig = require('./src/models/LeaveConfig');
const Company = require('./src/models/Company');

async function testSave() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to DB');

        const company = await Company.findOne({ subdomain: 'telentcio-demo' });
        if (!company) throw new Error('Company telentcio-demo not found');
        console.log(`Testing for company: ${company.subdomain} (${company._id})`);

        const testPolicy = {
            leaveType: 'TEST',
            companyId: company._id,
            name: 'Manual Test Policy',
            accrualType: 'Monthly',
            accrualAmount: 1,
            isActive: true
        };

        // Try to update or create
        let policy = await LeaveConfig.findOneAndUpdate(
            { leaveType: testPolicy.leaveType, companyId: testPolicy.companyId },
            testPolicy,
            { upsert: true, new: true, runValidators: true }
        );

        console.log('[SUCCESS] Policy saved:', policy.name);

        // Delete it after test
        await LeaveConfig.deleteOne({ _id: policy._id });
        console.log('[CLEANUP] Test policy removed.');

        process.exit(0);
    } catch (err) {
        console.error('[ERROR]', err);
        process.exit(1);
    }
}

testSave();
