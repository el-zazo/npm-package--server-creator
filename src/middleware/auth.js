/**
 * Authentication middleware for JWT token verification
 */
const { verifyToken, extractToken } = require("../utils/token");
const { ERROR_MESSAGES, AUTH } = require("../utils/constants");
const { AuthenticationError, TokenExpiredError, logger } = require("../utils/errors");

/**
 * Middleware to verify JWT token
 * @param {Object} options - Authentication options
 * @param {String} options.secret - JWT secret key
 * @param {String} options.tokenFrom - Where to get token from: 'header', 'query', 'cookie', or 'body' (default: 'header')
 * @param {String} options.headerName - Name of the header containing the token (default: 'Authorization')
 * @param {String} options.queryParam - Name of the query parameter containing the token (default: 'token')
 * @param {String} options.cookieName - Name of the cookie containing the token (default: 'token')
 * @param {String} options.bodyField - Name of the body field containing the token (default: 'token')
 * @param {Boolean} options.passthrough - If true, request will continue even without token (default: false)
 * @returns {Function} - Express middleware function
 */
const authMiddleware = (options = {}) => {
  // Default options
  const { secret = AUTH.SECRET_KEY, passthrough = AUTH.PASSTHROUGH, ...tokenOptions } = options || {};

  if (!secret) {
    throw new AuthenticationError(ERROR_MESSAGES.JWT_SECRET_REQUIRED);
  }

  return (req, res, next) => {
    try {
      // Extract token from request
      const token = extractToken(req, tokenOptions);

      // If no token found
      if (!token) {
        if (passthrough) {
          logger("debug", "No authentication token provided, but passthrough enabled");
          return next();
        }
        logger("warn", "Authentication failed: No token provided");
        throw new AuthenticationError(ERROR_MESSAGES.AUTHENTICATION_TOKEN_REQUIRED);
      }

      try {
        // Verify token
        const decoded = verifyToken(token, secret);

        if (!decoded) {
          if (passthrough) {
            logger("debug", "Invalid authentication token, but passthrough enabled");
            return next();
          }
          logger("warn", "Authentication failed: Invalid token");
          throw new AuthenticationError(ERROR_MESSAGES.INVALID_AUTHENTICATION_TOKEN);
        }

        logger("debug", "Authentication successful", { userId: decoded._id, collection: decoded?._collection });

        // Add user data to request object
        req.user = decoded;

        // Add collection information for access control
        if (decoded._collection) {
          req.userCollection = decoded._collection;
        }
        next();
      } catch (error) {
        // Handle token expiration specifically
        if (error instanceof TokenExpiredError) {
          logger("warn", "Authentication failed: Token expired", { expiredAt: error.details.expiredAt });
          return next(error);
        }
        throw error;
      }
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  authMiddleware,
};
