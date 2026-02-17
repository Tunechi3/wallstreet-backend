const multer = require('multer');
const path = require('path');
const AppError = require('../utils/appError');

// ==========================================
// MULTER CONFIGURATION
// ==========================================

/**
 * Configure multer storage
 * Using memory storage for cloudinary upload
 */
const multerStorage = multer.memoryStorage();

/**
 * Configure multer file filter
 * Only allow image files
 */
const multerFilter = (req, file, cb) => {
  // Check if file is an image
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

/**
 * Configure multer upload
 */
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// ==========================================
// UPLOAD MIDDLEWARE EXPORTS
// ==========================================

/**
 * Single file upload
 * Usage: upload.single('fieldname')
 */
exports.single = (fieldname) => upload.single(fieldname);

/**
 * Multiple files upload (same field)
 * Usage: upload.array('fieldname', maxCount)
 */
exports.array = (fieldname, maxCount) => upload.array(fieldname, maxCount);

/**
 * Multiple files upload (different fields)
 * Usage: upload.fields([{ name: 'field1', maxCount: 1 }, { name: 'field2', maxCount: 3 }])
 */
exports.fields = (fields) => upload.fields(fields);

// ==========================================
// ALTERNATIVE: DISK STORAGE CONFIGURATION
// ==========================================
// Uncomment if you want to save files to disk instead of memory

/*
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Set upload destination
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadDisk = multer({
  storage: diskStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

exports.singleDisk = (fieldname) => uploadDisk.single(fieldname);
*/

// ==========================================
// USAGE EXAMPLES IN ROUTES
// ==========================================

/*
// Single file upload
router.post('/profile/image', upload.single('profileImage'), uploadController);

// Multiple files (same field)
router.post('/gallery', upload.array('photos', 5), uploadController);

// Multiple files (different fields)
router.post('/documents', upload.fields([
  { name: 'idCard', maxCount: 1 },
  { name: 'proofOfAddress', maxCount: 1 }
]), uploadController);
*/

// ==========================================
// FILE VALIDATION HELPER
// ==========================================

/**
 * Validate file type for documents
 */
exports.documentFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only PDF, JPG, and PNG are allowed.', 400), false);
  }
};

/**
 * Custom multer for document uploads
 */
exports.documentUpload = multer({
  storage: multerStorage,
  fileFilter: exports.documentFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for documents
  }
});

// ==========================================
// ERROR HANDLING MIDDLEWARE
// ==========================================

/**
 * Handle multer errors
 * Use this after multer middleware in routes
 */
exports.handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Multer-specific errors
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'fail',
        message: 'File too large. Maximum size is 5MB.'
      });
    }
    
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        status: 'fail',
        message: 'Too many files uploaded.'
      });
    }
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        status: 'fail',
        message: 'Unexpected field in file upload.'
      });
    }
    
    return res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
  
  // Pass other errors to global error handler
  next(err);
};

// ==========================================
// EXPORT DEFAULT
// ==========================================

module.exports = upload;