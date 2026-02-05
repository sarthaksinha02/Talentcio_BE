const Permission = require('../models/Permission');
const permissionConfig = require('../config/permissions');

const syncPermissions = async () => {
    try {
        console.log('Syncing permissions...');

        // 1. Get all config permissions keys
        const configKeys = permissionConfig.map(p => p.key);

        const allPermissionIds = [];

        // 2. Upsert (Insert or Update) permissions from config
        for (const perm of permissionConfig) {
            const savedPerm = await Permission.findOneAndUpdate(
                { key: perm.key },
                {
                    module: perm.module,
                    description: perm.description,
                    isDeprecated: false
                },
                { upsert: true, new: true }
            );
            allPermissionIds.push(savedPerm._id);
        }

        // 3. Mark permissions not in config as deprecated
        await Permission.updateMany(
            { key: { $nin: configKeys } },
            { $set: { isDeprecated: true } }
        );

        // 4. Auto-assign all permissions to Admin role
        const Role = require('../models/Role');
        const adminRole = await Role.findOne({ name: 'Admin' });

        if (adminRole) {
            // Using addToSet to ensure we don't have duplicates if merging, 
            // but for 'Admin' usually we want them to have EVERYTHING active.
            // If we just replace the array, we ensure they lose deprecated ones too (if that's desired).
            // Let's effectively "merge" by adding all new ones, 
            // OR we can just set it to `allPermissionIds` if Admin represents "System Administrator" who can do everything.
            // Assuming Admin == Super User, setting it to `allPermissionIds` ensures they have exactly the supported set.

            // However, to be safe and avoiding removing custom stuff if they manually added weird things (unlikely for Admin), 
            // let's use addToSet logic but optimally we just set it.
            // Given the request "whenever created... assign to admin", setting the list is cleaner.

            adminRole.permissions = allPermissionIds;
            await adminRole.save();
            console.log(`Updated Admin role with ${allPermissionIds.length} permissions.`);
        } else {
            console.warn('Admin role not found. Skipping auto-assignment.');
        }

        console.log('Permissions synced successfully.');
    } catch (error) {
        console.error('Error syncing permissions:', error);
    }
};

module.exports = syncPermissions;
