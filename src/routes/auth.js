/**
 * Authentication route handlers for Router class
 */
const { verifyPassword, hashPassword } = require("../utils/password");
const { generateToken, verifyToken } = require("../utils/token");
const { AUTH, ERROR_MESSAGES, HTTP_STATUS } = require("../utils/constants");
const { ValidationError, AuthenticationError, ConflictError, AppError, logger } = require("../utils/errors");

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
    const user = await model.getMany({ [identifiantKey]: identifiant }, {});
    const currentUser = user?.[0]?._doc || user?.[0]?.dataValues;

    if (!currentUser) {
      logger("warn", "Login failed - User not found", { identifiant, collection: model.modelName });
      throw new AuthenticationError(ERROR_MESSAGES.INVALID_CREDENTIALS, { identifiant });
    }

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
    const userForToken = { ...currentUser };
    delete userForToken?.[passwordKey];

    // Get collection name from model for access control
    const collectionName = model.collectionName;
    const token = generateToken(userForToken, authConfig.authMiddlewareOptions.secret, { expiresIn: AUTH.DEFAULT_TOKEN_EXPIRY }, collectionName);

    // Display
    logger("info", "Login successful", { userId: userForToken._id, collection: model.modelName });

    res.json({
      success: true,
      data: {
        user: userForToken,
        token,
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
    const userForToken = { ...(newUser._doc || newUser.dataValues) };
    delete userForToken?.[passwordKey];

    // Get collection name from model for access control
    const collectionName = model.collectionName;

    const token = generateToken(userForToken, authConfig.authMiddlewareOptions.secret, { expiresIn: AUTH.DEFAULT_TOKEN_EXPIRY }, collectionName);

    logger("info", "Registration successful", { userId: userForToken._id, collection: model.modelName });

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: {
        user: userForToken,
        token,
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

    const decoded = verifyToken(token, authConfig.authMiddlewareOptions.secret);

    if (!decoded) {
      logger("warn", "Token refresh failed - Invalid token");
      throw new AuthenticationError(ERROR_MESSAGES.INVALID_AUTHENTICATION_TOKEN);
    }

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
    const userForToken = { ...(user._doc || user.dataValues) };
    delete userForToken?.[passwordKey];

    // Get collection name from model for access control
    const collectionName = model.collectionName;

    // Generate new token
    const newToken = generateToken(userForToken, authConfig.authMiddlewareOptions.secret, { expiresIn: AUTH.DEFAULT_TOKEN_EXPIRY }, collectionName);

    logger("info", "Token refresh successful", { userId, collection: model.modelName });

    res.json({
      success: true,
      data: {
        user: userForToken,
        token: newToken,
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
    const userForResponse = { ...(user._doc || user.dataValues) };
    delete userForResponse?.[passwordKey];

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
