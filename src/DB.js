/**
 * DB class for handling database connections and auto-generating models and routers
 */
// express is required solely for express.Router(), which is used to create bare
// route mounts for custom "otherRoutes" (user-defined routes not tied to a collection).
// The project's own Router class cannot replace it here — Router is a model-backed
// route generator that auto-creates CRUD + auth routes, while otherRoutes need a
// lightweight Express router to mount individual handlers with custom middleware chains.
const express = require("express");
const Router = require("./Router");
const Server = require("./Server");
const MongoDBAdapter = require("./adapters/MongoDBAdapter");
const MySQLAdapter = require("./adapters/MySQLAdapter");
const { DATABASE, COLLECTION_ACCESS } = require("./utils/constants");
const { ValidationError, AccessDeniedError } = require("./utils/errors");
const { authMiddleware } = require("./middleware/auth");
const { loggerMiddleware } = require("./middleware/logger");
const { hasCollectionAccess } = require("./routes/route-config");
const { logger, configureLogger } = require("./utils/logger");

/**
 * Deep clone router options while preserving function references and special types.
 * JSON.parse(JSON.stringify()) drops functions, Dates, undefined values,
 * RegExp, Set, Map — and throws on circular references.
 * This avoids all of those issues.
 * @param {Object} options - Router options to clone
 * @returns {Object} - Cloned options with functions and special types preserved
 */
const cloneRouterOptions = (options, seen = new WeakMap()) => {
  if (options === null || options === undefined) return {};
  if (options instanceof Date) return new Date(options);
  if (options instanceof RegExp) return new RegExp(options);
  if (options instanceof Set) return new Set([...options]);
  if (options instanceof Map) return new Map([...options]);

  if (typeof options === "function") return options;
  if (Array.isArray(options)) {
    if (seen.has(options)) return seen.get(options); // preserve reference / break cycle
    const clone = [];
    seen.set(options, clone);
    options.forEach((item, index) => {
      clone[index] = cloneRouterOptions(item, seen);
    });
    return clone;
  }
  if (typeof options === "object" && options !== null) {
    if (seen.has(options)) return seen.get(options); // preserve reference / break cycle
    const clone = {};
    seen.set(options, clone);
    for (const key of Object.keys(options)) {
      clone[key] = cloneRouterOptions(options[key], seen);
    }
    return clone;
  }
  return options;
};

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
   * @param {Object} options.globalRouterOptions - Global router options (applied to all collections unless overridden)
   * @param {Array} options.globalRouterOptions.routes - Routes to initialize (default: all routes)
   * @param {Array} options.globalRouterOptions.middleware - Middleware to apply to all routes
   * @param {Object} options.globalRouterOptions.auth - Authentication configuration
   * @param {Object} options.globalRouterOptions.auth.authMiddlewareOptions - Authentication middleware options
   * @param {String} options.globalRouterOptions.auth.authMiddlewareOptions.secret - JWT secret key
   * @param {String} options.globalRouterOptions.auth.authMiddlewareOptions.tokenFrom - Where to get token from: 'header', 'query', 'cookie', or 'body' (default: 'header')
   * @param {String} options.globalRouterOptions.auth.authMiddlewareOptions.headerName - Name of the header containing the token (default: 'Authorization')
   * @param {String} options.globalRouterOptions.auth.authMiddlewareOptions.queryParam - Name of the query parameter containing the token (default: 'token')
   * @param {String} options.globalRouterOptions.auth.authMiddlewareOptions.cookieName - Name of the cookie containing the token (default: 'token')
   * @param {String} options.globalRouterOptions.auth.authMiddlewareOptions.bodyField - Name of the body field containing the token (default: 'token')
   * @param {Boolean} options.globalRouterOptions.auth.authMiddlewareOptions.passthrough - If true, request will continue even without token (default: false)
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
   * @param {Object} [options.logs] - Logger configuration
   * @param {boolean} [options.logs.enabled=true] - Master switch: false silences ALL log output
   * @param {string}  [options.logs.level="debug"] - Minimum log level: "debug" | "info" | "warn" | "error"
   */
  constructor(options = {}) {
    // Set database type (mongodb or mysql)
    this.dbType = options.dbType || DATABASE.DEFAULT_TYPE;

    // Initialize the appropriate database adapter
    if (this.dbType === DATABASE.TYPES.MONGODB) {
      this.dbAdapter = new MongoDBAdapter(options.adapterConfig?.mongodb);
    } else if (this.dbType === DATABASE.TYPES.MYSQL) {
      this.dbAdapter = new MySQLAdapter(options.adapterConfig?.mysql);
    } else {
      throw new ValidationError(`Unsupported database type: ${this.dbType}`);
    }

    this.collections = options.collections || {};
    this.globalRouterOptions = options?.globalRouterOptions || {};

    // Configure logger from options
    if (options.logs) configureLogger(options.logs);

    // Store custom routes that aren't tied to collections
    this.otherRoutes = options.otherRoutes || [];

    // Initialize server
    const serverOptions = options?.serverOptions || {};
    this.server = options?.server || new Server(serverOptions);
    this.server.db = this;

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
   * Ping the database to verify connectivity
   * @returns {Promise} - Ping result
   */
  async ping() {
    return await this.dbAdapter.ping();
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
      // ONLY iterate over explicitly configured collections — this.collections is an ALLOWLIST,
      // not just an options bag. Collections NOT listed here will NEVER get routes.
      const collectionEntries = Object.entries(this.collections || {});
      if (collectionEntries.length === 0) {
        throw new Error(
          "DB configuration error: options.collections cannot be empty. " +
          "Please specify at least one collection explicitly."
        );
      }

      for (const [collectionName, collectionOptions] of collectionEntries) {
        // Skip if explicitly disabled
        if (collectionOptions?.enabled === false) continue;

        // Create model using the appropriate adapter
        this.models[collectionName] = await this.dbAdapter.createModel(collectionName, collectionOptions);

        // set final router options for current collection
        // Using cloneRouterOptions instead of JSON.parse(JSON.stringify()) to preserve function references
        const finalCollectionRouterOptions = cloneRouterOptions(collectionOptions?.routerOptions);

        // ==================================================================================================
        // Only inherit routes, middleware from global router options
        // if not specified in final collection router options
        // ==================================================================================================

        // copy routes from global router options to final collection router options
        if (!finalCollectionRouterOptions?.routes && this.globalRouterOptions?.routes) {
          finalCollectionRouterOptions.routes = this.globalRouterOptions.routes;
        }

        // copy middleware from global router options to final collection router options
        if (!finalCollectionRouterOptions?.middleware && this.globalRouterOptions?.middleware) {
          finalCollectionRouterOptions.middleware = this.globalRouterOptions.middleware;
        }

        // ==================================================================================================
        //  I will move .fields from collection.fields to collection.routerOptions.fields
        // ==================================================================================================
        // // Add fields configuration to final collection router options if present in collection options
        // if (collectionOptions?.fields) {
        //   routerOptions.fields = collectionOptions.fields;
        // }

        // ==================================================================================================
        // Add authMiddlewareOptions in finalCollectionRouterOptions.auth
        // Because authMiddlewareOptions can be specified just in global router options
        // Not in collection config or otherRoutes config, If seted in them no problem but will be not used
        // ==================================================================================================

        // copy auth.authMiddlewareOptions from global router options to final collection router options
        finalCollectionRouterOptions.auth = {
          ...(finalCollectionRouterOptions?.auth || {}),
          authMiddlewareOptions: {
            ...(this.globalRouterOptions?.auth?.authMiddlewareOptions || {}),
          },
        };


        this.routers[collectionName] = new Router(this.models[collectionName], finalCollectionRouterOptions);
      }

      return {
        models: this.models,
        routers: this.routers,
      };
    } catch (error) {
      logger("error", "Failed to prepare collections", { error: error.message });
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
      const VALID_HTTP_METHODS = ["get", "post", "put", "patch", "delete", "options", "head"];

      for (const route of this.otherRoutes) {
        if (!route.method || !route.path || !route.handler) {
          throw new Error(
            `Invalid otherRoute: each route must have method, path, and handler. ` +
            `Received: ${JSON.stringify(route)}`
          );
        }
        if (!VALID_HTTP_METHODS.includes(route.method.toLowerCase())) {
          throw new Error(
            `Invalid HTTP method "${route.method}" in otherRoute. ` +
            `Allowed methods: ${VALID_HTTP_METHODS.join(", ")}`
          );
        }
      }

      this.otherRoutes.forEach((route) => {
        const { method, path, handler, middleware = [], isProtected = false, collectionAccess = null } = route;

        // Create Express router for this custom route
        const router = express.Router();

        // Apply authentication middleware if route is protected
        if (isProtected) {
          
          // create auth middleware
          // ==================================================================================================
          // use authMiddlewareOptions from global router options
          // Because authMiddlewareOptions can be specified just in global router options
          // Not in collection config or otherRoutes config, If seted in them no problem but will be not used
          // ==================================================================================================
          
          const globalAuthMiddlewareOptions = this.globalRouterOptions?.auth?.authMiddlewareOptions || {};
          if (!globalAuthMiddlewareOptions.secret) {
            throw new Error(
              `JWT secret is required for Other Route "${route.routeName || "unknown"}" ` +
              `when an always protected route exists in auth.routes or protected routes are configured. ` +
              `Provide it in globalRouterOptions.auth.authMiddlewareOptions.secret`
            );
          }

          const otherRoutesAuthMiddleware = authMiddleware(globalAuthMiddlewareOptions);

          // Apply collection access check if configured
          if (collectionAccess) {
            router[method.toLowerCase()](
              path,
              loggerMiddleware,
              otherRoutesAuthMiddleware,
              (req, res, next) => {
                if (!hasCollectionAccess(req, route.routeName || route.path, collectionAccess)) {
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
        // Default to "/api" prefix to match documented behavior and keep
        // custom routes consistent with auto-generated collection routes.
        this.server.addRouter({ router }, route.prefix ?? "/api");
      });
    }
  }

  /**
   * Invalidate cache for a specific collection
   * @param {String} collectionName - Name of the collection to invalidate
   */
  invalidateCache(collectionName) {
    const model = this.models[collectionName];
    if (model?.cache) {
      model.cache.invalidateByPrefix(collectionName);
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
      logger("error", "Failed to start server", { error: error.message });
      throw new Error(`Failed to start server: ${error.message}`);
    }
  }
}

module.exports = DB;
