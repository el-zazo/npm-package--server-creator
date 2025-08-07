/**
 * MySQLModel class for handling CRUD operations with Sequelize models
 */
const { MODEL } = require("../utils/constants");
const { DatabaseError, NotFoundError, ValidationError } = require("../utils/errors");
const { Op } = require("sequelize");

class MySQLModel {
  /**
   * Create a new MySQLModel instance
   * @param {Object} sequelizeModel - Sequelize model
   * @param {String} modelName - Name of the model
   * @param {String} tableName - Name of the table
   * @param {Object} options - Model options
   * @param {Object} options.cache - Cache instance
   */
  constructor(sequelizeModel, modelName, tableName, options) {
    if (!sequelizeModel) {
      throw new ValidationError("Sequelize model is required");
    }
    if (!modelName) {
      throw new ValidationError("Model name is required");
    }

    this.model = sequelizeModel;
    this.modelName = modelName;
    this.collectionName = tableName;
    this.cache = options.cache;
    console.log(`Using MySQL model: ${modelName}`);
  }

  /**
   * Process field selection for Sequelize queries
   * @param {Object} fields - Fields object with field names as keys and 0/1 as values
   * @returns {Array|Object|undefined} - Sequelize attributes configuration
   */
  #processFieldSelection(fields) {
    if (!fields) return undefined;

    // For MySQL, we need to convert the fields object to an array of attributes
    // or an object with include/exclude lists
    if (Object.values(fields).every((val) => val === 1)) {
      // If all values are 1, we're including fields
      return Object.keys(fields);
    } else if (Object.values(fields).every((val) => val === 0)) {
      // If all values are 0, we're excluding fields
      return { exclude: Object.keys(fields) };
    } else {
      // Mixed include/exclude - convert to include list (only include fields with value 1)
      return Object.entries(fields)
        .filter(([_, value]) => value === 1)
        .map(([field]) => field);
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
    const cacheKey = `${this.collectionName}_all_${JSON.stringify(options)}`;

    // Define the function to execute
    const executeQuery = async () => {
      try {
        const { sort, limit, skip, fields } = { ...MODEL.DEFAULT_QUERY_OPTIONS, ...options };

        // Convert sort object to Sequelize format
        const order = [];
        for (const [field, direction] of Object.entries(sort)) {
          order.push([field, direction === 1 ? "ASC" : "DESC"]);
        }

        // Process field selection if provided
        const attributes = this.#processFieldSelection(fields);

        return await this.model.findAll({
          attributes,
          order: order.length > 0 ? order : undefined,
          limit: limit || undefined,
          offset: skip || undefined,
        });
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
    const cacheKey = `${this.collectionName}_id_${id}_${JSON.stringify(fields)}`;

    // Define the function to execute
    const executeQuery = async () => {
      try {
        // Process field selection if provided
        const attributes = this.#processFieldSelection(fields);

        const document = await this.model.findByPk(id, { attributes });
        if (!document) {
          throw new NotFoundError(`Document with ID ${id} not found`, { id, collection: this.modelName });
        }
        return document;
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
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
    // Define the function to execute
    const executeQuery = async () => {
      try {
        const { sort, limit, skip, fields } = { ...MODEL.DEFAULT_QUERY_OPTIONS, ...options };

        // Convert sort object to Sequelize format
        const order = [];
        for (const [field, direction] of Object.entries(sort)) {
          order.push([field, direction === 1 ? "ASC" : "DESC"]);
        }

        // Process field selection if provided
        const attributes = this.#processFieldSelection(fields);

        return await this.model.findAll({
          where: query,
          attributes,
          order: order.length > 0 ? order : undefined,
          limit: limit || undefined,
          offset: skip || undefined,
        });
      } catch (error) {
        throw new DatabaseError(`Error getting documents by query: ${error.message}`, { query, collection: this.modelName });
      }
    };

    // Skip caching for complex queries to avoid excessive memory usage
    const queryStr = JSON.stringify(query);
    if (queryStr.length > 100) {
      return await executeQuery();
    }

    const cacheKey = `${this.collectionName}_query_${queryStr}_${JSON.stringify(options)}`;

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
      if (error.name === "SequelizeValidationError") {
        throw new ValidationError("Document validation failed", {
          errors: error.errors.reduce((acc, err) => {
            acc[err.path] = err.message;
            return acc;
          }, {}),
          collection: this.modelName,
        });
      }
      if (error.name === "SequelizeUniqueConstraintError") {
        throw new ValidationError("Duplicate key error", {
          errors: error.errors.reduce((acc, err) => {
            acc[err.path] = err.message;
            return acc;
          }, {}),
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
      return await this.model.bulkCreate(dataArray);
    } catch (error) {
      if (error.name === "SequelizeValidationError") {
        throw new ValidationError("Documents validation failed", {
          errors: error.errors.reduce((acc, err) => {
            acc[err.path] = err.message;
            return acc;
          }, {}),
          collection: this.modelName,
        });
      }
      if (error.name === "SequelizeUniqueConstraintError") {
        throw new ValidationError("Duplicate key error", {
          errors: error.errors.reduce((acc, err) => {
            acc[err.path] = err.message;
            return acc;
          }, {}),
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
  async updateOneById(id, data, options = {}) {
    try {
      const document = await this.model.findByPk(id);
      if (!document) {
        throw new NotFoundError(`Document with ID ${id} not found`, { id, collection: this.modelName });
      }

      await document.update(data);
      return document;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      if (error.name === "SequelizeValidationError") {
        throw new ValidationError("Document validation failed", {
          errors: error.errors.reduce((acc, err) => {
            acc[err.path] = err.message;
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
        queryFilter[Op.or] = filter.or;
        delete queryFilter.or;
      }

      if (filter.and && Array.isArray(filter.and)) {
        queryFilter[Op.and] = filter.and;
        delete queryFilter.and;
      }

      const [affectedCount] = await this.model.update(data, {
        where: queryFilter,
      });

      return { affectedCount };
    } catch (error) {
      if (error.name === "SequelizeValidationError") {
        throw new ValidationError("Documents validation failed", {
          errors: error.errors.reduce((acc, err) => {
            acc[err.path] = err.message;
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
      const document = await this.model.findByPk(id);
      if (!document) {
        throw new NotFoundError(`Document with ID ${id} not found`, { id, collection: this.modelName });
      }

      await document.destroy();
      return document;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
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
        queryFilter[Op.or] = filter.or;
        delete queryFilter.or;
      }

      if (filter.and && Array.isArray(filter.and)) {
        queryFilter[Op.and] = filter.and;
        delete queryFilter.and;
      }

      const deletedCount = await this.model.destroy({
        where: queryFilter,
      });

      return { deletedCount };
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
        queryFilter[Op.or] = query.or;
        delete queryFilter.or;
      }

      if (query.and && Array.isArray(query.and)) {
        queryFilter[Op.and] = query.and;
        delete queryFilter.and;
      }

      return await this.model.count({
        where: queryFilter,
      });
    } catch (error) {
      throw new DatabaseError(`Error counting documents: ${error.message}`, { query, collection: this.modelName });
    }
  }
}

module.exports = MySQLModel;
