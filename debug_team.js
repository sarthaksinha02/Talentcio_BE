const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

// Hardcoded for debug purposes to avoid path issues
const MONGO_URI = 'mongodb://localhost:27017/hrcode';

const debugTeam = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to DB');

        const users = await User.find({}).select('firstName email reportingManager');
        console.log('--- ALL USERS ---');
        users.forEach(u => {
            console.log(`${u.email} (${u.firstName}) [ID: ${u._id}] - Manager: ${u.reportingManager}`);
        });

        console.log('--- MANAGER CHECK ---');
        // Find a user who is likely a manager
        const managers = await User.find({ reportingManager: { $exists: false } }); // Top level?

        for (const mgr of users) {
            const reports = await User.find({ reportingManager: mgr._id });
            if (reports.length > 0) {
                console.log(`Manager: ${mgr.email} has ${reports.length} reports: ${reports.map(r => r.email).join(', ')}`);
            }
        }

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
};

debugTeam();
