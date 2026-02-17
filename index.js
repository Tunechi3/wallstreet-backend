// server.js
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { initializeCronJobs } = require("./services/cronService");

dotenv.config();

const app = express();

// Import routes
const userRoute = require("./routes/user.route");
const authRoute = require("./routes/auth.route");
const dashboardRoutes = require("./routes/dashboard.route");
const investmentRoutes = require("./routes/investment.route");
const transactionRoutes = require("./routes/transaction.route");
const notificationRoutes = require("./routes/notification.route");
const adminRoutes = require('./routes/admin.route');
// CORS configuration - MUST BE BEFORE OTHER MIDDLEWARE
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Home route
app.get("/", (req, res) => {
  res.status(200).json({ 
    message: "Wallstreet API is running",
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// MongoDB Connection
mongoose.connect(process.env.URI || process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB ti connect successfully");
    
    // Initialize cron jobs after database connection
    initializeCronJobs();
    console.log("⏰ Cron jobs initialized successfully");
  })
  .catch((err) => {
    console.log("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// API Routes
app.use('/api/auth', authRoute);
app.use('/api/users', userRoute);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);
// 404 handler - route not found
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Start server
const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server ti gbera lori port ${port}`);
  console.log(`📍 Server URL: http://localhost:${port}`);
  console.log(`📍 API Base URL: http://localhost:${port}/api`);
  console.log(`📊 Dashboard API: http://localhost:${port}/api/dashboard`);
  console.log(`💰 Investments API: http://localhost:${port}/api/investments`);
  console.log(`💳 Transactions API: http://localhost:${port}/api/transactions`);
  console.log(`🔔 Notifications API: http://localhost:${port}/api/notifications`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', err);
  // Close server & exit process
  // server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('❌ Uncaught Exception:', err);
  process.exit(1);
});

module.exports = app;