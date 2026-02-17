const User = require('../models/user.model');
const Investment = require('../models/investment.model');
const Transaction = require('../models/transaction.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

// Get complete dashboard data
exports.getDashboardData = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch user data
    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 'fail', // ✅ Changed from success: false
        message: 'User not found'
      });
    }

    // Fetch active investments
    const activeInvestments = await Investment.find({ 
      userId, 
      status: 'active' 
    }).sort({ createdAt: -1 });

    // Format active investments
    const formattedInvestments = activeInvestments.map(inv => ({
      id: inv._id,
      plan: inv.planName,
      amount: inv.amount,
      dailyReturn: inv.dailyReturn,
      totalDays: inv.totalDays,
      daysRemaining: inv.daysRemaining,
      progress: inv.progress,
      totalEarned: inv.totalEarned,
      nextPayout: inv.nextPayoutDate ? inv.nextPayoutDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }) : '12:00 PM',
      startDate: inv.startDate,
      endDate: inv.endDate
    }));

    // Fetch recent transactions (last 10)
    const recentTransactions = await Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('investmentId', 'planName');

    // Format transactions
    const formattedTransactions = recentTransactions.map(txn => ({
      id: txn._id,
      type: txn.type,
      amount: txn.amount,
      method: txn.method || 'N/A',
      status: txn.status,
      description: txn.description || '',
      date: txn.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      time: txn.createdAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      createdAt: txn.createdAt
    }));

    // Fetch unread notifications
    const notifications = await Notification.find({ 
      userId, 
      isRead: false 
    })
      .sort({ createdAt: -1 })
      .limit(10);

    // Format notifications
    const formattedNotifications = notifications.map(notif => ({
      id: notif._id,
      type: notif.type,
      title: notif.title || '',
      message: notif.message,
      time: notif.timeAgo || notif.createdAt,
      createdAt: notif.createdAt
    }));

    // Calculate daily earnings
    const dailyEarnings = activeInvestments.reduce((total, inv) => {
      return total + (inv.amount * inv.dailyReturn) / 100;
    }, 0);

    // Calculate total profit from completed and active investments
    const totalProfit = await Investment.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          status: { $in: ['active', 'completed'] }
        } 
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalEarned' }
        }
      }
    ]);

    const userData = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      country: user.country || '',
      address: user.address || '',
      totalBalance: user.totalBalance || 0,
      availableBalance: user.availableBalance || 0,
      dailyEarnings: parseFloat(dailyEarnings.toFixed(2)),
      totalProfit: totalProfit.length > 0 ? totalProfit[0].total : 0,
      referralCode: user.referralCode || '',
      referralEarnings: user.referralEarnings || 0,
      referredUsersCount: user.referredUsers ? user.referredUsers.length : 0,
      accountStatus: user.accountStatus || 'Active',
      verificationStatus: user.isVerified ? 'Verified' : 'Unverified',
      createdAt: user.createdAt
    };

    // ✅ Changed response format
    res.status(200).json({
      status: 'success', // ✅ Use 'status' instead of 'success'
      data: {
        user: userData,
        activeInvestments: formattedInvestments,
        recentTransactions: formattedTransactions,
        notifications: formattedNotifications,
        stats: {
          totalBalance: userData.totalBalance,
          availableBalance: userData.availableBalance,
          activeInvestmentsCount: activeInvestments.length,
          dailyEarnings: userData.dailyEarnings,
          totalProfit: userData.totalProfit
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error);
    res.status(500).json({
      status: 'error', // ✅ Changed from success: false
      message: 'Error fetching dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get user statistics
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get investment stats
    const investmentStats = await Investment.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalEarned: { $sum: '$totalEarned' }
        }
      }
    ]);

    // Get transaction stats (if method exists)
    let transactionStats = {};
    try {
      transactionStats = await Transaction.getUserStats(userId);
    } catch (error) {
      console.log('⚠️ Transaction.getUserStats not available');
    }

    // Format investment stats
    const invStats = {
      activeInvestments: 0,
      completedInvestments: 0,
      cancelledInvestments: 0,
      totalInvested: 0,
      totalEarnings: 0,
      activeAmount: 0
    };

    investmentStats.forEach(stat => {
      if (stat._id === 'active') {
        invStats.activeInvestments = stat.count;
        invStats.activeAmount = stat.totalAmount;
      } else if (stat._id === 'completed') {
        invStats.completedInvestments = stat.count;
      } else if (stat._id === 'cancelled') {
        invStats.cancelledInvestments = stat.count;
      }
      invStats.totalInvested += stat.totalAmount;
      invStats.totalEarnings += stat.totalEarned;
    });

    res.status(200).json({
      status: 'success', // ✅ Changed
      data: {
        investments: invStats,
        transactions: transactionStats
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user stats:', error);
    res.status(500).json({
      status: 'error', // ✅ Changed
      message: 'Error fetching user statistics'
    });
  }
};

// Get portfolio summary
exports.getPortfolioSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user
    const user = await User.findById(userId).select('-password');

    // Get all investments
    const investments = await Investment.find({ userId });

    // Calculate portfolio metrics
    const portfolioMetrics = {
      totalBalance: user.totalBalance || 0,
      availableBalance: user.availableBalance || 0,
      investedAmount: investments
        .filter(inv => inv.status === 'active')
        .reduce((sum, inv) => sum + inv.amount, 0),
      totalEarnings: investments
        .reduce((sum, inv) => sum + inv.totalEarned, 0),
      expectedReturns: investments
        .filter(inv => inv.status === 'active')
        .reduce((sum, inv) => sum + (inv.expectedTotalReturn - inv.totalEarned), 0),
      activeInvestments: investments.filter(inv => inv.status === 'active').length,
      totalInvestments: investments.length
    };

    // Calculate daily earnings
    portfolioMetrics.dailyEarnings = investments
      .filter(inv => inv.status === 'active')
      .reduce((total, inv) => total + (inv.amount * inv.dailyReturn) / 100, 0);

    // Calculate ROI
    if (portfolioMetrics.investedAmount > 0) {
      portfolioMetrics.roi = (
        (portfolioMetrics.totalEarnings / portfolioMetrics.investedAmount) * 100
      ).toFixed(2);
    } else {
      portfolioMetrics.roi = 0;
    }

    res.status(200).json({
      status: 'success', // ✅ Changed
      data: portfolioMetrics
    });

  } catch (error) {
    console.error('❌ Error fetching portfolio summary:', error);
    res.status(500).json({
      status: 'error', // ✅ Changed
      message: 'Error fetching portfolio summary'
    });
  }
};

module.exports = exports;