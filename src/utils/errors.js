/**
 * Custom error classes for standardized error handling
 */

const { HTTP_STATUS } = require("./constants");

/**
 * Base error class for all custom errors
 */
class AppError extends Error {
  /**
   * Create a new AppError
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code
   * @param {String} type - Error type
   * @param {Object} details - Additional error details
   */
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, type = "AppError", details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.type = type;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON response format
   * @returns {Object} - Formatted error response
   */
  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        type: this.type,
        statusCode: this.statusCode,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }
}

/**
 * Authentication error class
 */
class AuthenticationError extends AppError {
  constructor(message = "Authentication failed", details = {}) {
    super(message, HTTP_STATUS.UNAUTHORIZED, "AuthenticationError", details);
  }
}

/**
 * Authorization error class
 */
class AuthorizationError extends AppError {
  constructor(message = "Not authorized", details = {}) {
    super(message, HTTP_STATUS.FORBIDDEN, "AuthorizationError", details);
  }
}

/**
 * Access denied error class for insufficient collection permissions
 */
class AccessDeniedError extends AuthorizationError {
  constructor(message = "Access denied: Insufficient collection permissions", details = {}) {
    super(message, details);
    this.name = "AccessDeniedError";
  }
}

/**
 * Validation error class
 */
class ValidationError extends AppError {
  constructor(message = "Validation failed", details = {}) {
    super(message, HTTP_STATUS.BAD_REQUEST, "ValidationError", details);
  }
}

/**
 * Not found error class
 */
class NotFoundError extends AppError {
  constructor(message = "Resource not found", details = {}) {
    super(message, HTTP_STATUS.NOT_FOUND, "NotFoundError", details);
  }
}

/**
 * Conflict error class
 */
class ConflictError extends AppError {
  constructor(message = "Resource conflict", details = {}) {
    super(message, HTTP_STATUS.CONFLICT, "ConflictError", details);
  }
}

/**
 * Token expired error class
 */
class TokenExpiredError extends AuthenticationError {
  constructor(message = "Token has expired", expiredAt = null, details = {}) {
    const errorDetails = expiredAt ? { ...details, expiredAt } : details;
    super(message, errorDetails);
    this.name = "TokenExpiredError";
  }
}

/**
 * Rate limit error class
 */
class RateLimitError extends AppError {
  constructor(message = "Too many requests", details = {}) {
    super(message, HTTP_STATUS.TOO_MANY_REQUESTS, "RateLimitError", details);
  }
}

/**
 * Database error class
 */
class DatabaseError extends AppError {
  constructor(message = "Database operation failed", details = {}) {
    super(message, HTTP_STATUS.INTERNAL_SERVER_ERROR, "DatabaseError", details);
  }
}

/**
 * Error handler middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${err.name}: ${err.message}`);

  // if (err.stack) {
  //   console.error(err.stack);
  // }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Joi validation errors
  if (err.isJoi) {
    const details = {};
    const errorMessages = [];

    err.details.forEach((detail) => {
      const path = detail.path.join(".");
      errorMessages.push(`${path}: ${detail.message}`);

      if (!details.fields) {
        details.fields = {};
      }
      details.fields[path] = detail.message;
    });

    const validationError = new ValidationError(`Validation error: ${errorMessages.join(", ")}`, details);
    return res.status(validationError.statusCode).json(validationError.toJSON());
  }

  // Handle mongoose validation errors
  if (err.name === "ValidationError") {
    const validationError = new ValidationError("Validation failed", {
      errors: Object.keys(err.errors).reduce((acc, key) => {
        acc[key] = err.errors[key].message;
        return acc;
      }, {}),
    });
    return res.status(validationError.statusCode).json(validationError.toJSON());
  }

  // Handle mongoose cast errors (invalid ID)
  if (err.name === "CastError") {
    console.log(err.path, err.value);
    const validationError = new ValidationError("Invalid ID format", {
      path: err.path,
      value: err.value,
    });
    return res.status(validationError.statusCode).json(validationError.toJSON());
  }

  // Handle duplicate key errors
  if (err.code === 11000) {
    const conflictError = new ConflictError("Duplicate key error", {
      keyPattern: err.keyPattern,
      keyValue: err.keyValue,
    });
    return res.status(conflictError.statusCode).json(conflictError.toJSON());
  }

  // Default to 500 internal server error
  const serverError = new AppError(err.message);
  return res.status(serverError.statusCode).json(serverError.toJSON());
};

/**
 * Logger function for different severity levels
 * @param {String} level - Log level (error, warn, info, debug)
 * @param {String} message - Log message
 * @param {Object} data - Additional log data
 */
const logger = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
  };

  switch (level) {
    case "error":
      console.error(JSON.stringify(logEntry));
      break;
    case "warn":
      console.warn(JSON.stringify(logEntry));
      break;
    case "info":
      console.info(JSON.stringify(logEntry));
      break;
    case "debug":
      console.debug(JSON.stringify(logEntry));
      break;
    default:
      console.log(JSON.stringify(logEntry));
  }
};

module.exports = {
  AppError,
  AuthenticationError,
  AuthorizationError,
  AccessDeniedError,
  ValidationError,
  NotFoundError,
  ConflictError,
  TokenExpiredError,
  RateLimitError,
  DatabaseError,
  errorHandler,
  logger,
};
