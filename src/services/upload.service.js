// ─────────────────────────────────────────────────────────────
// services/upload.service.js — Gestion uploads Cloudinary
// ─────────────────────────────────────────────────────────────
const cloudinary = require('../config/cloudinary');
const logger = require('../utils/logger');

// ✅ PERF: Upload avec timeout (30 secondes)
function uploadImage(buffer, originalname, folder = 'yobante') {
  return new Promise((resolve, reject) => {
    // Timeout après 30 secondes
    const timeout = setTimeout(() => {
      stream.destroy();
      reject(new Error('Cloudinary upload timeout après 30 secondes'));
    }, 30000);

    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        timeout: 30000,
      },
      (error, result) => {
        clearTimeout(timeout);
        if (error) {
          logger.error('[upload] Cloudinary upload failed', {
            originalname,
            folder,
            error: error.message,
          });
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

function _extractPublicId(url) {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

async function deleteImage(url) {
  if (!url) return;
  const publicId = _extractPublicId(url);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    logger.warn('[upload] Échec suppression Cloudinary', { url, error: err.message });
  }
}

module.exports = { uploadImage, deleteImage };
