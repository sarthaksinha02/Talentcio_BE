const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./src/models/User');
const bcrypt = require('bcrypt');
const fs = require('fs');

const logFile = 'debug_log.txt';
fs.writeFileSync(logFile, 'Script started\n');

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

log('URI: ' + process.env.MONGO_URI);

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        log(`Error: ${error.message}`);
        process.exit(1);
    }
};

const checkUser = async () => {
    await connectDB();
    const email = 'admin@gmail.com';
    const password = 'Admin@123';

    try {
        const user = await User.findOne({ email });
        if (!user) {
            log(`User NOT found with email: ${email}`);
        } else {
            log(`User found: ${user.email}`);
            log(`Password hash: ${user.password}`);

            const isMatch = await bcrypt.compare(password, user.password);
            log(`Password match result: ${isMatch}`);
        }
    } catch (error) {
        log(error.message);
    } finally {
        mongoose.connection.close();
    }
};

checkUser();
