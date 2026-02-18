const express = require('express');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// ==========================================
// PUBLIC ROUTES (No authentication required)
// ==========================================

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);

// ==========================================
// PROTECTED ROUTES (Authentication required)
// ==========================================

router.use(authController.protect);

router.get('/me', authController.checkAuth);
router.patch('/change-password', authController.changePassword);
router.post('/resend-verification', authController.resendVerificationEmail);

// ==========================================
// 2FA ROUTES
// ==========================================

// Step 1: Generate secret + QR code
router.post('/2fa/setup', authController.setup2FA);

// Step 2: Confirm the scanned code and activate 2FA
router.post('/2fa/verify', authController.verify2FA);

// Disable 2FA
router.post('/2fa/disable', authController.disable2FA);

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;