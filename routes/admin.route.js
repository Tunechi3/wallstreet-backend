const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { protect, adminProtect } = require('../middleware/auth');

// All admin routes require both protect + adminProtect
router.use(protect, adminProtect);

// ── Platform overview ────────────────────────────────────────────────────────
router.get('/stats', adminController.getPlatformStats);

// ── Users ────────────────────────────────────────────────────────────────────
router.get('/users',                   adminController.getAllUsers);
router.get('/users/:id',               adminController.getUser);
router.patch('/users/:id/status',      adminController.updateUserStatus);
router.patch('/users/:id/balance',     adminController.adjustUserBalance);

// ── Transactions ─────────────────────────────────────────────────────────────
router.get('/transactions',            adminController.getAllTransactions);

module.exports = router;