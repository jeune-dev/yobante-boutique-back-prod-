/**
 * PostgreSQL advisory locks — verrous de session non-transactionnels.
 *
 * Utilisé pour sérialiser des opérations critiques (passage de commande,
 * validation en deux étapes) sans bloquer toute la table.
 *
 * pg_try_advisory_lock  → non-bloquant, retourne false si déjà vérouillé
 * pg_advisory_unlock    → libère le verrou
 *
 * La clé doit être un BIGINT PostgreSQL. On hache l'identifiant (UUID ou string)
 * en un entier 32 bits signé pour rester dans les bornes du type.
 * ✅ PERF: Cache LRU pour éviter de recalculer le hash à chaque fois
 */
const { sequelize } = require('../models');
const { AppError } = require('../errors/AppError');

const MESSAGE_OCCUPE =
  'Une opération est déjà en cours pour ce compte. Réessayez dans quelques secondes.';

const lockKeyCache = new Map();
const MAX_CACHE_SIZE = 10000;

function _hashKey(key) {
  const strKey = String(key);

  // ✅ PERF: Vérifier le cache d'abord
  if (lockKeyCache.has(strKey)) {
    return lockKeyCache.get(strKey);
  }

  // Utiliser un simple hash au lieu de SHA256 (plus rapide, suffisant)
  // PostgreSQL accepte BIGINT pour advisory locks
  let hash = 0;
  for (let i = 0; i < strKey.length; i++) {
    const char = strKey.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convertir à 32-bit int signé
  }

  // ✅ PERF: Limiter la taille du cache
  if (lockKeyCache.size >= MAX_CACHE_SIZE) {
    const firstKey = lockKeyCache.keys().next().value;
    lockKeyCache.delete(firstKey);
  }

  lockKeyCache.set(strKey, hash);
  return hash;
}

/**
 * Essaie d'acquérir le verrou. Lance une AppError 429 si déjà pris.
 * À appeler en début d'opération ; appeler `release` en finally.
 */
async function acquire(key) {
  const lockKey = _hashKey(key);
  const [{ pg_try_advisory_lock: ok }] = await sequelize.query(
    `SELECT pg_try_advisory_lock(:key)`,
    { replacements: { key: lockKey }, type: sequelize.QueryTypes.SELECT }
  );
  if (!ok) {
    throw new AppError(MESSAGE_OCCUPE, 429);
  }
  return lockKey;
}

async function release(lockKey) {
  try {
    await sequelize.query(`SELECT pg_advisory_unlock(:key)`, {
      replacements: { key: lockKey },
      type: sequelize.QueryTypes.SELECT,
    });
  } catch (_) {
    // Libération best-effort — ne jamais lever ici
  }
}

/**
 * Verrou de TRANSACTION : pris sur la connexion de `transaction`, libéré par
 * PostgreSQL au COMMIT/ROLLBACK. À préférer à `acquire`/`release` : ces
 * derniers passent par le pool, et le déverrouillage peut atterrir sur une
 * autre connexion que celle qui détient le verrou (verrou orphelin qui bloque
 * ensuite les opérations suivantes du même compte).
 * Lance une AppError 429 si le verrou est déjà pris.
 */
async function acquireXact(key, transaction) {
  const [row] = await sequelize.query(`SELECT pg_try_advisory_xact_lock(:key) AS ok`, {
    replacements: { key: _hashKey(key) },
    type: sequelize.QueryTypes.SELECT,
    transaction,
  });
  if (!row || !row.ok) throw new AppError(MESSAGE_OCCUPE, 429);
}

module.exports = { acquire, release, acquireXact };
