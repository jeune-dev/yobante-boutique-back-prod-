/**
 * ✅ REFACTORING: Upload Error Handler Middleware
 * Élimine 4 implémentations dupliquées du pattern de gestion d'erreurs multer
 *
 * AVANT (9 lignes par route):
 * const handleUpload = (req, res, next) => {
 *   upload.array('images', 5)(req, res, (err) => {
 *     if (!err) return next();
 *     if (err.code === 'LIMIT_FILE_SIZE') {
 *       return res.status(400).json({ message: 'Fichier trop volumineux...' });
 *     }
 *     return res.status(400).json({ message: err.message || 'Erreur...' });
 *   });
 * };
 *
 * APRÈS (1 ligne par route):
 * router.post('/', uploadHandler.single(), ctrl.create);
 */

const { AppError } = require('../errors/AppError');

class UploadHandler {
  /**
   * Crée un middleware pour single file upload avec gestion d'erreurs standardisée
   * @param {object} uploadMiddleware - Instance multer pour single()
   * @param {number} maxSizeMB - Taille maximale du fichier (par défaut 5MB)
   */
  static singleFile(uploadMiddleware, maxSizeMB = 5) {
    return (req, res, next) => {
      uploadMiddleware(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(`Fichier trop volumineux. Taille maximale : ${maxSizeMB} MB.`, 400)
          );
        }
        if (err.code === 'LIMIT_PART_COUNT') {
          return next(new AppError('Trop de parties du fichier.', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new AppError('Trop de fichiers.', 400));
        }
        if (err.code === 'LIMIT_FIELD_KEY') {
          return next(new AppError('Nom du champ invalide.', 400));
        }
        if (err.code === 'LIMIT_FIELD_VALUE') {
          return next(new AppError('Valeur du champ trop longue.', 400));
        }
        return next(new AppError(err.message || 'Erreur lors du traitement du fichier.', 400));
      });
    };
  }

  /**
   * Crée un middleware pour multiple files upload avec gestion d'erreurs standardisée
   * @param {object} uploadMiddleware - Instance multer pour array()
   * @param {number} maxSizeMB - Taille maximale par fichier (par défaut 5MB)
   */
  static multipleFiles(uploadMiddleware, maxSizeMB = 5) {
    return (req, res, next) => {
      uploadMiddleware(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(`Fichier trop volumineux. Taille maximale : ${maxSizeMB} MB.`, 400)
          );
        }
        if (err.code === 'LIMIT_PART_COUNT') {
          return next(new AppError('Trop de parties des fichiers.', 400));
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return next(new AppError('Trop de fichiers envoyés.', 400));
        }
        if (err.code === 'LIMIT_FIELD_KEY') {
          return next(new AppError('Nom du champ invalide.', 400));
        }
        if (err.code === 'LIMIT_FIELD_VALUE') {
          return next(new AppError('Valeur du champ trop longue.', 400));
        }
        return next(new AppError(err.message || 'Erreur lors du traitement des fichiers.', 400));
      });
    };
  }
}

module.exports = UploadHandler;
