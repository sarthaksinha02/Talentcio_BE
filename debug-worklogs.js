const mongoose = require('mongoose');
require('dotenv').config();
require('./src/models/Project');
require('./src/models/Module');
require('./src/models/Task');
const WorkLog = require('./src/models/WorkLog');
const Company = require('./src/models/Company');

async function debugWorkLogs() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to DB');

        const demoCompany = await Company.findOne({ subdomain: 'telentcio-demo' });
        console.log(`Demo Company ID: ${demoCompany?._id}`);

        const logs = await WorkLog.find({ companyId: demoCompany?._id }).populate({
            path: 'task',
            populate: { path: 'module', populate: { path: 'project' } }
        });
        console.log(`\nFound ${logs.length} WorkLogs for telentcio-demo`);

        logs.forEach(l => {
            console.log(`- Date: ${l.date.toISOString().split('T')[0]} | Project: ${l.task?.module?.project?.name || 'MISSING'}`);
        });

        const orphanLogs = await WorkLog.find({ companyId: { $exists: false } });
        console.log(`\nFound ${orphanLogs.length} WorkLogs with NO companyId`);

        const allLogs = await WorkLog.find().limit(10);
        console.log(`\nSample of last 10 WorkLogs (Any company):`);
        allLogs.forEach(l => {
            console.log(`- User: ${l.user} | Co: ${l.companyId} | Date: ${l.date.toISOString().split('T')[0]}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debugWorkLogs();
