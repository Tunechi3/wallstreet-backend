const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const {sendEmail} = require('../utils/emailService');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Sign JWT Token
 */
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * Create and send JWT token response
 */
const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);
  
  // Cookie options
  const cookieOptions = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true, // Prevent XSS attacks
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https', // HTTPS only in production
    sameSite: 'strict' // CSRF protection
  };
  
  // Send cookie
  res.cookie('jwt', token, cookieOptions);
  
  // Remove password from output
  user.password = undefined;
  
  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountStatus: user.accountStatus,
        verificationStatus: user.verificationStatus,
        totalBalance: user.totalBalance,
        availableBalance: user.availableBalance,
        referralCode: user.referralCode
      }
    }
  });
};

// ==========================================
// REGISTER NEW USER
// ==========================================
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, referralCode } = req.body;
  
  // 1) Check if passwords match
  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }
  
  // 2) Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }
  
  // 3) Check if referral code is provided and valid
  let referrer = null;
  if (referralCode) {
    referrer = await User.findByReferralCode(referralCode);
    if (!referrer) {
      return next(new AppError('Invalid referral code', 400));
    }
  }
  
  // 4) Create new user
  const newUser = await User.create({
    name,
    email,
    password,
    referredBy: referrer ? referrer._id : null
  });
  
  // 5) Update referrer's referred users count
  if (referrer) {
    referrer.referredUsersCount += 1;
    await referrer.save({ validateBeforeSave: false });
    
    // Create referral record
    const Referral = require('../models/Referral.model');
    await Referral.create({
      referrer: referrer._id,
      referred: newUser._id,
      referralCode: referralCode
    });
  }
  
  // 6) Generate email verification token
  const verificationToken = newUser.createEmailVerificationToken();
  await newUser.save({ validateBeforeSave: false });
  
  // 7) Send verification email
  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    await sendEmail({
      email: newUser.email,
      subject: 'Email Verification - Wallstreet Investment',
      message: `Welcome ${newUser.name}! Please verify your email by clicking: ${verificationUrl}`
    });
  } catch (err) {
    console.error('Email sending failed:', err);
    // Don't fail registration if email fails
  }
  
  // 8) Send welcome notification
  const Notification = require('../models/notification.model.js');
  await Notification.create({
    user: newUser._id,
    type: 'success',
    title: 'Welcome to Wallstreet Investment!',
    message: 'Your account has been created successfully. Please verify your email to get started.'
  });
  
  // 9) Send token response
  createSendToken(newUser, 201, req, res);
});

// ==========================================
// LOGIN USER
// ==========================================
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // 1) Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  
  // 2) Check if user exists and password is correct
  const user = await User.findOne({ email }).select('+password +isActive');
  
  if (!user || !(await user.comparePassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }
  
  // 3) Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403));
  }
  
  // 4) Check if account is suspended
  if (user.accountStatus === 'suspended') {
    return next(new AppError('Your account has been suspended. Please contact support.', 403));
  }
  
  // 5) Update last login
  await user.updateLastLogin();
  
  // 6) Send token response
  createSendToken(user, 200, req, res);
});

// ==========================================
// LOGOUT USER
// ==========================================
exports.logout = catchAsync(async (req, res, next) => {
  // Clear the JWT cookie
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000), // Expire in 10 seconds
    httpOnly: true
  });
  
  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// ==========================================
// PROTECT MIDDLEWARE - Verify JWT Token
// ==========================================
exports.protect = catchAsync(async (req, res, next) => {
  let token;
  
  // 1) Get token from header or cookie
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }
  
  // 2) Check if token exists
  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }
  
  // 3) Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Your token has expired. Please log in again.', 401));
    }
    return next(err);
  }
  
  // 4) Check if user still exists
  const currentUser = await User.findById(decoded.id).select('+isActive');
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }
  
  // 5) Check if user is active
  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated.', 403));
  }
  
  // 6) Check if user changed password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password. Please log in again.', 401));
  }
  
  // 7) Grant access to protected route
  req.user = currentUser;
  next();
});

// ==========================================
// RESTRICT TO - Role-based Access Control
// ==========================================
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    // roles is an array ['admin', 'super_admin']
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }
    
    next();
  };
};

// ==========================================
// FORGOT PASSWORD
// ==========================================
exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on email
  const user = await User.findOne({ email: req.body.email });
  
  if (!user) {
    return next(new AppError('There is no user with that email address.', 404));
  }
  
  // 2) Generate random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });
  
  // 3) Send token to user's email
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    
    await sendEmail({
      email: user.email,
      subject: 'Password Reset Request (valid for 10 minutes)',
      message: `Forgot your password? Click here to reset: ${resetUrl}\n\nIf you didn't request this, please ignore this email.`
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Password reset link sent to email'
    });
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });
    
    return next(
      new AppError('There was an error sending the email. Try again later.', 500)
    );
  }
});

// ==========================================
// RESET PASSWORD
// ==========================================
exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+resetPasswordToken +resetPasswordExpires');
  
  // 2) If token is valid and not expired, set new password
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  // 3) Check if passwords match
  if (req.body.password !== req.body.passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }
  
  // 4) Update password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  
  // 5) Send notification
  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'success',
    title: 'Password Reset Successful',
    message: 'Your password has been changed successfully.'
  });
  
  // 6) Log user in, send JWT
  createSendToken(user, 200, req, res);
});

// ==========================================
// CHANGE PASSWORD (when logged in)
// ==========================================
exports.changePassword = catchAsync(async (req, res, next) => {
  // 1) Get user from collection
  const user = await User.findById(req.user.id).select('+password');
  
  // 2) Check if current password is correct
  if (!(await user.comparePassword(req.body.currentPassword, user.password))) {
    return next(new AppError('Your current password is incorrect', 401));
  }
  
  // 3) Check if new passwords match
  if (req.body.newPassword !== req.body.passwordConfirm) {
    return next(new AppError('New passwords do not match', 400));
  }
  
  // 4) Check if new password is different from old password
  if (await user.comparePassword(req.body.newPassword, user.password)) {
    return next(new AppError('New password must be different from current password', 400));
  }
  
  // 5) Update password
  user.password = req.body.newPassword;
  await user.save();
  
  // 6) Send notification
  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'success',
    title: 'Password Changed',
    message: 'Your password has been updated successfully.'
  });
  
  // 7) Log user in with new password, send JWT
  createSendToken(user, 200, req, res);
});

// ==========================================
// VERIFY EMAIL
// ==========================================
exports.verifyEmail = catchAsync(async (req, res, next) => {
  // 1) Get hashed token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');
  
  // 2) Find user with token
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  }).select('+emailVerificationToken +emailVerificationExpires');
  
  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  // 3) Update user verification status
  user.verificationStatus = 'verified';
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });
  
  // 4) Send notification
  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'success',
    title: 'Email Verified',
    message: 'Your email has been verified successfully!'
  });
  
  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully'
  });
});

// ==========================================
// RESEND VERIFICATION EMAIL
// ==========================================
exports.resendVerificationEmail = catchAsync(async (req, res, next) => {
  // 1) Get user
  const user = await User.findById(req.user.id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }
  
  // 2) Check if already verified
  if (user.verificationStatus === 'verified') {
    return next(new AppError('Email is already verified', 400));
  }
  
  // 3) Generate new token
  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });
  
  // 4) Send email
  try {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
    await sendEmail({
      email: user.email,
      subject: 'Email Verification - Wallstreet Investment',
      message: `Please verify your email by clicking: ${verificationUrl}`
    });
    
    res.status(200).json({
      status: 'success',
      message: 'Verification email sent'
    });
  } catch (err) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save({ validateBeforeSave: false });
    
    return next(
      new AppError('There was an error sending the email. Try again later.', 500)
    );
  }
});

// ==========================================
// CHECK AUTHENTICATION STATUS
// ==========================================
exports.checkAuth = catchAsync(async (req, res, next) => {
  // This assumes protect middleware has already run
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        accountStatus: req.user.accountStatus,
        verificationStatus: req.user.verificationStatus
      }
    }
  });
});

// ==========================================
// EXPORT CONTROLLER
// ==========================================
module.exports = exports;