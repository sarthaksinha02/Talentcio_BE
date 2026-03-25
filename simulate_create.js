const mongoose = require('mongoose');
require('dotenv').config();

const simulate = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const Company = require('./src/models/Company');
        const User = require('./src/models/User');
        const Role = require('./src/models/Role');
        const Permission = require('./src/models/Permission');

        const companyData = {
            name: 'testing_sim_1',
            subdomain: 'testsim123',
            email: 'testsim123@gmail.com'
        };

        const adminUser = {
            firstName: 'test',
            lastName: 'test',
            email: 'testsim123@gmail.com',
            password: 'password123'
        };

        // 1. Pre-flight Validation
        const existingSubdomain = await Company.findOne({ subdomain: companyData.subdomain.toLowerCase() });
        if (existingSubdomain) {
            console.log('Subdomain exists');
            return;
        }

        const existingUser = await User.findOne({ email: adminUser.email.toLowerCase() });
        if (existingUser) {
            console.log('User exists');
            return;
        }

        // 2. Creation Process
        const company = await Company.create(companyData);
        console.log('Company created:', company._id);
        let adminRole = null;
        let createdUser = null;

        try {
            const allPermissions = await Permission.find({});
            const permissionIds = allPermissions.map(p => p._id);

            adminRole = await Role.create({
                name: 'Admin',
                companyId: company._id,
                permissions: permissionIds,
                isSystem: true
            });
            console.log('Role created:', adminRole._id);

            createdUser = await User.create({
                firstName: adminUser.firstName,
                lastName: adminUser.lastName,
                email: adminUser.email,
                password: adminUser.password,
                companyId: company._id,
                roles: [adminRole._id],
                isActive: true,
                isPasswordResetRequired: false
            });
            console.log('User created:', createdUser._id);

        } catch (innerErr) {
            console.log('INNER ERROR:', innerErr);
            throw innerErr;
        }
        
    } catch (err) {
        console.log('OUTER ERROR:', err);
    } finally {
        process.exit(0);
    }
};

simulate();
