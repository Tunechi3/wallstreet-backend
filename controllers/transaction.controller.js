const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

// ✅ Helper: always round money to 2 decimal places to prevent floating point drift
const round2 = (v) => Math.round((v || 0) * 100) / 100;

// ── Wallet addresses for each payment method ──────────────────────────────────
const PLATFORM_WALLETS = {
  'Bitcoin (BTC)':  'bc1qd2dh37ypm4qqgx6pqm9euxfdpjjdzheanwpl95',
  'Ethereum (ETH)': '0xf6b8b7E0360B0F30e0CaFE3C204491F06f271D24',
  'USDT (TRC20)':   '0xf6b8b7E0360B0F30e0CaFE3C204491F06f271D24',
  'Solana (SOL)':   'BnPARD4pinVAyMSmGRbdZ3w2XrZg1G7bjJsBbqxdynkj',
  'USDC (ERC20)':   '0xf6b8b7E0360B0F30e0CaFE3C204491F06f271D24',
  'Tron (TRX)':     'TVeauDNhNvhE35yomVoAEVe27G2yTzyCDe',
};

// Get all transactions for user
exports.getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, status, limit = 50 } = req.query;

    const query = { userId };
    if (type) query.type = type;
    if (status) query.status = status;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('investmentId', 'planName amount');

    const formattedTransactions = transactions.map(txn => ({
      id: txn._id,
      type: txn.type,
      amount: txn.amount,
      method: txn.method,
      status: txn.status,
      description: txn.description,
      date: txn.createdAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }),
      time: txn.createdAt.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit'
      }),
      walletAddress: txn.walletAddress,
      transactionHash: txn.transactionHash,
      createdAt: txn.createdAt
    }));

    res.status(200).json({
      success: true,
      data: formattedTransactions
    });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transactions'
    });
  }
};

// Create deposit request
exports.createDeposit = async (req, res) => {
  try {
    const { amount, method, walletAddress } = req.body;
    const userId = req.user.id;

    if (!amount || !method) {
      return res.status(400).json({
        success: false,
        message: 'Amount and payment method are required'
      });
    }

    // ✅ FIX: round2 at entry point eliminates any floating point input
    const depositAmount = round2(parseFloat(amount));

    if (depositAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum deposit amount is $100'
      });
    }

    const transaction = new Transaction({
      userId,
      type: 'deposit',
      amount: depositAmount,
      method,
      status: 'pending',
      walletAddress: walletAddress || null,
      description: `Deposit via ${method}`
    });

    await transaction.save();

    await Notification.createNotification(
      userId,
      'info',
      'Deposit Initiated',
      `Your deposit request of $${depositAmount.toLocaleString()} via ${method} has been received and is pending confirmation.`,
      { transactionId: transaction._id }
    );

    // Resolve the correct platform wallet address for the chosen method
    const platformWallet = PLATFORM_WALLETS[method] || PLATFORM_WALLETS['Bitcoin (BTC)'];

    res.status(201).json({
      success: true,
      message: 'Deposit request created successfully. Please wait for confirmation.',
      data: {
        transactionId: transaction._id,
        amount: depositAmount,
        method,
        status: 'pending',
        paymentDetails: {
          walletAddress: platformWallet,
          amount: depositAmount,
          note: 'Please send exact amount to avoid delays'
        }
      }
    });

  } catch (error) {
    console.error('Error creating deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating deposit request'
    });
  }
};

// Create withdrawal request
exports.createWithdrawal = async (req, res) => {
  try {
    const { amount, method, walletAddress } = req.body;
    const userId = req.user.id;

    if (!amount || !method || !walletAddress) {
      return res.status(400).json({
        success: false,
        message: 'Amount, payment method, and wallet address are required'
      });
    }

    // ✅ FIX: round2 at entry point
    const withdrawalAmount = round2(parseFloat(amount));

    if (withdrawalAmount < 50) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is $50'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.availableBalance < withdrawalAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: $${user.availableBalance.toFixed(2)}`
      });
    }

    // ✅ FIX: round2 on fee so 2% of e.g. $249.99 doesn't produce 4.9998 instead of 5.00
    const withdrawalFee  = round2(Math.max(round2(withdrawalAmount * 0.02), 5));
    const totalDeduction = round2(withdrawalAmount + withdrawalFee);

    if (user.availableBalance < totalDeduction) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance to cover withdrawal + fee. Total required: $${totalDeduction.toFixed(2)}, Available: $${user.availableBalance.toFixed(2)}`
      });
    }

    // Funds are NOT deducted here — only when admin approves (processWithdrawal)
    const transaction = new Transaction({
      userId,
      type: 'withdrawal',
      amount: withdrawalAmount,
      method,
      status: 'pending',
      walletAddress,
      description: `Withdrawal via ${method} (Fee: $${withdrawalFee.toFixed(2)})`
    });

    await transaction.save();

    await Notification.createNotification(
      userId,
      'info',
      'Withdrawal Requested',
      `Your withdrawal request of $${withdrawalAmount.toLocaleString()} has been submitted and is pending admin approval.`,
      { transactionId: transaction._id }
    );

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully. Awaiting admin approval.',
      data: {
        transactionId: transaction._id,
        amount: withdrawalAmount,
        fee: withdrawalFee,
        totalAmount: totalDeduction,
        method,
        walletAddress,
        status: 'pending',
        note: 'Funds will be deducted from your account once approved by admin',
        estimatedProcessingTime: '24-48 hours after approval'
      }
    });

  } catch (error) {
    console.error('Error creating withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating withdrawal request'
    });
  }
};

// Get transaction by ID
exports.getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findOne({ _id: id, userId })
      .populate('investmentId', 'planName amount');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });

  } catch (error) {
    console.error('Error fetching transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction'
    });
  }
};

// Get transaction statistics
exports.getTransactionStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await Transaction.getUserStats(userId);

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching transaction statistics'
    });
  }
};

// Cancel pending transaction
exports.cancelTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const transaction = await Transaction.findOne({ 
      _id: id, 
      userId,
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or cannot be cancelled'
      });
    }

    // No refund needed — funds are never deducted until admin approval
    transaction.status = 'cancelled';
    await transaction.save();

    await Notification.createNotification(
      userId,
      'info',
      'Transaction Cancelled',
      `Your ${transaction.type} transaction has been cancelled.`,
      { transactionId: transaction._id }
    );

    res.status(200).json({
      success: true,
      message: 'Transaction cancelled successfully',
      data: transaction
    });

  } catch (error) {
    console.error('Error cancelling transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Error cancelling transaction'
    });
  }
};

// Admin: Approve deposit
exports.approveDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionHash } = req.body || {};

    const transaction = await Transaction.findOne({ 
      _id: id, 
      type: 'deposit',
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Deposit transaction not found'
      });
    }

    transaction.status = 'completed';
    transaction.transactionHash = transactionHash || null;
    transaction.completedAt = new Date();
    await transaction.save();

    // ✅ FIX: Additive credit with round2 — no overwrite, no drift
    const user = await User.findById(transaction.userId);
    user.availableBalance = round2(user.availableBalance + transaction.amount);
    user.totalBalance     = round2(user.totalBalance     + transaction.amount);
    await user.save();

    const { processReferralBonuses } = require('../services/cronService');
    await processReferralBonuses(transaction.userId, transaction.amount);

    await Notification.createNotification(
      transaction.userId,
      'success',
      'Deposit Confirmed',
      `Your deposit of $${transaction.amount.toLocaleString()} has been confirmed and credited to your account.`,
      { transactionId: transaction._id }
    );

    res.status(200).json({
      success: true,
      message: 'Deposit approved successfully',
      data: transaction
    });

  } catch (error) {
    console.error('Error approving deposit:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving deposit'
    });
  }
};

// Admin: Process withdrawal
exports.processWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionHash, status } = req.body || {};

    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "completed" or "failed"'
      });
    }

    const transaction = await Transaction.findOne({ 
      _id: id, 
      type: 'withdrawal',
      status: 'pending'
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Withdrawal transaction not found'
      });
    }

    const user = await User.findById(transaction.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ FIX: round2 on fee arithmetic
    const withdrawalFee  = round2(Math.max(round2(transaction.amount * 0.02), 5));
    const totalDeduction = round2(transaction.amount + withdrawalFee);

    if (status === 'completed') {
      if (user.availableBalance < totalDeduction) {
        return res.status(400).json({
          success: false,
          message: `User has insufficient balance. Available: $${user.availableBalance.toFixed(2)}, Required: $${totalDeduction.toFixed(2)}`
        });
      }

      // ✅ FIX: Deduct from both independently with round2 — no overwrite
      user.availableBalance = round2(user.availableBalance - totalDeduction);
      user.totalBalance     = round2(user.totalBalance     - totalDeduction);
      await user.save();
    }

    // If failed — no deduction needed, funds were never touched

    transaction.status = status;
    transaction.transactionHash = transactionHash || null;
    transaction.completedAt = new Date();
    await transaction.save();

    await Notification.createNotification(
      transaction.userId,
      status === 'completed' ? 'success' : 'error',
      status === 'completed' ? 'Withdrawal Processed' : 'Withdrawal Failed',
      status === 'completed'
        ? `Your withdrawal of $${transaction.amount.toLocaleString()} has been processed successfully.`
        : `Your withdrawal request failed. No funds were deducted from your account.`,
      { transactionId: transaction._id }
    );

    res.status(200).json({
      success: true,
      message: `Withdrawal ${status} successfully`,
      data: transaction
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing withdrawal'
    });
  }
};

module.exports = exports;