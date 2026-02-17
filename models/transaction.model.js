const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'earning', 'investment', 'referral_bonus', 'refund'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  method: {
    type: String,
    enum: ['Bitcoin (BTC)', 'Ethereum (ETH)', 'USDT (TRC20)', 'Bank Transfer', 'Internal', 'N/A'],
    default: 'N/A'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  walletAddress: {
    type: String,
    default: null
  },
  transactionHash: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: ''
  },
  investmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Investment',
    default: null
  },
  referralId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  failureReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1, type: 1 });
transactionSchema.index({ type: 1, createdAt: -1 });

// Virtual for formatted date
transactionSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
});

// Method to mark transaction as completed
transactionSchema.methods.markCompleted = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  return this.save();
};

// Method to mark transaction as failed
transactionSchema.methods.markFailed = function(reason) {
  this.status = 'failed';
  this.failureReason = reason;
  return this.save();
};

// Static method to get user transactions
transactionSchema.statics.getUserTransactions = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get pending transactions
transactionSchema.statics.getPendingTransactions = function(type = null) {
  const query = { status: 'pending' };
  if (type) {
    query.type = type;
  }
  return this.find(query).sort({ createdAt: 1 });
};

// Static method to calculate user stats
transactionSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const result = {
    totalDeposits: 0,
    totalWithdrawals: 0,
    totalEarnings: 0,
    depositCount: 0,
    withdrawalCount: 0,
    earningCount: 0
  };

  stats.forEach(stat => {
    if (stat._id === 'deposit') {
      result.totalDeposits = stat.total;
      result.depositCount = stat.count;
    } else if (stat._id === 'withdrawal') {
      result.totalWithdrawals = stat.total;
      result.withdrawalCount = stat.count;
    } else if (stat._id === 'earning' || stat._id === 'referral_bonus') {
      result.totalEarnings += stat.total;
      result.earningCount += stat.count;
    }
  });

  return result;
};

// const Transaction = mongoose.model('Transaction', transactionSchema);

// module.exports = Transaction;

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);