const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const { sendEmail } = require('../utils/emailService');

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

const createSendToken = (user, statusCode, req, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() + (process.env.JWT_COOKIE_EXPIRES_IN || 7) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    sameSite: 'strict'
  };

  res.cookie('jwt', token, cookieOptions);

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
        referralCode: user.referralCode,
        twoFactorEnabled: user.twoFactorEnabled
      }
    }
  });
};

// ==========================================
// REGISTER NEW USER
// ==========================================
exports.register = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm, referralCode } = req.body;

  if (password !== passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError('Email already registered', 400));
  }

  let referrer = null;
  if (referralCode) {
    referrer = await User.findByReferralCode(referralCode);
    if (!referrer) {
      return next(new AppError('Invalid referral code', 400));
    }
  }

  const newUser = await User.create({
    name,
    email,
    password,
    referredBy: referrer ? referrer._id : null
  });

  if (referrer) {
    referrer.referredUsersCount += 1;
    await referrer.save({ validateBeforeSave: false });

    const Referral = require('../models/Referral.model');
    await Referral.create({
      referrer: referrer._id,
      referred: newUser._id,
      referralCode: referralCode
    });
  }

  const verificationToken = newUser.createEmailVerificationToken();
  await newUser.save({ validateBeforeSave: false });

  // FIX: fire-and-forget — don't await email, it was blocking registration
  // for 30-60s while Render's network timed out on the SMTP connection
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email/${verificationToken}`;
  sendEmail({
    email: newUser.email,
    subject: 'Email Verification - Wallstreet Investment',
    message: `Welcome ${newUser.name}! Please verify your email by clicking: ${verificationUrl}`
  }).catch(err => console.warn('⚠️ Welcome email failed:', err.message));

  const Notification = require('../models/notification.model.js');
  await Notification.create({
    user: newUser._id,
    type: 'success',
    title: 'Welcome to Wallstreet Investment!',
    message: 'Your account has been created successfully. Please verify your email to get started.'
  });

  createSendToken(newUser, 201, req, res);
});

// ==========================================
// LOGIN USER
// ==========================================
exports.login = catchAsync(async (req, res, next) => {
  const { email, password, totpCode } = req.body;

  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  const user = await User.findOne({ email }).select('+password +isActive +twoFactorSecret');

  if (!user || !(await user.comparePassword(password, user.password))) {
    return next(new AppError('Incorrect email or password', 401));
  }

  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Please contact support.', 403));
  }

  if (user.accountStatus === 'suspended') {
    return next(new AppError('Your account has been suspended. Please contact support.', 403));
  }

  // ── 2FA check ────────────────────────────────────────────────────────────
  if (user.twoFactorEnabled) {
    if (!totpCode) {
      // Tell the frontend 2FA is required without issuing a token yet
      return res.status(200).json({
        status: 'requires_2fa',
        message: 'Please provide your 2FA code to continue.'
      });
    }

    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: totpCode,
      window: 1 // allow 30s clock drift
    });

    if (!isValid) {
      return next(new AppError('Invalid 2FA code. Please try again.', 401));
    }
  }

  await user.updateLastLogin();
  createSendToken(user, 200, req, res);
});

// ==========================================
// LOGOUT USER
// ==========================================
exports.logout = catchAsync(async (req, res, next) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// ==========================================
// PROTECT MIDDLEWARE
// ==========================================
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to get access.', 401));
  }

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

  const currentUser = await User.findById(decoded.id).select('+isActive');
  if (!currentUser) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  if (!currentUser.isActive) {
    return next(new AppError('Your account has been deactivated.', 403));
  }

  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('User recently changed password. Please log in again.', 401));
  }

  req.user = currentUser;
  next();
});

// ==========================================
// RESTRICT TO
// ==========================================
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
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
  const user = await User.findOne({ email: req.body.email });

  if (!user) {
    return next(new AppError('There is no user with that email address.', 404));
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

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
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+resetPasswordToken +resetPasswordExpires');

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  if (req.body.password !== req.body.passwordConfirm) {
    return next(new AppError('Passwords do not match', 400));
  }

  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();

  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'success',
    title: 'Password Reset Successful',
    message: 'Your password has been changed successfully.'
  });

  createSendToken(user, 200, req, res);
});

// ==========================================
// CHANGE PASSWORD (when logged in)
// ==========================================
exports.changePassword = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+password');

  if (!(await user.comparePassword(req.body.currentPassword, user.password))) {
    return next(new AppError('Your current password is incorrect', 401));
  }

  if (req.body.newPassword !== req.body.passwordConfirm) {
    return next(new AppError('New passwords do not match', 400));
  }

  if (await user.comparePassword(req.body.newPassword, user.password)) {
    return next(new AppError('New password must be different from current password', 400));
  }

  user.password = req.body.newPassword;
  await user.save();

  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'success',
    title: 'Password Changed',
    message: 'Your password has been updated successfully.'
  });

  createSendToken(user, 200, req, res);
});

// ==========================================
// VERIFY EMAIL
// ==========================================
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() }
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  user.verificationStatus = 'verified';
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

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
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  if (user.verificationStatus === 'verified') {
    return next(new AppError('Email is already verified', 400));
  }

  const verificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

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
// CHECK AUTH
// ==========================================
exports.checkAuth = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        accountStatus: req.user.accountStatus,
        verificationStatus: req.user.verificationStatus,
        twoFactorEnabled: req.user.twoFactorEnabled
      }
    }
  });
});

// ==========================================
// 2FA - SETUP (Step 1: generate secret + QR)
// ==========================================
exports.setup2FA = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('+twoFactorSecret');

  if (user.twoFactorEnabled) {
    return next(new AppError('2FA is already enabled on this account.', 400));
  }

  // Generate a new TOTP secret
  const secret = speakeasy.generateSecret({
    name: `Wallstreet Investment (${user.email})`,
    length: 20
  });

  // Temporarily store the secret (not yet confirmed/activated)
  user.twoFactorSecret = secret.base32;
  await user.save({ validateBeforeSave: false });

  // Generate QR code as a data URL the frontend can display directly
  const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

  res.status(200).json({
    status: 'success',
    data: {
      qrCode: qrCodeDataURL,       // base64 PNG — show in <img src="...">
      secret: secret.base32,       // manual entry fallback
      message: 'Scan the QR code with Google Authenticator or Authy, then call /2fa/verify with the 6-digit code.'
    }
  });
});

// ==========================================
// 2FA - VERIFY (Step 2: confirm code + activate)
// ==========================================
exports.verify2FA = catchAsync(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new AppError('Please provide the 6-digit code from your authenticator app.', 400));
  }

  const user = await User.findById(req.user.id).select('+twoFactorSecret');

  if (!user.twoFactorSecret) {
    return next(new AppError('Please complete 2FA setup first by calling /2fa/setup.', 400));
  }

  if (user.twoFactorEnabled) {
    return next(new AppError('2FA is already enabled on this account.', 400));
  }

  const isValid = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!isValid) {
    return next(new AppError('Invalid code. Please try again with a fresh code from your app.', 401));
  }

  // Activate 2FA
  user.twoFactorEnabled = true;
  await user.save({ validateBeforeSave: false });

  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'security',
    title: 'Two-Factor Authentication Enabled',
    message: 'Your account is now protected with 2FA. You will need your authenticator app on each login.'
  });

  res.status(200).json({
    status: 'success',
    message: 'Two-factor authentication has been enabled successfully.'
  });
});

// ==========================================
// 2FA - DISABLE
// ==========================================
exports.disable2FA = catchAsync(async (req, res, next) => {
  const { password, token } = req.body;

  if (!password || !token) {
    return next(new AppError('Please provide your password and a current 2FA code to disable 2FA.', 400));
  }

  const user = await User.findById(req.user.id).select('+password +twoFactorSecret');

  if (!user.twoFactorEnabled) {
    return next(new AppError('2FA is not enabled on this account.', 400));
  }

  // Verify password
  const isPasswordCorrect = await user.comparePassword(password, user.password);
  if (!isPasswordCorrect) {
    return next(new AppError('Incorrect password.', 401));
  }

  // Verify current TOTP code
  const isValidToken = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token,
    window: 1
  });

  if (!isValidToken) {
    return next(new AppError('Invalid 2FA code.', 401));
  }

  // Disable 2FA and clear secret
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save({ validateBeforeSave: false });

  const Notification = require('../models/notification.model');
  await Notification.create({
    user: user._id,
    type: 'security',
    title: 'Two-Factor Authentication Disabled',
    message: 'Two-factor authentication has been removed from your account.'
  });

  res.status(200).json({
    status: 'success',
    message: 'Two-factor authentication has been disabled.'
  });
});

// ==========================================
// EXPORT CONTROLLER
// ==========================================
module.exports = exports;