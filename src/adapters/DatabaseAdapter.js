/**
 * Abstract DatabaseAdapter class that defines the interface for database adapters
 */
const Cache = require("../utils/cache");

class DatabaseAdapter {
  /**
   * Create a new DatabaseAdapter instance
   * @param {Object} options - Database adapter options
   * @param {Object} options.cache - Cache options
   * @param {Boolean} options.cache.enabled - Whether caching is enabled
   * @param {Number} options.cache.ttl - Time to live in milliseconds
   * @param {Number} options.cache.maxSize - Maximum number of items in cache
   */
  constructor(options = {}) {
    // Initialize cache
    this.cache = new Cache(options.cache || {});
    
    // Set cache enabled/disabled based on options
    if (options.cache && options.cache.enabled !== undefined) {
      this.cache.setEnabled(options.cache.enabled);
    }
  }
  
  /**
   * Connect to the database
   * @returns {Promise} - Database connection
   */
  async connect() {
    throw new Error("Method not implemented");
  }

  /**
   * Disconnect from the database
   * @returns {Promise} - Disconnect result
   */
  async disconnect() {
    throw new Error("Method not implemented");
  }

  /**
   * Get all collections/tables from the database
   * @returns {Promise<Array>} - Array of collection/table names
   */
  async getAllCollections() {
    // Use cache for collections list
    return this.cache.getOrCompute("all_collections", async () => {
      throw new Error("Method not implemented");
    });
  }

  /**
   * Format collection/table name to model name (singular, PascalCase)
   * @param {String} collectionName - Collection/table name
   * @returns {String} - Formatted model name
   */
  formatModelName(collectionName) {
    // Remove trailing 's' if present (simple pluralization)
    let singular = collectionName.endsWith("s") ? collectionName.slice(0, -1) : collectionName;

    // Convert to PascalCase
    return singular
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  /**
   * Create a model for a collection/table
   * @param {String} collectionName - Collection/table name
   * @param {Object} collectionOptions - Collection/table options
   * @returns {Promise<Object>} - Model instance
   */
  async createModel(collectionName, collectionOptions) {
    throw new Error("Method not implemented");
  }
}

module.exports = DatabaseAdapter;
