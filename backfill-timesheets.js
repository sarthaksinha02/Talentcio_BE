const mongoose = require('mongoose');
require('dotenv').config();
const Project = require('./src/models/Project');
const Module = require('./src/models/Module');
const Task = require('./src/models/Task');
const WorkLog = require('./src/models/WorkLog');
const Timesheet = require('./src/models/Timesheet');
const User = require('./src/models/User');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to DB');

        // 1. Migrate Projects
        const orphanProjects = await Project.find({ companyId: { $exists: false } });
        console.log(`Migrating ${orphanProjects.length} projects...`);
        for (const p of orphanProjects) {
            // Projects are usually managed by someone. Find that user's company.
            const manager = await User.findById(p.manager || p.members[0]);
            if (manager && manager.companyId) {
                p.companyId = manager.companyId;
                await p.save();
            }
        }

        // 2. Migrate Modules
        const orphanModules = await Module.find({ companyId: { $exists: false } }).populate('project');
        console.log(`Migrating ${orphanModules.length} modules...`);
        for (const m of orphanModules) {
            if (m.project && m.project.companyId) {
                m.companyId = m.project.companyId;
                await m.save();
            }
        }

        // 3. Migrate Tasks
        const orphanTasks = await Task.find({ companyId: { $exists: false } }).populate('module');
        console.log(`Migrating ${orphanTasks.length} tasks...`);
        for (const t of orphanTasks) {
            if (t.module && t.module.companyId) {
                t.companyId = t.module.companyId;
                await t.save();
            }
        }

        // 4. Migrate WorkLogs
        const orphanLogs = await WorkLog.find({ companyId: { $exists: false } });
        console.log(`Migrating ${orphanLogs.length} work logs...`);
        for (const l of orphanLogs) {
            const user = await User.findById(l.user);
            if (user && user.companyId) {
                l.companyId = user.companyId;
                await l.save();
            }
        }

        // 5. Migrate Timesheets
        const orphanTimesheets = await Timesheet.find({ companyId: { $exists: false } });
        console.log(`Migrating ${orphanTimesheets.length} timesheets...`);
        for (const ts of orphanTimesheets) {
            const user = await User.findById(ts.user);
            if (user && user.companyId) {
                ts.companyId = user.companyId;
                await ts.save();
            }
        }

        console.log('\nMigration complete.');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
