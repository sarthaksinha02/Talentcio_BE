require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('./src/models/Company');
const User = require('./src/models/User');
const Role = require('./src/models/Role');
const Permission = require('./src/models/Permission');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // 1. Create Company
        const companyName = 'TechCorp Demo';
        let company = await Company.findOne({ name: companyName });
        if (!company) {
            company = await Company.create({
                name: companyName,
                domain: 'techcorp.com',
                address: '123 Tech Street'
            });
            console.log('Company created');
        } else {
            console.log('Company already exists');
        }

        // 2. Get All Permissions
        const permissions = await Permission.find({});
        if (permissions.length === 0) {
            console.log('No permissions found. Run server once to sync permissions.');
            process.exit(1);
        }

        // 3. Create Admin Role
        let adminRole = await Role.findOne({ name: 'Admin', company: company._id });
        if (!adminRole) {
            adminRole = await Role.create({
                name: 'Admin',
                company: company._id,
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

        // 4. Create Admin User
        const email = 'admin@techcorp.com';
        const password = 'password123';

        let adminUser = await User.findOne({ email });
        if (!adminUser) {
            adminUser = await User.create({
                firstName: 'Admin',
                lastName: 'User',
                email: email,
                password: password,
                company: company._id,
                roles: [adminRole._id],
                isActive: true
            });
            console.log(`Admin User created: ${email} / ${password}`);
        } else {
            console.log('Admin User already exists');
            // Reset password if needed? No, let's just log it.
        }

        console.log('Seeding Complete');
        process.exit();
    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }
};

seedData();
