const User = require('../models/User');
const Role = require('../models/Role');

// @desc    Get All Users
// @route   GET /api/users
// @access  Private (Admin)
const getUsers = async (req, res) => {
    try {
        const users = await User.find({ company: req.user.company })
            .select('-password')
            .select('-password')
            .populate('roles', 'name')
            .populate('reportingManagers', 'firstName lastName email');
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
    const { firstName, lastName, email, password, roleId, department, employmentType, employeeCode, joiningDate, directReports, reportingManagers } = req.body;
    console.log('Create User Body:', req.body); // DEBUG LOG

    try {
        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Validate Role
        const role = await Role.findById(roleId);
        if (!role || role.company.toString() !== req.user.company.toString()) {
            return res.status(400).json({ message: 'Invalid Role' });
        }

        const user = await User.create({
            firstName,
            lastName,
            email,
            password,
            company: req.user.company,
            roles: [roleId],
            department,
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

        if (!user || user.company.toString() !== req.user.company.toString()) {
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
    const { firstName, lastName, email, password, roleId, department, employmentType, employeeCode, joiningDate, directReports } = req.body;
    console.log('Update User Body:', req.body); // DEBUG LOG
    try {
        const user = await User.findById(req.params.id);

        if (!user || user.company.toString() !== req.user.company.toString()) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.firstName = firstName || user.firstName;
        user.lastName = lastName || user.lastName;
        user.email = email || user.email;
        if (password) user.password = password;
        user.department = department || user.department;
        user.employmentType = employmentType || user.employmentType;
        user.employeeCode = employeeCode || user.employeeCode;
        if (joiningDate) user.joiningDate = joiningDate;

        if (roleId) {
            // Only update role if it's different and valid
            const currentRoleId = user.roles && user.roles.length > 0 ? user.roles[0].toString() : null;
            if (currentRoleId !== roleId) {
                const role = await Role.findById(roleId);
                if (role && (role.company.toString() === req.user.company.toString() || role.isSystem)) {
                    user.roles = [roleId];
                    user.tokenVersion = (user.tokenVersion || 0) + 1;
                }
            }
        }

        await user.save();

        // Handle Direct Reports (Assign subordinates)
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
            .populate('reportingManagers', 'firstName lastName email');
        res.json(team);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getMyself = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .populate('roles', 'name')
            .populate('reportingManagers', 'firstName lastName email');

        // Also fetch subordinates
        const subordinates = await User.find({ reportingManagers: req.user._id })
            .select('firstName lastName email role department');

        res.json({ ...user.toObject(), directReports: subordinates });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const getUserById = async (req, res) => {
    try {
        const user = await User.findById(req.params.id)
            .select('-password')
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

module.exports = {
    getUsers,
    createUser,
    updateUserRole,
    updateUser,
    getMyTeam,
    getMyself,
    getUserById
};
