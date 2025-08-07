/**
 * Constants used throughout the application
 */

// Server defaults
const SERVER = {
  DEFAULT_PORT: 3000,
  // CORS configuration
  CORS: {
    DEFAULT_OPTIONS: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    },
  },
};

// Database defaults
const DATABASE = {
  // Database types
  TYPES: {
    MONGODB: "mongodb",
    MYSQL: "mysql",
  },

  // Default database type
  DEFAULT_TYPE: "mongodb",

  // Cache configuration
  CACHE: {
    DEFAULT_ENABLED: true,
    DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
    DEFAULT_MAX_SIZE: 100,
  },

  // MongoDB configuration
  MONGODB: {
    DEFAULT_URI: "mongodb://0.0.0.0:27017/auto-server",
    DEFAULT_OPTIONS: {},
  },

  // MySQL configuration
  MYSQL: {
    DEFAULT_HOST: "localhost",
    DEFAULT_PORT: 3306,
    DEFAULT_DATABASE: "auto_server",
    DEFAULT_USERNAME: "root",
    DEFAULT_PASSWORD: "",
    DEFAULT_OPTIONS: {
      dialect: "mysql",
      logging: false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    },
  },
};

// Model constants
const MODEL = {
  DEFAULT_QUERY_OPTIONS: {
    sort: {},
    limit: 0,
    skip: 0,
    fields: null,
  },
  // Pagination defaults
  // Note: Pagination can be disabled by setting no_pagination=true in query parameters
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_PER_PAGE: 10,
    MAX_PER_PAGE: 100,
  },
};

// Authentication defaults
const AUTH = {
  DEFAULT_SALT_ROUNDS: 10,
  DEFAULT_TOKEN_EXPIRY: "24h",
  DEFAULT_IDENTIFIER_KEY: "email",
  DEFAULT_PASSWORD_KEY: "password",
  DEFAULT_TOKEN_FROM: "header",
  DEFAULT_HEADER_NAME: "Authorization",
  DEFAULT_QUERY_PARAM: "token",
  DEFAULT_COOKIE_NAME: "token",
  DEFAULT_BODY_FIELD: "token",
  SECRET_KEY: process.env.JWT_SECRET || "your-secret-key",
  PASSTHROUGH: false,
  DEFAULT_USE_PASSWORD_HASH: true,
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
};

// Error messages
const ERROR_MESSAGES = {
  // Authentication errors
  JWT_SECRET_REQUIRED: "JWT secret is required",
  PASSWORD_REQUIRED: "Password is required",
  INVALID_CREDENTIALS: "Invalid credentials",
  JWT_SECRET_NOT_CONFIGURED: "JWT secret is not configured",
  AUTHENTICATION_TOKEN_REQUIRED: "Authentication token is required",
  INVALID_AUTHENTICATION_TOKEN: "Invalid authentication token",
  USER_ALREADY_EXISTS: "User with this credentials already exists",
  JWT_TOKEN_HAS_EXPIRED: "JWT token has expired",

  // Rate limiting errors
  TOO_MANY_REQUESTS: "Too many requests from this IP, please try again later",
  TOO_MANY_AUTH_ATTEMPTS: "Too many authentication attempts, please try again later",

  // Request validation errors
  EMPTY_FILTER_NOT_ALLOWED: "Empty filter is not allowed for safety reasons.",
  FILTER_REQUIRED: "Filter is required in body { filter }",
  UPDATE_DATA_REQUIRED_IN_BODY: "Update data is required in body { update }",
  REQUEST_BODY_MUST_BE_ARRAY: "Request body must be an array",
  REQUEST_BODY_MUST_BE_NOT_EMPTY: "Request body must be not empty",
  UPDATE_DATA_REQUIRED: "Update data is required",
  INVALID_FIELDS_PARAMETER_FORMAT: "Invalid fields parameter format",
};

// Route defaults
const ROUTES = {
  DEFAULT_PREFIX: "/api",
  DEFAULT_ROUTES: ["getAll", "getOneById", "search", "addOne", "addMany", "updateOneById", "updateMany", "deleteById", "deleteMany"],
  ROUTE_ORDER: ["getUserByToken", "login", "register", "refreshToken", "getAll", "getOneById", "search", "addOne", "addMany", "updateMany", "updateOneById", "deleteMany", "deleteById"],
  DEFAULT_AUTH_ROUTES: ["getUserByToken", "login", "register", "refreshToken"],
  DEFAULT_PROTECTED_ROUTES: ["getAll", "getOneById", "search", "addOne", "addMany", "updateOneById", "updateMany", "deleteById", "deleteMany", "getUserByToken"],
  METHODS: {
    getAll: { method: "get", path: "/" },
    getOneById: { method: "get", path: "/:id" },
    search: { method: "post", path: "/search" },
    addOne: { method: "post", path: "/" },
    addMany: { method: "post", path: "/many" },
    updateOneById: { method: "put", path: "/:id" },
    updateMany: { method: "put", path: "/many" },
    deleteById: { method: "delete", path: "/:id" },
    deleteMany: { method: "delete", path: "/many" },
    getUserByToken: { method: "get", path: "/me" },
    login: { method: "post", path: "/login" },
    register: { method: "post", path: "/register" },
    refreshToken: { method: "post", path: "/refresh-token" },
  },
};

// Response messages
const RESPONSE_MESSAGES = {
  // Success messages
  CREATED_SUCCESSFULLY: "Resource created successfully",
  UPDATED_SUCCESSFULLY: "Resource updated successfully",
  DELETED_SUCCESSFULLY: "Resource deleted successfully",
  LOGIN_SUCCESSFUL: "Login successful",
  REGISTRATION_SUCCESSFUL: "Registration successful",
};

// Collection access constants
const COLLECTION_ACCESS = {
  ALL_ACCESS: ["*", "all", true],
  NO_ACCESS: ["none", false],
  DEFAULT_ACCESS: true,
};

// Rate limiting defaults
const RATE_LIMIT = {
  DEFAULT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  DEFAULT_MAX_REQUESTS: 100, // 100 requests per window
  STRICT_WINDOW_MS: 60 * 1000, // 1 minute
  STRICT_MAX_REQUESTS: 5, // 5 requests per minute
};

module.exports = {
  SERVER,
  DATABASE,
  AUTH,
  HTTP_STATUS,
  ERROR_MESSAGES,
  RESPONSE_MESSAGES,
  ROUTES,
  COLLECTION_ACCESS,
  MODEL,
  RATE_LIMIT,
};
