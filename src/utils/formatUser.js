const formatUser = (user) => ({
  id: user.id,
  nom: user.nom,
  prenom: user.prenom,
  email: user.email,
  telephone: user.telephone,
  role: user.role,
  isActive: user.isActive,
  isVerified: user.isVerified,
  avatar: user.avatar,
  // Dashboard : pages autorisées (null = accès complet). Seulement pour un admin.
  ...(user.role === 'ADMIN' ? { permissions: user.permissions ?? null } : {}),
});

module.exports = formatUser;
