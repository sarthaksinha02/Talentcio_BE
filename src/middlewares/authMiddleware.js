const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        try {
            // Get token from header
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Get user from the token
            req.user = await User.findById(decoded.id)
                .select('-password -company')
                .populate({
                    path: 'roles',
                    populate: {
                        path: 'permissions'
                    }
                }).populate('reportingManagers', 'firstName lastName');
            
            if (req.user && req.user.roles) {
                req.user.permissions = [...new Set(
                    req.user.roles.flatMap(role => 
                        (role.permissions || []).map(p => typeof p === 'object' ? p.key : p)
                    )
                )];
            }

            // Ensure roles is always an array
            if (req.user && !req.user.roles) {
                req.user.roles = [];
            }

            // --- Multi-tenant isolation check ---
            // If a tenant workspace is identified (subdomain), the user MUST belong to it.
            if (req.companyId && req.user.companyId && req.user.companyId.toString() !== req.companyId.toString()) {
                console.warn(`[SECURITY ALERT] User ${req.user.email} attempted cross-tenant access from workspace ${req.company?.name || req.companyId} while belonging to ${req.user.companyId}`);
                return res.status(403).json({ 
                    message: `Your account does not belong to the '${req.company?.name || 'requested'}' workspace.`,
                    code: 'TENANT_MISMATCH'
                });
            }

            // Sync req.company if it was resolved by tenantMiddleware
            // (already handled in tenantMiddleware, but good to keep reference here)
            if (req.companyId && !req.user.companyId) {
                 // Guest or newly registered user? Still scoped to this companyId
            }

            if (!req.user) {
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }

            // Check Token Version
            // Treat missing version as 0 for backward compatibility during migration
            const tokenVersion = decoded.tokenVersion || 0;
            const userVersion = req.user.tokenVersion || 0;

            if (tokenVersion !== userVersion) {
                return res.status(401).json({ message: 'Not authorized, session expired (Role/Permission changed)' });
            }

            next();
        } catch (error) {
            console.error(`JWT Error: ${error.message}`);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    const isAdminRole = req.user && req.user.roles && req.user.roles.some(role => 
        role.name === 'Admin' || role === 'Admin' || (typeof role === 'object' && role.name === 'Admin')
    );
    
    const hasAdminPermission = req.user && req.user.permissions && (
        req.user.permissions.includes('*') || 
        req.user.permissions.includes('all') ||
        req.user.permissions.includes('admin')
    );

    if (isAdminRole || hasAdminPermission) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as an admin (Role or Permission missing)' });
    }
};

module.exports = { protect, admin };
