const { model } = require("mongoose");
const { MODEL } = require("../utils/constants");
const { DatabaseError, NotFoundError, ValidationError } = require("../utils/errors");
const { logger } = require("../utils/logger");

/**
 * Allowlist of safe MongoDB query operators that users are permitted to use.
 * Dangerous operators like $where, $function, $accumulator, etc. are excluded
 * because they can execute arbitrary JavaScript on the database server.
 */
const ALLOWED_MONGO_OPERATORS = new Set([
  "$eq", "$ne", "$gt", "$gte", "$lt", "$lte",
  "$in", "$nin", "$exists", "$type",
  "$size", "$all", "$elemMatch",
  "$or", "$and", "$not", "$nor"
]);

/**
 * Recursively normalize filter objects by converting user-friendly
 * "or"/"and" keys to MongoDB "$or"/"$and" operators. This must run
 * BEFORE sanitizeMongoQuery so that the converted operators are
 * recognized by the allowlist and their nested content gets properly
 * sanitized.
 *
 * @param {*} obj - The filter object to normalize
 * @returns {*} - Normalized filter with "or"/"and" → "$or"/"$and"
 */
const normalizeFilter = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((item) => normalizeFilter(item));
  }
  if (typeof obj !== "object" || obj === null) return obj;

  return Object.keys(obj).reduce((acc, key) => {
    // Convert user-friendly "or"/"and" to MongoDB operators
    const normalizedKey =
      key === "or" ? "$or" :
      key === "and" ? "$and" :
      key;

    acc[normalizedKey] = normalizeFilter(obj[key]);
    return acc;
  }, {});
};

/**
 * Recursively sanitize a MongoDB query object by stripping dangerous "$" operators
 * while preserving safe ones from the allowlist. This prevents NoSQL injection attacks
 * where users inject operators like $where, $function, etc. into query/filter objects.
 * Also sanitizes array elements to prevent bypass via nested objects inside arrays.
 * @param {*} obj - The object to sanitize
 * @returns {*} - Sanitized object with only allowed $ operators preserved
 */
const sanitizeMongoQuery = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeMongoQuery(item));
  }
  if (typeof obj !== "object" || obj === null) return obj;
  return Object.keys(obj).reduce((acc, key) => {
    if (key.startsWith("$") && !ALLOWED_MONGO_OPERATORS.has(key)) {
      return acc; // Strip dangerous MongoDB operators not in allowlist
    }
    acc[key] = sanitizeMongoQuery(obj[key]);
    return acc;
  }, {});
};

/**
 * Model class for handling CRUD operations with Mongoose schemas
 */
class MongoDBModel {
  /**
   * Create a new Model instance
   * @param {Object} schema - Mongoose schema
   * @param {String} modelName - Name of the model
   * @param {String} collectionName - Name of the collection
   * @param {Object} options - Model options
   * @param {Object} options.cache - Cache instance
   */
  constructor(schema, modelName, collectionName, options = {}) {
    if (!schema) {
      throw new ValidationError("Schema is required");
    }
    if (!modelName) {
      throw new ValidationError("Model name is required");
    }

    this.schema = schema;
    this.modelName = modelName;
    this.collectionName = collectionName;
    this.cache = options.cache;

    try {
      // Try to get existing model first
      this.model = model(modelName);
      logger("debug", "Using existing model", { modelName });
    } catch (error) {
      // Model doesn't exist, create a new one
      this.model = model(modelName, schema);
      logger("debug", "Created new model", { modelName });
    }
  }

  /**
   * Get all documents
   * @param {Object} options - Query options (sort, limit, skip, fields)
   * @param {Object} options.sort - Sorting criteria
   * @param {Number} options.limit - Maximum number of documents to return
   * @param {Number} options.skip - Number of documents to skip
   * @param {Object} options.fields - Fields to include or exclude
   * @returns {Promise<Array>} - Array of documents
   */
  async getAll(options = {}) {
    const { sort, limit, skip, fields } = { ...MODEL.DEFAULT_QUERY_OPTIONS, ...options };

    // Create a cache key based on the options
    const cacheKey = `${this.collectionName}::all::${JSON.stringify(sort)}_${limit}_${skip}_${JSON.stringify(fields)}`;

    // Define the function to execute
    const executeQuery = async () => {
      try {
        // Apply field selection if provided
        const query = this.model.find({});

        if (fields) {
          query.select(fields);
        }

        return await query.sort(sort).limit(limit).skip(skip);
      } catch (error) {
        throw new DatabaseError(`Error getting all documents: ${error.message}`, { collection: this.modelName });
      }
    };

    // If cache is available, use it, otherwise execute directly
    return this.cache ? this.cache.getOrCompute(cacheKey, executeQuery) : await executeQuery();
  }

  /**
   * Get one document by ID
   * @param {String} id - Document ID
   * @param {Object} options - Query options (fields)
   * @param {Object} options.fields - Fields to include or exclude
   * @returns {Promise<Object>} - Document
   */
  async getOneById(id, options = {}) {
    const { fields } = options;

    // Create a cache key for this document
    const cacheKey = `${this.collectionName}::id::${id}_${JSON.stringify(fields)}`;

    // Define the function to execute
    const executeQuery = async () => {
      try {
        // Apply field selection if provided
        let query = this.model.findById(id);

        if (fields) {
          query = query.select(fields);
        }

        const document = await query;
        if (!document) {
          throw new NotFoundError(`Document with ID ${id} not found`, { id, collection: this.modelName });
        }
        return document;
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        if (error.name === "CastError") {
          throw new ValidationError(`Invalid ID format: ${id}`, { id, collection: this.modelName });
        }
        throw new DatabaseError(`Error getting document by ID: ${error.message}`, { id, collection: this.modelName });
      }
    };

    // If cache is available, use it, otherwise execute directly
    return this.cache ? this.cache.getOrCompute(cacheKey, executeQuery) : await executeQuery();
  }

  /**
   * Get many documents by query
   * @param {Object} query - Query object
   * @param {Object} options - Query options (sort, limit, skip, fields)
   * @param {Object} options.sort - Sorting criteria
   * @param {Number} options.limit - Maximum number of documents to return
   * @param {Number} options.skip - Number of documents to skip
   * @param {Object} options.fields - Fields to include or exclude
   * @returns {Promise<Array>} - Array of documents
   */
  async getMany(query = {}, options = {}) {
    const { sort, limit, skip, fields } = { ...MODEL.DEFAULT_QUERY_OPTIONS, ...options };

    // Normalize then sanitize query to prevent NoSQL injection
    const sanitizedQuery = sanitizeMongoQuery(normalizeFilter(query));

    // Define the function to execute
    const executeQuery = async () => {
      try {
        // Apply field selection if provided
        let queryBuilder = this.model.find(sanitizedQuery);

        if (fields) {
          queryBuilder = queryBuilder.select(fields);
        }

        return await queryBuilder.sort(sort).limit(limit).skip(skip);
      } catch (error) {
        throw new DatabaseError(`Error getting documents by query: ${error.message}`, { query, collection: this.modelName });
      }
    };

    // Create a cache key based on the query and options
    // Only cache if the query is simple enough (to avoid huge cache keys)
    const queryStr = JSON.stringify(sanitizedQuery);
    if (queryStr.length > 100) {
      // Skip caching for complex queries
      return await executeQuery();
    }

    const cacheKey = `${this.collectionName}::query::${queryStr}_${JSON.stringify(sort)}_${limit}_${skip}_${JSON.stringify(fields)}`;

    // If cache is available, use it, otherwise execute directly
    return this.cache ? this.cache.getOrCompute(cacheKey, executeQuery) : await executeQuery();
  }

  /**
   * Add one document
   * @param {Object} data - Document data
   * @returns {Promise<Object>} - Created document
   */
  async addOne(data) {
    try {
      const document = await this.model.create(data);
      this.cache?.invalidateByPrefix(this.collectionName);
      return document;
    } catch (error) {
      if (error.name === "ValidationError") {
        throw new ValidationError("Document validation failed", {
          errors: Object.keys(error.errors).reduce((acc, key) => {
            acc[key] = error.errors[key].message;
            return acc;
          }, {}),
          collection: this.modelName,
        });
      }
      if (error.code === 11000) {
        throw new ValidationError("Duplicate key error", {
          keyPattern: error.keyPattern,
          keyValue: error.keyValue,
          collection: this.modelName,
        });
      }
      throw new DatabaseError(`Error adding document: ${error.message}`, { collection: this.modelName });
    }
  }

  /**
   * Add many documents
   * @param {Array} dataArray - Array of document data
   * @returns {Promise<Array>} - Array of created documents
   */
  async addMany(dataArray) {
    try {
      const documents = await this.model.insertMany(dataArray);
      this.cache?.invalidateByPrefix(this.collectionName);
      return documents;
    } catch (error) {
      if (error.name === "ValidationError") {
        throw new ValidationError("Documents validation failed", {
          errors: Object.keys(error.errors).reduce((acc, key) => {
            acc[key] = error.errors[key].message;
            return acc;
          }, {}),
          collection: this.modelName,
        });
      }
      if (error.code === 11000) {
        throw new ValidationError("Duplicate key error", {
          keyPattern: error.keyPattern,
          keyValue: error.keyValue,
          collection: this.modelName,
        });
      }
      throw new DatabaseError(`Error adding documents: ${error.message}`, { collection: this.modelName });
    }
  }

  /**
   * Update one document by ID
   * @param {String} id - Document ID
   * @param {Object} data - Update data
   * @param {Object} options - Update options
   * @returns {Promise<Object>} - Updated document
   */
  async updateOneById(id, data, options = { new: true }) {
    try {
      // Wrap in $set to prevent MongoDB operator injection
      const document = await this.model.findByIdAndUpdate(
        id,
        { $set: data },
        { ...options, runValidators: true }
      );
      if (!document) {
        throw new NotFoundError(`Document with ID ${id} not found`, { id, collection: this.modelName });
      }
      this.cache?.invalidateByPrefix(this.collectionName);
      return document;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      if (error.name === "CastError") {
        throw new ValidationError(`Invalid ID format: ${id}`, { id, collection: this.modelName });
      }
      if (error.name === "ValidationError") {
        throw new ValidationError("Document validation failed", {
          errors: Object.keys(error.errors).reduce((acc, key) => {
            acc[key] = error.errors[key].message;
            return acc;
          }, {}),
          collection: this.modelName,
        });
      }
      throw new DatabaseError(`Error updating document by ID: ${error.message}`, { id, collection: this.modelName });
    }
  }

  /**
   * Update many documents by filter
   * @param {Object} filter - Filter object
   * @param {Object} data - Update data
   * @returns {Promise<Object>} - Update result
   */
  async updateManyByFilter(filter, data) {
    try {
      // Normalize then sanitize filter to prevent NoSQL injection
      const queryFilter = sanitizeMongoQuery(normalizeFilter(filter));

      // Wrap in $set to prevent MongoDB operator injection
      const result = await this.model.updateMany(queryFilter, { $set: data });
      this.cache?.invalidateByPrefix(this.collectionName);
      return { affectedCount: result.modifiedCount };
    } catch (error) {
      if (error.name === "ValidationError") {
        throw new ValidationError("Documents validation failed", {
          errors: Object.keys(error.errors).reduce((acc, key) => {
            acc[key] = error.errors[key].message;
            return acc;
          }, {}),
          collection: this.modelName,
        });
      }
      throw new DatabaseError(`Error updating documents by filter: ${error.message}`, { filter, collection: this.modelName });
    }
  }

  /**
   * Delete one document by ID
   * @param {String} id - Document ID
   * @returns {Promise<Object>} - Deleted document
   */
  async deleteOneById(id) {
    try {
      const document = await this.model.findByIdAndDelete(id);
      if (!document) {
        throw new NotFoundError(`Document with ID ${id} not found`, { id, collection: this.modelName });
      }
      this.cache?.invalidateByPrefix(this.collectionName);
      return document;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      if (error.name === "CastError") {
        throw new ValidationError(`Invalid ID format: ${id}`, { id, collection: this.modelName });
      }
      throw new DatabaseError(`Error deleting document by ID: ${error.message}`, { id, collection: this.modelName });
    }
  }

  /**
   * Delete many documents by filter
   * @param {Object} filter - Filter object
   * @returns {Promise<Object>} - Delete result
   */
  async deleteManyByFilter(filter) {
    try {
      // Normalize then sanitize filter to prevent NoSQL injection
      const queryFilter = sanitizeMongoQuery(normalizeFilter(filter));

      const result = await this.model.deleteMany(queryFilter);
      this.cache?.invalidateByPrefix(this.collectionName);
      return { deletedCount: result.deletedCount };
    } catch (error) {
      throw new DatabaseError(`Error deleting documents by filter: ${error.message}`, { filter, collection: this.modelName });
    }
  }

  /**
   * Count documents matching a query
   * @param {Object} query - Query filter
   * @returns {Promise<Number>} - Count of matching documents
   */
  async count(query = {}) {
    try {
      // Normalize then sanitize query to prevent NoSQL injection
      const queryFilter = sanitizeMongoQuery(normalizeFilter(query));

      return await this.model.countDocuments(queryFilter);
    } catch (error) {
      throw new DatabaseError(`Error counting documents: ${error.message}`, { query, collection: this.modelName });
    }
  }
}

module.exports = MongoDBModel;
