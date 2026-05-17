/**
 * Routes module for Router class
 */

// Import route handlers
const crudRoutes = require("./crud");
const authRoutes = require("./auth");
const routeConfig = require("./route-config");

// Export all route handlers and utilities
module.exports = {
  // CRUD route handlers
  getAll: crudRoutes.getAll,
  getOneById: crudRoutes.getOneById,
  search: crudRoutes.search,
  addOne: crudRoutes.addOne,
  addMany: crudRoutes.addMany,
  updateOneById: crudRoutes.updateOneById,
  updateMany: crudRoutes.updateMany,
  deleteById: crudRoutes.deleteById,
  deleteMany: crudRoutes.deleteMany,

  // Auth route handlers
  login: authRoutes.login,
  register: authRoutes.register,
  refreshToken: authRoutes.refreshToken,
  getUserByToken: authRoutes.getUserByToken,

  // Route configuration utilities
  getRouteConfig: routeConfig.getRouteConfig,
  isProtectedRoute: routeConfig.isProtectedRoute,
  hasCollectionAccess: routeConfig.hasCollectionAccess,
};
