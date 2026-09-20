const multer = require('multer');
const { uploadConfig } = require('../config/security');

// Signatures magiques pour valider le contenu réel du fichier (pas seulement le mimetype déclaré)
const MAGIC_BYTES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP
};

const validateMagicBytes = (buffer, mimetype) => {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return false;
  return signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
};

const fileFilter = (req, file, cb) => {
  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error('Type de fichier non autorisé. Formats acceptés : JPEG, PNG, WEBP'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadConfig.maxFileSize },
  fileFilter,
});

// Middleware à chaîner après upload.* pour vérifier les magic bytes sur tous les fichiers reçus
const checkMagicBytes = (req, res, next) => {
  const files = req.files
    ? Array.isArray(req.files)
      ? req.files
      : Object.values(req.files).flat()
    : req.file
      ? [req.file]
      : [];

  for (const file of files) {
    if (!validateMagicBytes(file.buffer, file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Le fichier "${file.originalname}" est corrompu ou son contenu ne correspond pas à son type déclaré.`,
        data: null,
      });
    }
    // Pour WEBP: vixer aussi les octets 8-11 = 'W','E','B','P'
    if (file.mimetype === 'image/webp') {
      const webpSig = [0x57, 0x45, 0x42, 0x50];
      const valid = webpSig.every((b, i) => file.buffer[i + 8] === b);
      if (!valid) {
        return res
          .status(400)
          .json({ success: false, message: 'Fichier WEBP invalide.', data: null });
      }
    }
  }
  next();
};

module.exports = upload;
module.exports.checkMagicBytes = checkMagicBytes;
