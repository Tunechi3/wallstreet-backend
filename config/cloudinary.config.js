const cloudinary = require('cloudinary').v2;
// Remove this line:
// const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Keep only the cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload helper function
const uploadFromBuffer = (fileBuffer, folder = 'uploads', options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder,
      resource_type: 'auto',
      ...options
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );

    uploadStream.end(fileBuffer);
  });
};

// Upload functions
const uploadProfileImage = async (fileBuffer) => {
  try {
    const result = await uploadFromBuffer(fileBuffer, 'profile-images', {
      width: 500,
      height: 500,
      crop: 'fill',
      quality: 'auto',
      format: 'jpg'
    });
    
    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    throw new Error('Failed to upload profile image: ' + error.message);
  }
};

const uploadPaymentProof = async (fileBuffer) => {
  try {
    const result = await uploadFromBuffer(fileBuffer, 'payment-proofs');
    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    throw new Error('Failed to upload payment proof: ' + error.message);
  }
};

const uploadDocument = async (fileBuffer) => {
  try {
    const result = await uploadFromBuffer(fileBuffer, 'documents');
    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    throw new Error('Failed to upload document: ' + error.message);
  }
};

const deleteImage = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    throw new Error('Failed to delete image: ' + error.message);
  }
};

module.exports = {
  cloudinary,
  uploadFromBuffer,
  uploadProfileImage,
  uploadPaymentProof,
  uploadDocument,
  deleteImage
};