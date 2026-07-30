// Tests du middleware d'authentification.
// Le middleware actuel NE touche PAS la base : il fait confiance au payload JWT
// signé ({ id, role, isActive }) et propage les erreurs via next(AppError).
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../../src/middlewares/auth.middleware');

jest.mock('jsonwebtoken');

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('devrait appeler next() avec un token valide (compte actif)', () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ id: 'user-1', role: 'CLIENT', isActive: true });

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: 'user-1', role: 'CLIENT', isActive: true });
  });

  it('devrait rejeter (401) un token manquant', () => {
    req.headers.authorization = undefined;

    authMiddleware(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err).toBeDefined();
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Token manquant ou invalide');
    expect(req.user).toBeUndefined();
  });

  it('devrait rejeter (401) un token au mauvais format', () => {
    req.headers.authorization = 'InvalidFormat token';

    authMiddleware(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
  });

  it('devrait rejeter (401) un token expiré', () => {
    req.headers.authorization = 'Bearer expired-token';
    jwt.verify.mockImplementation(() => {
      const e = new Error('jwt expired');
      e.name = 'TokenExpiredError';
      throw e;
    });

    authMiddleware(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Token expiré');
  });

  it('devrait rejeter (401) un token invalide', () => {
    req.headers.authorization = 'Bearer bad-token';
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    authMiddleware(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe('Token invalide');
  });

  it('devrait rejeter (403) un compte désactivé', () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ id: 'user-1', role: 'CLIENT', isActive: false });

    authMiddleware(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Compte désactivé. Contactez le support.');
    expect(req.user).toBeUndefined();
  });

  it('devrait attacher { id, role, isActive } à req.user', () => {
    req.headers.authorization = 'Bearer valid-token';
    jwt.verify.mockReturnValue({ id: 'user-42', role: 'ADMIN', isActive: true });

    authMiddleware(req, res, next);

    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('user-42');
    expect(req.user.role).toBe('ADMIN');
    expect(req.user.isActive).toBe(true);
  });
});
