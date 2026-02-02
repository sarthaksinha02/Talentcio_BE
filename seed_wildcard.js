const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Role = require('./src/models/Role');
const Permission = require('./src/models/Permission');

dotenv.config();

const seedWildcard = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Create or Find the Wildcard Permission
        let wildcardPerm = await Permission.findOne({ key: '*' });
        if (!wildcardPerm) {
            wildcardPerm = await Permission.create({
                key: '*',
                description: 'All Permissions (Wildcard)',
                module: 'SYSTEM'
            });
            console.log('Created Wildcard Permission: *');
        } else {
            console.log('Wildcard Permission already exists');
        }

        // 2. Find or Create "System Admin" Role and Assign Wildcard
        let systemAdmin = await Role.findOne({ name: 'System Admin' });

        // If not found, check if "Admin" exists and maybe rename or create new?
        // User asked for "System admin", let's be literal.
        if (!systemAdmin) {
            // Check for a generic Admin to maybe upgrade, otherwise create new
            const admin = await Role.findOne({ name: 'Admin' });
            if (admin) {
                console.log('Found "Admin" role. Upgrading to include * permission...');
                systemAdmin = admin; // Treat 'Admin' as the system admin target
            } else {
                console.log('Creating new "System Admin" role...');
                systemAdmin = new Role({
                    name: 'System Admin',
                    description: 'System Administrator with full access',
                    isSystem: true // Mark as system role
                });
            }
        }

        // Add wildcard permission if not present
        if (!systemAdmin.permissions.includes(wildcardPerm._id)) {
            systemAdmin.permissions.push(wildcardPerm._id);
            // Ensure isSystem is true for super power
            systemAdmin.isSystem = true;
            await systemAdmin.save();
            console.log(`Assigned * permission to role: ${systemAdmin.name}`);
        } else {
            console.log(`Role ${systemAdmin.name} already has * permission`);
        }

        process.exit(0);
    } catch (error) {
        console.error('Error seeding wildcard:', error);
        process.exit(1);
    }
};

seedWildcard();
