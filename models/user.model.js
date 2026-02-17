const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ✅ Helper: round to 2 decimal places to eliminate floating point drift
const round2 = (v) => Math.round((v || 0) * 100) / 100;

const userSchema = new mongoose.Schema({
  // ==========================================
  // BASIC INFORMATION
  // ==========================================
  name: {
    type: String,
    required: [true, 'Please provide your name'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ]
  },
  
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  
  address: {
    type: String,
    trim: true,
    default: ''
  },
  
  country: {
    type: String,
    trim: true,
    default: ''
  },
  
  profileImage: {
    type: String,
    default: ''
  },
  
  // ==========================================
  // ACCOUNT INFORMATION
  // ==========================================
  accountStatus: {
    type: String,
    enum: {
      values: ['active', 'suspended', 'pending', 'closed'],
      message: 'Account status must be either active, suspended, pending, or closed'
    },
    default: 'active'
  },
  
  verificationStatus: {
    type: String,
    enum: {
      values: ['verified', 'unverified', 'pending'],
      message: 'Verification status must be either verified, unverified, or pending'
    },
    default: 'unverified'
  },
  
  role: {
    type: String,
    enum: {
      values: ['user', 'admin', 'super_admin'],
      message: 'Role must be either user, admin, or super_admin'
    },
    default: 'user'
  },
  
  isActive: {
    type: Boolean,
    default: true,
    select: false
  },
  
  // ==========================================
  // FINANCIAL INFORMATION
  // ✅ FIX: Added get/set on every balance field so floating point is
  //         rounded to 2 decimal places on every read AND every write.
  //         This is what caused the "$1 difference" bug — e.g. depositing
  //         $100 then reading back $99.99999... which rounds to $99 or $100
  //         depending on how toLocaleString truncates it.
  // ==========================================
  totalBalance: {
    type: Number,
    default: 0,
    min: [0, 'Balance cannot be negative'],
    get: round2,
    set: round2
  },
  
  availableBalance: {
    type: Number,
    default: 0,
    min: [0, 'Available balance cannot be negative'],
    get: round2,
    set: round2
  },
  
  totalProfit: {
    type: Number,
    default: 0,
    min: [0, 'Total profit cannot be negative'],
    get: round2,
    set: round2
  },
  
  dailyEarnings: {
    type: Number,
    default: 0,
    min: [0, 'Daily earnings cannot be negative'],
    get: round2,
    set: round2
  },
  
  // ==========================================
  // REFERRAL INFORMATION
  // ==========================================
  referralCode: {
    type: String,
    unique: true,
    uppercase: true,
    trim: true,
    sparse: true
  },
  
  referralEarnings: {
    type: Number,
    default: 0,
    min: [0, 'Referral earnings cannot be negative'],
    get: round2,
    set: round2
  },
  
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  referredUsersCount: {
    type: Number,
    default: 0,
    min: [0, 'Referred users count cannot be negative']
  },
  
  // ==========================================
  // SECURITY
  // ==========================================
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  
  twoFactorSecret: {
    type: String,
    select: false
  },
  
  lastLogin: {
    type: Date,
    default: null
  },
  
  passwordChangedAt: {
    type: Date,
    select: false
  },
  
  resetPasswordToken: {
    type: String,
    select: false
  },
  
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  
  emailVerificationToken: {
    type: String,
    select: false
  },
  
  emailVerificationExpires: {
    type: Date,
    select: false
  }
  
}, {
  timestamps: true,
  // ✅ FIX: Must enable getters on toJSON and toObject so the round2 getters
  //         actually fire when the document is serialised and sent to the frontend.
  //         Without this, mongoose ignores field getters during serialisation.
  toJSON: { virtuals: true, getters: true },
  toObject: { virtuals: true, getters: true }
});

// ==========================================
// INDEXES FOR PERFORMANCE
// ==========================================
userSchema.index({ createdAt: -1 });
userSchema.index({ accountStatus: 1, isActive: 1 });

// ==========================================
// VIRTUALS
// ==========================================

// Calculate invested amount (totalBalance - availableBalance)
userSchema.virtual('investedAmount').get(function() {
  return round2(this.totalBalance - this.availableBalance);
});

// Virtual for active investments count (populated from Investment model)
userSchema.virtual('activeInvestments', {
  ref: 'Investment',
  localField: '_id',
  foreignField: 'user',
  count: true,
  match: { status: 'active' }
});

// ==========================================
// MIDDLEWARE - PRE HOOKS
// ==========================================

// Hash password before saving
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Update passwordChangedAt when password is modified
userSchema.pre('save', function() {
  if (!this.isModified('password') || this.isNew) return;
  this.passwordChangedAt = Date.now() - 1000;
});

// Generate referral code before saving new user
userSchema.pre('save', function() {
  if (!this.isNew || this.referralCode) return;
  const namePrefix = this.name.substring(0, 3).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  this.referralCode = `${namePrefix}${randomSuffix}`;
});

// Exclude inactive users from queries
userSchema.pre(/^find/, function() {
  this.find({ isActive: { $ne: false } });
});

// ==========================================
// INSTANCE METHODS
// ==========================================

// Compare password for login
userSchema.methods.comparePassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Check if password was changed after JWT was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  this.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// Generate email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verifyToken = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verifyToken)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  return verifyToken;
};

// ✅ FIX: updateBalance now uses round2 on every arithmetic operation
//         so balance drift is impossible regardless of the input amount.
userSchema.methods.updateBalance = async function(amount, type) {
  if (type === 'add') {
    this.availableBalance = round2(this.availableBalance + amount);
    this.totalBalance     = round2(this.totalBalance     + amount);
  } else if (type === 'subtract') {
    if (this.availableBalance < amount) {
      throw new Error('Insufficient balance');
    }
    this.availableBalance = round2(this.availableBalance - amount);
    this.totalBalance     = round2(this.totalBalance     - amount);
  }
  
  await this.save();
  return this;
};

// Update last login
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = Date.now();
  await this.save({ validateBeforeSave: false });
};

// ==========================================
// STATIC METHODS
// ==========================================

// Find user by referral code
userSchema.statics.findByReferralCode = function(code) {
  return this.findOne({ referralCode: code.toUpperCase() });
};

// Get user statistics
userSchema.statics.getUserStats = async function(userId) {
  const user = await this.findById(userId)
    .populate('activeInvestments')
    .select('+passwordChangedAt');
  
  if (!user) {
    throw new Error('User not found');
  }
  
  return {
    name: user.name,
    email: user.email,
    totalBalance: user.totalBalance,
    availableBalance: user.availableBalance,
    investedAmount: user.investedAmount,
    totalProfit: user.totalProfit,
    dailyEarnings: user.dailyEarnings,
    referralEarnings: user.referralEarnings,
    activeInvestments: user.activeInvestments,
    accountStatus: user.accountStatus,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt
  };
};

// ==========================================
// EXPORT MODEL
// ==========================================
module.exports = mongoose.models.User || mongoose.model('User', userSchema);