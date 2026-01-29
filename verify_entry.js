require('dotenv').config();
const mongoose = require('mongoose');
const Timesheet = require('./src/models/Timesheet');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Find the most recent timesheet
        const timesheet = await Timesheet.findOne().sort({ updatedAt: -1 });
        
        if (!timesheet) {
            console.log("No timesheet found");
        } else {
            console.log(`Timesheet ID: ${timesheet._id}, User: ${timesheet.user}, Status: ${timesheet.status}`);
            console.log("Entries:");
            timesheet.entries.forEach(e => {
                console.log(`- Date: ${e.date}, Hours: ${e.hours}, Project: ${e.project}`);
                console.log(`  Start: ${e.startTime}, End: ${e.endTime}, Status: ${e.status}`);
            });
        }

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

run();
