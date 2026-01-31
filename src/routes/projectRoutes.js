const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/authorize');
const {
    getBusinessUnits, createBusinessUnit, updateBusinessUnit,
    getClients, createClient, updateClient,
    getProjects, createProject, updateProject, getProjectHierarchy,
    getModules, createModule, updateModule,
    getTasks, createTask, updateTask,
    getEmployees
} = require('../controllers/projectController');

router.use(protect);

// Helpers
router.get('/employees', getEmployees);

// Business Units
router.get('/business-units', authorize('business_unit.read'), getBusinessUnits);
router.post('/business-units', authorize('business_unit.create'), createBusinessUnit);
router.put('/business-units/:id', authorize('business_unit.update'), updateBusinessUnit);

// Clients
router.get('/clients', getClients);
router.post('/clients', authorize('client.create'), createClient);
router.put('/clients/:id', authorize('client.update'), updateClient);

// Projects
router.get('/:id/hierarchy', getProjectHierarchy);
router.get('/', getProjects);
router.post('/', authorize('project.create'), createProject);
router.put('/:id', authorize('project.update'), updateProject);

// Modules
router.get('/:projectId/modules', getModules);
router.post('/modules', authorize('project.create'), createModule);
router.put('/modules/:id', authorize('project.update'), updateModule);

// Tasks
router.get('/tasks', getTasks); // /api/projects/tasks?moduleId=...
router.post('/tasks', authorize('task.create'), createTask);
router.put('/tasks/:id', authorize('task.update'), updateTask);

// Work Logs
// Work Logs
const { logWork, getWorkLogs, updateWorkLog, deleteWorkLog } = require('../controllers/workLogController');
router.post('/tasks/:taskId/log', logWork);
router.get('/worklogs', getWorkLogs);
router.put('/worklogs/:id', updateWorkLog);
router.delete('/worklogs/:id', deleteWorkLog);

module.exports = router;
