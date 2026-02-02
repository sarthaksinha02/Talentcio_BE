const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Permission = require('./src/models/Permission');

dotenv.config();

const checkPermissions = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const permissions = await Permission.find({});
        console.log('Total Permissions:', permissions.length);

        console.log('--- Checking for Wildcards ---');
        permissions.forEach(p => {
            if (p.key.includes('*')) {
                console.log(`Found Wildcard: ID=${p._id}, Key="${p.key}", Length=${p.key.length}`);
            }
        });

        console.log('--- Keys ending/starting with space ---');
        permissions.forEach(p => {
            if (p.key.trim() !== p.key) {
                console.log(`Found value with space: "${p.key}"`);
            }
        });

        process.exit(0);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
};

checkPermissions();
