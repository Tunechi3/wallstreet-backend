/**
 * AppError Class
 * 
 * Custom error class for operational errors
 * Extends the built-in Error class
 * Used to create and throw predictable errors throughout the application
 */

class AppError extends Error {
  /**
   * Create an AppError
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   */
  constructor(message, statusCode) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Operational errors vs programming errors
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;

/**
 * Usage Examples:
 * 
 * // 404 Not Found
 * throw new AppError('User not found', 404);
 * 
 * // 400 Bad Request
 * throw new AppError('Invalid email or password', 400);
 * 
 * // 401 Unauthorized
 * throw new AppError('You are not logged in', 401);
 * 
 * // 403 Forbidden
 * throw new AppError('You do not have permission to perform this action', 403);
 * 
 * // 500 Internal Server Error
 * throw new AppError('Something went wrong', 500);
 * 
 * // With next() in Express
 * if (!user) {
 *   return next(new AppError('User not found', 404));
 * }
 */