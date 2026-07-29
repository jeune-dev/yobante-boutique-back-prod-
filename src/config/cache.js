/**
 * Simple LRU Cache avec TTL
 * Utilisé pour cacher les vérifications utilisateur (auth/admin middlewares)
 */

class SimpleLRUCache {
  constructor(maxSize = 5000) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  /**
   * Set avec expiration TTL en secondes
   */
  set(key, value, ttlSeconds = 30) {
    // Éviter que le cache devienne trop gros
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  /**
   * Get avec vérification d'expiration
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    // Vérifier si expiré
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  /**
   * Vider complètement le cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Taille actuelle du cache
   */
  size() {
    return this.cache.size;
  }
}

// Exporter une instance unique (singleton)
module.exports = new SimpleLRUCache(5000);
