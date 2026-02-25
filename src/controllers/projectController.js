
const BusinessUnit = require('../models/BusinessUnit');
const Client = require('../models/Client');
const Project = require('../models/Project');
const Module = require('../models/Module');
const Task = require('../models/Task');

const User = require('../models/User');

// --- Employees (Helper for Dropdowns) ---
const getEmployees = async (req, res) => {
    try {
        const users = await User.find({})
            .select('firstName lastName email');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Business Units ---
const getBusinessUnits = async (req, res) => {
    try {
        const units = await BusinessUnit.find({})
            .populate('headOfUnit', 'firstName lastName');
        res.json(units);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createBusinessUnit = async (req, res) => {
    try {
        const unit = await BusinessUnit.create({ ...req.body });
        res.status(201).json(unit);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateBusinessUnit = async (req, res) => {
    try {
        const unit = await BusinessUnit.findOneAndUpdate(
            { _id: req.params.id },
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
        const clients = await Client.find({})
            .populate('businessUnit', 'name');
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createClient = async (req, res) => {
    try {
        const client = await Client.create({ ...req.body });
        res.status(201).json(client);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateClient = async (req, res) => {
    try {
        const client = await Client.findOneAndUpdate(
            { _id: req.params.id },
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
        let query = {};

        // Check if user is Admin
        // Check if user is Admin or has global read permission
        const canViewAll = req.user.roles.some(r => r.name === 'Admin') ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'project.read'));

        const canViewAssigned = req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_assigned'));
        const canViewTeam = req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_team'));

        if (canViewAll) {
            // Fetch all projects
        } else if (canViewAssigned || canViewTeam) {
            const orConditions = [];

            // 1. Assigned Projects (Manager, Member, or Task Assigned)
            const assignedModuleIds = await Task.distinct('module', { assignees: req.user._id });
            const taskProjectIds = await Module.distinct('project', { _id: { $in: assignedModuleIds } });

            orConditions.push({ manager: req.user._id });
            orConditions.push({ members: req.user._id });
            orConditions.push({ _id: { $in: taskProjectIds } });

            // 2. Team Projects
            if (canViewTeam) {
                const directReports = await User.find({ reportingManagers: req.user._id }).select('_id');
                const reportIds = directReports.map(u => u._id);

                if (reportIds.length > 0) {
                    orConditions.push({ manager: { $in: reportIds } });
                    orConditions.push({ members: { $in: reportIds } });

                    const teamAssignedModuleIds = await Task.distinct('module', { assignees: { $in: reportIds } });
                    const teamTaskProjectIds = await Module.distinct('project', { _id: { $in: teamAssignedModuleIds } });
                    orConditions.push({ _id: { $in: teamTaskProjectIds } });
                }
            }

            query.$or = orConditions;
        } else {
            // Neither Admin, nor Read All, nor View Assigned -> See Nothing
            // Setting a query that returns nothing
            query._id = null;
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
        const project = await Project.findById(id)
            .populate('client', 'name')
            .populate('manager', 'firstName lastName')
            .populate('members', '_id'); // Need IDs to check membership

        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Security Check
        const canViewAll = req.user.roles.some(r => r.name === 'Admin') ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'project.read'));

        const canViewAssigned = req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_assigned'));
        const canViewTeam = req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_team'));

        // Strict Check
        if (!canViewAll && !canViewAssigned && !canViewTeam) {
            return res.status(403).json({ message: 'Not authorized to view projects' });
        }

        const isManager = project.manager?._id.toString() === req.user._id.toString();
        const isMember = project.members.some(m => m._id.toString() === req.user._id.toString());

        // Determine Access
        let hasAccess = canViewAll || isManager || isMember;

        if (!hasAccess) {
            const projectModules = await Module.find({ project: id }).select('_id');
            const projectModuleIds = projectModules.map(m => m._id);

            // 1. Check Assigned Task
            if (canViewAssigned || canViewTeam) {
                const assignedTask = await Task.findOne({
                    module: { $in: projectModuleIds },
                    assignees: req.user._id
                });
                if (assignedTask) hasAccess = true;
            }

            // 2. Check Team Access
            if (!hasAccess && canViewTeam) {
                const directReports = await User.find({ reportingManagers: req.user._id }).select('_id');
                const reportIds = directReports.map(u => u._id.toString());

                if (reportIds.length > 0) {
                    // Check if report is manager or member
                    const reportIsManager = project.manager && reportIds.includes(project.manager._id.toString());
                    const reportIsMember = project.members.some(m => reportIds.includes(m._id.toString()));

                    if (reportIsManager || reportIsMember) {
                        hasAccess = true;
                    } else {
                        // Check if report has task
                        const teamTask = await Task.findOne({
                            module: { $in: projectModuleIds },
                            assignees: { $in: reportIds }
                        });
                        if (teamTask) hasAccess = true;
                    }
                }
            }
        }

        if (!hasAccess) {
            return res.status(403).json({ message: 'Not authorized to view this project' });
        }



        const modules = await Module.find({ project: id }).sort({ startDate: 1 });

        // Fetch all tasks for these modules
        const moduleIds = modules.map(m => m._id);

        // Filter: If not Admin/Manager/Member, restrict to assigned tasks
        let taskQuery = { module: { $in: moduleIds } };
        if (!canViewAll && !isManager && !isMember) {
            taskQuery.assignees = req.user._id;
        }

        const tasks = await Task.find(taskQuery)
            .populate('assignees', 'firstName lastName')
            .sort({ startDate: 1 });

        // Fetch Work Logs for these tasks
        // We need WorkLog model here
        const WorkLog = require('../models/WorkLog'); // Ensure this is imported or use mongoose.model
        const taskIds = tasks.map(t => t._id);

        let workLogs = [];
        const canViewWorkLogs = canViewAll ||
            req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_work_logs'));

        // Logic: 
        // 1. Admin/Global Read -> See all.
        // 2. Has project.view_work_logs -> See all.
        // 3. Manager/Member -> See all (Usually they need context).
        // 4. Assigned User (No other permission) -> DOES NOT SEE LOGS (as requested).

        // Wait, current logic for canViewAll handles Admin/project.read.
        // Let's refine based on "employee can see hierarchy NOT work log".
        // If I am just an assigned user (not manager/member), I shouldn't see logs of others or maybe even mine if that's the strict request.
        // But usually one sees their own. The user said "not the work log on that project" (singular/general).
        // I will hide ALL logs if not authorized.

        if (canViewWorkLogs || isManager || isMember) {
            workLogs = await WorkLog.find({ task: { $in: taskIds } })
                .populate('user', 'firstName lastName')
                .sort({ date: -1 });
        } else {
            // User can see the hierarchy (modules/tasks) but NOT the work logs.
            // We return empty logs.
            workLogs = [];
        }

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
        const project = await Project.create({ ...req.body });
        res.status(201).json(project);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateProject = async (req, res) => {
    try {
        const project = await Project.findOneAndUpdate(
            { _id: req.params.id },
            req.body,
            { new: true }
        );
        if (!project) return res.status(404).json({ message: 'Project not found' });
        res.json(project);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteProject = async (req, res) => {
    try {
        const project = await Project.findOneAndDelete({ _id: req.params.id });
        if (!project) return res.status(404).json({ message: 'Project not found' });

        // Cascade Delete
        const modules = await Module.find({ project: project._id });
        const moduleIds = modules.map(m => m._id);

        if (moduleIds.length > 0) {
            const tasks = await Task.find({ module: { $in: moduleIds } });
            const taskIds = tasks.map(t => t._id);

            const WorkLog = require('../models/WorkLog');
            if (taskIds.length > 0) {
                await WorkLog.deleteMany({ task: { $in: taskIds } });
            }
            await Task.deleteMany({ module: { $in: moduleIds } });
            await Module.deleteMany({ project: project._id });
        }

        res.json({ message: 'Project and associated data deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
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

        const canViewAssigned = req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_assigned'));
        const canViewTeam = req.user.roles.some(r => r.permissions.some(p => p.key === 'project.view_team'));

        // Strict Check: If not Admin/Read, MUST have view_assigned or view_team
        if (!canViewAll && !canViewAssigned && !canViewTeam) {
            return res.status(403).json({ message: 'Not authorized to view modules for this project' });
        }

        const isManager = project.manager?.toString() === req.user._id.toString();
        const isMember = project.members?.some(m => m.toString() === req.user._id.toString());

        let hasAccess = canViewAll || isManager || isMember;

        if (!hasAccess) {
            const modules = await Module.find({ project: projectId }).select('_id');
            const moduleIds = modules.map(m => m._id);

            // 1. Check Assigned Task
            if (canViewAssigned || canViewTeam) {
                const assignedTask = await Task.findOne({
                    module: { $in: moduleIds },
                    assignees: req.user._id
                });
                if (assignedTask) hasAccess = true;
            }

            // 2. Check Team Access
            if (!hasAccess && canViewTeam) {
                const directReports = await User.find({ reportingManagers: req.user._id }).select('_id');
                const reportIds = directReports.map(u => u._id.toString());
                if (reportIds.length > 0) {
                    const reportIsManager = project.manager && reportIds.includes(project.manager.toString());
                    const reportIsMember = project.members && project.members.some(m => reportIds.includes(m.toString()));
                    if (reportIsManager || reportIsMember) {
                        hasAccess = true;
                    } else {
                        const teamTask = await Task.findOne({
                            module: { $in: moduleIds },
                            assignees: { $in: reportIds }
                        });
                        if (teamTask) hasAccess = true;
                    }
                }
            }
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

const deleteModule = async (req, res) => {
    try {
        const module = await Module.findByIdAndDelete(req.params.id);
        if (!module) return res.status(404).json({ message: 'Module not found' });

        // Cascade Delete
        const tasks = await Task.find({ module: module._id });
        const taskIds = tasks.map(t => t._id);

        const WorkLog = require('../models/WorkLog');
        if (taskIds.length > 0) {
            await WorkLog.deleteMany({ task: { $in: taskIds } });
        }
        await Task.deleteMany({ module: module._id });

        res.json({ message: 'Module and tasks deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
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

const deleteTask = async (req, res) => {
    try {
        const task = await Task.findByIdAndDelete(req.params.id);
        if (!task) return res.status(404).json({ message: 'Task not found' });

        const WorkLog = require('../models/WorkLog');
        await WorkLog.deleteMany({ task: task._id });

        res.json({ message: 'Task deleted' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getBusinessUnits, createBusinessUnit, updateBusinessUnit,
    getClients, createClient, updateClient,
    getProjects, createProject, updateProject, deleteProject, getProjectHierarchy,
    getModules, createModule, updateModule, deleteModule,
    getTasks, createTask, updateTask, deleteTask,
    getEmployees
};
