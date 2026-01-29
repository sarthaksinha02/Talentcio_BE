const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Attendance = require('./src/models/Attendance');

dotenv.config();

const migrate = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected');

        // Find attendance with no approvalStatus
        const result = await Attendance.updateMany(
            { approvalStatus: { $exists: false } },
            { $set: { approvalStatus: 'PENDING' } }
        );

        console.log(`Updated ${result.modifiedCount} attendance records to PENDING.`);
        process.exit();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

migrate();
