require('dotenv').config();
const mongoose = require('mongoose');
const syncPermissions = require('./src/services/permissionSync');

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('DB Connected');
        await syncPermissions();
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
