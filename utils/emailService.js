const nodemailer = require('nodemailer');

// ==========================================
// EMAIL TRANSPORTER CONFIGURATION
// ==========================================

/**
 * Create email transporter
 * Using Gmail SMTP (can be changed to any email service)
 */
const createTransporter = () => {
  // Production: Use real email service (Gmail, SendGrid, Mailgun, etc.)
  if (process.env.NODE_ENV === 'production') {
    // Example with Gmail
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    
    /* Example with SendGrid
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
    */
    
    /* Example with custom SMTP
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    */
  }
  
  // Development: Use Mailtrap or Ethereal
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.mailtrap.io',
    port: process.env.EMAIL_PORT || 2525,
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// ==========================================
// SEND EMAIL FUNCTION
// ==========================================

/**
 * Send email
 * 
 * @param {Object} options - Email options
 * @param {String} options.email - Recipient email
 * @param {String} options.subject - Email subject
 * @param {String} options.message - Plain text message
 * @param {String} options.html - HTML message (optional)
 * @returns {Promise}
 */
const sendEmail = async (options) => {
  // 1) Create transporter
  const transporter = createTransporter();
  
  // 2) Define email options
  const mailOptions = {
    from: `Wallstreet Investment <${process.env.EMAIL_FROM || 'noreply@wallstreet.com'}>`,
    to: options.email,
    subject: options.subject,
    text: options.message
  };
  
  // Add HTML if provided
  if (options.html) {
    mailOptions.html = options.html;
  }
  
  // 3) Send email
  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.email}`);
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Failed to send email');
  }
};

// ==========================================
// EMAIL TEMPLATES
// ==========================================

/**
 * Send welcome email
 */
const sendWelcomeEmail = async (user, verificationUrl) => {
  const subject = 'Welcome to Wallstreet Investment!';
  const message = `
Hello ${user.name},

Welcome to Wallstreet Investment Platform!

Your account has been created successfully. To get started, please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 24 hours.

Thank you for joining us!

Best regards,
Wallstreet Investment Team
  `.trim();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #555a69;">Welcome to Wallstreet Investment!</h2>
      <p>Hello ${user.name},</p>
      <p>Welcome to Wallstreet Investment Platform!</p>
      <p>Your account has been created successfully. To get started, please verify your email address by clicking the button below:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background-color: #555a69; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Verify Email</a>
      </div>
      <p style="color: #666; font-size: 14px;">This link will expire in 24 hours.</p>
      <p>Thank you for joining us!</p>
      <p>Best regards,<br>Wallstreet Investment Team</p>
    </div>
  `;
  
  await sendEmail({
    email: user.email,
    subject,
    message,
    html
  });
};

/**
 * Send password reset email
 */
const sendPasswordResetEmail = async (user, resetUrl) => {
  const subject = 'Password Reset Request';
  const message = `
Hello ${user.name},

You requested a password reset for your Wallstreet Investment account.

Click the link below to reset your password:

${resetUrl}

This link will expire in 10 minutes.

If you didn't request this, please ignore this email.

Best regards,
Wallstreet Investment Team
  `.trim();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #555a69;">Password Reset Request</h2>
      <p>Hello ${user.name},</p>
      <p>You requested a password reset for your Wallstreet Investment account.</p>
      <p>Click the button below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #555a69; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
      </div>
      <p style="color: #666; font-size: 14px;">This link will expire in 10 minutes.</p>
      <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
      <p>Best regards,<br>Wallstreet Investment Team</p>
    </div>
  `;
  
  await sendEmail({
    email: user.email,
    subject,
    message,
    html
  });
};

/**
 * Send deposit confirmation email
 */
const sendDepositConfirmationEmail = async (user, amount, method) => {
  const subject = 'Deposit Confirmed';
  const message = `
Hello ${user.name},

Your deposit of $${amount} via ${method} has been confirmed and credited to your account.

Your new balance: $${user.totalBalance}

Thank you for investing with us!

Best regards,
Wallstreet Investment Team
  `.trim();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #27ae60;">Deposit Confirmed</h2>
      <p>Hello ${user.name},</p>
      <p>Your deposit has been confirmed and credited to your account.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Amount:</strong> $${amount}</p>
        <p style="margin: 10px 0 0 0;"><strong>Method:</strong> ${method}</p>
        <p style="margin: 10px 0 0 0;"><strong>New Balance:</strong> $${user.totalBalance}</p>
      </div>
      <p>Thank you for investing with us!</p>
      <p>Best regards,<br>Wallstreet Investment Team</p>
    </div>
  `;
  
  await sendEmail({
    email: user.email,
    subject,
    message,
    html
  });
};

/**
 * Send withdrawal confirmation email
 */
const sendWithdrawalConfirmationEmail = async (user, amount, method) => {
  const subject = 'Withdrawal Processed';
  const message = `
Hello ${user.name},

Your withdrawal request of $${amount} via ${method} has been processed successfully.

The funds should arrive in your account within 1-3 business days.

Best regards,
Wallstreet Investment Team
  `.trim();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #555a69;">Withdrawal Processed</h2>
      <p>Hello ${user.name},</p>
      <p>Your withdrawal request has been processed successfully.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Amount:</strong> $${amount}</p>
        <p style="margin: 10px 0 0 0;"><strong>Method:</strong> ${method}</p>
      </div>
      <p style="color: #666;">The funds should arrive in your account within 1-3 business days.</p>
      <p>Best regards,<br>Wallstreet Investment Team</p>
    </div>
  `;
  
  await sendEmail({
    email: user.email,
    subject,
    message,
    html
  });
};

/**
 * Send investment payout notification
 */
const sendPayoutNotificationEmail = async (user, amount, investment) => {
  const subject = 'Investment Payout Received';
  const message = `
Hello ${user.name},

You have received a payout of $${amount} from your ${investment.plan.name}.

Your new balance: $${user.totalBalance}

Keep investing!

Best regards,
Wallstreet Investment Team
  `.trim();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #27ae60;">Investment Payout Received</h2>
      <p>Hello ${user.name},</p>
      <p>You have received a payout from your investment.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Payout Amount:</strong> $${amount}</p>
        <p style="margin: 10px 0 0 0;"><strong>Investment Plan:</strong> ${investment.plan.name}</p>
        <p style="margin: 10px 0 0 0;"><strong>New Balance:</strong> $${user.totalBalance}</p>
      </div>
      <p>Keep investing!</p>
      <p>Best regards,<br>Wallstreet Investment Team</p>
    </div>
  `;
  
  await sendEmail({
    email: user.email,
    subject,
    message,
    html
  });
};

/**
 * Send referral commission email
 */
const sendReferralCommissionEmail = async (user, amount, referredUser) => {
  const subject = 'Referral Commission Earned';
  const message = `
Hello ${user.name},

Congratulations! You've earned a referral commission of $${amount}.

${referredUser.name} has made their first investment using your referral code.

Your new referral earnings: $${user.referralEarnings}

Keep referring!

Best regards,
Wallstreet Investment Team
  `.trim();
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #27ae60;">Referral Commission Earned</h2>
      <p>Hello ${user.name},</p>
      <p>Congratulations! You've earned a referral commission.</p>
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0;"><strong>Commission:</strong> $${amount}</p>
        <p style="margin: 10px 0 0 0;"><strong>Referred User:</strong> ${referredUser.name}</p>
        <p style="margin: 10px 0 0 0;"><strong>Total Referral Earnings:</strong> $${user.referralEarnings}</p>
      </div>
      <p>Keep referring!</p>
      <p>Best regards,<br>Wallstreet Investment Team</p>
    </div>
  `;
  
  await sendEmail({
    email: user.email,
    subject,
    message,
    html
  });
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendDepositConfirmationEmail,
  sendWithdrawalConfirmationEmail,
  sendPayoutNotificationEmail,
  sendReferralCommissionEmail
};

// ==========================================
// USAGE EXAMPLE
// ==========================================

/*
const { sendWelcomeEmail } = require('../utils/emailService');

// In controller
const verificationUrl = `${process.env.FRONTEND_URL}/verify/${token}`;
await sendWelcomeEmail(user, verificationUrl);
*/