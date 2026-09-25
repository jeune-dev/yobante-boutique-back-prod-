/**
 * Gestion des comptes administrateurs depuis le dashboard :
 * route → validation Joi → middleware admin → contrôleur → service.
 *
 * Même approche que vendeur.admin.test.js : les modèles Sequelize sont doublés,
 * les écritures attendues en base sont contrôlées via les appels reçus.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models', () => {
  const transaction = { commit: jest.fn(), rollback: jest.fn() };
  return {
    User: {
      findOne: jest.fn(),
      findByPk: jest.fn(),
      findAndCountAll: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    ProfilVendeur: {},
    Produit: {},
    RefreshToken: { create: jest.fn(), destroy: jest.fn(), update: jest.fn(), findOne: jest.fn() },
    UserOtp: {},
    Adresse: {},
    sequelize: { transaction: jest.fn(async () => transaction), __transaction: transaction },
  };
});

jest.mock('../../src/services/resend.service', () => ({
  sendEmail: jest.fn(async () => ({ success: true, id: 'msg_test' })),
  FROM: 'test',
}));

const { User, RefreshToken, sequelize } = require('../../src/models');
const { sendEmail } = require('../../src/services/resend.service');
const cache = require('../../src/config/cache');
const app = require('../../src/app');
const { jwtConfig } = require('../../src/config/security');

const ID_ADMIN = '11111111-1111-4111-8111-111111111111';
const ID_AUTRE = '33333333-3333-4333-8333-333333333333';

const tokenAdmin = () =>
  jwt.sign({ id: ID_ADMIN, role: 'ADMIN', isActive: true }, jwtConfig.secret, {
    expiresIn: '1h',
  });

const adminAuthentifie = () =>
  User.findByPk.mockResolvedValue({
    id: ID_ADMIN,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
  });

const adminFactice = (surcharges = {}) => {
  const donnees = {
    id: ID_AUTRE,
    nom: 'Ndiaye',
    prenom: 'Awa',
    email: 'awa@yobante.sn',
    telephone: null,
    role: 'ADMIN',
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date('2026-09-01'),
    ...surcharges,
  };
  return {
    ...donnees,
    update: jest.fn(async function (maj) {
      Object.assign(this, maj);
      return this;
    }),
    toJSON() {
      const { update, toJSON, ...reste } = this;
      return reste;
    },
  };
};

const appel = (methode, url) =>
  request(app)[methode](`/api/v1/admin/users${url}`).set('Authorization', `Bearer ${tokenAdmin()}`);

beforeEach(() => {
  jest.clearAllMocks();
  cache.clear();
  sequelize.transaction.mockResolvedValue(sequelize.__transaction);
  sequelize.__transaction.commit.mockResolvedValue(undefined);
  sequelize.__transaction.rollback.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue({ success: true, id: 'msg_test' });
  RefreshToken.update.mockResolvedValue([1]);
});

describe('POST /admin/users/admins — création', () => {
  const corps = { nom: 'Ndiaye', prenom: 'Awa', email: '  AWA@Yobante.SN ' };

  it('crée un admin actif avec mot de passe temporaire et lui envoie ses identifiants', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockImplementation(async (d) => adminFactice(d));

    const res = await appel('post', '/admins').send(corps);

    expect(res.status).toBe(201);
    const cree = User.create.mock.calls[0][0];
    expect(cree.role).toBe('ADMIN');
    expect(cree.isActive).toBe(true);
    expect(cree.mustChangePassword).toBe(true);
    expect(cree.email).toBe('awa@yobante.sn');
    expect(cree.password).toMatch(/^\$2[aby]\$/);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe('awa@yobante.sn');
    expect(mail.html).toContain('administrateur');
    expect(mail.html).toContain('https://admin.yobanterek.com');

    expect(res.body.data.emailEnvoye).toBe(true);
    expect(res.body.data.admin.mustChangePassword).toBe(true);
    expect(res.body.data.admin.statut).toBe('actif');
    expect(res.body.data.admin.password).toBeUndefined();
  });

  it('ignore un mot de passe fourni par le client', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockImplementation(async (d) => adminFactice(d));

    await appel('post', '/admins').send({ ...corps, password: 'Choisi123' });

    expect(User.create.mock.calls[0][0].password).not.toContain('Choisi123');
  });

  it('crée le compte même si l’email échoue, et le signale', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(null);
    User.create.mockImplementation(async (d) => adminFactice(d));
    sendEmail.mockResolvedValue({ success: false, error: 'quota' });

    const res = await appel('post', '/admins').send(corps);

    expect(res.status).toBe(201);
    expect(res.body.data.emailEnvoye).toBe(false);
    expect(res.body.message).toMatch(/n'a pas pu être envoyé/);
  });

  it('refuse un email déjà utilisé', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: 'x' });

    const res = await appel('post', '/admins').send(corps);

    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });

  it('refuse un corps invalide', async () => {
    adminAuthentifie();
    const res = await appel('post', '/admins').send({ nom: 'N', email: 'pas-un-email' });
    expect(res.status).toBe(400);
    expect(User.create).not.toHaveBeenCalled();
  });
});

describe('GET /admin/users/admins — liste', () => {
  it('renvoie les admins avec statut et état du premier mot de passe', async () => {
    adminAuthentifie();
    User.findAndCountAll.mockResolvedValue({
      count: 1,
      rows: [adminFactice({ isActive: false, mustChangePassword: true })],
    });

    const res = await appel('get', '/admins?search=awa&statut=bloque');

    expect(res.status).toBe(200);
    const where = User.findAndCountAll.mock.calls[0][0].where;
    expect(where.role).toBe('ADMIN');
    expect(where.isActive).toBe(false);
    expect(User.findAndCountAll.mock.calls[0][0].attributes).not.toContain('password');
    expect(res.body.data.admins[0]).toMatchObject({
      statut: 'bloque',
      isBlocked: true,
      mustChangePassword: true,
    });
    expect(res.body.data.pagination.total).toBe(1);
  });
});

describe('PUT /admin/users/admins/:id — modification', () => {
  it('met à jour nom, prénom, email et téléphone', async () => {
    adminAuthentifie();
    const cible = adminFactice();
    User.findOne.mockResolvedValueOnce(cible).mockResolvedValueOnce(null);

    const res = await appel('put', `/admins/${ID_AUTRE}`).send({
      nom: 'Diop',
      email: 'Nouvelle@Yobante.sn',
      telephone: '771234567',
    });

    expect(res.status).toBe(200);
    expect(cible.update).toHaveBeenCalledWith({
      nom: 'Diop',
      email: 'nouvelle@yobante.sn',
      telephone: '771234567',
    });
    expect(res.body.data.admin.email).toBe('nouvelle@yobante.sn');
  });

  it('refuse un email pris par un autre compte', async () => {
    adminAuthentifie();
    const cible = adminFactice();
    User.findOne.mockResolvedValueOnce(cible).mockResolvedValueOnce({ id: 'autre' });

    const res = await appel('put', `/admins/${ID_AUTRE}`).send({ email: 'pris@yobante.sn' });

    expect(res.status).toBe(400);
    expect(cible.update).not.toHaveBeenCalled();
  });

  it('404 si l’administrateur n’existe pas', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(null);
    const res = await appel('put', `/admins/${ID_AUTRE}`).send({ nom: 'X' });
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/users/admins/:id/renvoyer-identifiants', () => {
  it('génère un nouveau mot de passe, révoque les sessions et envoie l’email', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(adminFactice({ isActive: false }));
    User.update.mockResolvedValue([1]);

    const res = await appel('post', `/admins/${ID_AUTRE}/renvoyer-identifiants`);

    expect(res.status).toBe(200);
    const [maj, options] = User.update.mock.calls[0];
    expect(maj.password).toMatch(/^\$2[aby]\$/);
    expect(maj.mustChangePassword).toBe(true);
    // Renvoyer les identifiants ne débloque pas le compte.
    expect(maj.isActive).toBeUndefined();
    expect(options.where).toEqual({ id: ID_AUTRE });
    expect(RefreshToken.update).toHaveBeenCalledWith(
      { revoked: true },
      expect.objectContaining({ where: { userId: ID_AUTRE, revoked: false } })
    );
    expect(sendEmail.mock.calls[0][0].to).toBe('awa@yobante.sn');
    expect(res.body.data.emailDest).toBe('awa@yobante.sn');
  });

  it('refuse sur son propre compte', async () => {
    adminAuthentifie();
    const res = await appel('post', `/admins/${ID_ADMIN}/renvoyer-identifiants`);
    expect(res.status).toBe(400);
    expect(User.update).not.toHaveBeenCalled();
  });

  it('signale un email non parti', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce(adminFactice());
    User.update.mockResolvedValue([1]);
    sendEmail.mockResolvedValue({ success: false, error: 'down' });

    const res = await appel('post', `/admins/${ID_AUTRE}/renvoyer-identifiants`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/n'a pas pu être envoyé/);
  });
});

describe('PATCH /admin/users/admins/:id/bloquer | debloquer', () => {
  it('bloque un admin et révoque ses sessions', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_AUTRE, isActive: true });
    User.count.mockResolvedValue(2);
    User.update.mockResolvedValue([1]);

    const res = await appel('patch', `/admins/${ID_AUTRE}/bloquer`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ statut: 'bloque', isBlocked: true });
    expect(User.update.mock.calls[0][0]).toEqual({ isActive: false });
    expect(User.update.mock.calls[0][1].where).toMatchObject({ id: ID_AUTRE, isActive: true });
    expect(RefreshToken.update).toHaveBeenCalled();
  });

  it('refuse de se bloquer soi-même', async () => {
    adminAuthentifie();
    const res = await appel('patch', `/admins/${ID_ADMIN}/bloquer`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/propre compte/);
    expect(User.update).not.toHaveBeenCalled();
  });

  it('refuse de bloquer le dernier administrateur actif', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_AUTRE, isActive: true });
    User.count.mockResolvedValue(1);

    const res = await appel('patch', `/admins/${ID_AUTRE}/bloquer`);
    expect(res.status).toBe(400);
    expect(User.update).not.toHaveBeenCalled();
  });

  it('débloque un admin bloqué sans toucher à ses sessions', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_AUTRE, isActive: false });
    User.update.mockResolvedValue([1]);

    const res = await appel('patch', `/admins/${ID_AUTRE}/debloquer`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ statut: 'actif', isBlocked: false });
    expect(RefreshToken.update).not.toHaveBeenCalled();
  });

  it('signale un admin déjà dans l’état demandé', async () => {
    adminAuthentifie();
    User.findOne.mockResolvedValueOnce({ id: ID_AUTRE, isActive: true });
    User.update.mockResolvedValue([0]);

    const res = await appel('patch', `/admins/${ID_AUTRE}/debloquer`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/déjà actif/);
  });
});

describe('Accès', () => {
  it('refuse un non-administrateur', async () => {
    User.findByPk.mockResolvedValue({ id: 'c', role: 'CLIENT', isActive: true });
    const token = jwt.sign({ id: 'c', role: 'CLIENT', isActive: true }, jwtConfig.secret);
    const res = await request(app)
      .get('/api/v1/admin/users/admins')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
