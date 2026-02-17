const User = require('../models/user.model')
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const cloudinary = require('../config/cloudinary.config')

exports.getProfile = catchAsync(async (req, res, next) => {
  
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        country: user.country,
        profileImage: user.profileImage,
        accountStatus: user.accountStatus,
        verificationStatus: user.verificationStatus,
        joinedDate: user.createdAt,
        totalBalance: user.totalBalance,
        availableBalance: user.availableBalance,
        totalProfit: user.totalProfit,
        dailyEarnings: user.dailyEarnings,
        referralCode: user.referralCode,
        referralEarnings: user.referralEarnings,
        referredUsersCount: user.referredUsersCount
      }
    }
  });
});

// ==========================================
// UPDATE USER PROFILE
// ==========================================
exports.updateProfile = catchAsync(async (req, res, next) => {
  // 1) Create error if user tries to update password here
  if (req.body.password || req.body.passwordConfirm) {
    return next(
      new AppError(
        'This route is not for password updates. Please use /change-password',
        400
      )
    );
  }
  
  // 2) Filter out unwanted field names that are not allowed to be updated
  const allowedFields = ['name', 'phone', 'address', 'country'];
  const filteredBody = {};
  
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredBody[key] = req.body[key];
    }
  });
  
  // 3) Update user document
  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    filteredBody,
    {
      new: true, // Return updated document
      runValidators: true // Run validators on update
    }
  );
  
  if (!updatedUser) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Profile updated successfully',
    data: {
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        address: updatedUser.address,
        country: updatedUser.country,
        profileImage: updatedUser.profileImage
      }
    }
  });
});

// ==========================================
// UPLOAD PROFILE IMAGE
// ==========================================
exports.uploadProfileImage = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please upload an image', 400));
  }
  
  // Upload image to cloudinary
  const result = await cloudinary.uploader.upload(req.file.path, {
    folder: 'profile-images',
    width: 500,
    height: 500,
    crop: 'fill',
    quality: 'auto'
  });
  
  // Update user with new image URL
  const user = await User.findByIdAndUpdate(
    req.user.id,
    { profileImage: result.secure_url },
    { new: true }
  );
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    status: 'success',
    message: 'Profile image updated successfully',
    data: {
      profileImage: user.profileImage
    }
  });
});

// ==========================================
// DELETE ACCOUNT (SOFT DELETE)
// ==========================================
exports.deleteAccount = catchAsync(async (req, res, next) => {
  // 1) Verify password before deletion
  const user = await User.findById(req.user.id).select('+password');
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  if (!req.body.password) {
    return next(new AppError('Please provide your password to confirm account deletion', 400));
  }
  
  const isPasswordCorrect = await user.comparePassword(req.body.password, user.password);
  
  if (!isPasswordCorrect) {
    return next(new AppError('Incorrect password', 401));
  }
  
  // 2) Check if user has active investments
  const Investment = require('../models/investment.model');
  const activeInvestments = await Investment.countDocuments({
    user: req.user.id,
    status: 'active'
  });
  
  if (activeInvestments > 0) {
    return next(
      new AppError(
        'Cannot delete account with active investments. Please wait for investments to complete or contact support.',
        400
      )
    );
  }
  
  // 3) Check if user has pending withdrawals
  const Withdrawal = require('../models/Withdrawal.model');
  const pendingWithdrawals = await Withdrawal.countDocuments({
    user: req.user.id,
    status: { $in: ['pending', 'processing'] }
  });
  
  if (pendingWithdrawals > 0) {
    return next(
      new AppError(
        'Cannot delete account with pending withdrawals. Please wait for withdrawals to complete.',
        400
      )
    );
  }
  
  // 4) Soft delete (set isActive to false)
  await User.findByIdAndUpdate(req.user.id, {
    isActive: false,
    accountStatus: 'closed'
  });
  
  res.status(200).json({
    status: 'success',
    message: 'Account deleted successfully'
  });
});

// ==========================================
// GET USER STATISTICS
// ==========================================
exports.getUserStats = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  
  // Get user with populated investments
  const user = await User.findById(userId);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Get investment statistics
  const Investment = require('../models/investment.model');
  const investments = await Investment.find({ user: userId });
  
  const activeInvestments = investments.filter(inv => inv.status === 'active');
  const completedInvestments = investments.filter(inv => inv.status === 'completed');
  
  // Get transaction statistics
  const Transaction = require('../models/transaction.model');
  const transactions = await Transaction.find({ user: userId });
  
  const totalDeposits = transactions
    .filter(t => t.type === 'deposit' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalWithdrawals = transactions
    .filter(t => t.type === 'withdrawal' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  const totalEarnings = transactions
    .filter(t => t.type === 'earning' && t.status === 'completed')
    .reduce((sum, t) => sum + t.amount, 0);
  
  // Calculate this week's earnings
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const weeklyEarnings = transactions
    .filter(t => 
      t.type === 'earning' && 
      t.status === 'completed' && 
      t.createdAt >= oneWeekAgo
    )
    .reduce((sum, t) => sum + t.amount, 0);
  
  // Get referral statistics
  const referredUsers = await User.countDocuments({ referredBy: userId });
  
  res.status(200).json({
    status: 'success',
    data: {
      overview: {
        totalBalance: user.totalBalance,
        availableBalance: user.availableBalance,
        investedAmount: user.totalBalance - user.availableBalance,
        totalProfit: user.totalProfit,
        dailyEarnings: user.dailyEarnings
      },
      investments: {
        active: activeInvestments.length,
        completed: completedInvestments.length,
        total: investments.length
      },
      transactions: {
        totalDeposits,
        totalWithdrawals,
        totalEarnings,
        weeklyEarnings
      },
      referrals: {
        totalReferred: referredUsers,
        referralEarnings: user.referralEarnings,
        referralCode: user.referralCode
      },
      account: {
        memberSince: user.createdAt,
        accountStatus: user.accountStatus,
        verificationStatus: user.verificationStatus,
        lastLogin: user.lastLogin
      }
    }
  });
});

// ==========================================
// GET DASHBOARD DATA
// ==========================================
exports.getDashboardData = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  
  // Fetch user data
  const user = await User.findById(userId);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Fetch active investments
  const Investment = require('../models/investment.model');
  const activeInvestments = await Investment.find({
    user: userId,
    status: 'active'
  })
    .populate('plan', 'name')
    .sort('-createdAt')
    .limit(5);
  
  // Fetch recent transactions
  const Transaction = require('../models/transaction.model');
  const recentTransactions = await Transaction.find({ user: userId })
    .sort('-createdAt')
    .limit(10);
  
  // Fetch unread notifications
  const Notification = require('../models/notification.model');
  const notifications = await Notification.find({
    user: userId,
    isRead: false
  })
    .sort('-createdAt')
    .limit(5);
  
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        name: user.name,
        email: user.email,
        totalBalance: user.totalBalance,
        availableBalance: user.availableBalance,
        totalProfit: user.totalProfit,
        dailyEarnings: user.dailyEarnings,
        referralEarnings: user.referralEarnings
      },
      activeInvestments: activeInvestments.map(inv => ({
        id: inv._id,
        plan: inv.plan.name,
        amount: inv.amount,
        dailyReturn: inv.dailyReturn,
        daysRemaining: inv.daysRemaining,
        progress: inv.progress,
        nextPayout: inv.nextPayoutTime
      })),
      recentTransactions: recentTransactions.map(trans => ({
        id: trans._id,
        type: trans.type,
        amount: trans.amount,
        status: trans.status,
        date: trans.createdAt,
        method: trans.method
      })),
      notifications: notifications.map(notif => ({
        id: notif._id,
        type: notif.type,
        message: notif.message,
        time: notif.createdAt
      }))
    }
  });
});

// ==========================================
// UPDATE USER BALANCE (Internal use - called by other controllers)
// ==========================================
exports.updateUserBalance = catchAsync(async (userId, amount, operation) => {
  const user = await User.findById(userId);
  
  if (!user) {
    throw new AppError('User not found', 404);
  }
  
  if (operation === 'add') {
    user.totalBalance += amount;
    user.availableBalance += amount;
  } else if (operation === 'subtract') {
    if (user.availableBalance < amount) {
      throw new AppError('Insufficient balance', 400);
    }
    user.totalBalance -= amount;
    user.availableBalance -= amount;
  } else if (operation === 'invest') {
    if (user.availableBalance < amount) {
      throw new AppError('Insufficient balance', 400);
    }
    user.availableBalance -= amount;
    // Total balance stays the same, just moved to investments
  } else if (operation === 'earning') {
    user.totalBalance += amount;
    user.availableBalance += amount;
    user.totalProfit += amount;
    user.dailyEarnings = amount; // Update latest daily earnings
  }
  
  await user.save({ validateBeforeSave: false });
  return user;
});

// ==========================================
// GET USER BY ID (Admin only)
// ==========================================
exports.getUserById = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  res.status(200).json({
    status: 'success',
    data: {
      user
    }
  });
});

// ==========================================
// GET ALL USERS (Admin only)
// ==========================================
exports.getAllUsers = catchAsync(async (req, res, next) => {
  // Build query
  const queryObj = { ...req.query };
  const excludedFields = ['page', 'sort', 'limit', 'fields'];
  excludedFields.forEach(el => delete queryObj[el]);
  
  // Advanced filtering
  let queryStr = JSON.stringify(queryObj);
  queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);
  
  let query = User.find(JSON.parse(queryStr));
  
  // Sorting
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }
  
  // Field limiting
  if (req.query.fields) {
    const fields = req.query.fields.split(',').join(' ');
    query = query.select(fields);
  }
  
  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 100;
  const skip = (page - 1) * limit;
  
  query = query.skip(skip).limit(limit);
  
  // Execute query
  const users = await query;
  const total = await User.countDocuments(JSON.parse(queryStr));
  
  res.status(200).json({
    status: 'success',
    results: users.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    data: {
      users
    }
  });
});

// ==========================================
// UPDATE USER STATUS (Admin only)
// ==========================================
exports.updateUserStatus = catchAsync(async (req, res, next) => {
  const { accountStatus, verificationStatus } = req.body;
  
  const updateData = {};
  if (accountStatus) updateData.accountStatus = accountStatus;
  if (verificationStatus) updateData.verificationStatus = verificationStatus;
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  );
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // Send notification to user about status change
  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'info',
    title: 'Account Status Updated',
    message: `Your account status has been updated to: ${accountStatus || user.accountStatus}`
  });
  
  res.status(200).json({
    status: 'success',
    message: 'User status updated successfully',
    data: {
      user
    }
  });
});

// ==========================================
// DELETE USER (Admin only - permanent delete)
// ==========================================
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findByIdAndDelete(req.params.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // TODO: Delete all related data (investments, transactions, etc.)
  // This should be done in a transaction or with cascade deletes
  
  res.status(204).json({
    status: 'success',
    data: null
  });
});

// ==========================================
// EXPORT CONTROLLER
// ==========================================
module.exports = exports;