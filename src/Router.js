/**
 * Router class for handling Express route configuration
 */
const express = require("express");
const { authMiddleware } = require("./middleware/auth");
const { validate, schemas } = require("./middleware/validation");
const { strictRateLimiter } = require("./middleware/rate-limit");
const routes = require("./routes");
const { ROUTES, AUTH } = require("./utils/constants");
const { AccessDeniedError } = require("./utils/errors");
const { setLenBySpace } = require("@el-zazo/main-utils");
const { loggerMiddleware } = require("./middleware/logger");

class Router {
  /**
   * Create a new Router instance
   * @param {Object} model - Model instance
   * @param {Object} options - Router options
   * @param {Array} options.routes - Routes to initialize (default: all routes)
   * @param {Array} options.middleware - Middleware to apply to all routes
   * @param {Object} options.auth
   * @param {Object} options.auth.keys
   * @param {Array} options.auth.keys.identifiantKey
   * @param {Array} options.auth.keys.passwordKey
   * @param {Object} options.auth.additionalFields - Additional fields to include in registration schema
   * @param {Array} options.auth.routes
   * @param {Array|Boolean} options.auth.protectedRoutes
   * @param {Object} options.auth.collectionAccess - Collection-based access control configuration
   * @param {Boolean} options.auth.collectionAccess.accessDefault - Default access for collections not specified (default: true)
   * @param {Object} options.auth.collectionAccess.collections - Collection-specific access rules
   * @param {Object} options.auth.authMiddlewareOptions
   * @param {String} options.auth.authMiddlewareOptions.secret - JWT secret key
   * @param {String} options.auth.authMiddlewareOptions.tokenFrom - Where to get token from: 'header', 'query', 'cookie', or 'body' (default: 'header')
   * @param {String} options.auth.authMiddlewareOptions.headerName - Name of the header containing the token (default: 'Authorization')
   * @param {String} options.auth.authMiddlewareOptions.queryParam - Name of the query parameter containing the token (default: 'token')
   * @param {String} options.auth.authMiddlewareOptions.cookieName - Name of the cookie containing the token (default: 'token')
   * @param {String} options.auth.authMiddlewareOptions.bodyField - Name of the body field containing the token (default: 'token')
   * @param {Boolean} options.auth.authMiddlewareOptions.passthrough - If true, request will continue even without token (default: false)
   */
  constructor(model, options = {}) {
    if (!model) {
      throw new Error("Model is required");
    }

    this.model = model;
    this.router = express.Router();
    this.middleware = options.middleware || [];

    // Store collection fields configuration if provided
    this.fieldsConfig = options.fields || null;

    // set routes
    if (!Array.isArray(options.routes)) {
      this.routes = [...ROUTES.DEFAULT_ROUTES];
    } else {
      // Save just normal routes
      this.routes = options.routes.filter((routeName) => ROUTES.DEFAULT_ROUTES.includes(routeName));
    }

    // set auth middlware
    this.auth = options.auth || null;
    if (this?.auth?.authMiddlewareOptions) {
      this.auth.middleware = authMiddleware(this.auth.authMiddlewareOptions);
    }

    // Initialize auth schemas with the configured keys
    if (this.auth) {
      const identifiantKey = this.auth?.keys?.identifiantKey || AUTH.DEFAULT_IDENTIFIER_KEY;
      const passwordKey = this.auth?.keys?.passwordKey || AUTH.DEFAULT_PASSWORD_KEY;
      const additionalFields = this.auth?.additionalFields || {};

      // Create dynamic validation schemas based on auth configuration
      schemas.auth.login = schemas.auth.getLoginSchema(identifiantKey, passwordKey);
      schemas.auth.register = schemas.auth.getRegisterSchema(identifiantKey, passwordKey, additionalFields);
    } else {
      // Use default keys if no auth config is provided
      schemas.auth.login = schemas.auth.getLoginSchema();
      schemas.auth.register = schemas.auth.getRegisterSchema();
    }

    // Add auth routes to the list of routes
    if (this?.auth?.routes && Array.isArray(this.auth.routes) && this.auth.routes.length > 0) {
      this.routes.push(...this.auth.routes.filter((routeName) => ROUTES.DEFAULT_AUTH_ROUTES.includes(routeName)));
    }

    // Apply middleware to all routes if provided
    if (this.middleware.length > 0) {
      this.router.use(this.middleware);
    }

    // Initialize routes
    this.initializeRoutes();
  }

  /**
   * Initialize routes for the model
   */
  initializeRoutes() {
    console.log(`Initializing routes for model: ${this.model.modelName}`);

    // Map route names to their handler functions
    // Pass this router instance as the 5th parameter to provide access to fieldsConfig
    this.routesCreators = {
      getAll: (req, res, next) => routes.getAll(req, res, next, this.model, this),
      getOneById: (req, res, next) => routes.getOneById(req, res, next, this.model, this),
      search: (req, res, next) => routes.search(req, res, next, this.model, this),
      addOne: (req, res, next) => routes.addOne(req, res, next, this.model, this),
      addMany: (req, res, next) => routes.addMany(req, res, next, this.model, this),
      updateOneById: (req, res, next) => routes.updateOneById(req, res, next, this.model, this),
      updateMany: (req, res, next) => routes.updateMany(req, res, next, this.model, this),
      deleteById: (req, res, next) => routes.deleteById(req, res, next, this.model, this),
      deleteMany: (req, res, next) => routes.deleteMany(req, res, next, this.model, this),
      getUserByToken: (req, res, next) => routes.getUserByToken(req, res, next, this.model, this.auth),
      login: (req, res, next) => routes.login(req, res, next, this.model, this.auth),
      register: (req, res, next) => routes.register(req, res, next, this.model, this.auth),
      refreshToken: (req, res, next) => routes.refreshToken(req, res, next, this.model, this.auth),
    };

    // Sort routes according to the defined order
    const sortedRoutes = this.sortRoutes(this.routes);

    // Create routes in the sorted order
    sortedRoutes.forEach((routeName) => {
      if (this.routesCreators?.[routeName]) {
        // Get route configuration (method and path)
        const { method, path } = routes.getRouteConfig(routeName);

        // Display route info
        console.log(`\tCreate route: \t - ${setLenBySpace(routeName, 20)} - ${setLenBySpace(String(method).toUpperCase(), 10)} - ${setLenBySpace(path, 40)}`);

        // Determine validation middleware based on route name
        const validationMiddleware = this.getValidationMiddleware(routeName);

        if (this.isRouteProtected(routeName)) {
          // Apply authentication middleware to protected route
          this.router[method](
            path,
            loggerMiddleware,
            this.auth.middleware,
            (req, res, next) => {
              // Check collection-based access control
              if (!routes.hasCollectionAccess(req, routeName, this.auth?.collectionAccess)) {
                const error = new AccessDeniedError();
                return next(error);
              }
              next();
            },
            ...validationMiddleware, // Apply validation middleware
            this.routesCreators[routeName]
          );
        } else {
          // Apply route without authentication
          this.router[method](
            path,
            loggerMiddleware,
            ...validationMiddleware, // Apply validation middleware
            this.routesCreators[routeName]
          );
        }
      }
    });

    console.log(`Routes initialized for model: ${this.model.modelName}\n\n`);
  }

  /**
   * Sort routes according to the defined order
   * @param {Array} routesToSort - Array of route names to sort
   * @returns {Array} - Sorted array of route names
   */
  sortRoutes(routesToSort) {
    return [...new Set(routesToSort)].sort((a, b) => {
      const indexA = ROUTES.ROUTE_ORDER.indexOf(a);
      const indexB = ROUTES.ROUTE_ORDER.indexOf(b);

      // If route is not in the order list, put it at the end
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;

      return indexA - indexB;
    });
  }

  /**
   * Check if a route is protected and requires authentication
   * @param {String} routeName - Name of the route
   * @returns {Boolean} - True if the route is protected, false otherwise
   */
  isRouteProtected(routeName) {
    return routes.isProtectedRoute(routeName, this.auth);
  }

  /**
   * Get validation middleware for a specific route
   * @param {String} routeName - Name of the route
   * @returns {Array} - Array of validation middleware functions
   */
  getValidationMiddleware(routeName) {
    const middlewares = [];

    // Apply validation based on route type
    switch (routeName) {
      // Authentication routes
      case "login":
        middlewares.push(strictRateLimiter, validate(schemas.auth.login));
        break;
      case "register":
        middlewares.push(strictRateLimiter, validate(schemas.auth.register));
        break;
      case "refreshToken":
        middlewares.push(validate(schemas.auth.refreshToken));
        break;
      case "getUserByToken":
        // No validation needed for this route as it only uses the token
        break;

      // CRUD routes
      case "getAll":
        middlewares.push(validate(schemas.crud.getAll, "query"));
        break;
      case "getOneById":
        middlewares.push(validate(schemas.crud.getOneById, "params"));
        break;
      case "search":
        middlewares.push(validate(schemas.crud.search));
        break;
      case "addOne":
        middlewares.push(validate(schemas.crud.addOne));
        break;
      case "addMany":
        middlewares.push(validate(schemas.crud.addMany));
        break;
      case "updateOneById":
        middlewares.push(validate(schemas.crud.updateOneByIdParams, "params"), validate(schemas.crud.updateOneByIdBody));
        break;
      case "updateMany":
        middlewares.push(validate(schemas.crud.updateMany));
        break;
      case "deleteById":
        middlewares.push(validate(schemas.crud.deleteById, "params"));
        break;
      case "deleteMany":
        middlewares.push(validate(schemas.crud.deleteMany));
        break;
      default:
        // No validation for unknown routes
        break;
    }

    return middlewares;
  }
}

module.exports = Router;
