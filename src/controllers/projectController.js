const BusinessUnit = require('../models/BusinessUnit');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Module = require('../models/Module');
const Task = require('../models/Task');

const User = require('../models/User');

// --- Employees (Helper for Dropdowns) ---
const getEmployees = async (req, res) => {
    try {
        const users = await User.find({ company: req.user.company })
            .select('firstName lastName email');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Business Units ---
const getBusinessUnits = async (req, res) => {
    try {
        const units = await BusinessUnit.find({ company: req.user.company })
            .populate('headOfUnit', 'firstName lastName');
        res.json(units);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createBusinessUnit = async (req, res) => {
    try {
        const unit = await BusinessUnit.create({ ...req.body, company: req.user.company });
        res.status(201).json(unit);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateBusinessUnit = async (req, res) => {
    try {
        const unit = await BusinessUnit.findOneAndUpdate(
            { _id: req.params.id, company: req.user.company },
            req.body,
            { new: true }
        );
        if (!unit) return res.status(404).json({ message: 'Unit not found' });
        res.json(unit);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- Clients ---
const getClients = async (req, res) => {
    try {
        const clients = await Client.find({ company: req.user.company })
            .populate('businessUnit', 'name');
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createClient = async (req, res) => {
    try {
        const client = await Client.create({ ...req.body, company: req.user.company });
        res.status(201).json(client);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateClient = async (req, res) => {
    try {
        const client = await Client.findOneAndUpdate(
            { _id: req.params.id, company: req.user.company },
            req.body,
            { new: true }
        );
        if (!client) return res.status(404).json({ message: 'Client not found' });
        res.json(client);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- Projects (Enhanced) ---
const getProjects = async (req, res) => {
    try {
        // If user is basic employee, maybe we want to filter? 
        // For now, adhering to 'project.read' permission check in route.
        // If Admin, fetch all. If not, fetch only assigned projects (manager, member, or has assigned task)
        let query = { company: req.user.company };

        // Check if user is Admin
        // Check if user is Admin or has global read permission
        const canViewAll = req.user.roles.some(r => r.name === 'Admin') ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'project.read'));

        if (!canViewAll) {
            // 1. Find Tasks assigned to user to get relevant Module IDs
            // We need to find purely unique modules first to save lookup time
            const assignedModuleIds = await Task.distinct('module', { assignees: req.user._id });

            // 2. Find Projects associated with those modules
            const taskProjectIds = await Module.distinct('project', { _id: { $in: assignedModuleIds } });

            query.$or = [
                { manager: req.user._id },
                { members: req.user._id },
                { _id: { $in: taskProjectIds } }
            ];
        }

        const projects = await Project.find(query)
            .populate('client', 'name')
            .populate('manager', 'firstName lastName')
            .populate('members', 'firstName lastName'); // Populate members to show them if needed
        res.json(projects);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getProjectHierarchy = async (req, res) => {
    try {
        const { id } = req.params;
        const project = await Project.findOne({ _id: id, company: req.user.company })
            .populate('client', 'name')
            .populate('manager', 'firstName lastName')
            .populate('members', '_id'); // Need IDs to check membership

        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Security Check
        const canViewAll = req.user.roles.some(r => r.name === 'Admin') ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'project.read'));

        const isManager = project.manager?._id.toString() === req.user._id.toString();
        const isMember = project.members.some(m => m._id.toString() === req.user._id.toString());

        // Check for assigned tasks if not already authorized
        let hasAssignedTask = false;
        if (!canViewAll && !isManager && !isMember) {
            // Find tasks in this project assigned to user
            const projectModules = await Module.find({ project: id }).select('_id');
            const projectModuleIds = projectModules.map(m => m._id);
            const assignedTask = await Task.findOne({
                module: { $in: projectModuleIds },
                assignees: req.user._id
            });
            if (assignedTask) hasAssignedTask = true;
        }

        if (!canViewAll && !isManager && !isMember && !hasAssignedTask) {
            return res.status(403).json({ message: 'Not authorized to view this project' });
        }

        const modules = await Module.find({ project: id }).sort({ startDate: 1 });

        // Fetch all tasks for these modules
        const moduleIds = modules.map(m => m._id);
        const tasks = await Task.find({ module: { $in: moduleIds } })
            .populate('assignees', 'firstName lastName')
            .sort({ startDate: 1 });

        // Fetch Work Logs for these tasks
        // We need WorkLog model here, require it at top if not present, but for now I'll use mongoose.model
        // Better to add require at top, but I can use mongoose.model('WorkLog') if model is registered.
        // Let's assume WorkLog is registered in server.js (it was in server.js view)
        const WorkLog = require('../models/WorkLog'); // Ensure this is imported or use mongoose.model
        const taskIds = tasks.map(t => t._id);
        const workLogs = await WorkLog.find({ task: { $in: taskIds } })
            .populate('user', 'firstName lastName')
            .sort({ date: -1 });

        // Structure the response
        const hierarchy = {
            ...project.toObject(),
            modules: modules.map(module => ({
                ...module.toObject(),
                tasks: tasks
                    .filter(task => task.module.toString() === module._id.toString())
                    .map(task => {
                        const taskLogs = workLogs.filter(log => log.task.toString() === task._id.toString());
                        const totalLogged = taskLogs.reduce((sum, log) => sum + log.hours, 0);
                        return {
                            ...task.toObject(),
                            workLogs: taskLogs,
                            loggedHours: totalLogged
                        };
                    })
            }))
        };

        res.json(hierarchy);
    } catch (error) {
        console.error(error); // Add console log for debug
        res.status(500).json({ message: error.message });
    }
};

const createProject = async (req, res) => {
    try {
        const project = await Project.create({ ...req.body, company: req.user.company });
        res.status(201).json(project);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateProject = async (req, res) => {
    try {
        const project = await Project.findOneAndUpdate(
            { _id: req.params.id, company: req.user.company },
            req.body,
            { new: true }
        );
        if (!project) return res.status(404).json({ message: 'Project not found' });
        res.json(project);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- Modules ---
const getModules = async (req, res) => {
    try {
        const { projectId } = req.params;

        // Security Check: Implicit Access
        const project = await Project.findById(projectId);
        if (!project) return res.status(404).json({ message: 'Project not found' });

        const canViewAll = req.user.roles.some(r => r.name === 'Admin') ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'project.read'));

        const isManager = project.manager?.toString() === req.user._id.toString();
        const isMember = project.members?.some(m => m.toString() === req.user._id.toString());

        let hasAccess = canViewAll || isManager || isMember;

        if (!hasAccess) {
            // Check if user has ANY task in this project (via modules)
            // 1. Get all modules for this project
            const modules = await Module.find({ project: projectId }).select('_id');
            const moduleIds = modules.map(m => m._id);

            // 2. Check for assigned task in these modules
            const assignedTask = await Task.findOne({
                module: { $in: moduleIds },
                assignees: req.user._id
            });

            if (assignedTask) hasAccess = true;
        }

        if (!hasAccess) {
            return res.status(403).json({ message: 'Not authorized to view modules for this project' });
        }

        const modules = await Module.find({ project: projectId });
        res.json(modules);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createModule = async (req, res) => {
    try {
        const module = await Module.create(req.body);
        res.status(201).json(module);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateModule = async (req, res) => {
    try {
        const module = await Module.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!module) return res.status(404).json({ message: 'Module not found' });
        res.json(module);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- Tasks ---
const getTasks = async (req, res) => {
    try {
        // Can filter by module or assignee
        const query = {};
        if (req.query.moduleId) query.module = req.query.moduleId;
        if (req.query.assignees) query.assignees = req.query.assignees; // Check assignees array

        // Security: Check permissions
        const canViewAll = req.user.roles.some(r => r.name === 'Admin') ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'task.read'));

        if (!canViewAll) {
            // If not admin/global reader, restrict.
            // If querying by module, check project access
            if (req.query.moduleId) {
                const module = await Module.findById(req.query.moduleId).populate('project');
                if (module && module.project) {
                    const project = module.project;
                    const isManager = project.manager?.toString() === req.user._id.toString();
                    const isMember = project.members?.some(m => m.toString() === req.user._id.toString());

                    if (!isManager && !isMember) {
                        // Restrict to assigned tasks only
                        query.assignees = req.user._id;
                    }
                } else {
                    // Module not found or no project, restrict to assigned
                    query.assignees = req.user._id;
                }
            } else {
                // No module filter, restrict to assigned tasks
                query.assignees = req.user._id;
            }
        }

        const tasks = await Task.find(query)
            .populate('assignees', 'firstName lastName')
            .populate({
                path: 'module',
                select: 'name project',
                populate: {
                    path: 'project',
                    select: 'name'
                }
            });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createTask = async (req, res) => {
    try {
        const task = await Task.create(req.body);
        res.status(201).json(task);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateTask = async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!task) return res.status(404).json({ message: 'Task not found' });
        res.json(task);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getBusinessUnits, createBusinessUnit, updateBusinessUnit,
    getClients, createClient, updateClient,
    getProjects, createProject, updateProject, getProjectHierarchy,
    getModules, createModule, updateModule,
    getTasks, createTask, updateTask,
    getEmployees
};
