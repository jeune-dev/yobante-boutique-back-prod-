// tests/unit/middlewares/error.middleware.test.js

const errorMiddleware = require('../../../src/middlewares/error.middleware');

// Mock logger pour éviter les logs en test
jest.mock('../../../src/config/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
}));

describe('Error Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
    process.env.NODE_ENV = 'development';
  });

  it('devrait retourner 500 pour une erreur générique', () => {
    const error = new Error('Something went wrong');

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false
      })
    );
  });

  it('devrait traiter les erreurs de validation Joi', () => {
    const error = new Error('Validation failed');
    error.isJoi = true;
    error.details = [{ message: 'Email invalide' }];

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Email invalide',
        data: { errors: [{ champ: '', message: 'Email invalide' }] },
      })
    );
  });

  it('devrait traiter les erreurs de validation Express', () => {
    const error = new Error('Validation error');
    error.name = 'ValidationError';

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Données invalides',
        data: null,
      })
    );
  });

  it('devrait traiter les erreurs 401 Unauthorized', () => {
    const error = new Error('Non autorisé');
    error.name = 'UnauthorizedError';

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Non autorisé'
      })
    );
  });

  it('devrait traiter les erreurs 403 Forbidden', () => {
    const error = new Error('Accès refusé');
    error.status = 403;

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Accès refusé'
      })
    );
  });

  it('devrait traiter les erreurs 404 Not Found', () => {
    const error = new Error('Ressource introuvable');
    error.status = 404;

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Ressource introuvable'
      })
    );
  });

  it('devrait traiter les erreurs Sequelize Unique Constraint', () => {
    const error = new Error('Unique constraint violation');
    error.name = 'SequelizeUniqueConstraintError';
    error.errors = [{ path: 'email' }];

    errorMiddleware(error, req, res, next);

    // Message volontairement générique : préciser le champ en conflit
    // permettrait d'énumérer les emails déjà inscrits.
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Cette ressource existe déjà'
      })
    );
  });

  it('devrait masquer le message d\'erreur en production', () => {
    process.env.NODE_ENV = 'production';
    const error = new Error('Sensitive database error');
    error.status = 500;

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Erreur interne du serveur'
      })
    );
  });

  it('devrait afficher le message d\'erreur en développement', () => {
    process.env.NODE_ENV = 'development';
    const error = new Error('Development error details');
    error.status = 500;

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Development error details'
      })
    );
  });

  it('devrait utiliser le status personnalisé de l\'erreur', () => {
    const error = new Error('Custom error');
    error.status = 418; // I'm a teapot

    errorMiddleware(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(418);
  });
});
