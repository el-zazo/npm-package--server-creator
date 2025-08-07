# Rate Limiting in Auto-Server

## Overview

Rate limiting is a security feature that helps protect your API from abuse by limiting the number of requests a client can make within a specified time window. This prevents malicious users from overwhelming your server with too many requests, which could lead to degraded performance or even a denial of service.

## Implementation

Auto-Server implements rate limiting using the `express-rate-limit` middleware. Two types of rate limiters are available:

1. **Default Rate Limiter**: Applied globally to all routes

   - Default window: 15 minutes
   - Default limit: 100 requests per window

2. **Strict Rate Limiter**: Applied to sensitive routes (authentication endpoints)
   - Default window: 1 minute
   - Default limit: 5 requests per window

## Configuration

Rate limiting can be configured through the constants defined in `src/utils/constants.js`:

```javascript
const RATE_LIMIT = {
  DEFAULT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  DEFAULT_MAX_REQUESTS: 100, // 100 requests per window
  STRICT_WINDOW_MS: 60 * 1000, // 1 minute
  STRICT_MAX_REQUESTS: 5, // 5 requests per minute
};
```

## Custom Rate Limiters

You can create custom rate limiters for specific routes using the `createRateLimiter` function:

```javascript
const { createRateLimiter } = require("./middleware/rate-limit");

// Create a custom rate limiter
const customLimiter = createRateLimiter({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 50, // 50 requests per window
  message: "Custom rate limit message",
});

// Apply to a specific route
app.use("/api/sensitive-endpoint", customLimiter, routeHandler);
```

### Rate Limiting for Custom Routes

For custom routes defined through the `otherRoutes` option in the DB constructor, you can apply rate limiting by including the rate limiter middleware:

```javascript
const { createRateLimiter } = require("./middleware/rate-limit");

// Create a custom rate limiter
const webhookLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 requests per window
  message: "Too many webhook requests, please try again later",
});

const db = new DB({
  // Database configuration...
  otherRoutes: [
    {
      method: "POST",
      path: "/webhook",
      handler: (req, res, next) => {
        // Process webhook data
        res.json({ success: true });
      },
      middleware: [webhookLimiter], // Apply rate limiting middleware
      isProtected: true,
      prefix: "/api/v1", // Custom prefix for this route
    },
  ],
});
```

## Response Headers

When rate limiting is applied, the following headers are included in the response:

- `RateLimit-Limit`: Maximum number of requests allowed in the window
- `RateLimit-Remaining`: Number of requests remaining in the current window
- `RateLimit-Reset`: Time when the current window resets (in seconds)

## Error Handling

When a client exceeds the rate limit, a `429 Too Many Requests` response is returned with a JSON error message:

```json
{
  "success": false,
  "error": {
    "message": "Too many requests from this IP, please try again later",
    "type": "RateLimitError",
    "statusCode": 429,
    "details": {
      "retryAfter": "00:09:48"
    },
    "timestamp": "2023-06-01T12:00:00.000Z"
  }
}
```

The `retryAfter` field indicates the duration after which the client can retry the request.
