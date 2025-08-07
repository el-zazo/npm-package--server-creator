const { model } = require("mongoose");
const { MODEL } = require("../utils/constants");
const { DatabaseError, NotFoundError, ValidationError } = require("../utils/errors");

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
      console.log(`Using existing model: ${modelName}`);
    } catch (error) {
      // Model doesn't exist, create a new one
      this.model = model(modelName, schema);
      console.log(`Created new model: ${modelName}`);
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
    const cacheKey = `${this.collectionName}_all_${JSON.stringify(sort)}_${limit}_${skip}_${JSON.stringify(fields)}`;

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
    const cacheKey = `${this.collectionName}_id_${id}_${JSON.stringify(fields)}`;

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

    // Define the function to execute
    const executeQuery = async () => {
      try {
        // Apply field selection if provided
        let queryBuilder = this.model.find(query);

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
    const queryStr = JSON.stringify(query);
    if (queryStr.length > 100) {
      // Skip caching for complex queries
      return await executeQuery();
    }

    const cacheKey = `${this.collectionName}_query_${queryStr}_${JSON.stringify(sort)}_${limit}_${skip}_${JSON.stringify(fields)}`;

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
      return await this.model.create(data);
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
      return await this.model.insertMany(dataArray);
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
      const document = await this.model.findByIdAndUpdate(id, data, options);
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
      // Handle complex filters with 'or' and 'and' operators
      let queryFilter = { ...filter };

      if (filter.or && Array.isArray(filter.or)) {
        queryFilter.$or = filter.or;
        delete queryFilter.or;
      }

      if (filter.and && Array.isArray(filter.and)) {
        queryFilter.$and = filter.and;
        delete queryFilter.and;
      }

      return await this.model.updateMany(queryFilter, data);
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
      // Handle complex filters with 'or' and 'and' operators
      let queryFilter = { ...filter };

      if (filter.or && Array.isArray(filter.or)) {
        queryFilter.$or = filter.or;
        delete queryFilter.or;
      }

      if (filter.and && Array.isArray(filter.and)) {
        queryFilter.$and = filter.and;
        delete queryFilter.and;
      }

      return await this.model.deleteMany(queryFilter);
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
      // Handle complex filters with 'or' and 'and' operators
      let queryFilter = { ...query };

      if (query.or && Array.isArray(query.or)) {
        queryFilter.$or = query.or;
        delete queryFilter.or;
      }

      if (query.and && Array.isArray(query.and)) {
        queryFilter.$and = query.and;
        delete queryFilter.and;
      }

      return await this.model.countDocuments(queryFilter);
    } catch (error) {
      throw new DatabaseError(`Error counting documents: ${error.message}`, { query, collection: this.modelName });
    }
  }
}

module.exports = MongoDBModel;
