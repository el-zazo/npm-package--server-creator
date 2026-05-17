/**
 * Cache utility for database operations
 * Implements LRU (Least Recently Used) eviction strategy using Map insertion order.
 * On every get(), the accessed item is moved to the end of the Map,
 * ensuring the first item is always the least recently used candidate for eviction.
 */
const { DATABASE } = require("./constants");

class Cache {
  /**
   * Create a new Cache instance
   * @param {Object} options - Cache options
   * @param {Boolean} options.enabled - Whether caching is enabled (default: true)
   * @param {Number} options.ttl - Time to live in milliseconds (default: 5 minutes)
   * @param {Number} options.maxSize - Maximum number of items in cache (default: 100)
   */
  constructor(options = {}) {
    this.ttl = options.ttl || DATABASE.CACHE.DEFAULT_TTL;
    this.maxSize = options.maxSize || DATABASE.CACHE.DEFAULT_MAX_SIZE;
    this.cache = new Map();
    this.prefixIndex = new Map(); // prefix → Set of keys, for O(1) prefix-based invalidation
    this.pending = new Map(); // key → Promise, for thundering herd deduplication
    this._cancelledKeys = new Set(); // Pending keys whose results should NOT be cached (invalidated mid-flight)
    this.enabled = options.enabled !== undefined ? options.enabled : DATABASE.CACHE.DEFAULT_ENABLED;
  }

  /**
   * Enable or disable the cache
   * @param {Boolean} enabled - Whether the cache is enabled
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Get a value from the cache.
   * LRU: moves the accessed item to the end of the Map (most recently used).
   * @param {String} key - Cache key
   * @returns {*} - Cached value or undefined if not found
   */
  get(key) {
    if (!this.enabled) return undefined;

    const item = this.cache.get(key);
    if (!item) return undefined;

    // Check if item has expired
    if (Date.now() > item.expiry) {
      this.delete(key);
      return undefined;
    }

    // LRU: move to end (most recently used) by reinserting
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.value;
  }

  /**
   * Set a value in the cache.
   * LRU: if the key already exists, it is moved to the end.
   * If the cache is at max size, the least recently used item (first in Map) is evicted.
   * @param {String} key - Cache key
   * @param {*} value - Value to cache
   * @param {Number} ttl - Optional custom TTL for this item
   */
  set(key, value, ttl) {
    if (!this.enabled) return;

    // If key already exists, remove it so reinsert places it at the end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item in Map)
      const lruKey = this.cache.keys().next().value;
      this.delete(lruKey);
    }

    // Update prefix index
    // Use "::" as dedicated prefix separator — "_" is unsafe because
    // collection names can contain underscores (e.g. "user_sessions"),
    // causing split("_")[0] to extract the wrong prefix.
    const prefix = key.split("::")[0];
    if (!this.prefixIndex.has(prefix)) {
      this.prefixIndex.set(prefix, new Set());
    }
    this.prefixIndex.get(prefix).add(key);

    const expiry = Date.now() + (ttl || this.ttl);
    this.cache.set(key, { value, expiry });
  }

  /**
   * Delete a value from the cache and remove it from the prefix index.
   * @param {String} key - Cache key
   */
  delete(key) {
    // Remove from prefix index
    const prefix = key.split("::")[0];
    const prefixSet = this.prefixIndex.get(prefix);
    if (prefixSet) {
      prefixSet.delete(key);
      // Clean up empty prefix sets to avoid memory leaks
      if (prefixSet.size === 0) {
        this.prefixIndex.delete(prefix);
      }
    }
    this.cache.delete(key);
  }

  /**
   * Clear the entire cache and prefix index.
   */
  clear() {
    this.cache.clear();
    this.prefixIndex.clear();
    this._cancelledKeys.clear();
  }

  /**
   * Invalidate all cache entries whose key starts with the given prefix.
   * Uses the prefix index for O(k) lookup where k = number of keys with
   * that prefix, instead of scanning all cache keys (O(n)).
   * Also cancels any in-flight pending computations for the affected prefix
   * to prevent stale data from being re-cached after invalidation.
   * Used after write operations (create, update, delete) to ensure stale
   * data is never served for the affected collection.
   * @param {String} prefix - Key prefix to match (typically the collection name)
   */
  invalidateByPrefix(prefix) {
    const keys = this.prefixIndex.get(prefix);
    if (keys) {
      for (const key of keys) {
        this.cache.delete(key);
      }
      this.prefixIndex.delete(prefix);
    }

    // Mark in-flight pending computations for this prefix as cancelled.
    // They will still resolve for their original callers, but their results
    // will NOT be stored in the cache. This prevents stale data from being
    // re-cached after invalidation.
    // NOTE: We must always scan pending, even if prefixIndex had no entries,
    // because a pending computation may not have called set() yet (and thus
    // its key is not in prefixIndex). The pending Map is typically small
    // (only in-flight queries), so a linear scan is acceptable.
    for (const pendingKey of this.pending.keys()) {
      if (pendingKey.startsWith(prefix + "::")) {
        this._cancelledKeys.add(pendingKey);
      }
    }
  }

  /**
   * Get a value from the cache or compute it if not found.
   * Implements thundering herd protection: if a computation for the same key
   * is already in progress, the same Promise is returned to all callers,
   * preventing duplicate concurrent computations.
   * @param {String} key - Cache key
   * @param {Function} computeFn - Function to compute the value if not in cache
   * @param {Number} ttl - Optional custom TTL for this item
   * @returns {Promise<*>} - Cached or computed value
   */
  async getOrCompute(key, computeFn, ttl) {
    if (!this.enabled) return await computeFn();

    const cachedValue = this.get(key);
    if (cachedValue !== undefined) {
      return cachedValue;
    }

    // Thundering herd: if a computation for this key is already in progress,
    // return the same Promise to avoid duplicate work
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }

    const computePromise = (async () => {
      try {
        const computedValue = await computeFn();
        // Only cache the result if this key was not invalidated while
        // the computation was in-flight. If it was invalidated, skip
        // caching to prevent stale data from re-entering the cache.
        if (!this._cancelledKeys.has(key)) {
          this.set(key, computedValue, ttl);
        } else {
          this._cancelledKeys.delete(key);
        }
        return computedValue;
      } finally {
        this.pending.delete(key);
        // Clean up cancelled key if computation failed before reaching
        // the else-branch above. Prevents slow memory leak in _cancelledKeys.
        this._cancelledKeys.delete(key);
      }
    })();

    this.pending.set(key, computePromise);
    return computePromise;
  }
}

module.exports = Cache;
