/**
 * DB class for handling database connections and auto-generating models and routers
 */
const express = require("express");
const Router = require("./Router");
const Server = require("./Server");
const MongoDBAdapter = require("./adapters/MongoDBAdapter");
const MySQLAdapter = require("./adapters/MySQLAdapter");
const { DATABASE, COLLECTION_ACCESS } = require("./utils/constants");
const { ValidationError, AccessDeniedError } = require("./utils/errors");
const { authMiddleware } = require("./middleware/auth");
const { loggerMiddleware } = require("./middleware/logger");

class DB {
  /**
   * Create a new DB instance
   * @param {Object} options - Database connection options
   * @param {String} options.dbType - Database type ('mongodb' or 'mysql', default: 'mongodb')
   * @param {Object} options.adapterConfig - Configuration for the database adapter
   * @param {Object} options.adapterConfig.mongodb
   * @param {String} options.adapterConfig.mongodb.uri - MongoDB connection URI
   * @param {Object} options.adapterConfig.mongodb.connectionOptions - Mongoose connection options
   * @param {Object} options.adapterConfig.mongodb.cache - Cache options
   * @param {Boolean} options.adapterConfig.mongodb.cache.enabled - Whether caching is enabled
   * @param {Number} options.adapterConfig.mongodb.cache.ttl - Time to live in milliseconds
   * @param {Number} options.adapterConfig.mongodb.cache.maxSize - Maximum number of items in cache
   * @param {Object} options.adapterConfig.mysql
   * @param {String} options.adapterConfig.mysql.host - MySQL host
   * @param {Number} options.adapterConfig.mysql.port - MySQL port
   * @param {String} options.adapterConfig.mysql.database - MySQL database name
   * @param {String} options.adapterConfig.mysql.username - MySQL username
   * @param {String} options.adapterConfig.mysql.password - MySQL password
   * @param {Object} options.adapterConfig.mysql.connectionOptions - MySQL connection options
   * @param {Object} options.adapterConfig.mysql.cache - Cache options
   * @param {Boolean} options.adapterConfig.mysql.cache.enabled - Whether caching is enabled
   * @param {Number} options.adapterConfig.mysql.cache.ttl - Time to live in milliseconds
   * @param {Number} options.adapterConfig.mysql.cache.maxSize - Maximum number of items in cache
   * @param {Object} options.collections - Collection configuration options
   * @param {Object} options.routerOptions - Global router options (applied to all collections unless overridden)
   * @param {Array} options.routerOptions.routes - Routes to initialize (default: all routes)
   * @param {Array} options.routerOptions.middleware - Middleware to apply to all routes
   * @param {Object} options.routerOptions.auth - Authentication configuration
   * @param {Object} options.routerOptions.auth.keys - Authentication keys configuration
   * @param {String} options.routerOptions.auth.keys.identifiantKey - Field name for user identifier (default: 'email')
   * @param {String} options.routerOptions.auth.keys.passwordKey - Field name for password (default: 'password')
   * @param {Array} options.routerOptions.auth.routes - Custom auth routes to add (default: ['login', 'register'])
   * @param {Array|Boolean} options.routerOptions.auth.protectedRoutes - Routes that require authentication
   * @param {Object} options.routerOptions.auth.collectionAccess - Collection-based access control configuration
   * @param {Boolean} options.routerOptions.auth.collectionAccess.accessDefault - Default access for collections not specified (default: true)
   * @param {Object} options.routerOptions.auth.collectionAccess.collections - Collection-specific access rules
   * @param {Object} options.routerOptions.auth.authMiddlewareOptions - Authentication middleware options
   * @param {String} options.routerOptions.auth.authMiddlewareOptions.secret - JWT secret key
   * @param {String} options.routerOptions.auth.authMiddlewareOptions.tokenFrom - Where to get token from: 'header', 'query', 'cookie', or 'body' (default: 'header')
   * @param {String} options.routerOptions.auth.authMiddlewareOptions.headerName - Name of the header containing the token (default: 'Authorization')
   * @param {String} options.routerOptions.auth.authMiddlewareOptions.queryParam - Name of the query parameter containing the token (default: 'token')
   * @param {String} options.routerOptions.auth.authMiddlewareOptions.cookieName - Name of the cookie containing the token (default: 'token')
   * @param {String} options.routerOptions.auth.authMiddlewareOptions.bodyField - Name of the body field containing the token (default: 'token')
   * @param {Boolean} options.routerOptions.auth.authMiddlewareOptions.passthrough - If true, request will continue even without token (default: false)
   * @param {Array} options.otherRoutes - Custom routes that aren't tied to collections
   * @param {String} options.otherRoutes[].method - HTTP method (GET, POST, PUT, DELETE, etc.)
   * @param {String} options.otherRoutes[].path - Route path
   * @param {Function} options.otherRoutes[].handler - Route handler function
   * @param {Array} options.otherRoutes[].middleware - Middleware to apply to this route
   * @param {Boolean} options.otherRoutes[].isProtected - Whether this route requires authentication
   * @param {String} options.otherRoutes[].prefix - Route prefix (default: '/api')
   * @param {Object} options.otherRoutes[].collectionAccess - Collection-based access control for this route
   * @param {Boolean} options.otherRoutes[].collectionAccess.accessDefault - Default access for collections not specified
   * @param {Object} options.otherRoutes[].collectionAccess.collections - Collection-specific access rules
   * @param {Object} options.otherRoutes[].authMiddlewareOptions - Authentication middleware options for this route
   * @param {String} options.otherRoutes[].authMiddlewareOptions.secret - JWT secret key
   * @param {String} options.otherRoutes[].authMiddlewareOptions.tokenFrom - Where to get token from
   * @param {String} options.otherRoutes[].authMiddlewareOptions.headerName - Name of the header containing the token
   * @param {String} options.otherRoutes[].authMiddlewareOptions.queryParam - Name of the query parameter containing the token
   * @param {String} options.otherRoutes[].authMiddlewareOptions.cookieName - Name of the cookie containing the token
   * @param {String} options.otherRoutes[].authMiddlewareOptions.bodyField - Name of the body field containing the token
   * @param {Boolean} options.otherRoutes[].authMiddlewareOptions.passthrough - If true, request will continue even without token
   * @param {Object} options.server - Server instance
   * @param {Object} options.serverOptions - Server options
   * @param {number} options.serverOptions.port - Port for the server to listen on
   * @param {Object} options.serverOptions.corsOptions - CORS configuration options (passed to Server instance)
   */
  constructor(options = {}) {
    // Set database type (mongodb or mysql)
    this.dbType = options.dbType || DATABASE.DEFAULT_TYPE;

    // Initialize the appropriate database adapter
    if (this.dbType === DATABASE.TYPES.MONGODB) {
      this.dbAdapter = new MongoDBAdapter(options.adapterConfig.mongodb);
    } else if (this.dbType === DATABASE.TYPES.MYSQL) {
      this.dbAdapter = new MySQLAdapter(options.adapterConfig.mysql);
    } else {
      throw new ValidationError(`Unsupported database type: ${this.dbType}`);
    }

    this.collections = options.collections || {};
    this.routerOptions = options.routerOptions || {};

    // Store custom routes that aren't tied to collections
    this.otherRoutes = options.otherRoutes || [];

    // Initialize server
    const serverOptions = options?.serverOptions || {};
    this.server = options?.server || new Server(serverOptions);

    this.models = {};
    this.routers = {};
  }

  /**
   * Connect to the database
   * @returns {Promise} - Database connection
   */
  async connect() {
    return await this.dbAdapter.connect();
  }

  /**
   * Disconnect from the database
   * @returns {Promise} - Disconnect result
   */
  async disconnect() {
    return await this.dbAdapter.disconnect();
  }

  /**
   * Get all collections/tables from the database
   * @returns {Promise<Array>} - Array of collection/table names
   */
  async getAllCollections() {
    return await this.dbAdapter.getAllCollections();
  }

  /**
   * Prepare collections by creating models and routers
   * @returns {Promise<Object>} - Object with models and routers
   */
  async #prepareCollections() {
    try {
      const collections = await this.getAllCollections();

      for (const collectionName of collections) {
        // Skip system collections for MongoDB
        if (this.dbType === DATABASE.TYPES.MONGODB && collectionName.startsWith("system.")) continue;

        // Get collection options
        const collectionOptions = this.collections[collectionName] || {};

        // Skip if explicitly disabled
        if (collectionOptions?.enabled === false) continue;

        // Create model using the appropriate adapter
        this.models[collectionName] = await this.dbAdapter.createModel(collectionName, collectionOptions);

        // Create router with collection-specific options
        const routerOptions = {
          ...this.routerOptions,
          ...(collectionOptions?.routerOptions || {}),
        };

        // Add fields configuration if present in collection options
        if (collectionOptions?.fields) {
          routerOptions.fields = collectionOptions.fields;
        }

        // Set routerOptions.auth
        if (this.routerOptions?.auth || collectionOptions?.routerOptions?.auth) {
          routerOptions.auth = {
            ...(this.routerOptions?.auth || {}),
            ...(collectionOptions?.routerOptions?.auth || {}),
          };

          // Set routerOptions.auth.keys
          if (this.routerOptions?.auth?.keys || collectionOptions?.routerOptions?.auth?.keys) {
            routerOptions.auth.keys = {
              ...(this.routerOptions?.auth?.keys || {}),
              ...(collectionOptions?.routerOptions?.auth?.keys || {}),
            };
          }

          // Set routerOptions.auth.authMiddlewareOptions
          if (this.routerOptions?.auth?.authMiddlewareOptions || collectionOptions?.routerOptions?.auth?.authMiddlewareOptions) {
            routerOptions.auth.authMiddlewareOptions = {
              ...(this.routerOptions?.auth?.authMiddlewareOptions || {}),
              ...(collectionOptions?.routerOptions?.auth?.authMiddlewareOptions || {}),
            };
          }

          // Set routerOptions.auth.collectionAccess
          if (this.routerOptions?.auth?.collectionAccess || collectionOptions?.routerOptions?.auth?.collectionAccess) {
            routerOptions.auth.collectionAccess = {
              ...(this.routerOptions?.auth?.collectionAccess || {}),
              ...(collectionOptions?.routerOptions?.auth?.collectionAccess || {}),
            };

            // Ensure collections object exists
            if (!routerOptions.auth.collectionAccess.collections) {
              routerOptions.auth.collectionAccess.collections = {};
            }
          }
        }

        this.routers[collectionName] = new Router(this.models[collectionName], routerOptions);
      }

      return {
        models: this.models,
        routers: this.routers,
      };
    } catch (error) {
      console.error("Error preparing collections:", error);
      throw new Error(`Failed to prepare collections: ${error.message}`);
    }
  }

  /**
   * Add all routers to the server
   * @private
   */
  #addRoutersToServer() {
    // Add routers to server with custom prefixes
    for (const collectionName in this.routers) {
      const router = this.routers[collectionName];
      const collectionOptions = this.collections[collectionName] || {};

      // Use custom prefix if provided, otherwise use collection name
      const prefix = collectionOptions?.prefix || `/${collectionName}`;

      this.server.addRouter(router, prefix);
    }

    // Add custom routes that aren't tied to collections
    if (this.otherRoutes && this.otherRoutes.length > 0) {
      this.otherRoutes.forEach((route) => {
        const { method, path, handler, middleware = [], isProtected = false, collectionAccess = null, authMiddlewareOptions = {} } = route;

        // Create Express router for this custom route
        const router = express.Router();

        // Apply authentication middleware if route is protected
        if (isProtected) {
          // create auth middleware
          const globalAuthMiddlewareOptions = this.routerOptions?.auth?.authMiddlewareOptions || {};
          const finalAuthMiddlewareOptions = authMiddlewareOptions ? { ...globalAuthMiddlewareOptions, ...authMiddlewareOptions } : globalAuthMiddlewareOptions;
          const otherRoutesAuthMiddleware = authMiddleware(finalAuthMiddlewareOptions || {});

          // Apply collection access check if configured
          if (collectionAccess) {
            router[method.toLowerCase()](
              path,
              loggerMiddleware,
              otherRoutesAuthMiddleware,
              (req, res, next) => {
                // Check if user has access based on collection access rules
                const userCollection = req.userCollection;

                // If no collection is specified in the token, check default access
                if (!userCollection) {
                  const defaultAccess = collectionAccess.accessDefault ?? COLLECTION_ACCESS.DEFAULT_ACCESS;
                  if (!defaultAccess) {
                    return next(new AccessDeniedError());
                  }
                  return next();
                }

                // Check collection-specific access rules
                const collections = collectionAccess.collections || {};
                const collectionRules = collections[userCollection];

                // If no specific rules, use default access
                if (!collectionRules) {
                  const defaultAccess = collectionAccess.accessDefault ?? COLLECTION_ACCESS.DEFAULT_ACCESS;
                  if (!defaultAccess) {
                    return next(new AccessDeniedError());
                  }
                  return next();
                }

                // Check if collection has access
                if (collectionRules === false || collectionRules === "none") {
                  return next(new AccessDeniedError());
                }

                next();
              },
              ...middleware,
              handler
            );
          } else {
            // No collection access rules, just apply auth middleware
            router[method.toLowerCase()](path, loggerMiddleware, otherRoutesAuthMiddleware, ...middleware, handler);
          }
        } else {
          // Route is not protected, no auth middleware needed
          router[method.toLowerCase()](path, loggerMiddleware, ...middleware, handler);
        }

        // Add the router to the server
        this.server.addRouter({ router }, route.prefix || "");
      });
    }
  }

  /**
   * Start the database connection and server
   * @param {Function} callback - Optional callback function to execute after server starts
   * @returns {Promise<Object>} - Server instance
   */
  async start(callback) {
    try {
      // Connect to database
      await this.connect();

      // Prepare collections (create models and routers)
      await this.#prepareCollections();

      // Add routers to server
      this.#addRoutersToServer();

      // Start server
      return this.server.start(callback);
    } catch (error) {
      console.error("Error starting server:", error);
      throw new Error(`Failed to start server: ${error.message}`);
    }
  }
}

module.exports = DB;
