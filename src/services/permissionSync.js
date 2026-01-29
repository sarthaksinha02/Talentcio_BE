const Permission = require('../models/Permission');
const permissionConfig = require('../config/permissions');

const syncPermissions = async () => {
    try {
        console.log('Syncing permissions...');
        
        // 1. Get all config permissions keys
        const configKeys = permissionConfig.map(p => p.key);
        
        // 2. Upsert (Insert or Update) permissions from config
        for (const perm of permissionConfig) {
            await Permission.findOneAndUpdate(
                { key: perm.key },
                { 
                    module: perm.module,
                    description: perm.description,
                    isDeprecated: false 
                },
                { upsert: true, new: true }
            );
        }

        // 3. Mark permissions not in config as deprecated
        await Permission.updateMany(
            { key: { $nin: configKeys } },
            { $set: { isDeprecated: true } }
        );

        console.log('Permissions synced successfully.');
    } catch (error) {
        console.error('Error syncing permissions:', error);
    }
};

module.exports = syncPermissions;
