const User = require('../models/user.model');
const Transaction = require('../models/transaction.model');
const Investment = require('../models/investment.model');
const Notification = require('../models/notification.model');
const mongoose = require('mongoose');

// ==========================================
// GET ALL USERS
// ==========================================
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } })
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: users
    });
  } catch (error) {
    console.error('Admin getAllUsers error:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching users' });
  }
};

// ==========================================
// GET SINGLE USER
// ==========================================
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ status: 'fail', message: 'User not found' });

    res.status(200).json({ status: 'success', data: user });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Error fetching user' });
  }
};

// ==========================================
// GET ALL TRANSACTIONS (admin view)
// Populates userId so frontend gets name/email
// ==========================================
exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(500);

    res.status(200).json({
      status: 'success',
      data: transactions
    });
  } catch (error) {
    console.error('Admin getAllTransactions error:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching transactions' });
  }
};

// ==========================================
// GET PLATFORM STATS
// ==========================================
exports.getPlatformStats = async (req, res) => {
  try {
    const totalUsers       = await User.countDocuments({ role: 'user' });
    const totalBalance     = await User.aggregate([{ $group: { _id: null, total: { $sum: '$totalBalance' } } }]);
    const completedDeposits = await Transaction.aggregate([
      { $match: { type: 'deposit', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const completedWithdrawals = await Transaction.aggregate([
      { $match: { type: 'withdrawal', status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const pendingDeposits    = await Transaction.countDocuments({ type: 'deposit',    status: 'pending' });
    const pendingWithdrawals = await Transaction.countDocuments({ type: 'withdrawal', status: 'pending' });

    res.status(200).json({
      status: 'success',
      data: {
        totalUsers,
        totalBalance:     totalBalance[0]?.total          || 0,
        totalDeposited:   completedDeposits[0]?.total     || 0,
        totalWithdrawn:   completedWithdrawals[0]?.total  || 0,
        pendingDeposits,
        pendingWithdrawals
      }
    });
  } catch (error) {
    console.error('Admin getPlatformStats error:', error);
    res.status(500).json({ status: 'error', message: 'Error fetching stats' });
  }
};

// ==========================================
// UPDATE USER STATUS (suspend / activate)
// ==========================================
exports.updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body; // 'active' | 'suspended'
    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ status: 'fail', message: 'Invalid status value' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { accountStatus: status },
      { new: true, select: '-password' }
    );

    if (!user) return res.status(404).json({ status: 'fail', message: 'User not found' });

    // Notify user
    await Notification.create({
      user: user._id,
      type: status === 'suspended' ? 'warning' : 'success',
      title: status === 'suspended' ? 'Account Suspended' : 'Account Activated',
      message: status === 'suspended'
        ? 'Your account has been suspended. Please contact support.'
        : 'Your account has been reactivated successfully.'
    });

    res.status(200).json({ status: 'success', data: user });
  } catch (error) {
    console.error('Admin updateUserStatus error:', error);
    res.status(500).json({ status: 'error', message: 'Error updating user status' });
  }
};

// ==========================================
// MANUALLY ADJUST USER BALANCE (admin credit)
// ==========================================
exports.adjustUserBalance = async (req, res) => {
  try {
    const { amount, type, note } = req.body;
    // type: 'credit' | 'debit'

    if (!amount || amount <= 0) {
      return res.status(400).json({ status: 'fail', message: 'Invalid amount' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: 'fail', message: 'User not found' });

    const round2 = (v) => Math.round((v || 0) * 100) / 100;

    if (type === 'credit') {
      user.availableBalance = round2(user.availableBalance + amount);
      user.totalBalance     = round2(user.totalBalance     + amount);
    } else {
      if (user.availableBalance < amount) {
        return res.status(400).json({ status: 'fail', message: 'Insufficient user balance' });
      }
      user.availableBalance = round2(user.availableBalance - amount);
      user.totalBalance     = round2(user.totalBalance     - amount);
    }

    await user.save();

    // Log as transaction
    await Transaction.create({
      userId: user._id,
      type:   type === 'credit' ? 'deposit' : 'withdrawal',
      amount,
      method: 'Admin Adjustment',
      status: 'completed',
      description: note || `Admin ${type} adjustment`
    });

    await Notification.create({
      user: user._id,
      type: type === 'credit' ? 'success' : 'warning',
      title: type === 'credit' ? 'Balance Credited' : 'Balance Deducted',
      message: type === 'credit'
        ? `$${amount} has been credited to your account${note ? ': ' + note : '.'}`
        : `$${amount} has been deducted from your account${note ? ': ' + note : '.'}`
    });

    res.status(200).json({ status: 'success', message: 'Balance adjusted', data: { availableBalance: user.availableBalance, totalBalance: user.totalBalance } });
  } catch (error) {
    console.error('Admin adjustUserBalance error:', error);
    res.status(500).json({ status: 'error', message: 'Error adjusting balance' });
  }
};

module.exports = exports;