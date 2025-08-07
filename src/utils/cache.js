/**
 * Cache utility for database operations
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
   * Get a value from the cache
   * @param {String} key - Cache key
   * @returns {*} - Cached value or undefined if not found
   */
  get(key) {
    if (!this.enabled) return undefined;

    const item = this.cache.get(key);
    if (!item) return undefined;

    // Check if item has expired
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * Set a value in the cache
   * @param {String} key - Cache key
   * @param {*} value - Value to cache
   * @param {Number} ttl - Optional custom TTL for this item
   */
  set(key, value, ttl) {
    if (!this.enabled) return;

    // If cache is at max size, remove oldest item
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const expiry = Date.now() + (ttl || this.ttl);
    this.cache.set(key, { value, expiry });
  }

  /**
   * Delete a value from the cache
   * @param {String} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get a value from the cache or compute it if not found
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

    const computedValue = await computeFn();
    this.set(key, computedValue, ttl);
    return computedValue;
  }
}

module.exports = Cache;
