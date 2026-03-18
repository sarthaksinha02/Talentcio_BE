const mongoose = require('mongoose');
require('dotenv').config();

// Models
const Company = require('../src/models/Company');
const User = require('../src/models/User');
const Attendance = require('../src/models/Attendance');
const AttendanceRegularization = require('../src/models/AttendanceRegularization');
const LeaveRequest = require('../src/models/LeaveRequest');
const LeaveConfig = require('../src/models/LeaveConfig');
const HelpdeskQuery = require('../src/models/HelpdeskQuery');
const Candidate = require('../src/models/Candidate');
const { HiringRequest } = require('../src/models/HiringRequest');
const Project = require('../src/models/Project');
const Task = require('../src/models/Task');
const Timesheet = require('../src/models/Timesheet');
const Holiday = require('../src/models/Holiday');
const EmployeeProfile = require('../src/models/EmployeeProfile');
const Client = require('../src/models/Client');
const BusinessUnit = require('../src/models/BusinessUnit');
const ActivityLog = require('../src/models/ActivityLog');
const Meeting = require('../src/models/Meeting');
const Notification = require('../src/models/Notification');
const Role = require('../src/models/Role');

async function migrate() {
    try {
        console.log('--- PRODUCTION MIGRATION STARTED ---');
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }

        await mongoose.connect(uri);
        console.log('Connected to Database.');

        // 1. Create or Find the default company (Tenant)
        const subdomain = "telentcio"; // Matches telentcio.vercel.app
        let defaultCompany = await Company.findOne({ subdomain });
        
        if (!defaultCompany) {
            defaultCompany = await Company.create({
                name: "Primary Company",
                subdomain: subdomain,
                email: "admin@yourcompany.com",
                status: "Active",
                timezone: "Asia/Kolkata",
                settings: {
                    attendance: { workingHours: 8, weeklyOff: ['Saturday', 'Sunday'] }
                }
            });
            console.log(`Created Default Company: ${defaultCompany.name} (ID: ${defaultCompany._id})`);
        } else {
            console.log(`Using existing Company: ${defaultCompany.name} (ID: ${defaultCompany._id})`);
        }

        // 2. All Models that require companyId association
        const modelsToUpdate = [
            { name: 'User', model: User },
            { name: 'Role', model: Role },
            { name: 'Attendance', model: Attendance },
            { name: 'AttendanceRegularization', model: AttendanceRegularization },
            { name: 'LeaveRequest', model: LeaveRequest },
            { name: 'LeaveConfig', model: LeaveConfig },
            { name: 'HelpdeskQuery', model: HelpdeskQuery },
            { name: 'Candidate', model: Candidate },
            { name: 'HiringRequest', model: HiringRequest },
            { name: 'Project', model: Project },
            { name: 'Task', model: Task },
            { name: 'Timesheet', model: Timesheet },
            { name: 'Holiday', model: Holiday },
            { name: 'EmployeeProfile', model: EmployeeProfile },
            { name: 'Client', model: Client },
            { name: 'BusinessUnit', model: BusinessUnit },
            { name: 'ActivityLog', model: ActivityLog },
            { name: 'Meeting', model: Meeting },
            { name: 'Notification', model: Notification }
        ];

        console.log('\n--- Syncing Data with Company ID ---');
        for (const { name, model } of modelsToUpdate) {
            const result = await model.updateMany(
                { companyId: { $exists: false } }, 
                { $set: { companyId: defaultCompany._id } }
            );
            console.log(`Associated ${result.modifiedCount} ${name} records.`);
        }

        console.log('\n--- Migration Completed Successfully ---');
        process.exit(0);
    } catch (err) {
        console.error('Migration Failed:', err);
        process.exit(1);
    }
}

migrate();
