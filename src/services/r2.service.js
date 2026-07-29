/**
 * r2.service.js — Stockage Cloudflare R2
 *
 * Remplace Cloudinary pour tous les uploads (images produits, profils, bannières, etc).
 *
 * Variables d'environnement requises :
 *   R2_ACCOUNT_ID       — ID du compte Cloudflare
 *   R2_ACCESS_KEY_ID    — Clé d'accès R2
 *   R2_SECRET_ACCESS_KEY — Clé secrète R2
 *   R2_BUCKET_NAME      — Nom du bucket
 *   R2_PUBLIC_URL       — URL publique du bucket (ex: https://pub-xxx.r2.dev)
 *
 * Structure du bucket :
 *   images/             — Photos produits, profils, bannières, catégories
 *   avatars/            — Photos de profil utilisateurs
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const logger = require('../config/logger');

// ── Client R2 ─────────────────────────────────────────────────────────────────
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

// ── Utilitaires ───────────────────────────────────────────────────────────────

/**
 * Détermine le Content-Type selon l'extension du fichier.
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return types[ext] || 'application/octet-stream';
}

// ── Upload image (produits, profils, bannières, catégories) ──────────────────

/**
 * Upload un fichier image directement vers R2 depuis un Buffer mémoire.
 * Remplace Cloudinary.
 *
 * @param {Buffer} buffer        — Contenu du fichier (req.file.buffer via multer memoryStorage)
 * @param {string} originalname  — Nom original du fichier (req.file.originalname)
 * @param {string} [folder]      — Sous-dossier dans R2 (défaut: 'images')
 * @returns {string}             — URL publique de l'image
 */
async function uploadImage(buffer, originalname, folder = 'images') {
  try {
    const ext = path.extname(originalname);
    const basename = path.basename(originalname, ext).replace(/\s+/g, '_');
    const filename = `${Date.now()}_${basename}${ext}`;
    const key = `${folder}/${filename}`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: getContentType(originalname),
      })
    );

    const url = `${PUBLIC_URL}/${key}`;
    logger.debug('[R2] Image uploaded', { folder, filename, url });
    return url;
  } catch (err) {
    logger.error('[R2] Upload failed', {
      originalname,
      folder,
      error: err.message,
    });
    throw err;
  }
}

// ── Suppression ───────────────────────────────────────────────────────────────

/**
 * Supprime un fichier de R2.
 *
 * @param {string} url  — URL publique ou clé R2
 */
async function deleteImage(url) {
  if (!url) return;

  try {
    let key = url;
    // Si c'est une URL complète, extraire la clé
    if (url.startsWith('http')) {
      key = url.replace(`${PUBLIC_URL}/`, '');
    }

    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );

    logger.debug('[R2] Image deleted', { url, key });
  } catch (err) {
    logger.warn('[R2] Deletion failed', { url, error: err.message });
  }
}

module.exports = { uploadImage, deleteImage };
