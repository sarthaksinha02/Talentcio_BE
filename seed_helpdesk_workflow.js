const mongoose = require('mongoose');
const dotenv = require('dotenv');
const ApprovalWorkflow = require('./src/models/ApprovalWorkflow');
const Role = require('./src/models/Role');
const User = require('./src/models/User');

dotenv.config();

mongoose.connect(process.env.MONGO_URI);

const seed = async () => {
    try {
        console.log('Seeding Payroll Issue Workflow...');

        const hrRole = await Role.findOne({ name: 'HR' });
        const adminRole = await Role.findOne({ name: 'Admin' });

        if (!hrRole || !adminRole) {
            console.log("Could not find HR or Admin role. Bailing out.");
            return;
        }

        const hrUsers = await User.find({ roles: hrRole._id });
        const adminUsers = await User.find({ roles: adminRole._id });

        // Remove existing if any
        await ApprovalWorkflow.deleteOne({ name: 'Payroll Issue' });

        const newWorkflow = new ApprovalWorkflow({
            name: 'Payroll Issue',
            description: 'Approval workflow for resolving employee payroll issues.',
            levels: [
                {
                    levelCheck: 1,
                    role: hrRole._id,
                    approvers: hrUsers.map(u => u._id),
                    isFinal: false
                },
                {
                    levelCheck: 2,
                    role: adminRole._id,
                    approvers: adminUsers.map(u => u._id),
                    isFinal: true
                }
            ],
            isActive: true
        });

        await newWorkflow.save();
        console.log('Successfully created ApprovalWorkflow for "Payroll Issue".');
        console.log(`Level 1: HR (${hrUsers.length} users)`);
        console.log(`Level 2: Admin (${adminUsers.length} users)`);

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.disconnect();
    }
}
seed();
