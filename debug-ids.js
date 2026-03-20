const mongoose = require('mongoose');
require('dotenv').config();
const LeaveConfig = require('./src/models/LeaveConfig');
const Company = require('./src/models/Company');

async function debugIds() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to DB');

        const demoCompany = await Company.findOne({ subdomain: 'telentcio-demo' });
        console.log(`Demo Company: ${demoCompany?.subdomain} | ID: ${demoCompany?._id}`);

        const prodCompany = await Company.findOne({ subdomain: 'telentcio' });
        console.log(`Prod Company: ${prodCompany?.subdomain} | ID: ${prodCompany?._id}`);

        const configs = await LeaveConfig.find({ companyId: demoCompany?._id });
        console.log(`Found ${configs.length} configs for telentcio-demo`);

        const allConfigs = await LeaveConfig.find();
        console.log(`\nTotal Leave Configs in DB: ${allConfigs.length}`);
        allConfigs.forEach(c => {
            console.log(`- ${c.leaveType} | CompanyId: ${c.companyId}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugIds();
