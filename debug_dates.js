const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const Project = require('./src/models/Project');
const Module = require('./src/models/Module');
const Task = require('./src/models/Task');
const Company = require('./src/models/Company');
const User = require('./src/models/User');

const fs = require('fs');
const logFile = 'debug_dates_log.txt';
fs.writeFileSync(logFile, 'Test started\n');

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

const testDates = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        log(`MongoDB Connected: ${conn.connection.host}`);

        // 1. Get a company and user for reference
        const company = await Company.findOne();
        if (!company) throw new Error('No company found for test');
        const user = await User.findOne({ company: company._id });
        if (!user) throw new Error('No user found for test');

        // 2. Create Project with dates
        const startDate = new Date('2025-01-01');
        const dueDate = new Date('2025-12-31');
        
        const project = await Project.create({
            name: 'Test Date Project',
            company: company._id,
            manager: user._id,
            startDate: startDate,
            dueDate: dueDate
        });
        
        log(`Project created: ${project.startDate?.toISOString()} ${project.dueDate?.toISOString()}`);

        // 3. Create Module with dates
        const module = await Module.create({
            name: 'Test Date Module',
            project: project._id,
            startDate: startDate,
            dueDate: dueDate
        });
        
        log(`Module created: ${module.startDate?.toISOString()} ${module.dueDate?.toISOString()}`);

        // 4. Create Task with dates
        const task = await Task.create({
            name: 'Test Date Task',
            module: module._id,
            startDate: startDate,
            dueDate: dueDate
        });
        
        log(`Task created: ${task.startDate?.toISOString()} ${task.dueDate?.toISOString()}`);

        // cleanup
        await Task.findByIdAndDelete(task._id);
        await Module.findByIdAndDelete(module._id);
        await Project.findByIdAndDelete(project._id);
        log('Cleanup complete');

    } catch (error) {
        log(`Test Failed: ${error}`);
    } finally {
        mongoose.connection.close();
    }
};

testDates();
