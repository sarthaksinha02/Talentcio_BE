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
                .select('-password')
                .populate({
                    path: 'roles',
                    populate: {
                        path: 'permissions'
                    }
                }).populate('reportingManagers', 'firstName lastName');

            // Ensure roles is always an array
            if (req.user && !req.user.roles) {
                req.user.roles = [];
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
            console.error(error);
            res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const admin = (req, res, next) => {
    if (req.user && req.user.roles && req.user.roles.some(role => role.name === 'Admin' || role === 'Admin' || (typeof role === 'object' && role.name === 'Admin'))) {
        next();
    } else {
        res.status(403).json({ message: 'Not authorized as an admin' });
    }
};

module.exports = { protect, admin };
