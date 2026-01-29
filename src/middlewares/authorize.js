const authorize = (permissionKey) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'User not authenticated' });
        }

        // Super Admin Bypass (optional, but good for boostrapping)
        // Check if user has a role with isSystem: true (Super Admin)
        const isSuperAdmin = req.user.roles.some(role => role.isSystem);
        if (isSuperAdmin) {
            return next();
        }

        // Check user permissions
        // req.user.roles is populated with permissions
        const userPermissions = req.user.roles.flatMap(role => 
            role.permissions.map(p => p.key)
        );

        if (userPermissions.includes(permissionKey)) {
            return next();
        } else {
            return res.status(403).json({ 
                message: `Forbidden: You do not have permission '${permissionKey}'` 
            });
        }
    };
};

module.exports = { authorize };
