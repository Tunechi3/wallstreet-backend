const Investment = require('../models/investment.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

// ✅ Helper: always round money to 2 decimal places
const round2 = (v) => Math.round((v || 0) * 100) / 100;

// ─── Investment Plans Configuration ─────────────────────────────────────────
const INVESTMENT_PLANS = [
  // ── DAILY PLAN ─────────────────────────────────────────────────────────────
  {
    id: 1,
    name: 'Daily Starter',
    category: 'daily',
    minAmount: 1000,
    maxAmount: 3000,
    dailyReturn: 11,
    duration: 1,           // 1 day
    totalReturn: 11,
    description: 'Quick 24-hour cycle. Earn 11% on your investment in just one day.'
  },

  // ── 3-DAY PLAN ─────────────────────────────────────────────────────────────
  {
    id: 2,
    name: '3-Day Plan',
    category: '3days',
    minAmount: 100,
    maxAmount: 999,
    dailyReturn: 11.67,    // ~35% over 3 days
    duration: 3,
    totalReturn: 35,
    description: 'Solid 3-day returns. Perfect for entry-level investors.'
  },

  // ── WEEKLY PLANS ───────────────────────────────────────────────────────────
  {
    id: 3,
    name: 'Weekly Starter',
    category: 'weekly',
    minAmount: 1000,
    maxAmount: 4999,
    dailyReturn: 7.86,     // ~55% over 7 days
    duration: 7,
    totalReturn: 55,
    description: 'Steady 7-day plan for mid-range investors. 55% total return.'
  },
  {
    id: 4,
    name: 'Weekly Growth',
    category: 'weekly',
    minAmount: 5000,
    maxAmount: 19999,
    dailyReturn: 10.71,    // ~75% over 7 days
    duration: 7,
    totalReturn: 75,
    description: 'High-yield weekly plan for serious investors. 75% total return.'
  },
  {
    id: 5,
    name: 'Weekly Elite',
    category: 'weekly',
    minAmount: 20000,
    maxAmount: 99999,
    dailyReturn: 25,       // 175% over 7 days
    duration: 7,
    totalReturn: 175,
    description: 'Elite weekly plan with maximum returns for top-tier investors.'
  },

  // ── 3-WEEK PLAN ────────────────────────────────────────────────────────────
  {
    id: 6,
    name: '3-Week Titan',
    category: '3weeks',
    minAmount: 100000,
    maxAmount: Infinity,
    dailyReturn: 17.86,    // ~375% over 21 days
    duration: 21,
    totalReturn: 375,
    description: 'The ultimate 3-week wealth accelerator for elite investors. 375% total return.'
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