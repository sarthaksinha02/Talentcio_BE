const mongoose = require('mongoose');
require('dotenv').config();

// Models
const User = require('../src/models/User');
const Company = require('../src/models/Company');
const ApprovalWorkflow = require('../src/models/ApprovalWorkflow');
const InterviewWorkflow = require('../src/models/InterviewWorkflow');

async function migrate() {
    try {
        console.log('--- WORKFLOW MIGRATION STARTED ---');
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }

        await mongoose.connect(uri);
        console.log('Connected to Database.');

        const fallbackCompany = await Company.findOne();
        if (!fallbackCompany) {
            console.warn('No company found in database. Migration cannot proceed safely.');
            process.exit(1);
        }
        console.log(`Using fallback Company: ${fallbackCompany.name} (ID: ${fallbackCompany._id})`);

        const models = [
            { name: 'ApprovalWorkflow', model: ApprovalWorkflow },
            { name: 'InterviewWorkflow', model: InterviewWorkflow }
        ];

        for (const { name, model } of models) {
            console.log(`\nProcessing ${name}...`);
            const records = await model.find({ companyId: { $exists: false } });
            console.log(`Found ${records.length} records missing companyId.`);

            let updatedCount = 0;
            for (const record of records) {
                let targetCompanyId = fallbackCompany._id;

                if (record.createdBy) {
                    const creator = await User.findById(record.createdBy);
                    if (creator && creator.companyId) {
                        targetCompanyId = creator.companyId;
                    }
                }

                await model.updateOne({ _id: record._id }, { $set: { companyId: targetCompanyId } });
                updatedCount++;
            }
            console.log(`Successfully updated ${updatedCount} ${name} records.`);
        }

        console.log('\n--- Migration Completed Successfully ---');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
}

migrate();
