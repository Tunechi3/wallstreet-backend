const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// ==========================================
// PUBLIC ROUTES (No authentication required)
// ==========================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 * @body    { name, email, password, passwordConfirm, referralCode? }
 */
router.post('/register', authController.register);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 * @body    { email, password }
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (clears JWT cookie)
 * @access  Public
 */
router.post('/logout', authController.logout);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 * @body    { email }
 */
router.post('/forgot-password', authController.forgotPassword);

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Reset password with token
 * @access  Public
 * @body    { password, passwordConfirm }
 */
router.post('/reset-password/:token', authController.resetPassword);

/**
 * @route   GET /api/auth/verify-email/:token
 * @desc    Verify email with token
 * @access  Public
 */
router.get('/verify-email/:token', authController.verifyEmail);

// ==========================================
// PROTECTED ROUTES (Authentication required)
// ==========================================

// All routes after this middleware require authentication
router.use(authController.protect);

/**
 * @route   GET /api/auth/me
 * @desc    Check authentication status and get current user
 * @access  Private
 */
router.get('/me', authController.checkAuth);

/**
 * @route   PATCH /api/auth/change-password
 * @desc    Change password (when logged in)
 * @access  Private
 * @body    { currentPassword, newPassword, passwordConfirm }
 */
router.patch('/change-password', authController.changePassword);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification link
 * @access  Private
 */
router.post('/resend-verification', authController.resendVerificationEmail);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;