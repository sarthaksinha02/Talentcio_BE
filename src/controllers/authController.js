const User = require('../models/User');
const Company = require('../models/Company');
const jwt = require('jsonwebtoken');

// Generate JWT Helper
const generateToken = (id, tokenVersion) => {
    return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET, {
        expiresIn: '7d'
    });
};

// @desc    Register a new company and admin user
// @route   POST /api/auth/register-company
// @access  Public
const registerCompany = async (req, res) => {
    const { companyName, email, password, firstName, lastName } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 1. Create Company
        const company = await Company.create({
            name: companyName
        });

        // 2. Create User (Super Admin for this company)
        // Note: In real app, we should assign a Super Admin Role here.
        // For now, we will create the user and let the seed/bootstrap handle role assignment
        // or hardcode 'isSystem' check if we added that to User (we added it to Role).
        // Let's assume we simply create the user for now.

        const user = await User.create({
            firstName,
            lastName,
            email,
            password,
            company: company._id
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                firstName: user.firstName,
                email: user.email,
                company: company.name,
                company: company.name,
                token: generateToken(user._id, user.tokenVersion)
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email }).populate({
            path: 'roles',
            populate: {
                path: 'permissions'
            }
        }).populate('reportingManagers', 'firstName lastName');

        if (user && (await user.matchPassword(password))) {
            // Flatten unique permissions
            let permissions = [...new Set(
                user.roles.flatMap(role => role.permissions.map(p => p.key))
            )];

            // Wildcard Expansion: If user has '*', provide ALL permissions
            if (permissions.includes('*')) {
                const Permission = require('../models/Permission');
                const allPermissions = await Permission.find({});

                // Add all permission keys
                const allKeys = allPermissions.map(p => p.key);
                permissions = [...new Set([...permissions, ...allKeys])];
            }

            // Check if user has subordinates
            const directReportsCount = await User.countDocuments({ reportingManagers: user._id });

            res.json({
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                joiningDate: user.joiningDate,
                company: user.company,
                reportingManagers: user.reportingManagers,
                roles: user.roles.map(r => r.name),
                permissions: permissions,
                directReportsCount: directReportsCount,
                directReportsCount: directReportsCount,
                token: generateToken(user._id, user.tokenVersion)
            });
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        console.error('LOGIN ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = {
    registerCompany,
    loginUser
};
