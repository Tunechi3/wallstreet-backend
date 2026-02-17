const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // ==========================================
  // USER REFERENCE
  // ==========================================
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Notification must belong to a user']
  },
  
  // ==========================================
  // NOTIFICATION DETAILS
  // ==========================================
  type: {
    type: String,
    enum: {
      values: [
        'success',
        'info',
        'warning',
        'error',
        'account',
        'transaction',
        'investment',
        'referral',
        'security',
        'system',
        'promotion'
      ],
      message: 'Invalid notification type'
    },
    required: [true, 'Notification type is required']
  },
  
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  
  // ==========================================
  // STATUS & PRIORITY
  // ==========================================
  isRead: {
    type: Boolean,
    default: false
  },
  
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high', 'urgent'],
      message: 'Priority must be low, medium, high, or urgent'
    },
    default: 'medium'
  },
  
  // ==========================================
  // OPTIONAL METADATA
  // ==========================================
  actionUrl: {
    type: String,
    default: null,
    trim: true
  },
  
  actionText: {
    type: String,
    default: null,
    trim: true,
    maxlength: [50, 'Action text cannot exceed 50 characters']
  },
  
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // ==========================================
  // TIMESTAMPS
  // ==========================================
  readAt: {
    type: Date,
    default: null
  },
  
  expiresAt: {
    type: Date,
    default: null
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==========================================
// INDEXES FOR PERFORMANCE
// ==========================================
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ==========================================
// VIRTUALS
// ==========================================
notificationSchema.virtual('isExpired').get(function() {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
});

// ==========================================
// MIDDLEWARE
// ==========================================
notificationSchema.pre('save', function() {
  if (this.isModified('isRead') && this.isRead && !this.readAt) {
    this.readAt = Date.now();
  }
});

// ==========================================
// INSTANCE METHODS
// ==========================================

notificationSchema.methods.markAsRead = async function() {
  this.isRead = true;
  this.readAt = Date.now();
  await this.save();
  return this;
};

notificationSchema.methods.markAsUnread = async function() {
  this.isRead = false;
  this.readAt = null;
  await this.save();
  return this;
};

// ==========================================
// STATIC METHODS
// ==========================================

notificationSchema.statics.getUnreadCount = async function(userId) {
  return await this.countDocuments({ 
    user: userId, 
    isRead: false,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });
};

notificationSchema.statics.getRecentNotifications = async function(userId, limit = 10) {
  return await this.find({ 
    user: userId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  })
    .sort({ createdAt: -1 })
    .limit(limit);
};

notificationSchema.statics.markAllAsRead = async function(userId) {
  return await this.updateMany(
    { user: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

// ✅ FIX: createNotification now handles BOTH calling styles:
//
//   Style 1 — positional args (how all controllers call it):
//     Notification.createNotification(userId, 'info', 'Title', 'Message', { meta })
//
//   Style 2 — single object (original style):
//     Notification.createNotification({ user, type, title, message, metadata })
//
// The old signature `function(data)` only worked with Style 2, so Style 1 passed
// a userId string as `data`, causing:
// "First argument to Model constructor must be an object, not a string."
notificationSchema.statics.createNotification = async function(
  userIdOrData,
  type,
  title,
  message,
  metadata = {}
) {
  let notificationData;

  if (
    userIdOrData !== null &&
    typeof userIdOrData === 'object' &&
    !mongoose.Types.ObjectId.isValid(userIdOrData)
  ) {
    // Style 2: plain object passed — use directly
    notificationData = userIdOrData;
  } else {
    // Style 1: positional arguments
    notificationData = {
      user: userIdOrData,
      type,
      title,
      message,
      metadata: metadata || {}
    };
  }

  const notification = await this.create(notificationData);
  return notification;
};

// Bulk create notifications for multiple users
notificationSchema.statics.createBulkNotifications = async function(userIds, notificationData) {
  const notifications = userIds.map(userId => ({
    user: userId,
    ...notificationData
  }));
  return await this.insertMany(notifications);
};

// Delete old read notifications (cleanup)
notificationSchema.statics.cleanupOldNotifications = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  return await this.deleteMany({
    isRead: true,
    readAt: { $lt: cutoffDate }
  });
};

// ==========================================
// EXPORT MODEL
// ==========================================
module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);