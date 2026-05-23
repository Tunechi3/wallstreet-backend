const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  planId: {
    type: Number,
    required: true
  },
  planName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  dailyReturn: {
    type: Number,
    required: true,
    min: 0
  },
  totalDays: {
    type: Number,
    required: true,
    min: 1
  },
  daysRemaining: {
    type: Number,
    required: true,
    min: 0
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  lastPayoutDate: {
    type: Date,
    default: Date.now
  },
  nextPayoutDate: {
    type: Date,
    required: true
  },
  totalEarned: {
    type: Number,
    default: 0,
    min: 0
  },
  expectedTotalReturn: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  is_seeded: {
  type: Boolean,
  default: false
},
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  }
}, {
  timestamps: true
});

// Index for efficient queries
investmentSchema.index({ userId: 1, status: 1 });
investmentSchema.index({ status: 1, nextPayoutDate: 1 });

// Virtual for days completed
investmentSchema.virtual('daysCompleted').get(function() {
  return this.totalDays - this.daysRemaining;
});

// Method to calculate daily earnings
investmentSchema.methods.calculateDailyEarnings = function() {
  return (this.amount * this.dailyReturn) / 100;
};

// Method to update investment progress
investmentSchema.methods.updateProgress = function() {
  const daysCompleted = this.totalDays - this.daysRemaining;
  this.progress = Math.round((daysCompleted / this.totalDays) * 100);
  
  if (this.progress >= 100) {
    this.status = 'completed';
  }
  
  return this.progress;
};

// Static method to get active investments for a user
investmentSchema.statics.getActiveInvestments = function(userId) {
  return this.find({ userId, status: 'active' }).sort({ createdAt: -1 });
};

// Static method to get investments due for payout
investmentSchema.statics.getDuePayouts = function() {
  const now = new Date();
  return this.find({
    status: 'active',
    nextPayoutDate: { $lte: now }
  });
};

// const Investment = mongoose.model('Investment', investmentSchema);

// module.exports = Investment;

module.exports = mongoose.models.Investment || mongoose.model('Investment', investmentSchema);