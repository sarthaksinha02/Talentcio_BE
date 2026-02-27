const User = require('../models/User');
const Role = require('../models/Role');
const { HiringRequest } = require('../models/HiringRequest');
const Candidate = require('../models/Candidate');

// @desc    Get All Users
// @route   GET /api/users
// @access  Private (Admin)
const getUsers = async (req, res) => {
    try {
        const users = await User.find({})
            .select('-password -company')
            .populate({
                path: 'roles',
                populate: { path: 'permissions', select: 'key' }
            })
            .populate('reportingManagers', 'firstName lastName email')
            .populate('employeeProfile', 'hris');
        res.json(users);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Create User (Admin)
// @route   POST /api/users
// @access  Private (Admin)
const createUser = async (req, res) => {
    const { firstName, lastName, email, password, roleId, department, workLocation, employmentType, employeeCode, joiningDate, directReports, reportingManagers } = req.body;
    console.log('Create User Body:', req.body); // DEBUG LOG

    try {
        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Validate Role
        const role = await Role.findById(roleId);
        if (!role) {
            return res.status(400).json({ message: 'Invalid Role' });
        }

        const user = await User.create({
            firstName,
            lastName,
            email,
            password,
            roles: [roleId],
            department,
            workLocation,
            employmentType,
            employeeCode,
            joiningDate,
            reportingManagers: reportingManagers || []
        });

        // Handle Direct Reports
        if (directReports && Array.isArray(directReports) && directReports.length > 0) {
            await User.updateMany(
                { _id: { $in: directReports } },
                { $addToSet: { reportingManagers: user._id } }
            );
        }

        if (user) {
            res.status(201).json({
                _id: user._id,
                firstName: user.firstName,
                email: user.email,
                role: role.name
            });
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update User Role
// @route   PUT /api/users/:id/role
// @access  Private (Admin)
const updateUserRole = async (req, res) => {
    const { roleId } = req.body;
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.roles = [roleId];
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ message: 'User role updated' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// @desc    Update User Details
// @route   PUT /api/users/:id
// @access  Private (Admin)
const updateUser = async (req, res) => {
    const { firstName, lastName, email, password, roleId, department, workLocation, employmentType, employeeCode, joiningDate, directReports } = req.body;
    console.log('Update User Body:', req.body); // DEBUG LOG
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.firstName = firstName || user.firstName;
        user.lastName = lastName || user.lastName;
        user.email = email || user.email;
        if (password) user.password = password;
        user.department = department || user.department;
        user.workLocation = workLocation || user.workLocation;
        user.employmentType = employmentType || user.employmentType;
        user.employeeCode = employeeCode || user.employeeCode;
        if (joiningDate) user.joiningDate = joiningDate;

        if (roleId) {
            // Only update role if it's different and valid
            const currentRoleId = user.roles && user.roles.length > 0 ? user.roles[0].toString() : null;
            if (currentRoleId !== roleId) {
                const role = await Role.findById(roleId);
                if (role) {
                    user.roles = [roleId];
                    user.tokenVersion = (user.tokenVersion || 0) + 1;
                }
            }
        }

        await user.save();

        // Handle Direct Reports (Assign subordinates)
        if (directReports && Array.isArray(directReports)) {
            // 1. Remove this user from reportingManagers of users who are NO LONGER direct reports
            await User.updateMany(
                { reportingManagers: user._id, _id: { $nin: directReports } },
                { $pull: { reportingManagers: user._id } }
            );

            // 2. Add this user to reportingManagers of users who ARE direct reports
            await User.updateMany(
                { _id: { $in: directReports } },
                { $addToSet: { reportingManagers: user._id } }
            );
        }

        res.json({ message: 'User updated successfully', user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getMyTeam = async (req, res) => {
    try {
        const team = await User.find({ reportingManagers: req.user._id })
            .select('-password')
            .populate('roles', 'name')
            .populate('reportingManagers', 'firstName lastName email')
            .populate('employeeProfile', 'hris');
        res.json(team);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getMyself = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -company')
            .populate({
                path: 'roles',
                populate: { path: 'permissions' }
            })
            .populate('reportingManagers', 'firstName lastName email');

        // Flatten unique permission keys (same logic as loginUser)
        let permissions = [...new Set(
            user.roles.flatMap(role => (role.permissions || []).filter(p => p).map(p => p.key))
        )];

        let hasAllPermissions = false;
        const Permission = require('../models/Permission');
        if (permissions.includes('*')) {
            hasAllPermissions = true;
            const allPermissions = await Permission.find({});
            const allKeys = allPermissions.map(p => p.key);
            permissions = [...new Set([...permissions, ...allKeys])];
        } else {
            const totalPerms = await Permission.countDocuments({ key: { $ne: '*' } });
            if (totalPerms > 0 && permissions.length >= totalPerms) {
                hasAllPermissions = true;
            }
        }

        // Count subordinates — used by frontend for approval tab visibility
        const directReportsCount = await User.countDocuments({ reportingManagers: req.user._id });

        // Also fetch subordinate list (for Profile page)
        const subordinates = await User.find({ reportingManagers: req.user._id })
            .select('firstName lastName email role department');

        // Check TA Participation (Creator, HM, Recruiter only — NOT approvers, as those are role-based workflow assignments)
        const taCount = await HiringRequest.countDocuments({
            $or: [
                { createdBy: req.user._id },
                { 'ownership.hiringManager': req.user._id },
                { 'ownership.recruiter': req.user._id }
            ]
        });

        // Check if they are an interviewer via per-candidate round assignment (precise check)
        let isInterviewer = false;
        let interviewCount = 0;
        if (taCount === 0 && !permissions.includes('ta.view') && !permissions.includes('*')) {
            interviewCount = await Candidate.countDocuments({
                'interviewRounds.assignedTo': req.user._id
            });
            isInterviewer = interviewCount > 0;
        }

        res.json({
            ...user.toObject(),
            roles: user.roles,                    // Full objects so Profile.jsx can read r.name
            roleNames: user.roles.map(r => r.name), // Flat names array for AuthContext
            permissions,
            hasAllPermissions,
            directReports: subordinates,
            directReportsCount,                   // Added: needed by Leaves.jsx hasApprovalAccess
            isTAParticipant: taCount > 0 || isInterviewer
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password -company')
            .populate('roles', 'name')
            .populate('reportingManagers', 'firstName lastName email');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// TEMP DEBUG: Remove after fixing isTAParticipant issue
const debugTA = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate({ path: 'roles', populate: { path: 'permissions' } });
        const permissions = [...new Set(user.roles.flatMap(r => (r.permissions || []).filter(p => p).map(p => p.key)))];

        const taParticipantHRRs = await HiringRequest.find({
            $or: [
                { createdBy: req.user._id },
                { 'ownership.hiringManager': req.user._id },
                { 'ownership.recruiter': req.user._id }
            ]
        }).select('requestId createdBy ownership.hiringManager ownership.recruiter');

        const panelHRRs = await HiringRequest.find({
            'ownership.interviewPanel': req.user._id
        }).select('requestId');

        const assignedCandidates = await Candidate.find({
            'interviewRounds.assignedTo': req.user._id
        }).select('candidateName hiringRequestId');

        const approverHRRs = await HiringRequest.find({
            'approvalChain.approvers': req.user._id
        }).select('requestId');

        res.json({
            userId: req.user._id,
            email: user.email,
            roles: user.roles.map(r => r.name),
            permissions,
            taParticipantHRRs: taParticipantHRRs.map(h => h.requestId),
            panelHRRs: panelHRRs.map(h => h.requestId),
            assignedCandidates: assignedCandidates.map(c => c.candidateName),
            approverHRRs: approverHRRs.map(h => h.requestId),
            calculatedIsTAParticipant: taParticipantHRRs.length > 0 || panelHRRs.length > 0 || assignedCandidates.length > 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getUsers,
    createUser,
    updateUserRole,
    updateUser,
    getMyTeam,
    getMyself,
    getUserById,
    debugTA
};
