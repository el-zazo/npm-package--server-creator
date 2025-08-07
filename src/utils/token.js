/**
 * Utility functions for JWT token generation and verification
 */
const { verify, sign, TokenExpiredError: JwtTokenExpiredError } = require("jsonwebtoken");
const { ERROR_MESSAGES, AUTH } = require("./constants");
const { TokenExpiredError } = require("./errors");

/**
 * Generate JWT token
 * @param {Object} payload - Token payload
 * @param {String} secret - JWT secret key
 * @param {Object} options - JWT sign options
 * @param {String} collectionName - Name of the collection (for access control)
 * @returns {String} - JWT token
 */
const generateToken = (payload, secret, options = {}, collectionName = null) => {
  if (!secret) {
    throw new Error(ERROR_MESSAGES.JWT_SECRET_REQUIRED);
  }

  // Add collection name to payload for access control
  const tokenPayload = { ...payload };
  if (collectionName) {
    tokenPayload._collection = collectionName;
  }

  return sign(tokenPayload, secret, options);
};

/**
 * Verify JWT token
 * @param {String} token - JWT token to verify
 * @param {String} secret - JWT secret key
 * @returns {Object} - Decoded token payload or null if invalid
 */
const verifyToken = (token, secret) => {
  if (!token || !secret) {
    return null;
  }

  try {
    return verify(token, secret);
  } catch (error) {
    // Handle token expiration specifically
    if (error instanceof JwtTokenExpiredError) {
      throw new TokenExpiredError(ERROR_MESSAGES.JWT_TOKEN_HAS_EXPIRED, error.expiredAt);
    }

    return null;
  }
};

/**
 * Extract token from request based on configuration
 * @param {Object} req - Express request object
 * @param {Object} options - Token extraction options
 * @param {String} options.tokenFrom - Where to get token from: 'header', 'query', 'cookie', or 'body' (default: 'header')
 * @param {String} options.headerName - Name of the header containing the token (default: 'Authorization')
 * @param {String} options.queryParam - Name of the query parameter containing the token (default: 'token')
 * @param {String} options.cookieName - Name of the cookie containing the token (default: 'token')
 * @param {String} options.bodyField - Name of the body field containing the token (default: 'token')
 * @returns {String|null} - Extracted token or null if not found
 */
const extractToken = (req, options = {}) => {
  const {
    tokenFrom = AUTH.DEFAULT_TOKEN_FROM,
    headerName = AUTH.DEFAULT_HEADER_NAME,
    queryParam = AUTH.DEFAULT_QUERY_PARAM,
    cookieName = AUTH.DEFAULT_COOKIE_NAME,
    bodyField = AUTH.DEFAULT_BODY_FIELD,
  } = options;

  let token;

  // Extract token based on tokenFrom option
  switch (tokenFrom) {
    case "header":
      const authHeader = req.headers[headerName.toLowerCase()];
      if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
      } else {
        token = authHeader;
      }
      break;
    case "query":
      token = req.query[queryParam];
      break;
    case "cookie":
      token = req.cookies?.[cookieName];
      break;
    case "body":
      token = req.body?.[bodyField];
      break;
    default:
      token = req.headers[headerName.toLowerCase()];
  }

  return token || null;
};

module.exports = {
  generateToken,
  verifyToken,
  extractToken,
};
