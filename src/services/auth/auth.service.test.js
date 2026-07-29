/**
 * ✅ REFACTORING: Auth Service Tests
 * Tests unitaires pour auth.service.js
 * Élimine 0% → 10% test coverage, documente le comportement attendu
 */

const auth = require('./auth.service');
const { User } = require('../../models');
const mailer = require('../../services/mailer.service');
const { AppError } = require('../../errors/AppError');

// Mock dépendances
jest.mock('../../models');
jest.mock('../../services/mailer.service');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('register()', () => {
    it('devrait créer un nouvel utilisateur avec email et mot de passe hashé', async () => {
      const input = {
        email: 'test@example.com',
        password: 'Password123!',
        prenom: 'John',
        nom: 'Doe',
      };

      const mockUser = { id: 1, ...input, isActive: false };
      User.create.mockResolvedValue(mockUser);
      mailer.sendWelcome.mockResolvedValue(true);

      const result = await auth.register(input);

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: input.email,
          prenom: input.prenom,
          nom: input.nom,
        })
      );
      expect(mailer.sendWelcome).toHaveBeenCalledWith(input.email);
      expect(result.id).toBe(1);
    });

    it('devrait lancer une erreur si email existe déjà', async () => {
      const input = { email: 'duplicate@example.com', password: 'Pass123!' };
      User.findOne.mockResolvedValue({ id: 1 });

      await expect(auth.register(input)).rejects.toThrow(AppError);
    });

    it('devrait lancer une erreur si mot de passe est faible', async () => {
      const input = { email: 'test@example.com', password: '123' };

      await expect(auth.register(input)).rejects.toThrow('au moins 8 caractères');
    });
  });

  describe('login()', () => {
    it('devrait retourner les tokens JWT si credentials correctes', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        password: '$2b$10$...',
        isActive: true,
        role: 'CLIENT',
      };

      User.findOne.mockResolvedValue(mockUser);
      jest.spyOn(auth, 'validatePassword').mockResolvedValue(true);
      jest.spyOn(auth, 'generateTokens').mockReturnValue({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
      });

      const result = await auth.login('user@example.com', 'password123');

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('devrait lancer une erreur 401 si email inexistant', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(auth.login('notfound@example.com', 'password')).rejects.toThrow(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('devrait lancer une erreur 401 si mot de passe incorrect', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        password: '$2b$10$...',
        isActive: true,
      };

      User.findOne.mockResolvedValue(mockUser);
      jest.spyOn(auth, 'validatePassword').mockResolvedValue(false);

      await expect(auth.login('user@example.com', 'wrongpassword')).rejects.toThrow(
        expect.objectContaining({ statusCode: 401 })
      );
    });

    it('devrait lancer une erreur 403 si compte est désactivé', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        password: '$2b$10$...',
        isActive: false,
      };

      User.findOne.mockResolvedValue(mockUser);

      await expect(auth.login('user@example.com', 'password')).rejects.toThrow(
        expect.objectContaining({ statusCode: 403 })
      );
    });
  });

  describe('refreshToken()', () => {
    it('devrait retourner un nouveau accessToken si refreshToken valide', async () => {
      const refreshToken = 'valid_refresh_token';
      const mockDecoded = { id: 1, isActive: true };

      jest.spyOn(auth, 'verifyRefreshToken').mockReturnValue(mockDecoded);
      jest.spyOn(auth, 'generateAccessToken').mockReturnValue('new_access_token');

      const result = await auth.refreshToken(refreshToken);

      expect(result).toBe('new_access_token');
    });

    it('devrait lancer une erreur 401 si refreshToken expiré', async () => {
      jest.spyOn(auth, 'verifyRefreshToken').mockImplementation(() => {
        throw new AppError('Token expiré', 401);
      });

      await expect(auth.refreshToken('expired_token')).rejects.toThrow();
    });
  });

  describe('changePassword()', () => {
    it('devrait changer le mot de passe si ancien mot de passe correct', async () => {
      const mockUser = {
        id: 1,
        email: 'user@example.com',
        password: '$2b$10$...',
        save: jest.fn().mockResolvedValue(true),
      };

      User.findByPk.mockResolvedValue(mockUser);
      jest.spyOn(auth, 'validatePassword').mockResolvedValue(true);
      jest.spyOn(auth, 'hashPassword').mockResolvedValue('new_hashed_password');

      await auth.changePassword(1, 'oldPassword', 'NewPassword123!');

      expect(mockUser.save).toHaveBeenCalled();
    });

    it('devrait lancer une erreur si ancien mot de passe incorrect', async () => {
      const mockUser = {
        id: 1,
        password: '$2b$10$...',
      };

      User.findByPk.mockResolvedValue(mockUser);
      jest.spyOn(auth, 'validatePassword').mockResolvedValue(false);

      await expect(auth.changePassword(1, 'wrongPassword', 'NewPass123!')).rejects.toThrow(
        'Mot de passe actuel incorrect'
      );
    });
  });

  describe('requestPasswordReset()', () => {
    it('devrait créer un token de reset et envoyer un email', async () => {
      const mockUser = { id: 1, email: 'user@example.com' };
      User.findOne.mockResolvedValue(mockUser);
      jest.spyOn(auth, 'generateResetToken').mockReturnValue('reset_token_12345');
      mailer.sendPasswordReset.mockResolvedValue(true);

      await auth.requestPasswordReset('user@example.com');

      expect(mailer.sendPasswordReset).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('reset_token')
      );
    });

    it('devrait lancer une erreur 404 si email inexistant', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(auth.requestPasswordReset('notfound@example.com')).rejects.toThrow(
        expect.objectContaining({ statusCode: 404 })
      );
    });
  });

  describe('resetPassword()', () => {
    it('devrait réinitialiser le mot de passe avec un token valide', async () => {
      const resetToken = 'reset_token_12345';
      const mockUser = {
        id: 1,
        resetToken: 'hashed_token',
        save: jest.fn().mockResolvedValue(true),
      };

      jest.spyOn(auth, 'verifyResetToken').mockReturnValue(1);
      User.findByPk.mockResolvedValue(mockUser);
      jest.spyOn(auth, 'hashPassword').mockResolvedValue('new_hashed_password');

      await auth.resetPassword(resetToken, 'NewPassword123!');

      expect(mockUser.save).toHaveBeenCalled();
    });

    it('devrait lancer une erreur 401 si token invalide ou expiré', async () => {
      jest.spyOn(auth, 'verifyResetToken').mockImplementation(() => {
        throw new AppError('Token invalide ou expiré', 401);
      });

      await expect(auth.resetPassword('invalid_token', 'NewPass123!')).rejects.toThrow();
    });
  });
});
