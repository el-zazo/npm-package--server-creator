/**
 * MongoDB adapter implementation
 */
const mongoose = require("mongoose");
const DatabaseAdapter = require("./DatabaseAdapter");
const MongoDBModel = require("../models/MongoDBModel");
const { DATABASE } = require("../utils/constants");

class MongoDBAdapter extends DatabaseAdapter {
  /**
   * Create a new MongoDBAdapter instance
   * @param {Object} options - Database connection options
   * @param {String} options.uri - MongoDB connection URI
   * @param {Object} options.connectionOptions - Mongoose connection options
   * @param {Object} options.cache - Cache options
   * @param {Boolean} options.cache.enabled - Whether caching is enabled
   * @param {Number} options.cache.ttl - Time to live in milliseconds
   * @param {Number} options.cache.maxSize - Maximum number of items in cache
   */
  constructor(options = {}) {
    super(options);
    this.uri = options.uri || DATABASE.MONGODB.DEFAULT_URI;
    this.connectionOptions = options.connectionOptions || DATABASE.MONGODB.DEFAULT_OPTIONS;
    this.connection = null;
  }

  /**
   * Connect to the MongoDB database
   * @returns {Promise} - Mongoose connection
   */
  async connect() {
    try {
      this.connection = await mongoose.connect(this.uri, this.connectionOptions);
      console.log(`Connected to MongoDB at ${this.uri}`);
      return this.connection;
    } catch (error) {
      console.error("MongoDB connection error:", error);
      throw new Error(`Failed to connect to MongoDB: ${error.message}`);
    }
  }

  /**
   * Disconnect from the MongoDB database
   * @returns {Promise} - Disconnect result
   */
  async disconnect() {
    try {
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB");
      this.connection = null;
    } catch (error) {
      console.error("MongoDB disconnection error:", error);
      throw new Error(`Failed to disconnect from MongoDB: ${error.message}`);
    }
  }

  /**
   * Get all collections from the database
   * @returns {Promise<Array>} - Array of collection names
   */
  async getAllCollections() {
    return this.cache.getOrCompute("all_collections", async () => {
      try {
        if (!this.connection) {
          await this.connect();
        }

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        return collections.map((collection) => collection.name);
      } catch (error) {
        console.error("Error getting collections:", error);
        throw new Error(`Failed to get collections: ${error.message}`);
      }
    });
  }

  /**
   * Create a model for a collection
   * @param {String} collectionName - Collection name
   * @param {Object} collectionOptions - Collection options
   * @returns {Promise<Object>} - MongoDBModel instance
   */
  async createModel(collectionName, collectionOptions) {
    const cacheKey = `model_${collectionName}`;
    return this.cache.getOrCompute(cacheKey, async () => {
      try {
        // Create schema or use provided schema
        let schema;
        if (collectionOptions?.schema) {
          schema = collectionOptions.schema;
        } else {
          // Create a schema with strict: false if no schema provided
          schema = new mongoose.Schema({}, { strict: false, collection: collectionName, versionKey: false });
        }

        // Create model
        const modelName = collectionOptions?.modelName || this.formatModelName(collectionName);
        return new MongoDBModel(schema, modelName, collectionName, { cache: this.cache });
      } catch (error) {
        console.error(`Error creating model for collection ${collectionName}:`, error);
        throw new Error(`Failed to create model for collection ${collectionName}: ${error.message}`);
      }
    });
  }
}

module.exports = MongoDBAdapter;
