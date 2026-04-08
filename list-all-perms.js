require('dotenv').config();
const mongoose = require('mongoose');
const Permission = require('./src/models/Permission');

const listAll = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const perms = await Permission.find({ module: { $in: ['TIMESHEET', 'ATTENDANCE'] } });
        console.log('Total found:', perms.length);
        perms.forEach(p => console.log(`- ${p.key} (${p.module}): ${p.description}`));
        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

listAll();
