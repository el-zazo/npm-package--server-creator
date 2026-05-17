/**
 * Authentication route handlers for Router class
 */
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { verifyPassword, hashPassword } = require("../utils/password");
const { generateToken, verifyToken } = require("../utils/token");
const { AUTH, ERROR_MESSAGES, HTTP_STATUS } = require("../utils/constants");
const { ValidationError, AuthenticationError, ConflictError, AppError, logger } = require("../utils/errors");
const jwt = require("jsonwebtoken");
const { sanitizeDocument } = require("./crud");

// File-based token store — survives restarts but not multi-instance
// For multi-instance deployments, replace with Redis or database store
const TOKEN_STORE_PATH = path.join(process.cwd(), ".refresh-tokens.json");

const loadStore = () => {
  try {
    if (fs.existsSync(TOKEN_STORE_PATH)) {
      const data = JSON.parse(fs.readFileSync(TOKEN_STORE_PATH, "utf8"));
      return new Map(Object.entries(data));
    }
  } catch {
    // If file is corrupted, start fresh
  }
  return new Map();
};

const saveStore = (store) => {
  try {
    const data = Object.fromEntries(store);
    fs.writeFileSync(TOKEN_STORE_PATH, JSON.stringify(data), "utf8");
  } catch {
    // Silently fail — token store is best-effort
  }
};

const refreshTokenStore = loadStore();

// Save store to disk after every modification
const storeSet = (jti, expiry) => {
  refreshTokenStore.set(jti, expiry);
  saveStore(refreshTokenStore);
};

const storeDelete = (jti) => {
  refreshTokenStore.delete(jti);
  saveStore(refreshTokenStore);
};

const storeHas = (jti) => refreshTokenStore.has(jti);

// Clean up expired refresh tokens every 10 minutes
// Assign to variable and call .unref() so the interval does NOT keep
// the Node.js process alive when the event loop is otherwise empty.
// Without .unref(), this interval prevents graceful shutdown.
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [jti, entry] of refreshTokenStore) {
    if (now > entry.expiresAt) {
      storeDelete(jti);
    }
  }
}, 10 * 60 * 1000);
cleanupInterval.unref();

/**
 * Extract plain user data from a Mongoose document, Sequelize instance,
 * or a plain JavaScript object. Handles _doc (Mongoose), dataValues
 * (Sequelize), and plain objects uniformly.
 * @param {Object} doc - Mongoose document, Sequelize instance, or plain object
 * @returns {Object} - Plain JavaScript object with user data
 */
function extractUserData(doc) {
  if (!doc) return {};
  // Mongoose: use toObject() for proper serialization (ObjectId → string, etc.)
  if (doc.toObject && typeof doc.toObject === "function") return doc.toObject();
  // Sequelize: instance.dataValues or instance.get({ plain: true })
  if (doc.dataValues && typeof doc.dataValues === "object") return { ...doc.dataValues };
  // Plain object or already extracted
  return { ...doc };
}

/**
 * POST /{model}/login - User login
 */
async function login(req, res, next, model, authConfig) {
  try {
    const { identifiantKey = AUTH.DEFAULT_IDENTIFIER_KEY, passwordKey = AUTH.DEFAULT_PASSWORD_KEY } = authConfig?.keys || {};
    const { [identifiantKey]: identifiant, [passwordKey]: password } = req.body;

    // Check if password hashing is enabled (default to true if not specified)
    const usePasswordHash = authConfig?.usePasswordHash !== undefined ? authConfig.usePasswordHash : AUTH.DEFAULT_USE_PASSWORD_HASH;

    // Log login attempt
    logger("info", "Login attempt", { identifiant, collection: model.modelName, usePasswordHash });

    if (!identifiant || !password) {
      throw new ValidationError(`${identifiantKey} and ${passwordKey} are required in body`, {
        missingFields: !identifiant ? [identifiantKey] : !password ? [passwordKey] : [identifiantKey, passwordKey],
      });
    }

    // Find user by identifiant key
    const users = await model.getMany({ [identifiantKey]: identifiant }, {});

    if (!users || users.length === 0) {
      // Perform a dummy password verification to maintain constant-time
      // response regardless of whether the user exists. Without this,
      // "user not found" returns instantly while "wrong password" takes
      // ~100ms for bcrypt — enabling user enumeration via timing.
      if (usePasswordHash) {
        try {
          await verifyPassword("timing-constant-dummy", "$2b$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX", true);
        } catch {
          // Ignore — this dummy compare exists solely for timing,
          // its result and any errors are irrelevant.
        }
      }
      logger("warn", "Login failed - User not found", { identifiant, collection: model.modelName });
      throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS, { identifiant });
    }

    const currentUser = extractUserData(users[0]);

    // Compare password with or without hashing based on configuration
    const isPasswordValid = await verifyPassword(password, currentUser?.[passwordKey], usePasswordHash);

    if (!isPasswordValid) {
      logger("warn", "Login failed - Invalid password", { identifiant, collection: model.modelName });
      throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS, { identifiant });
    }

    // Generate token
    if (!authConfig?.authMiddlewareOptions?.secret) {
      logger("error", "JWT secret not configured", { collection: model.modelName });
      throw new AppError(ERROR_MESSAGES.JWT_SECRET_NOT_CONFIGURED, HTTP_STATUS.INTERNAL_SERVER_ERROR, "ConfigurationError");
    }

    // Create user object without password for token payload
    const userForToken = sanitizeDocument(extractUserData(currentUser), [passwordKey]);

    // Get collection name from model for access control
    const collectionName = model.collectionName;

    // Generate access token (short-lived)
    const accessToken = generateToken(userForToken, authConfig.authMiddlewareOptions.secret, { expiresIn: AUTH.DEFAULT_TOKEN_EXPIRY }, collectionName);

    // Generate refresh token with jti for rotation tracking
    const jti = crypto.randomUUID();
    const refreshTokenExpiry = "7d";
    const refreshToken = generateToken(
      { ...userForToken, jti },
      authConfig.authMiddlewareOptions.secret,
      { expiresIn: refreshTokenExpiry },
      collectionName
    );

    // Store refresh token jti for rotation validation
    const decodedRefresh = jwt.decode(refreshToken);
    storeSet(jti, {
      userId: userForToken._id || userForToken.id,
      expiresAt: (decodedRefresh.exp || 0) * 1000,
    });

    // Display
    logger("info", "Login successful", { userId: userForToken._id, collection: model.modelName });

    res.json({
      success: true,
      data: {
        user: userForToken,
        token: accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model}/register - User registration
 */
async function register(req, res, next, model, authConfig) {
  try {
    const { identifiantKey = AUTH.DEFAULT_IDENTIFIER_KEY, passwordKey = AUTH.DEFAULT_PASSWORD_KEY } = authConfig?.keys || {};
    const { [identifiantKey]: identifiant, [passwordKey]: password, ...otherData } = req.body;

    // Check if password hashing is enabled (default to true if not specified)
    const usePasswordHash = authConfig?.usePasswordHash !== undefined ? authConfig.usePasswordHash : AUTH.DEFAULT_USE_PASSWORD_HASH;

    // Log registration attempt
    logger("info", "Registration attempt", { identifiant, collection: model.modelName, usePasswordHash });

    if (!identifiant || !password) {
      throw new ValidationError(`${identifiantKey} and ${passwordKey} are required in body`, {
        missingFields: !identifiant ? [identifiantKey] : !password ? [passwordKey] : [identifiantKey, passwordKey],
      });
    }

    // Check if user already exists
    const existingUser = await model.getMany({ [identifiantKey]: identifiant }, {});

    if (existingUser && existingUser.length > 0) {
      logger("warn", "Registration failed - User already exists", { identifiant, collection: model.modelName });
      throw new ConflictError(ERROR_MESSAGES.USER_ALREADY_EXISTS, { identifiant });
    }

    // Hash password if enabled, otherwise store as plain text
    const processedPassword = await hashPassword(password, usePasswordHash);

    // Create user
    const newUser = await model.addOne({
      [identifiantKey]: identifiant,
      [passwordKey]: processedPassword,
      ...otherData,
    });

    // Generate token
    if (!authConfig?.authMiddlewareOptions?.secret) {
      logger("error", "JWT secret not configured", { collection: model.modelName });
      throw new AppError(ERROR_MESSAGES.JWT_SECRET_NOT_CONFIGURED, HTTP_STATUS.INTERNAL_SERVER_ERROR, "ConfigurationError");
    }

    // Create user object without password for token payload
    const userForToken = sanitizeDocument(extractUserData(newUser), [passwordKey]);

    // Get collection name from model for access control
    const collectionName = model.collectionName;

    // Generate access token (short-lived)
    const accessToken = generateToken(userForToken, authConfig.authMiddlewareOptions.secret, { expiresIn: AUTH.DEFAULT_TOKEN_EXPIRY }, collectionName);

    // Generate refresh token with jti for rotation tracking
    const jti = crypto.randomUUID();
    const refreshTokenExpiry = "7d";
    const refreshToken = generateToken(
      { ...userForToken, jti },
      authConfig.authMiddlewareOptions.secret,
      { expiresIn: refreshTokenExpiry },
      collectionName
    );

    // Store refresh token jti for rotation validation
    const decodedRefresh = jwt.decode(refreshToken);
    storeSet(jti, {
      userId: userForToken._id || userForToken.id,
      expiresAt: (decodedRefresh.exp || 0) * 1000,
    });

    logger("info", "Registration successful", { userId: userForToken._id, collection: model.modelName });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        user: userForToken,
        token: accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /{model}/refresh-token - Refresh authentication token
 */
async function refreshToken(req, res, next, model, authConfig) {
  try {
    // Extract token from request
    const { token } = req.body;

    if (!token) {
      throw new ValidationError("Token is required in request body", {
        missingFields: ["token"],
      });
    }

    // Verify the existing token
    if (!authConfig?.authMiddlewareOptions?.secret) {
      logger("error", "JWT secret not configured", { collection: model.modelName });
      throw new AppError(ERROR_MESSAGES.JWT_SECRET_NOT_CONFIGURED, HTTP_STATUS.INTERNAL_SERVER_ERROR, "ConfigurationError");
    }

    let decoded;
    try {
      decoded = verifyToken(token, authConfig.authMiddlewareOptions.secret);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new AuthenticationError("Refresh token has expired"));
      } else {
        return next(new AuthenticationError("Invalid token"));
      }
    }

    if (!decoded) {
      logger("warn", "Token refresh failed - Invalid token");
      throw new AuthenticationError(ERROR_MESSAGES.INVALID_AUTHENTICATION_TOKEN);
    }

    // Ensure the token is actually a refresh token by checking for jti
    if (!decoded.jti) {
      logger("warn", "Token refresh failed - Not a refresh token");
      throw new AuthenticationError("Invalid token type");
    }

    // Check if the refresh token's jti is still valid (rotation tracking)
    if (!storeHas(decoded.jti)) {
      logger("warn", "Token refresh failed - Refresh token already used or revoked", { jti: decoded.jti });
      throw new AuthenticationError("Refresh token has been revoked or already used");
    }

    // Revoke the old refresh token by removing its jti from the store
    storeDelete(decoded.jti);

    // Get user data from the token
    const userId = decoded._id || decoded.id;
    if (!userId) {
      logger("warn", "Token refresh failed - No user ID in token");
      throw new AuthenticationError("Invalid token payload");
    }

    // Find the user in the database to ensure they still exist
    const user = await model.getOneById(userId);
    if (!user) {
      logger("warn", "Token refresh failed - User not found", { userId });
      throw new AuthenticationError("User not found");
    }

    // Create user object without password for token payload
    const passwordKey = authConfig?.keys?.passwordKey || AUTH.DEFAULT_PASSWORD_KEY;
    const userForToken = sanitizeDocument(extractUserData(user), [passwordKey]);

    // Get collection name from model for access control
    const collectionName = model.collectionName;

    // Generate new access token
    const newAccessToken = generateToken(userForToken, authConfig.authMiddlewareOptions.secret, { expiresIn: AUTH.DEFAULT_TOKEN_EXPIRY }, collectionName);

    // Generate new refresh token with a new jti (rotation)
    const newJti = crypto.randomUUID();
    const refreshTokenExpiry = "7d";
    const newRefreshToken = generateToken(
      { ...userForToken, jti: newJti },
      authConfig.authMiddlewareOptions.secret,
      { expiresIn: refreshTokenExpiry },
      collectionName
    );

    // Store the new refresh token jti
    const decodedNewRefresh = jwt.decode(newRefreshToken);
    storeSet(newJti, {
      userId: userForToken._id || userForToken.id,
      expiresAt: (decodedNewRefresh.exp || 0) * 1000,
    });

    logger("info", "Token refresh successful", { userId, collection: model.modelName });

    res.json({
      success: true,
      data: {
        user: userForToken,
        token: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /{model}/me - Get current user data from token
 */
async function getUserByToken(req, res, next, model, authConfig) {
  try {
    // User data is already available in req.user from the auth middleware
    if (!req.user) {
      throw new AuthenticationError(ERROR_MESSAGES.AUTHENTICATION_TOKEN_REQUIRED);
    }

    // Get user ID from token
    const userId = req.user._id || req.user.id;
    if (!userId) {
      throw new AuthenticationError("Invalid token payload");
    }

    // Find the user in the database to get the latest data
    const user = await model.getOneById(userId);
    if (!user) {
      throw new AuthenticationError("User not found");
    }

    // Create user object without password for response
    const passwordKey = authConfig?.keys?.passwordKey || AUTH.DEFAULT_PASSWORD_KEY;
    const userForResponse = sanitizeDocument(extractUserData(user), [passwordKey]);

    logger("info", "User data retrieved by token", { userId, collection: model.modelName });

    res.json({
      success: true,
      data: userForResponse,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  register,
  refreshToken,
  getUserByToken,
};
