const User = require('../models/User');
const { HiringRequest } = require('../models/HiringRequest');
const Candidate = require('../models/Candidate');
const jwt = require('jsonwebtoken');

// Generate JWT Helper
const generateToken = (id, tokenVersion) => {
    return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET, {
        expiresIn: '7d'
    });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
    const { email, password, firstName, lastName } = req.body;

    try {
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const user = await User.create({
            firstName,
            lastName,
            email,
            password
        });

        if (user) {
            res.status(201).json({
                _id: user._id,
                firstName: user.firstName,
                email: user.email,
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
            let permissions = [...new Set(
                user.roles.flatMap(role => (role.permissions || []).filter(p => p).map(p => p.key))
            )];

            // Wildcard Expansion: If user has '*', provide ALL permissions
            let hasAllPermissions = false;
            const Permission = require('../models/Permission');
            let totalPerms = 0, directReportsCount = 0, taCount = 0;

            if (permissions.includes('*')) {
                hasAllPermissions = true;
                const allPermissions = await Permission.find({});

                // Add all permission keys
                const allKeys = allPermissions.map(p => p.key);
                permissions = [...new Set([...permissions, ...allKeys])];

                // Run auth queries in parallel
                [directReportsCount, taCount] = await Promise.all([
                    User.countDocuments({ reportingManagers: user._id }),
                    HiringRequest.countDocuments({
                        $or: [
                            { createdBy: user._id },
                            { 'ownership.hiringManager': user._id },
                            { 'ownership.recruiter': user._id }
                        ]
                    })
                ]);
            } else {
                // Run auth queries in parallel
                [totalPerms, directReportsCount, taCount] = await Promise.all([
                    Permission.countDocuments({ key: { $ne: '*' } }),
                    User.countDocuments({ reportingManagers: user._id }),
                    HiringRequest.countDocuments({
                        $or: [
                            { createdBy: user._id },
                            { 'ownership.hiringManager': user._id },
                            { 'ownership.recruiter': user._id }
                        ]
                    })
                ]);

                if (totalPerms > 0 && permissions.length >= totalPerms) {
                    hasAllPermissions = true;
                }
            }

            // Check if they are an interviewer via per-candidate round assignment (precise check)
            let isInterviewer = false;
            if (taCount === 0 && !permissions.includes('ta.view') && !permissions.includes('*')) {
                const interviewCount = await Candidate.countDocuments({
                    'interviewRounds.assignedTo': user._id
                });
                isInterviewer = interviewCount > 0;
            }

            res.json({
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                joiningDate: user.joiningDate,
                reportingManagers: user.reportingManagers,
                roles: user.roles.map(r => r.name),
                permissions: permissions,
                hasAllPermissions: hasAllPermissions,
                directReportsCount: directReportsCount,
                isTAParticipant: taCount > 0 || isInterviewer,
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

// @desc    Upload Profile Picture
// @route   POST /api/auth/upload-profile-picture
// @access  Private
const uploadProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.profilePicture = req.file.path;
        await user.save();

        res.json({
            message: 'Profile picture uploaded successfully',
            profilePicture: user.profilePicture
        });
    } catch (error) {
        console.error('UPLOAD ERROR:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

module.exports = {
    register,
    loginUser,
    uploadProfilePicture
};
