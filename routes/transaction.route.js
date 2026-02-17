const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transaction.controller');
const { protect, adminProtect } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

// Get all user transactions
router.get('/', transactionController.getUserTransactions);

// Get transaction statistics
router.get('/stats', transactionController.getTransactionStats);

// Create deposit request
router.post('/deposit', transactionController.createDeposit);

// Create withdrawal request
router.post('/withdraw', transactionController.createWithdrawal);

// Get specific transaction by ID
router.get('/:id', transactionController.getTransactionById);

// Cancel pending transaction
router.patch('/:id/cancel', transactionController.cancelTransaction);

// Admin routes (protected with admin middleware)
// Approve deposit
router.patch('/:id/approve-deposit', adminProtect, transactionController.approveDeposit);

// Process withdrawal (complete or fail)
router.patch('/:id/process-withdrawal', adminProtect, transactionController.processWithdrawal);

module.exports = router;