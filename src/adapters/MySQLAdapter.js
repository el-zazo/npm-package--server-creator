/**
 * MySQL adapter implementation using Sequelize
 */
const { Sequelize, DataTypes } = require("sequelize");
const DatabaseAdapter = require("./DatabaseAdapter");
const MySQLModel = require("../models/MySQLModel");
const { DATABASE } = require("../utils/constants");
const { ValidationError } = require("../utils/errors");

class MySQLAdapter extends DatabaseAdapter {
  /**
   * Create a new MySQLAdapter instance
   * @param {Object} options - Database connection options
   * @param {String} options.host - MySQL host
   * @param {Number} options.port - MySQL port
   * @param {String} options.database - MySQL database name
   * @param {String} options.username - MySQL username
   * @param {String} options.password - MySQL password
   * @param {Object} options.connectionOptions - Sequelize connection options
   * @param {Object} options.cache - Cache options
   * @param {Boolean} options.cache.enabled - Whether caching is enabled
   * @param {Number} options.cache.ttl - Time to live in milliseconds
   * @param {Number} options.cache.maxSize - Maximum number of items in cache
   */
  constructor(options = {}) {
    super(options);
    this.host = options.host || DATABASE.MYSQL.DEFAULT_HOST;
    this.port = options.port || DATABASE.MYSQL.DEFAULT_PORT;
    this.database = options.database || DATABASE.MYSQL.DEFAULT_DATABASE;
    this.username = options.username || DATABASE.MYSQL.DEFAULT_USERNAME;
    this.password = options.password || DATABASE.MYSQL.DEFAULT_PASSWORD;
    this.connectionOptions = options.connectionOptions || DATABASE.MYSQL.DEFAULT_OPTIONS;
    this.sequelize = null;
    this.models = {};
  }

  /**
   * Connect to the MySQL database
   * @returns {Promise} - Sequelize connection
   */
  async connect() {
    try {
      this.sequelize = new Sequelize(this.database, this.username, this.password, {
        host: this.host,
        port: this.port,
        dialect: "mysql",
        logging: console.log,
        ...this.connectionOptions,
      });

      await this.sequelize.authenticate();
      console.log(`Connected to MySQL at ${this.host}:${this.port}/${this.database}`);
      return this.sequelize;
    } catch (error) {
      console.error("MySQL connection error:", error);
      throw new Error(`Failed to connect to MySQL: ${error.message}`);
    }
  }

  /**
   * Disconnect from the MySQL database
   * @returns {Promise} - Disconnect result
   */
  async disconnect() {
    try {
      if (this.sequelize) {
        await this.sequelize.close();
        console.log("Disconnected from MySQL");
        this.sequelize = null;
      }
    } catch (error) {
      console.error("MySQL disconnection error:", error);
      throw new Error(`Failed to disconnect from MySQL: ${error.message}`);
    }
  }

  /**
   * Get all tables from the database
   * @returns {Promise<Array>} - Array of table names
   */
  async getAllCollections() {
    return this.cache.getOrCompute("all_collections", async () => {
      try {
        if (!this.sequelize) {
          await this.connect();
        }

        const [results] = await this.sequelize.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = '${this.database}'`);
        return results.map((result) => result.table_name || result.TABLE_NAME);
      } catch (error) {
        console.error("Error getting tables:", error);
        throw new Error(`Failed to get tables: ${error.message}`);
      }
    });
  }

  /**
   * Create a model for a table
   * @param {String} tableName - Table name
   * @param {Object} tableOptions - Table options
   * @returns {Promise<Object>} - Model instance
   */
  async createModel(tableName, tableOptions) {
    const cacheKey = `model_${tableName}`;
    return this.cache.getOrCompute(cacheKey, async () => {
      try {
        if (!this.sequelize) {
          await this.connect();
        }

        // Create schema or use provided schema
        let schema;
        if (tableOptions?.schema) {
          schema = tableOptions.schema;
        } else {
          // Get table structure from database
          const [columns] = await this.sequelize.query(`SHOW COLUMNS FROM ${tableName}`);

          // Create a schema based on table structure
          schema = {};
          columns.forEach((column) => {
            const columnName = column.Field || column.field;
            const columnType = column.Type || column.type;
            const isNullable = (column.Null || column.null) === "YES";
            const isPrimaryKey = (column.Key || column.key) === "PRI";
            const defaultValue = column.Default || column.default;
            const isAutoIncrement = (column.Extra || column.extra || "").toLowerCase().includes("auto_increment");

            // Map MySQL types to Sequelize types
            let dataType;
            if (columnType.includes("int")) {
              dataType = DataTypes.INTEGER;
            } else if (columnType.includes("varchar") || columnType.includes("text")) {
              dataType = DataTypes.STRING;
            } else if (columnType.includes("date")) {
              dataType = DataTypes.DATE;
            } else if (columnType.includes("decimal") || columnType.includes("float") || columnType.includes("double")) {
              dataType = DataTypes.FLOAT;
            } else if (columnType.includes("boolean") || columnType.includes("tinyint(1)")) {
              dataType = DataTypes.BOOLEAN;
            } else {
              dataType = DataTypes.STRING; // Default to STRING for unknown types
            }

            schema[columnName] = {
              type: dataType,
              allowNull: isNullable,
              primaryKey: isPrimaryKey,
              defaultValue: defaultValue === "NULL" ? null : defaultValue,
              autoIncrement: isAutoIncrement,
            };

            // Remove defaultValue for auto-increment fields as it's handled by the database
            if (isAutoIncrement) {
              delete schema[columnName].defaultValue;
            }
          });
        }

        // Create model
        const modelName = tableOptions?.modelName || this.formatModelName(tableName);
        const sequelizeModel = this.sequelize.define(modelName, schema, {
          tableName,
          timestamps: false, // Disable timestamps by default
          ...tableOptions?.modelOptions,
        });

        return new MySQLModel(sequelizeModel, modelName, tableName, { cache: this.cache });
      } catch (error) {
        console.error(`Error creating model for table ${tableName}:`, error);
        throw new Error(`Failed to create model for table ${tableName}: ${error.message}`);
      }
    });
  }
}

module.exports = MySQLAdapter;
