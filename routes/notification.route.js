const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(protect);

// Get all notifications
router.get('/', notificationController.getNotifications);

// Get unread notification count
router.get('/unread/count', notificationController.getUnreadCount);

// Mark all notifications as read
router.patch('/mark-all-read', notificationController.markAllAsRead);

// Delete all read notifications
router.delete('/clear-read', notificationController.deleteAllRead);

// Mark specific notification as read
router.patch('/:id/read', notificationController.markAsRead);

// Delete specific notification
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;