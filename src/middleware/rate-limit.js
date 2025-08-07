/**
 * Rate limiting middleware to prevent API abuse
 */
const { rateLimit } = require("express-rate-limit");
const { HTTP_STATUS, ERROR_MESSAGES, RATE_LIMIT } = require("../utils/constants");
const { RateLimitError } = require("../utils/errors");
const { secondsToDuration } = require("@el-zazo/main-utils");

/**
 * Create a rate limiter middleware with configurable options
 * @param {Object} options - Rate limiting options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of requests per window
 * @param {string} options.message - Error message to display when limit is exceeded
 * @param {boolean} options.standardHeaders - Whether to include standard rate limit headers
 * @param {boolean} options.legacyHeaders - Whether to include legacy X-RateLimit headers
 * @returns {Function} - Express middleware function
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: RATE_LIMIT.DEFAULT_WINDOW_MS,
    max: RATE_LIMIT.DEFAULT_MAX_REQUESTS,
    message: ERROR_MESSAGES.TOO_MANY_REQUESTS,
    standardHeaders: "draft-8", // Return rate limit info in the `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res, next, options) => {
      // Get the reset timestamp from the rate limiter
      // This is the time when the current window resets in seconds since epoch
      const resetTime = res.getHeader("RateLimit");

      // Parse the time value from the RateLimit header
      let retryAfterSeconds = Math.ceil(options.windowMs / 1000);

      if (resetTime) {
        if (Array.isArray(resetTime)) {
          // Extract the smallest 't=' value from the policy strings
          const timeValues = resetTime.map((policy) => {
            const match = policy.match(/t=(\d+)/);
            return match ? parseInt(match[1], 10) : Infinity;
          });

          const minTimeValue = Math.min(...timeValues);
          if (minTimeValue !== Infinity) {
            retryAfterSeconds = minTimeValue;
          }
        } else if (typeof resetTime === "string") {
          // Handle format like: 'resetTime: "100-in-15min"; r=0; t=790'
          const tMatch = resetTime.match(/t=(\d+)/);
          if (tMatch) {
            retryAfterSeconds = parseInt(tMatch[1], 10);
          }
        }
      }

      next(
        new RateLimitError(options.message, {
          retryAfter: `${secondsToDuration(retryAfterSeconds)}`,
        })
      );
    },
  };

  // Merge default options with provided options
  const mergedOptions = { ...defaultOptions, ...options };

  return rateLimit(mergedOptions);
};

/**
 * Default rate limiter with standard configuration
 */
const defaultRateLimiter = createRateLimiter();

/**
 * Strict rate limiter for sensitive endpoints (auth, etc.)
 */
const strictRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT.STRICT_WINDOW_MS,
  max: RATE_LIMIT.STRICT_MAX_REQUESTS,
  message: ERROR_MESSAGES.TOO_MANY_AUTH_ATTEMPTS,
});

module.exports = {
  createRateLimiter,
  defaultRateLimiter,
  strictRateLimiter,
};
