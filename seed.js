require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Role = require('./src/models/Role');
const Permission = require('./src/models/Permission');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // 1. Get All Permissions
        const permissions = await Permission.find({});
        if (permissions.length === 0) {
            console.log('No permissions found. Run server once to sync permissions.');
            process.exit(1);
        }

        // 2. Create Admin Role
        let adminRole = await Role.findOne({ name: 'Admin' });
        if (!adminRole) {
            adminRole = await Role.create({
                name: 'Admin',
                permissions: permissions.map(p => p._id),
                isSystem: true
            });
            console.log('Admin Role created');
        } else {
            // Update permissions just in case
            adminRole.permissions = permissions.map(p => p._id);
            await adminRole.save();
            console.log('Admin Role updated');
        }

        // 3. Create Admin User
        const email = 'admin@techcorp.com';
        const password = 'password123';

        let adminUser = await User.findOne({ email });
        if (!adminUser) {
            adminUser = await User.create({
                firstName: 'Admin',
                lastName: 'User',
                email: email,
                password: password,
                roles: [adminRole._id],
                isActive: true
            });
            console.log(`Admin User created: ${email} / ${password}`);
        } else {
            console.log('Admin User already exists');
        }

        console.log('Seeding Complete');
        process.exit();
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData();
