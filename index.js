const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const morgan = require("morgan");
const { initializeCronJobs } = require("./services/cronService");

dotenv.config();

const app = express();

// ─── 1. CORS (must be first) ─────────────────────────────────────────────────
const corsOptions = {
  origin: "https://wallstreet-one.vercel.app",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// ─── 2. Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── 3. Logging ───────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// ─── 4. Health / Root Routes ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Wallstreet API is running",
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// ─── 5. Import Routes ─────────────────────────────────────────────────────────
const authRoute          = require("./routes/auth.route");
const userRoute          = require("./routes/user.route");
const dashboardRoutes    = require("./routes/dashboard.route");
const investmentRoutes   = require("./routes/investment.route");
const transactionRoutes  = require("./routes/transaction.route");
const notificationRoutes = require("./routes/notification.route");
const adminRoutes        = require("./routes/admin.route");

// ─── 6. Mount Routes ──────────────────────────────────────────────────────────
app.use("/api/auth",          authRoute);
app.use("/api/users",         userRoute);
app.use("/api/dashboard",     dashboardRoutes);
app.use("/api/investments",   investmentRoutes);
app.use("/api/transactions",  transactionRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin",         adminRoutes);


// ─── 7. 404 Handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// ─── 8. Global Error Handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("❌ Error:", err.stack);
  res.status(err.statusCode || err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// ─── 9. Database Connection ───────────────────────────────────────────────────
mongoose
  .connect(process.env.URI || process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    initializeCronJobs();
    console.log("⏰ Cron jobs initialized successfully");
  })
  .catch((err) => {
    console.log("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ─── 10. Start Server ─────────────────────────────────────────────────────────
const port = process.env.PORT || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});

// ─── 11. Process Error Handlers ───────────────────────────────────────────────
process.on("unhandledRejection", (err, promise) => {
  console.log("❌ Unhandled Rejection at:", promise, "reason:", err);
});

process.on("uncaughtException", (err) => {
  console.log("❌ Uncaught Exception:", err);
  process.exit(1);
});

module.exports = app;