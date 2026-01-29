const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const User = require('./src/models/User');
const fs = require('fs');

const logFile = 'reset_log.txt';
fs.writeFileSync(logFile, 'Reset Script started\n');

const log = (msg) => {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
};

const resetPassword = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        log(`MongoDB Connected: ${conn.connection.host}`);
        
        const email = 'admin@gmail.com';
        const newPassword = 'Admin@123';
        
        const user = await User.findOne({ email });
        if (!user) {
            log('User not found');
            process.exit(1);
        }
        
        // This will trigger the pre check which hashes the password
        user.password = newPassword;
        await user.save();
        
        log(`Password for ${email} has been reset to ${newPassword}`);
        
    } catch (error) {
        log(error.message);
        process.exit(1);
    } finally {
        mongoose.connection.close();
    }
};

resetPassword();
