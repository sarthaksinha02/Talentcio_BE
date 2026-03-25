/**
 * PRODUCTION SEED SCRIPT
 * Run this script to initialize your production database with the first company and superadmin.
 * 
 * Usage:
 * 1. Set MONGO_URI in your .env to your production database
 * 2. Run: node seed_production.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Company = require('./src/models/Company');
const User = require('./src/models/User');
const Role = require('./src/models/Role');
const Permission = require('./src/models/Permission');

const seedProduction = async () => {
    try {
        console.log('Connecting to Production Database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Successfully Connected!');

        // 1. Create Initial Company (Tenant)
        const companyData = {
            name: 'Master Company',
            subdomain: 'admin', // You can change this to your desired subdomain
            email: 'admin@example.com',
            status: 'Active',
            timezone: 'Asia/Kolkata',
            settings: {
                attendance: { workingHours: 8, weeklyOff: ['Saturday', 'Sunday'] }
            }
        };

        let company = await Company.findOne({ subdomain: companyData.subdomain });
        if (!company) {
            company = await Company.create(companyData);
            console.log(`Created Company: ${company.name} (${company.subdomain})`);
        } else {
            console.log('Company already exists.');
        }

        // 2. Sync Permissions (All defined in the system)
        // Note: The server normally does this on start. Let's ensure they exist.
        const syncPermissions = require('./src/services/permissionSync');
        await syncPermissions();
        const permissions = await Permission.find({});
        console.log(`Synced ${permissions.length} Permissions.`);

        // 3. Create SuperAdmin Role
        let superAdminRole = await Role.findOne({ name: 'SuperAdmin', companyId: company._id });
        if (!superAdminRole) {
            superAdminRole = await Role.create({
                name: 'SuperAdmin',
                companyId: company._id,
                permissions: permissions.map(p => p._id),
                isSystem: true
            });
            console.log('Created SuperAdmin Role.');
        }

        // 4. Create Initial Admin User
        const adminEmail = 'admin@example.com'; // CHANGE THIS
        const adminPassword = 'ChangeThisPassword123!'; // CHANGE THIS

        let adminUser = await User.findOne({ email: adminEmail });
        if (!adminUser) {
            adminUser = await User.create({
                firstName: 'System',
                lastName: 'Administrator',
                email: adminEmail,
                password: adminPassword,
                roles: [superAdminRole._id],
                companyId: company._id, // Map to the created company
                isActive: true
            });
            console.log(`Created Admin User: ${adminEmail}`);
        } else {
            console.log('Admin User already exists.');
        }

        console.log('\n--- SEEDING COMPLETE ---');
        console.log(`Login at: http://${company.subdomain}.localhost:5173/login`);
        console.log(`Once deployed: http://${company.subdomain}.yourdomain.com/login`);
        
        process.exit(0);
    } catch (error) {
        console.error('Seeding Failed:', error);
        process.exit(1);
    }
};

seedProduction();
