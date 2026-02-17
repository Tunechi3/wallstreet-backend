const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

// Get complete dashboard data
router.get('/', dashboardController.getDashboardData);

// Get user statistics
router.get('/stats', dashboardController.getUserStats);

// Get portfolio summary
router.get('/portfolio', dashboardController.getPortfolioSummary);

module.exports = router;