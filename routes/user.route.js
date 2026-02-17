const express = require('express');
const userController = require('../controllers/user.controller');
const authController = require('../controllers/auth.controller');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

// ==========================================
// PROTECTED ROUTES (Require Authentication)
// ==========================================

// All routes after this middleware require authentication
router.use(authController.protect);

// ==========================================
// USER PROFILE ROUTES
// ==========================================

// Get current user profile
router.get('/profile', userController.getProfile);

// Update current user profile
router.patch('/profile', userController.updateProfile);

// Upload profile image
router.post(
  '/profile/image',
  upload.single('profileImage'),
  userController.uploadProfileImage
);

// ==========================================
// USER STATISTICS & DASHBOARD
// ==========================================

// Get user statistics
router.get('/stats', userController.getUserStats);

// Get dashboard data (overview)
router.get('/dashboard', userController.getDashboardData);

// ==========================================
// ACCOUNT MANAGEMENT
// ==========================================

// Delete account (soft delete)
router.delete('/account', userController.deleteAccount);

// ==========================================
// ADMIN ONLY ROUTES
// ==========================================

// Restrict all routes below to admin only
router.use(authController.restrictTo('admin', 'super_admin'));

// Get all users with filtering, sorting, pagination
router.get('/', userController.getAllUsers);

// Get user by ID
router.get('/:id', userController.getUserById);

// Update user status (account status, verification status)
router.patch('/:id/status', userController.updateUserStatus);

// Delete user permanently (admin only)
router.delete('/:id', userController.deleteUser);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;