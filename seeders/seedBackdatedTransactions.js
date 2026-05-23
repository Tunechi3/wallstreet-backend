/**
 * seedBackdatedTransactions.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds 7 years of REALISTIC transaction + investment history for one or more
 * users. The financial flow is:
 *
 *   1. DEPOSIT        → funds arrive, availableBalance increases
 *   2. INVESTMENT     → funds locked into a plan, availableBalance decreases
 *   3. EARNING        → daily returns credit availableBalance + totalProfit
 *   4. WITHDRAWAL     → user cashes out periodically (fee deducted)
 *   5. REFERRAL BONUS → occasional bonus credited
 *
 * Target final state:
 *   availableBalance : $90,000 – $290,000
 *   totalBalance     : max $450,000
 *
 * USAGE:
 *   1. Add user IDs to TARGET_USER_IDS below.
 *   2. node seeders/seedBackdatedTransactions.js
 *
 * SAFE TO RE-RUN — deletes is_seeded=true records before re-inserting.
 * Does NOT modify any controller, route, or model file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const mongoose    = require('mongoose');
const Transaction = require('../models/transaction.model');
const Investment  = require('../models/investment.model');
const User        = require('../models/user.model');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.URI || process.env.MONGO_URI;

const TARGET_USER_IDS = [
  '6991f06aa7660c59fa271c0d',
  // Add more user IDs here as needed
];

const YEARS_BACK = 7;
const BATCH_SIZE = 500;

// ─── INVESTMENT PLANS (mirrors investment.controller.js exactly) ──────────────

const INVESTMENT_PLANS = [
  { id: 1, name: 'Daily Starter',  minAmount: 1000,   maxAmount: 3000,    dailyReturn: 11,    duration: 1,  totalReturn: 11  },
  { id: 2, name: '3-Day Plan',     minAmount: 100,    maxAmount: 999,     dailyReturn: 11.67, duration: 3,  totalReturn: 35  },
  { id: 3, name: 'Weekly Starter', minAmount: 1000,   maxAmount: 4999,    dailyReturn: 7.86,  duration: 7,  totalReturn: 55  },
  { id: 4, name: 'Weekly Growth',  minAmount: 5000,   maxAmount: 19999,   dailyReturn: 10.71, duration: 7,  totalReturn: 75  },
  { id: 5, name: 'Weekly Elite',   minAmount: 20000,  maxAmount: 99999,   dailyReturn: 25,    duration: 7,  totalReturn: 175 },
  { id: 6, name: '3-Week Titan',   minAmount: 100000, maxAmount: Infinity, dailyReturn: 17.86, duration: 21, totalReturn: 375 },
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const round2      = (v) => Math.round((v || 0) * 100) / 100;
const randBetween = (min, max) => round2(min + Math.random() * (max - min));
const randInt     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const CRYPTO_METHODS = [
  'Bitcoin (BTC)', 'Ethereum (ETH)', 'USDT (TRC20)',
  'Solana (SOL)',  'USDC (ERC20)',   'Tron (TRX)',
];
const pickCrypto = () => CRYPTO_METHODS[Math.floor(Math.random() * CRYPTO_METHODS.length)];

/**
 * Pick an affordable plan weighted toward higher tiers as the account matures.
 * Cap at Weekly Growth (plan 4) so we never invest $100k+ which would
 * distort the balance badly.
 */
const pickPlan = (availableBalance, yearIndex) => {
  const cappedPlans = INVESTMENT_PLANS.filter(p => p.id <= 4); // max Weekly Growth
  const affordable  = cappedPlans.filter(p => availableBalance >= p.minAmount);
  if (affordable.length === 0) return null;

  const weight = yearIndex / YEARS_BACK;
  const roll   = Math.random();
  if (roll > weight * 0.8 || affordable.length === 1) return affordable[0];
  return affordable[Math.floor(Math.random() * affordable.length)];
};

// ─── TX FACTORY ──────────────────────────────────────────────────────────────

const makeTx = (userId, type, amount, method, description, date, investmentId = null) => ({
  userId:       new mongoose.Types.ObjectId(userId),
  type,
  amount,
  method,
  status:       'completed',
  description,
  investmentId: investmentId || null,
  completedAt:  new Date(date),
  processedAt:  new Date(date),
  is_seeded:    true,
  createdAt:    new Date(date),
  updatedAt:    new Date(date),
});

// ─── CORE GENERATOR ──────────────────────────────────────────────────────────

const generateHistory = (userId) => {
  const transactions = [];
  const investments  = [];

  const end   = new Date();
  const start = new Date();
  start.setFullYear(end.getFullYear() - YEARS_BACK);

  let availableBalance = 0;
  let totalBalance     = 0;

  const activePool = [];

  let daysSinceDeposit    = 999; // force deposit on day 1
  let daysSinceWithdrawal = 999;
  let daysSinceInvestment = 999;
  let daysSinceReferral   = 999;

  // Deposit every 20–45 days
  // Withdrawal every 60–120 days (realistic — user cashes out every 2–4 months)
  let nextDepositIn  = 0;
  let nextInvestIn   = randInt(5, 12);
  let nextWithdrawIn = randInt(60, 120);
  let nextReferralIn = randInt(30, 90);

  for (let i = 0, d = new Date(start); d <= end; d.setDate(d.getDate() + 1), i++) {
    const txDate    = new Date(d);
    const yearIndex = i / 365;

    // ── STEP 1: Pay daily earnings ──────────────────────────────────────────
    for (const inv of activePool) {
      if (inv.daysLeft > 0) {
        const earning    = round2(inv.dailyEarning);
        availableBalance = round2(availableBalance + earning);
        totalBalance     = round2(totalBalance     + earning);
        transactions.push(makeTx(userId, 'earning', earning, 'Internal', `Daily return — ${inv.planName}`, txDate));
        inv.daysLeft--;
        if (inv.daysLeft === 0) inv.completed = true;
      }
    }
    for (let j = activePool.length - 1; j >= 0; j--) {
      if (activePool[j].completed) activePool.splice(j, 1);
    }

    // ── STEP 2: DEPOSIT ─────────────────────────────────────────────────────
    // Deposits grow gradually:
    //   Year 1: $500–$2,000   (getting started)
    //   Year 4: $1,500–$5,000 (growing confidence)
    //   Year 7: $3,000–$9,000 (established investor)
    // ~100 deposits × avg $3,500 = ~$350k total deposits over 7 years
    const balanceTooLow = availableBalance < 500;
    if (daysSinceDeposit >= nextDepositIn || balanceTooLow) {
      const minDep = round2(500  + yearIndex * 357);   // $500 → $3,000
      const maxDep = round2(2000 + yearIndex * 1000);  // $2,000 → $9,000
      const depAmt = randBetween(minDep, maxDep);
      const method = pickCrypto();

      availableBalance = round2(availableBalance + depAmt);
      totalBalance     = round2(totalBalance     + depAmt);
      transactions.push(makeTx(userId, 'deposit', depAmt, method, `Deposit via ${method}`, txDate));

      daysSinceDeposit = 0;
      nextDepositIn    = randInt(20, 45);

      // Referral bonus occasionally after deposit
      if (daysSinceReferral >= nextReferralIn && Math.random() < 0.20) {
        const bonus      = randBetween(50, 500);
        availableBalance = round2(availableBalance + bonus);
        totalBalance     = round2(totalBalance     + bonus);
        transactions.push(makeTx(userId, 'referral_bonus', bonus, 'Internal', 'Referral bonus earned', txDate));
        daysSinceReferral = 0;
        nextReferralIn    = randInt(30, 90);
      }
    } else {
      daysSinceDeposit++;
      daysSinceReferral++;
    }

    // ── STEP 3: INVESTMENT ──────────────────────────────────────────────────
    // Invest 20–35% of available balance per trade so balance isn't wiped out
    // Max 2 concurrent investments to keep it clean
    const activeCount   = activePool.length;
    const maxConcurrent = Math.min(2, 1 + Math.floor(yearIndex / 3));

    if (
      daysSinceInvestment >= nextInvestIn &&
      availableBalance >= 1000 &&
      activeCount < maxConcurrent &&
      Math.random() < 0.60
    ) {
      const plan = pickPlan(availableBalance, yearIndex);
      if (plan) {
        // Invest 20–35% of available balance, capped by plan max
        const pct       = randBetween(0.20, 0.35);
        const cap       = Math.min(
          plan.maxAmount === Infinity ? availableBalance * 0.35 : plan.maxAmount,
          availableBalance * pct
        );
        const invAmount = round2(Math.max(plan.minAmount, cap));
        const dailyEarn = round2((invAmount * plan.dailyReturn) / 100);
        const totalRet  = round2((invAmount * plan.totalReturn) / 100);

        const invStart   = new Date(txDate);
        const invEnd     = new Date(txDate);
        invEnd.setDate(invEnd.getDate() + plan.duration);
        const nextPayout = new Date(txDate);
        nextPayout.setDate(nextPayout.getDate() + 1);

        availableBalance = round2(availableBalance - invAmount);

        const investmentId = new mongoose.Types.ObjectId();

        investments.push({
          _id:                 investmentId,
          userId:              new mongoose.Types.ObjectId(userId),
          planId:              plan.id,
          planName:            plan.name,
          amount:              invAmount,
          dailyReturn:         plan.dailyReturn,
          totalDays:           plan.duration,
          daysRemaining:       0,
          startDate:           invStart,
          endDate:             invEnd,
          lastPayoutDate:      invEnd,
          nextPayoutDate:      nextPayout,
          totalEarned:         totalRet,
          expectedTotalReturn: totalRet,
          status:              'completed',
          progress:            100,
          is_seeded:           true,
          createdAt:           invStart,
          updatedAt:           invEnd,
        });

        transactions.push(makeTx(userId, 'investment', invAmount, 'Internal', `Investment in ${plan.name}`, txDate, investmentId));
        activePool.push({ planName: plan.name, dailyEarning: dailyEarn, daysLeft: plan.duration, completed: false });

        daysSinceInvestment = 0;
        nextInvestIn        = randInt(5, 15);
      }
    } else {
      daysSinceInvestment++;
    }

    // ── STEP 4: WITHDRAWAL ──────────────────────────────────────────────────
    // Withdraw every 60–120 days, taking 15–25% of available balance
    // Realistic: user cashes out profits regularly but leaves bulk invested
    // Hard cap: never withdraw if it would drop available below $20,000
    const minKeep = 20000;
    const canWd   = availableBalance > minKeep + 5000;

    if (
      daysSinceWithdrawal >= nextWithdrawIn &&
      canWd &&
      Math.random() < 0.65
    ) {
      const pct    = randBetween(0.15, 0.25);
      const wdAmt  = round2(Math.max(500, (availableBalance - minKeep) * pct));
      const fee    = round2(Math.max(5, round2(wdAmt * 0.02)));
      const totDed = round2(wdAmt + fee);
      const method = pickCrypto();

      if (availableBalance >= totDed) {
        availableBalance = round2(availableBalance - totDed);
        totalBalance     = round2(totalBalance     - totDed);
        transactions.push(makeTx(userId, 'withdrawal', wdAmt, method, `Withdrawal via ${method} (Fee: $${fee.toFixed(2)})`, txDate));
        daysSinceWithdrawal = 0;
        nextWithdrawIn      = randInt(60, 120);
      }
    } else {
      daysSinceWithdrawal++;
    }

    // ── HARD CAP: if totalBalance exceeds $450k, force a large withdrawal ───
    // This prevents runaway compounding from pushing past your ceiling
    if (totalBalance > 450000) {
      const excess = round2(totalBalance - 430000); // bring it back to ~$430k
      if (availableBalance >= excess) {
        const fee    = round2(Math.max(5, round2(excess * 0.02)));
        const totDed = round2(excess + fee);
        if (availableBalance >= totDed) {
          availableBalance = round2(availableBalance - totDed);
          totalBalance     = round2(totalBalance     - totDed);
          const method = pickCrypto();
          transactions.push(makeTx(userId, 'withdrawal', excess, method, `Withdrawal via ${method} (Fee: $${fee.toFixed(2)})`, txDate));
        }
      }
    }

  } // ── end day loop ─────────────────────────────────────────────────────────

  // ── POST-PROCESS: clamp final balances into target ranges ─────────────────
  // availableBalance → $90,000–$290,000
  // totalBalance     → max $450,000
  availableBalance = Math.max(90000,  Math.min(290000, availableBalance));
  totalBalance     = Math.max(availableBalance, Math.min(450000, totalBalance));

  return {
    transactions,
    investments,
    finalBalance: { availableBalance, totalBalance }
  };
};

// ─── BATCH INSERT ─────────────────────────────────────────────────────────────

const batchInsert = async (Model, records, label) => {
  if (records.length === 0) { console.log(`  ↳ ${label}: 0 records, skipping`); return; }
  const collection = mongoose.connection.collection(Model.collection.collectionName);
  let inserted = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    await collection.insertMany(records.slice(i, i + BATCH_SIZE));
    inserted += Math.min(BATCH_SIZE, records.length - i);
    process.stdout.write(`\r  ↳ ${label}: ${inserted}/${records.length} inserted`);
  }
  console.log();
};

// ─── SEED ONE USER ────────────────────────────────────────────────────────────

const seedUser = async (userId) => {
  console.log(`\n👤 Processing: ${userId}`);

  const user = await User.findById(userId);
  if (!user) { console.warn(`  ⚠️  User not found — skipping.`); return; }
  console.log(`  ✅ Found: ${user.name} (${user.email})`);

  const delTx  = await Transaction.deleteMany({ userId, is_seeded: true });
  const delInv = await Investment.deleteMany({  userId, is_seeded: true });
  console.log(`  🗑️  Cleared ${delTx.deletedCount} transactions, ${delInv.deletedCount} investments`);

  console.log(`  ⚙️  Simulating ${YEARS_BACK} years of daily activity...`);
  const { transactions, investments, finalBalance } = generateHistory(userId);

  const summary = transactions.reduce((acc, t) => { acc[t.type] = (acc[t.type] || 0) + 1; return acc; }, {});
  console.log(`  📊 Generated ${transactions.length} transactions, ${investments.length} investments`);
  console.log(`     Breakdown: ${Object.entries(summary).map(([k,v]) => `${k}×${v}`).join(' | ')}`);
  console.log(`  💰 Final balance — Available: $${finalBalance.availableBalance.toLocaleString()}, Total: $${finalBalance.totalBalance.toLocaleString()}`);

  await batchInsert(Transaction, transactions, 'Transactions');
  await batchInsert(Investment,  investments,  'Investments ');

  const profitSum = transactions
    .filter(t => ['earning', 'referral_bonus'].includes(t.type))
    .reduce((s, t) => round2(s + t.amount), 0);

  user.availableBalance = finalBalance.availableBalance;
  user.totalBalance     = finalBalance.totalBalance;
  user.totalProfit      = profitSum;

  await user.save({ validateBeforeSave: false });
  console.log(`  ✅ User balance synced — Available: $${finalBalance.availableBalance.toLocaleString()}, Total: $${finalBalance.totalBalance.toLocaleString()}`);
  console.log(`  🎉 Done for ${user.name}`);
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────

const run = async () => {
  if (TARGET_USER_IDS.length === 0) {
    console.error('\n❌  No users specified. Add ObjectId strings to TARGET_USER_IDS.\n');
    process.exit(1);
  }
  if (!MONGO_URI) {
    console.error('\n❌  No MongoDB URI found. Check your .env file.\n');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected\n');
  console.log(`📋 Seeding ${TARGET_USER_IDS.length} user(s) | ${YEARS_BACK} years of history each\n`);

  for (const userId of TARGET_USER_IDS) {
    await seedUser(userId);
  }

  console.log('\n✅ All users seeded successfully. Disconnecting...');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('❌ Fatal error:', err);
  mongoose.disconnect();
  process.exit(1);
});