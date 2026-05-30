# Error Handling

How errors are structured, caught, and returned across the entire API.

## Table of Contents

- [Overview](#overview)
- [Error Response Format](#error-response-format)
- [Error Classes](#error-classes)
  - [AppError (base)](#apperror-base)
  - [ValidationError](#validationerror)
  - [AuthenticationError](#authenticationerror)
  - [TokenExpiredError](#tokenexpirederror)
  - [AuthorizationError](#authorizationerror)
  - [AccessDeniedError](#accessdeniederror)
  - [NotFoundError](#notfounderror)
  - [ConflictError](#conflicterror)
  - [RateLimitError](#ratelimiterror)
  - [DatabaseError](#databaseerror)
  - [ConfigurationError (ad-hoc)](#configurationerror-ad-hoc)
- [Error Handler Middleware](#error-handler-middleware)
  - [Processing Order](#processing-order)
  - [Handled Error Types](#handled-error-types)
- [Common Error Responses](#common-error-responses)
- [Throwing Errors in Custom Routes](#throwing-errors-in-custom-routes)

---

## Overview

All errors follow a standardized JSON response format. The global `errorHandler` middleware catches every error thrown in route handlers and converts it to a consistent structure.

**Key principles:**

- All custom errors extend `AppError`
- Every error has a `statusCode`, `type`, `message`, and `details`
- The error handler catches both custom and third-party errors
- No stack traces are exposed in responses — unknown errors return a generic `"Internal server error"` message while the original error is logged server-side
- `AppError` calls `Error.captureStackTrace()` for clean stack traces in logs

---

## Error Response Format

Every error response follows this structure:

```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "fields": {
        "email": "\"email\" is required"
      }
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

| Field              | Type      | Description                                                             |
| ------------------ | --------- | ----------------------------------------------------------------------- |
| `success`          | `Boolean` | Always `false` for errors.                                              |
| `error.message`    | `String`  | Human-readable error message.                                           |
| `error.type`       | `String`  | Error class name (e.g. `"ValidationError"`, `"AuthenticationError"`).   |
| `error.statusCode` | `Number`  | HTTP status code.                                                       |
| `error.details`    | `Object`  | Additional context (varies by error type; defaults to `{}`).            |
| `error.timestamp`  | `String`  | ISO 8601 timestamp (set at construction time, not at response time).    |

> **Note:** The malformed JSON body handler returns a simplified format without `type`, `details`, or `timestamp` fields. See [Handled Error Types](#malformed-json-body) below.

---

## Error Classes

### AppError (base)

The base class for all custom errors. Not typically used directly, except for unknown errors and ad-hoc types like `ConfigurationError`.

| Property     | Default      | Description                                                    |
| ------------ | ------------ | -------------------------------------------------------------- |
| `statusCode` | `500`        | HTTP status code.                                              |
| `type`       | `"AppError"` | Error type string.                                             |
| `message`    | —            | Error message.                                                 |
| `details`    | `{}`         | Additional details.                                            |
| `timestamp`  | —            | ISO 8601 string, set at construction time via `new Date().toISOString()`. |
| `name`       | —            | Set to `this.constructor.name` (e.g. `"ValidationError"`).    |

Constructor signature: `new AppError(message, statusCode, type, details)`

`AppError` also calls `Error.captureStackTrace(this, this.constructor)` for cleaner stack traces in server-side logs.

The `toJSON()` method returns the standard error response envelope `{ success: false, error: { ... } }`.

---

### ValidationError

Thrown when request data fails validation.

- **Status:** `400`
- **Type:** `"ValidationError"`
- **Default message:** `"Validation failed"`

**Common causes:**

- Missing required fields in request body (e.g. login without email/password)
- Invalid field formats (e.g., non-email string for email field)
- Empty filter in `updateMany` or `deleteMany`
- Invalid sort or fields parameter format
- Joi schema validation failure

```json
{
  "success": false,
  "error": {
    "message": "Validation error: email: \"email\" is required",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "fields": {
        "email": "\"email\" is required"
      }
    },
    "timestamp": "..."
  }
}
```

**Note on Joi validation:** The `validate()` middleware in `validation.js` converts Joi errors to `ValidationError` directly before calling `next(error)`. This means Joi errors typically reach the error handler already wrapped as `ValidationError`, not as raw Joi errors. The `err.isJoi` branch in the error handler serves as a fallback for Joi errors thrown outside the `validate()` middleware.

---

### AuthenticationError

Thrown when authentication fails.

- **Status:** `401`
- **Type:** `"AuthenticationError"`
- **Default message:** `"Authentication failed"`

**Common causes:**

- Invalid credentials on login
- Missing authentication token
- Invalid authentication token
- User not found during token refresh
- Refresh token has been revoked or already used
- Invalid token payload (e.g., no user ID in token)

```json
{
  "success": false,
  "error": {
    "message": "Invalid credentials",
    "type": "AuthenticationError",
    "statusCode": 401,
    "details": { "identifiant": "user@example.com" },
    "timestamp": "..."
  }
}
```

---

### TokenExpiredError

Thrown when a JWT token has expired. Extends `AuthenticationError`.

- **Status:** `401`
- **Type:** `"TokenExpiredError"`
- **Default message:** `"Token has expired"`

Constructor signature: `new TokenExpiredError(message, expiredAt, details)`

The `expiredAt` parameter is a separate positional argument (not part of `details`). If provided, it is merged into the `details` object under the key `expiredAt`.

**Details include:** `expiredAt` — the timestamp when the token expired (from the JWT library's `expiredAt` property).

```json
{
  "success": false,
  "error": {
    "message": "JWT token has expired",
    "type": "TokenExpiredError",
    "statusCode": 401,
    "details": {
      "expiredAt": "2024-01-15T12:00:00.000Z"
    },
    "timestamp": "..."
  }
}
```

The `TokenExpiredError` is thrown in `utils/token.js` when the `jsonwebtoken` library's `verify()` throws its own `TokenExpiredError`. The custom class wraps the JWT library's error and extracts the `expiredAt` value. The auth middleware catches `TokenExpiredError` specifically and passes it through to the error handler.

---

### AuthorizationError

Thrown when a user is not authorized for an action.

- **Status:** `403`
- **Type:** `"AuthorizationError"`
- **Default message:** `"Not authorized"`

---

### AccessDeniedError

Thrown when collection-based access control denies a request. Extends `AuthorizationError`.

- **Status:** `403`
- **Type:** `"AccessDeniedError"`
- **Default message:** `"Access denied: Insufficient collection permissions"`

The `name` property is explicitly set to `"AccessDeniedError"` (overriding the inherited `AuthorizationError` name).

**Common cause:** User's `_collection` (from the JWT payload) does not have access to the requested route, as determined by the `collectionAccess` configuration.

```json
{
  "success": false,
  "error": {
    "message": "Access denied: Insufficient collection permissions",
    "type": "AccessDeniedError",
    "statusCode": 403,
    "details": {},
    "timestamp": "..."
  }
}
```

---

### NotFoundError

Thrown when a requested resource is not found.

- **Status:** `404`
- **Type:** `"NotFoundError"`
- **Default message:** `"Resource not found"`

**Common causes:**

- Document with given ID does not exist (in `getOneById`, `updateOneById`, `deleteOneById`)
- User not found during token refresh or profile fetch

```json
{
  "success": false,
  "error": {
    "message": "Document with ID 64a1b2c3 not found",
    "type": "NotFoundError",
    "statusCode": 404,
    "details": { "id": "64a1b2c3", "collection": "users" },
    "timestamp": "..."
  }
}
```

---

### ConflictError

Thrown on duplicate resource conflicts.

- **Status:** `409`
- **Type:** `"ConflictError"`
- **Default message:** `"Resource conflict"`

**Common causes:**

- Register with an already-existing identifier
- MongoDB duplicate key error (code `11000`)

```json
{
  "success": false,
  "error": {
    "message": "User with this credentials already exists",
    "type": "ConflictError",
    "statusCode": 409,
    "details": { "identifiant": "user@example.com" },
    "timestamp": "..."
  }
}
```

---

### RateLimitError

Thrown when rate limiting is exceeded.

- **Status:** `429`
- **Type:** `"RateLimitError"`
- **Default message:** `"Too many requests"`

**Details include:** `retryAfter` — human-readable duration string generated by the `secondsToDuration()` utility (e.g., `"15 minutes"`, `"1 minute"`, `"60 seconds"`).

The `retryAfter` value is computed from the rate limit window and the `RateLimit` response header. Three rate limiters produce this error:

| Limiter              | When Applied                                         | Key                             |
| -------------------- | ---------------------------------------------------- | ------------------------------- |
| `defaultRateLimiter` | All requests (global)                                | IP address                      |
| `ipStrictLimiter`    | Auth routes (login, register, refreshToken) — first  | IP address (3x threshold)       |
| `strictRateLimiter`  | Auth routes (login, register, refreshToken) — second | `{ip}_{identifier}` combination |

```json
{
  "success": false,
  "error": {
    "message": "Too many requests from this IP, please try again later",
    "type": "RateLimitError",
    "statusCode": 429,
    "details": {
      "retryAfter": "15 minutes"
    },
    "timestamp": "..."
  }
}
```

---

### DatabaseError

Thrown when a database operation fails.

- **Status:** `500`
- **Type:** `"DatabaseError"`
- **Default message:** `"Database operation failed"`

**Details include:** The collection name and/or query context. Each model method wraps the underlying driver error with relevant context (e.g., `{ collection: modelName }`, `{ id, collection }`, `{ query, collection }`).

```json
{
  "success": false,
  "error": {
    "message": "Error getting all documents: Connection timed out",
    "type": "DatabaseError",
    "statusCode": 500,
    "details": { "collection": "users" },
    "timestamp": "..."
  }
}
```

---

### ConfigurationError (ad-hoc)

Not a dedicated error class. When the JWT secret is not configured during login, registration, or token refresh, the code throws an `AppError` with type `"ConfigurationError"`:

```javascript
throw new AppError(
  ERROR_MESSAGES.JWT_SECRET_NOT_CONFIGURED,  // "JWT secret is not configured"
  HTTP_STATUS.INTERNAL_SERVER_ERROR,          // 500
  "ConfigurationError"
);
```

- **Status:** `500`
- **Type:** `"ConfigurationError"`
- **Message:** `"JWT secret is not configured"`

This is caught by the `instanceof AppError` branch of the error handler and returned with the standard format.

---

## Error Handler Middleware

The `errorHandler` middleware is added as the **last** middleware on the Express app (in `Server.start()`). It catches all errors passed to `next(error)` and converts them to JSON responses.

### Processing Order

Errors are processed in the following order:

| Priority | Check                                           | Result                                  |
| -------- | ----------------------------------------------- | --------------------------------------- |
| 1        | `instanceof AppError`                           | Uses error's own `statusCode` and `toJSON()` |
| 2        | `err.isJoi` (Joi validation)                    | → `ValidationError` (400)               |
| 3        | `err.name === "ValidationError"` (Mongoose)     | → `ValidationError` (400)               |
| 4        | `err.name === "CastError"` (Mongoose)           | → `ValidationError` (400)               |
| 5        | `err.code === 11000` (MongoDB duplicate key)    | → `ConflictError` (409)                 |
| 6        | `err.type === "entity.parse.failed" \|\| err instanceof SyntaxError` | → 400 with simplified format |
| 7        | Default (anything else)                         | → `AppError("Internal server error")` (500) |

---

### Handled Error Types

**Custom `AppError` instances** (`instanceof AppError`):

- Returned directly using the error's own `statusCode` and `toJSON()`.
- This includes all custom error subclasses: `ValidationError`, `AuthenticationError`, `TokenExpiredError`, `AuthorizationError`, `AccessDeniedError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `DatabaseError`, and ad-hoc types like `ConfigurationError`.

**Joi validation errors** (`err.isJoi`):

- Formatted into a fields map with per-field messages.
- Wrapped in `ValidationError(`"Validation error: ..."`, { fields: { ... } })`.
- **Note:** The `validate()` middleware in `validation.js` already converts Joi errors to `ValidationError` before calling `next()`. This branch in the error handler is a fallback for Joi errors thrown outside the `validate()` middleware.

**Mongoose validation errors** (`err.name === "ValidationError"`):

- Extracts each field's error message from `err.errors`.
- Wrapped in `ValidationError("Validation failed", { errors: { ... } })`.
- **Note:** `MongoDBModel` catches Mongoose validation errors and re-throws them as custom `ValidationError` before they reach the error handler. This branch is a fallback.

**Mongoose CastError** (`err.name === "CastError"`):

- Indicates an invalid ID format.
- Wrapped in `ValidationError("Invalid ID format", { path, value })`.
- **Note:** `MongoDBModel` catches `CastError` and re-throws as custom `ValidationError` before they reach the error handler. This branch is a fallback.

**MongoDB duplicate key** (`err.code === 11000`):

- Wrapped in `ConflictError("Duplicate key error", { keyPattern, keyValue })`.
- **Note:** `MongoDBModel` catches duplicate key errors and re-throws them as custom `ValidationError` before they reach the error handler. This branch is a fallback.

**Malformed JSON body** (`err.type === "entity.parse.failed" || err instanceof SyntaxError`):

- Returns a simplified response format (status 400):

```json
{
  "success": false,
  "error": {
    "message": "Invalid JSON in request body",
    "statusCode": 400
  }
}
```

> **Note:** This is the only error type that does not include `type`, `details`, or `timestamp` fields in the response. This is because the error is constructed inline rather than through an `AppError` subclass.

**Unknown errors** (anything else):

- The original error message and stack are logged server-side via `logger("error", ...)`.
- A generic `AppError("Internal server error")` is returned to the client with status `500`.
- The original error message is **not** exposed to the client for security reasons.

---

## Common Error Responses

### Missing Required Fields (Login/Register)

```json
{
  "success": false,
  "error": {
    "message": "email and password are required in body",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {
      "missingFields": ["email", "password"]
    },
    "timestamp": "..."
  }
}
```

### Empty Filter on Bulk Operation

```json
{
  "success": false,
  "error": {
    "message": "Empty filter is not allowed for safety reasons.",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {},
    "timestamp": "..."
  }
}
```

### Invalid Token

```json
{
  "success": false,
  "error": {
    "message": "Invalid authentication token",
    "type": "AuthenticationError",
    "statusCode": 401,
    "details": {},
    "timestamp": "..."
  }
}
```

### Duplicate Registration

```json
{
  "success": false,
  "error": {
    "message": "User with this credentials already exists",
    "type": "ConflictError",
    "statusCode": 409,
    "details": { "identifiant": "user@example.com" },
    "timestamp": "..."
  }
}
```

### Rate Limit Exceeded

```json
{
  "success": false,
  "error": {
    "message": "Too many authentication attempts, please try again later",
    "type": "RateLimitError",
    "statusCode": 429,
    "details": { "retryAfter": "1 minute" },
    "timestamp": "..."
  }
}
```

### Malformed JSON Body

```json
{
  "success": false,
  "error": {
    "message": "Invalid JSON in request body",
    "statusCode": 400
  }
}
```

### JWT Secret Not Configured

```json
{
  "success": false,
  "error": {
    "message": "JWT secret is not configured",
    "type": "ConfigurationError",
    "statusCode": 500,
    "details": {},
    "timestamp": "..."
  }
}
```

---

## Throwing Errors in Custom Routes

When using `otherRoutes`, you can throw custom errors for consistent responses. Import error classes from the package's `utils/errors` module:

```javascript
const {
  ValidationError,
  NotFoundError,
  AuthenticationError,
} = require("@el-zazo/server-creator/src/utils/errors");

otherRoutes: [
  {
    method: "POST",
    path: "/orders",
    handler: (req, res, next) => {
      if (!req.body.productId) {
        return next(new ValidationError("productId is required"));
      }

      const order = findOrder(req.body.productId);
      if (!order) {
        return next(new NotFoundError("Order not found"));
      }

      res.json({ success: true, data: order });
    },
    isProtected: true,
  },
];
```

> **Important:** The package's `index.js` only exports `DB` and `Server`. Error classes are not part of the public API surface. To use them in custom routes, import directly from `@el-zazo/server-creator/src/utils/errors` or create your own `AppError` subclass.

> Always use `next(error)` to pass errors to the error handler. Do not call `res.status().json()` directly for errors — the error handler provides consistent formatting, logging, and security (hiding internal details from the client).

---

← [Back to README](../README.md)
