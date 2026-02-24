const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ApprovalWorkflow = require('./src/models/ApprovalWorkflow');

dotenv.config();

mongoose.connect(process.env.MONGO_URI);

const migrateWorkflows = async () => {
    try {
        console.log('Migrating existing workflows to include module discriminator...');

        const helpdeskNames = ['Payroll Issue', 'Leave Query', 'Benefits Query', 'Policy Query', 'IT Support', 'Other'];

        // Update Helpdesk workflows
        const hdRes = await ApprovalWorkflow.updateMany(
            { name: { $in: helpdeskNames } },
            { $set: { module: 'Helpdesk' } }
        );
        console.log(`Updated ${hdRes.modifiedCount} Helpdesk workflows.`);

        // Update all other workflows to TA
        const taRes = await ApprovalWorkflow.updateMany(
            { name: { $nin: helpdeskNames }, module: { $exists: false } },
            { $set: { module: 'TA' } }
        );
        console.log(`Updated ${taRes.modifiedCount} TA workflows.`);

        // Also just forcing any existing TA ones that might already have the default
        const taRes2 = await ApprovalWorkflow.updateMany(
            { name: { $nin: helpdeskNames } },
            { $set: { module: 'TA' } }
        );
        console.log(`Ensured TA tags on ${taRes2.modifiedCount} workflows.`);

        console.log('Migration complete.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        mongoose.disconnect();
    }
};

migrateWorkflows();
