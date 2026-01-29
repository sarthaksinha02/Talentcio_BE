const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { authorize } = require('../middlewares/authorize');
const { 
    getUsers, 
    createUser, 
    updateUserRole,
    updateUser,
    getMyTeam
} = require('../controllers/userController');
const { 
    getRoles, 
    createRole, 
    updateRole,
    getPermissions 
} = require('../controllers/roleController');

router.use(protect);

// User Routes
router.get('/users/team', getMyTeam); // All authenticated users can see their own team
router.get('/users', authorize('user.read'), getUsers);
router.post('/users', authorize('user.create'), createUser);
router.put('/users/:id', authorize('user.update'), updateUser);
router.put('/users/:id/role', authorize('user.update'), updateUserRole);

// Role Routes
router.get('/roles', authorize('role.read'), getRoles);
router.post('/roles', authorize('role.create'), createRole);
router.put('/roles/:id', authorize('role.update'), updateRole); // Assuming role.update permission exists or re-using role.create
router.get('/permissions', getPermissions); // Assuming basic auth is enough to view permissions structure

module.exports = router;
