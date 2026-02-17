


const express = require('express');
const router = express.Router();
const investmentController = require('../controllers/investment.controller');
const { protect } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

// Get all investment plans
router.get('/plans', investmentController.getInvestmentPlans);

// Create new investment
router.post('/', investmentController.createInvestment);

// Get user's active investments
router.get('/active', investmentController.getActiveInvestments);

// Get all user's investments (with filters)
router.get('/', investmentController.getAllInvestments);

// Get investment statistics
router.get('/stats', investmentController.getInvestmentStats);

// Get specific investment by ID
router.get('/:id', investmentController.getInvestmentById);

// Cancel investment
router.patch('/:id/cancel', investmentController.cancelInvestment);

module.exports = router;