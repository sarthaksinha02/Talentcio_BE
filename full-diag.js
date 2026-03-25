const mongoose = require('mongoose');
require('dotenv').config();
const LeaveConfig = require('./src/models/LeaveConfig');
const Company = require('./src/models/Company');
const User = require('./src/models/User');

async function fullDiag() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to DB');

        const companies = await Company.find();
        console.log(`\nFound ${companies.length} Companies:`);
        companies.forEach(c => {
            console.log(`- ${c.subdomain} | ID: ${c._id} | Name: ${c.name}`);
        });

        const configs = await LeaveConfig.find().populate('companyId');
        console.log(`\nFound ${configs.length} Leave Configs (All):`);
        configs.forEach(c => {
            console.log(`- [${c.leaveType}] ${c.name} | Co: ${c.companyId?.subdomain || 'MISSING (ID: ' + c.companyId + ')'}`);
        });

        // Check for users in each company
        console.log('\nUsers per company:');
        for (const c of companies) {
            const count = await User.countDocuments({ companyId: c._id });
            console.log(`- ${c.subdomain}: ${count} users`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

fullDiag();
