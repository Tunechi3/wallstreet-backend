const Investment = require('../models/investment.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

// ✅ Helper: always round money to 2 decimal places
const round2 = (v) => Math.round((v || 0) * 100) / 100;

// ─── Investment Plans Configuration ─────────────────────────────────────────
// 3 Daily | 3 × 72-Hour | 2 Weekly | 1 Monthly  =  9 plans total
const INVESTMENT_PLANS = [
  // ── DAILY PLANS ────────────────────────────────────────────────────────────
  {
    id: 1,
    name: 'Daily Starter',
    category: 'daily',
    minAmount: 100,
    maxAmount: 999,
    dailyReturn: 3,
    duration: 1,           // 1 day
    totalReturn: 3,
    description: 'Quick 24-hour cycle. Perfect for testing the waters.'
  },
  {
    id: 2,
    name: 'Daily Growth',
    category: 'daily',
    minAmount: 1000,
    maxAmount: 4999,
    dailyReturn: 5,
    duration: 1,
    totalReturn: 5,
    description: 'Accelerated daily returns for mid-range capital.'
  },
  {
    id: 3,
    name: 'Daily Elite',
    category: 'daily',
    minAmount: 5000,
    maxAmount: 19999,
    dailyReturn: 7,
    duration: 1,
    totalReturn: 7,
    description: 'Premium daily returns for serious daily traders.'
  },

  // ── 72-HOUR PLANS ──────────────────────────────────────────────────────────
  {
    id: 4,
    name: '72H Bronze',
    category: '72hours',
    minAmount: 500,
    maxAmount: 2499,
    dailyReturn: 4,         // 4%/day × 3 days = 12%
    duration: 3,            // 3 days = 72 hours
    totalReturn: 12,
    description: 'Triple-day compounding. Entry-level power cycle.'
  },
  {
    id: 5,
    name: '72H Silver',
    category: '72hours',
    minAmount: 2500,
    maxAmount: 9999,
    dailyReturn: 6,         // 6% × 3 = 18%
    duration: 3,
    totalReturn: 18,
    description: 'Turbo-charged 3-day plan for high-frequency investors.'
  },
  {
    id: 6,
    name: '72H Gold',
    category: '72hours',
    minAmount: 10000,
    maxAmount: Infinity,
    dailyReturn: 8.33,      // ~25% over 3 days
    duration: 3,
    totalReturn: 25,
    description: 'Maximum 72-hour yield for top-tier investors.'
  },

  // ── WEEKLY PLANS ───────────────────────────────────────────────────────────
  {
    id: 7,
    name: 'Weekly Pro',
    category: 'weekly',
    minAmount: 1000,
    maxAmount: 24999,
    dailyReturn: 5.71,      // ~40% over 7 days
    duration: 7,
    totalReturn: 40,
    description: 'Steady 7-day returns with daily compounding.'
  },
  {
    id: 8,
    name: 'Weekly VIP',
    category: 'weekly',
    minAmount: 25000,
    maxAmount: Infinity,
    dailyReturn: 8.57,      // ~60% over 7 days
    duration: 7,
    totalReturn: 60,
    description: 'VIP exclusive weekly plan with premium returns.'
  },

  // ── MONTHLY PLAN ───────────────────────────────────────────────────────────
  {
    id: 9,
    name: 'Monthly Titan',
    category: 'monthly',
    minAmount: 5000,
    maxAmount: Infinity,
    dailyReturn: 10,        // 10%/day × 30 days = 300%
    duration: 30,
    totalReturn: 300,
    description: 'The ultimate 30-day wealth accelerator.'
  }
];

// Get all investment plans
exports.getInvestmentPlans = async (req, res) => {
  try {
    const plans = INVESTMENT_PLANS.map(plan => ({
      ...plan,
      maxAmount: plan.maxAmount === Infinity ? 'Unlimited' : plan.maxAmount
    }));

    res.status(200).json({
      success: true,
      data: plans
    });
  } catch (error) {
    console.error('Error fetching investment plans:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching investment plans'
    });
  }
};

// Create new investment
exports.createInvestment = async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user.id;

    if (!planId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID and amount are required'
      });
    }

    const plan = INVESTMENT_PLANS.find(p => p.id === parseInt(planId));
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Invalid investment plan'
      });
    }

    const investmentAmount = round2(parseFloat(amount));

    if (investmentAmount < plan.minAmount) {
      return res.status(400).json({
        success: false,
        message: `Minimum investment for ${plan.name} is $${plan.minAmount.toLocaleString()}`
      });
    }

    if (plan.maxAmount !== Infinity && investmentAmount > plan.maxAmount) {
      return res.status(400).json({
        success: false,
        message: `Maximum investment for ${plan.name} is $${plan.maxAmount.toLocaleString()}`
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.availableBalance < investmentAmount) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient balance. Please deposit funds first.'
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + plan.duration);

    const nextPayoutDate = new Date(startDate);
    nextPayoutDate.setDate(nextPayoutDate.getDate() + 1);

    const expectedTotalReturn = round2((investmentAmount * plan.totalReturn) / 100);

    const investment = new Investment({
      userId,
      planId: plan.id,
      planName: plan.name,
      amount: investmentAmount,
      dailyReturn: plan.dailyReturn,
      totalDays: plan.duration,
      daysRemaining: plan.duration,
      startDate,
      endDate,
      nextPayoutDate,
      expectedTotalReturn,
      status: 'active',
      progress: 0
    });

    await investment.save();

    // Deduct from availableBalance only — totalBalance stays until withdrawal
    user.availableBalance = round2(user.availableBalance - investmentAmount);
    await user.save();

    const transaction = new Transaction({
      userId,
      type: 'investment',
      amount: investmentAmount,
      method: 'Internal',
      status: 'completed',
      description: `Investment in ${plan.name}`,
      investmentId: investment._id,
      completedAt: new Date()
    });

    await transaction.save();

    await Notification.createNotification(
      userId,
      'success',
      'Investment Successful',
      `You have successfully invested $${investmentAmount.toLocaleString()} in ${plan.name}. Expected return: $${expectedTotalReturn.toLocaleString()} in ${plan.duration} day(s).`,
      { investmentId: investment._id }
    );

    res.status(201).json({
      success: true,
      message: 'Investment created successfully',
      data: investment
    });

  } catch (error) {
    console.error('Error creating investment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating investment'
    });
  }
};

// Get user's active investments
exports.getActiveInvestments = async (req, res) => {
  try {
    const userId = req.user.id;
    const investments = await Investment.getActiveInvestments(userId);

    const formattedInvestments = investments.map(inv => ({
      id: inv._id,
      plan: inv.planName,
      amount: inv.amount,
      dailyReturn: inv.dailyReturn,
      totalDays: inv.totalDays,
      daysRemaining: inv.daysRemaining,
      progress: inv.progress,
      totalEarned: inv.totalEarned,
      nextPayout: inv.nextPayoutDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      startDate: inv.startDate,
      endDate: inv.endDate
    }));

    res.status(200).json({
      success: true,
      data: formattedInvestments
    });

  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching investments'
    });
  }
};

// Get investment by ID
exports.getInvestmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const investment = await Investment.findOne({ _id: id, userId });

    if (!investment) {
      return res.status(404).json({ success: false, message: 'Investment not found' });
    }

    res.status(200).json({ success: true, data: investment });

  } catch (error) {
    console.error('Error fetching investment:', error);
    res.status(500).json({ success: false, message: 'Error fetching investment' });
  }
};

// Get all investments (with filters)
exports.getAllInvestments = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const query = { userId };
    if (status) query.status = status;

    const investments = await Investment.find(query).sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: investments });

  } catch (error) {
    console.error('Error fetching investments:', error);
    res.status(500).json({ success: false, message: 'Error fetching investments' });
  }
};

// Cancel investment (within first 24 hours only)
exports.cancelInvestment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const investment = await Investment.findOne({ _id: id, userId, status: 'active' });

    if (!investment) {
      return res.status(404).json({
        success: false,
        message: 'Investment not found or already completed'
      });
    }

    const hoursSinceStart = (Date.now() - investment.startDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceStart > 24) {
      return res.status(400).json({
        success: false,
        message: 'Investment can only be cancelled within 24 hours of creation'
      });
    }

    investment.status = 'cancelled';
    await investment.save();

    const user = await User.findById(userId);
    user.availableBalance = round2(user.availableBalance + investment.amount);
    await user.save();

    const transaction = new Transaction({
      userId,
      type: 'refund',
      amount: investment.amount,
      method: 'Internal',
      status: 'completed',
      description: `Refund for cancelled investment in ${investment.planName}`,
      investmentId: investment._id,
      completedAt: new Date()
    });

    await transaction.save();

    await Notification.createNotification(
      userId,
      'info',
      'Investment Cancelled',
      `Your investment of $${investment.amount.toLocaleString()} has been cancelled and refunded to your available balance.`,
      { investmentId: investment._id }
    );

    res.status(200).json({
      success: true,
      message: 'Investment cancelled successfully',
      data: investment
    });

  } catch (error) {
    console.error('Error cancelling investment:', error);
    res.status(500).json({ success: false, message: 'Error cancelling investment' });
  }
};

// Get investment statistics
exports.getInvestmentStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const stats = await Investment.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalEarned: { $sum: '$totalEarned' }
        }
      }
    ]);

    const result = {
      activeInvestments: 0,
      completedInvestments: 0,
      totalInvested: 0,
      totalEarnings: 0,
      activeAmount: 0
    };

    stats.forEach(stat => {
      if (stat._id === 'active') {
        result.activeInvestments = stat.count;
        result.activeAmount = stat.totalAmount;
      } else if (stat._id === 'completed') {
        result.completedInvestments = stat.count;
      }
      result.totalInvested += stat.totalAmount;
      result.totalEarnings += stat.totalEarned;
    });

    result.totalInvested = round2(result.totalInvested);
    result.totalEarnings = round2(result.totalEarnings);
    result.activeAmount  = round2(result.activeAmount);

    res.status(200).json({ success: true, data: result });

  } catch (error) {
    console.error('Error fetching investment stats:', error);
    res.status(500).json({ success: false, message: 'Error fetching investment statistics' });
  }
};

module.exports = exports;