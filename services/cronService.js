const cron = require('node-cron');
const Investment = require('../models/investment.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');
const Notification = require('../models/notification.model');

// Process daily investment payouts
const processDailyPayouts = async () => {
  try {
    console.log('Starting daily payout processing...');

    // Get all investments that are due for payout
    const dueInvestments = await Investment.getDuePayouts();

    console.log(`Found ${dueInvestments.length} investments due for payout`);

    for (const investment of dueInvestments) {
      try {
        // Calculate daily earnings
        const dailyEarnings = investment.calculateDailyEarnings();

        // Update investment
        investment.totalEarned += dailyEarnings;
        investment.daysRemaining -= 1;
        investment.lastPayoutDate = new Date();
        
        // Set next payout date
        const nextPayout = new Date();
        nextPayout.setDate(nextPayout.getDate() + 1);
        investment.nextPayoutDate = nextPayout;

        // Update progress
        investment.updateProgress();

        // Check if investment is completed
        if (investment.daysRemaining <= 0) {
          investment.status = 'completed';
          
          // Return principal amount to user
          const user = await User.findById(investment.userId);
          if (user) {
            user.availableBalance += investment.amount;
            user.totalBalance = user.availableBalance;
            await user.save();

            // Create notification for completion
            await Notification.createNotification(
              investment.userId,
              'success',
              'Investment Completed',
              `Your ${investment.planName} investment has been completed. Principal amount of $${investment.amount.toLocaleString()} has been returned to your account.`,
              { investmentId: investment._id }
            );
          }
        }

        await investment.save();

        // Update user's balance with daily earnings
        const user = await User.findById(investment.userId);
        if (user) {
          user.availableBalance += dailyEarnings;
          user.totalBalance += dailyEarnings;
          await user.save();
        }

        // Create earning transaction
        const transaction = new Transaction({
          userId: investment.userId,
          type: 'earning',
          amount: dailyEarnings,
          method: 'Internal',
          status: 'completed',
          description: `Daily earning from ${investment.planName}`,
          investmentId: investment._id,
          completedAt: new Date()
        });

        await transaction.save();

        // Create notification
        await Notification.createNotification(
          investment.userId,
          'success',
          'Daily Earnings Credited',
          `You've earned $${dailyEarnings.toFixed(2)} from your ${investment.planName} investment.`,
          { 
            investmentId: investment._id,
            transactionId: transaction._id 
          }
        );

        console.log(`Processed payout for investment ${investment._id}: $${dailyEarnings.toFixed(2)}`);

      } catch (error) {
        console.error(`Error processing payout for investment ${investment._id}:`, error);
      }
    }

    console.log('Daily payout processing completed');

  } catch (error) {
    console.error('Error in daily payout processing:', error);
  }
};

// Process referral bonuses
const processReferralBonuses = async (userId, depositAmount) => {
  try {
    const user = await User.findById(userId);
    
    if (user && user.referredBy) {
      const referrer = await User.findById(user.referredBy);
      
      if (referrer) {
        // Calculate 10% referral bonus
        const bonusAmount = depositAmount * 0.10;
        
        // Credit referrer's account
        referrer.availableBalance += bonusAmount;
        referrer.totalBalance += bonusAmount;
        referrer.referralEarnings = (referrer.referralEarnings || 0) + bonusAmount;
        await referrer.save();

        // Create transaction
        const transaction = new Transaction({
          userId: referrer._id,
          type: 'referral_bonus',
          amount: bonusAmount,
          method: 'Internal',
          status: 'completed',
          description: `Referral bonus from ${user.name || user.email}`,
          referralId: userId,
          completedAt: new Date()
        });

        await transaction.save();

        // Create notification
        await Notification.createNotification(
          referrer._id,
          'success',
          'Referral Bonus Earned',
          `You've earned $${bonusAmount.toFixed(2)} referral bonus from ${user.name || user.email}'s deposit.`,
          { 
            transactionId: transaction._id,
            referralUserId: userId 
          }
        );

        console.log(`Processed referral bonus for user ${referrer._id}: $${bonusAmount.toFixed(2)}`);
      }
    }
  } catch (error) {
    console.error('Error processing referral bonus:', error);
  }
};

// Initialize cron jobs
const initializeCronJobs = () => {
  // Run daily payout processing every day at 12:00 AM
  cron.schedule('0 0 * * *', async () => {
    console.log('Running scheduled daily payout processing...');
    await processDailyPayouts();
  });

  // Run every hour to catch any missed payouts
  cron.schedule('0 * * * *', async () => {
    console.log('Running hourly payout check...');
    await processDailyPayouts();
  });

  console.log('Cron jobs initialized successfully');
};

module.exports = {
  initializeCronJobs,
  processDailyPayouts,
  processReferralBonuses
};