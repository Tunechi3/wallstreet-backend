const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

// ==========================================
// PROTECT — verify JWT token
// ==========================================
exports.protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      message: 'Not authorized to access this route',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({
        status: 'fail',
        message: 'User not found',
      });
    }

    next();
  } catch (error) {
    return res.status(401).json({
      status: 'fail',
      message: 'Not authorized to access this route',
    });
  }
};

// ==========================================
// ADMIN PROTECT — role check
// Allows both 'admin' and 'super_admin'
// ==========================================
exports.adminProtect = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'fail',
      message: 'Not authorized to access this route',
    });
  }

  const allowedRoles = ['admin', 'super_admin'];

  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({
      status: 'fail',
      message: 'Access denied. Admin privileges required.',
    });
  }

  next();
};

module.exports = exports;