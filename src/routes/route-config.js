/**
 * Route configuration utilities for Router class
 */

const { ROUTES, COLLECTION_ACCESS } = require("../utils/constants");

/**
 * Get route configuration (HTTP method and path) for a given route type
 * @param {String} routeName - Name of the route
 * @returns {Object} - Object containing method and path
 */
function getRouteConfig(routeName) {
  // Check if route exists in ROUTES.METHODS
  if (ROUTES.METHODS[routeName]) {
    return ROUTES.METHODS[routeName];
  }

  // Default configuration if route not found
  console.warn(`Unknown route type: ${routeName}, defaulting to GET /`);
  return { method: "get", path: "/" };
}

/**
 * Check if a route requires authentication
 * @param {String} routeName - Name of the route
 * @param {Object} authConfig - Authentication configuration
 * @returns {Boolean} - True if route requires authentication
 */
function isProtectedRoute(routeName, authConfig) {
  if (!ROUTES.DEFAULT_PROTECTED_ROUTES.includes(routeName)) {
    return false;
  }

  if (!authConfig || !authConfig.middleware) {
    return false;
  }

  // If protectedRoutes is not specified, no routes are protected
  if (!authConfig.protectedRoutes) {
    return false;
  }

  // If protectedRoutes is true, all routes are protected
  if (authConfig.protectedRoutes === true) {
    return true;
  }

  // If protectedRoutes is an array, check if routeName is in the array
  if (Array.isArray(authConfig.protectedRoutes)) {
    return authConfig.protectedRoutes.includes(routeName);
  }

  return false;
}

/**
 * Check if a user has access to a specific route based on collection configuration
 * @param {Object} req - Express request object
 * @param {String} routeName - Name of the route
 * @param {Object} collectionAccess - Collection Access configuration
 * @returns {Boolean} - True if user has access to the route
 */
function hasCollectionAccess(req, routeName, collectionAccess) {
  if (ROUTES.DEFAULT_AUTH_ROUTES.includes(routeName)) {
    return true;
  }

  // If no collection access control is configured, allow access by default
  if (!collectionAccess) {
    return true;
  }

  // Get user's collection from request
  const userCollection = req.userCollection;

  // If no collection is specified in the token, check if we allow access to anyone
  if (!userCollection) {
    // Check against the default access setting
    const defaultAccess = collectionAccess.accessDefault ?? COLLECTION_ACCESS.DEFAULT_ACCESS;
    return defaultAccess !== false;
  }

  // Check if this collection has specific access rules
  const collectionRules = collectionAccess.collections?.[userCollection];

  // If no specific rules for this collection, check default access
  if (!collectionRules) {
    // Check against the default access setting
    const defaultAccess = collectionAccess.accessDefault ?? COLLECTION_ACCESS.DEFAULT_ACCESS;
    return defaultAccess !== false;
  }

  // If collection has access to all routes
  if (COLLECTION_ACCESS.ALL_ACCESS.includes(collectionRules)) {
    return true;
  }

  // If collection has access to specific routes
  if (Array.isArray(collectionRules)) {
    return collectionRules.includes(routeName);
  }

  // If collection has no access
  if (COLLECTION_ACCESS.NO_ACCESS.includes(collectionRules)) {
    return false;
  }

  // Default to allowing access if configuration is unclear
  return true;
}

module.exports = {
  getRouteConfig,
  isProtectedRoute,
  hasCollectionAccess,
};
