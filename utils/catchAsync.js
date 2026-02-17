/**
 * Catch Async Utility
 * 
 * Wraps async functions to catch errors and pass them to the global error handler
 * Eliminates the need for try-catch blocks in every async controller function
 * 
 * @param {Function} fn - Async function to wrap
 * @returns {Function} - Express middleware function
 */

module.exports = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * Usage Example:
 * 
 * const catchAsync = require('../utils/catchAsync');
 * 
 * exports.getUser = catchAsync(async (req, res, next) => {
 *   const user = await User.findById(req.params.id);
 *   
 *   if (!user) {
 *     return next(new AppError('User not found', 404));
 *   }
 *   
 *   res.status(200).json({
 *     status: 'success',
 *     data: { user }
 *   });
 * });
 */