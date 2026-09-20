// tests/unit/services/auth.service.test.js

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userFixture = require('../../fixtures/user.fixture');

// Mock les dépendances AVANT d'importer le service
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');

// Mock sequelize
const mockTransaction = {
  rollback: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined)
};

const mockSequelize = {
  transaction: jest.fn().mockResolvedValue(mockTransaction)
};

const mockUser = {
  findOne: jest.fn(),
  findByPk: jest.fn(),
  create: jest.fn()
};

const mockRefreshToken = {
  findOne: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
  update: jest.fn()
};

const mockUserOtp = {
  findOne: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn()
};

jest.mock('../../../src/models', () => ({
  User: mockUser,
  RefreshToken: mockRefreshToken,
  UserOtp: mockUserOtp,
  sequelize: mockSequelize
}));

jest.mock('../../../src/utils/mailer');

const AuthService = require('../../../src/services/auth.service');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.rollback.mockClear();
    mockTransaction.commit.mockClear();
  });

  describe('register', () => {
    it('devrait enregistrer un utilisateur avec données valides', async () => {
      const { registerData } = userFixture;
      const hashedPassword = '$2a$12$hashedpassword';

      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findOne.mockResolvedValue(null);
      mockUser.create.mockResolvedValue({
        ...registerData,
        id: 'generated-id',
        password: hashedPassword,
        role: 'CLIENT',
        isVerified: true
      });

      bcrypt.hash.mockResolvedValue(hashedPassword);

      const result = await AuthService.register(registerData);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Inscription réussie');
      // Les textes du message de succès viennent du backend, affichés tels
      // quels par le mobile.
      expect(result.messageDescription).toBe(
        'Veuillez vous connecter pour accéder à votre dashboard.'
      );
      expect(result.user).toBeDefined();
      // Pas d'auto-connexion : aucun token n'est renvoyé à l'inscription.
      expect(result.token).toBeUndefined();
      expect(mockUser.create).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith(registerData.password, 12);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('email déjà utilisé : ne crée pas de compte et renvoie un message explicite', async () => {
      const { registerData } = userFixture;

      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findOne.mockResolvedValue(userFixture.validUser);

      const result = await AuthService.register(registerData);

      // Décision produit : on révèle l'existence du compte pour guider
      // l'utilisateur vers la connexion. Le contrôleur transforme ce
      // `success: false` en erreur 400 affichée telle quelle par le mobile.
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Un compte existe déjà avec cet email. Veuillez vous connecter.'
      );
      expect(mockUser.create).not.toHaveBeenCalled();
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    it('devrait nettoyer l\'email (trim et lowercase)', async () => {
      const data = {
        ...userFixture.registerData,
        email: '  JOHN.DOE@EXAMPLE.COM  '
      };

      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findOne.mockResolvedValue(null);
      bcrypt.hash.mockResolvedValue('hashedpwd');
      mockUser.create.mockResolvedValue({ ...data, password: 'hashedpwd' });

      await AuthService.register(data);

      expect(mockUser.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email: 'john.doe@example.com'
          })
        })
      );
    });
  });

  describe('login', () => {
    it('devrait connecter un utilisateur avec email et mot de passe valides', async () => {
      const { validUser } = userFixture;
      const token = 'access-token';
      const refreshToken = 'refresh-token';

      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findOne.mockResolvedValue(validUser);
      bcrypt.compare.mockResolvedValue(true);
      mockRefreshToken.create.mockResolvedValue({});
      mockRefreshToken.destroy.mockResolvedValue(undefined);
      
      // Le service signe l'access token en premier, puis le refresh token.
      jwt.sign.mockReturnValueOnce(token).mockReturnValueOnce(refreshToken);
      jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await AuthService.login({
        identifiant: validUser.email,
        password: 'password123'
      });

      expect(result.success).toBe(true);
      expect(result.token).toBe(token);
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', validUser.password);
    });

    it('devrait refuser un mot de passe incorrect', async () => {
      const { validUser } = userFixture;
      mockUser.findOne.mockResolvedValue(validUser);
      bcrypt.compare.mockResolvedValue(false);

      const result = await AuthService.login({
        identifiant: validUser.email,
        password: 'wrongpassword'
      });

      expect(result.success).toBe(false);
    });

    it('devrait refuser un utilisateur inactif', async () => {
      const { inactiveUser } = userFixture;
      mockUser.findOne.mockResolvedValue(inactiveUser);

      const result = await AuthService.login({
        identifiant: inactiveUser.email,
        password: 'password123'
      });

      expect(result.success).toBe(false);
    });

    // Dashboard web : `roleAttendu: 'ADMIN'` ferme la porte aux vendeurs et
    // clients, même avec de bons identifiants.
    it('roleAttendu ADMIN : refuse un compte CLIENT avec un code dédié', async () => {
      const { validUser } = userFixture;
      mockUser.findOne.mockResolvedValue(validUser);
      bcrypt.compare.mockResolvedValue(true);

      const result = await AuthService.login({
        identifiant: validUser.email,
        password: 'password123',
        roleAttendu: 'ADMIN'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('ROLE_NON_AUTORISE');
      // Aucune session ne doit avoir été ouverte.
      expect(mockRefreshToken.create).not.toHaveBeenCalled();
    });

    it('roleAttendu ADMIN : ne révèle pas le rôle si le mot de passe est faux', async () => {
      const { validUser } = userFixture;
      mockUser.findOne.mockResolvedValue(validUser);
      bcrypt.compare.mockResolvedValue(false);

      const result = await AuthService.login({
        identifiant: validUser.email,
        password: 'wrongpassword',
        roleAttendu: 'ADMIN'
      });

      expect(result.success).toBe(false);
      expect(result.code).toBeUndefined();
    });

    it('roleAttendu ADMIN : connecte un administrateur', async () => {
      const { validAdmin } = userFixture;
      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findOne.mockResolvedValue(validAdmin);
      bcrypt.compare.mockResolvedValue(true);
      mockRefreshToken.create.mockResolvedValue({});
      mockRefreshToken.destroy.mockResolvedValue(undefined);
      jwt.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      jwt.decode.mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 });

      const result = await AuthService.login({
        identifiant: validAdmin.email,
        password: 'password123',
        roleAttendu: 'ADMIN'
      });

      expect(result.success).toBe(true);
      expect(result.token).toBe('access-token');
    });
  });

  describe('refresh', () => {
    it('devrait refuser un refresh token invalide', async () => {
      mockRefreshToken.findOne.mockResolvedValue(null);
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await AuthService.refresh({ refreshToken: 'invalid-token' });

      expect(result.success).toBe(false);
    });
  });

  describe('changePassword', () => {
    it('devrait changer le mot de passe avec l\'ancien mot de passe correct', async () => {
      const userId = userFixture.validUser.id;
      const oldPassword = 'oldPassword123';
      const newPassword = 'newPassword456';

      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findByPk.mockResolvedValue({
        ...userFixture.validUser,
        update: jest.fn().mockResolvedValue(true),
      });
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('hashed-new-password');

      const result = await AuthService.changePassword(userId, oldPassword, newPassword);

      expect(result.success).toBe(true);
      expect(bcrypt.hash).toHaveBeenCalledWith(newPassword, 12);
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('devrait refuser un ancien mot de passe incorrect', async () => {
      const userId = userFixture.validUser.id;

      mockSequelize.transaction.mockResolvedValue(mockTransaction);
      mockUser.findByPk.mockResolvedValue(userFixture.validUser);
      bcrypt.compare.mockResolvedValue(false);

      const result = await AuthService.changePassword(userId, 'wrong', 'newPassword');

      expect(result.success).toBe(false);
    });
  });
});
