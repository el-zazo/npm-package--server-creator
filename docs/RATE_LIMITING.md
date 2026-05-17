# Rate Limiting

How rate limiting protects your API from abuse and how to configure it.

## Table of Contents

- [Overview](#overview)
- [Default Rate Limiter](#default-rate-limiter)
- [IP Strict Rate Limiter](#ip-strict-rate-limiter)
- [Strict Rate Limiter (Per-Identifier)](#strict-rate-limiter-per-identifier)
- [Where Rate Limiters Are Applied](#where-rate-limiters-are-applied)
- [Rate Limit Response](#rate-limit-response)
- [Rate Limit Headers](#rate-limit-headers)
- [retryAfter Computation](#retryafter-computation)
- [Custom Rate Limiter](#custom-rate-limiter)
- [Configuration Reference](#configuration-reference)
- [Examples](#examples)

---

## Overview

The package uses `express-rate-limit` to protect your API from excessive requests. Three pre-configured rate limiters are provided:

| Limiter            | Window | Max Requests | Key              | Purpose                                    |
| ------------------ | ------ | ------------ | ---------------- | ------------------------------------------ |
| Default            | 15 min | 100          | IP address       | All API endpoints                          |
| IP Strict          | 1 min  | 15 (=5×3)    | IP address       | Auth endpoints — prevents IP-level abuse   |
| Strict (per-ident) | 1 min  | 5            | `IP_identifier`  | Auth endpoints — prevents credential brute-force |

Rate limiting is enabled by default and requires no configuration.

---

## Default Rate Limiter

The default rate limiter is applied **globally** to every request in the `Server` class via `this.app.use(defaultRateLimiter)`.

| Setting           | Value                                                      |
| ----------------- | ---------------------------------------------------------- |
| `windowMs`        | `900000` (15 minutes)                                      |
| `max`             | `100` requests per window                                  |
| `message`         | `"Too many requests from this IP, please try again later"` |
| `standardHeaders` | `"draft-8"` (RateLimit header)                             |
| `legacyHeaders`   | `false` (no X-RateLimit-\* headers)                        |
| `keyGenerator`    | Default (per-IP address)                                   |

> Rate limiting is per-IP address. Each IP gets its own window and counter.

---

## IP Strict Rate Limiter

The IP strict rate limiter (`ipStrictLimiter`) is an **IP-only** rate limiter applied to authentication routes as the first line of defense. It prevents bypass via rotating identifiers (e.g., using a different email address for each request from the same IP).

| Setting           | Value                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| `windowMs`        | `60000` (1 minute)                                                             |
| `max`             | `15` requests per window (= `STRICT_MAX_REQUESTS × 3`)                         |
| `keyGenerator`    | `req.ip \|\| req.socket?.remoteAddress \|\| "unknown"`                         |
| `standardHeaders` | `true` (boolean)                                                               |
| `legacyHeaders`   | `false`                                                                        |

**Custom handler message:** `"Too many attempts from this IP. Please try again after 1 minute"`

The 3× multiplier gives legitimate users more headroom at the IP level while the stricter per-identifier limiter (max=5) catches brute-force attempts against a single account. This two-tier approach means:

- A single IP can try up to 15 different usernames per minute (IP limiter)
- But only 5 attempts per specific username per minute (identifier limiter)

---

## Strict Rate Limiter (Per-Identifier)

The strict rate limiter (`strictRateLimiter`) uses a **composite key** combining the client's IP address with the request identifier (email, username, or identifier from the request body). This prevents brute-force attacks against a specific account while still allowing multiple users behind the same IP to authenticate.

| Setting           | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| `windowMs`        | `60000` (1 minute)                                           |
| `max`             | `5` requests per window                                      |
| `message`         | `"Too many authentication attempts, please try again later"` |
| `standardHeaders` | `"draft-8"` (RateLimit header)                               |
| `legacyHeaders`   | `false`                                                      |

**Key generator:**

```javascript
keyGenerator: (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown-ip";
  const identifier = req.body?.email || req.body?.username || req.body?.identifier || "unknown";
  return `${ip}_${identifier}`;
}
```

The key is always combined with the IP address to prevent an attacker from bypassing the limit by rotating identifiers alone. The identifier is extracted from `req.body` in the following priority: `email` → `username` → `identifier` → `"unknown"`.

---

## Where Rate Limiters Are Applied

```
┌──────────────────────────────────────────────────────────────┐
│  Server — defaultRateLimiter (all requests, per-IP)          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  login       → ipStrictLimiter + strictRateLimiter     │  │
│  │  register    → ipStrictLimiter + strictRateLimiter     │  │
│  │  refreshToken → ipStrictLimiter + strictRateLimiter    │  │
│  │  getUserByToken → no additional rate limiting          │  │
│  │  CRUD routes    → no additional rate limiting          │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

- **Layer 1 (global):** Default limiter — applies to every incoming request (per-IP, 100/15min).
- **Layer 2 (auth routes):** IP Strict limiter — applies to `login`, `register`, and `refreshToken` (per-IP, 15/1min).
- **Layer 3 (auth routes):** Strict per-identifier limiter — applies to `login`, `register`, and `refreshToken` (per-IP+identifier, 5/1min).

A request to `POST /login` must pass **all three** limiters. If the default limiter blocks it, the IP strict and per-identifier limiters are never reached. If the IP strict limiter blocks it, the per-identifier limiter is never reached.

The rate limiters are added as part of the validation middleware stack in `Router.getValidationMiddleware()`, applied **before** the validation schema:

```javascript
case "login":
  middlewares.push(ipStrictLimiter, strictRateLimiter, validate(this.loginSchema));
  break;
case "register":
  middlewares.push(ipStrictLimiter, strictRateLimiter, validate(this.registerSchema));
  break;
case "refreshToken":
  middlewares.push(ipStrictLimiter, strictRateLimiter, validate(schemas.auth.refreshToken));
  break;
```

---

## Rate Limit Response

When a rate limit is exceeded, all limiters throw a `RateLimitError` (status 429) via `next()`, which is caught by the global error handler.

### Default limiter exceeded

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
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### IP strict limiter exceeded

```json
{
  "success": false,
  "error": {
    "message": "Too many attempts from this IP. Please try again after 1 minute",
    "type": "RateLimitError",
    "statusCode": 429,
    "details": {},
    "timestamp": "2024-01-15T10:30:00.000Z"
}
```

> **Note:** The IP strict limiter's custom handler does not include a `retryAfter` detail — the duration is embedded directly in the message string.

### Strict per-identifier limiter exceeded

```json
{
  "success": false,
  "error": {
    "message": "Too many authentication attempts, please try again later",
    "type": "RateLimitError",
    "statusCode": 429,
    "details": {
      "retryAfter": "1 minute"
    },
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

The `retryAfter` value (when present) is a human-readable duration generated by the `secondsToDuration()` utility (e.g., `"15 minutes"`, `"1 minute"`, `"60 seconds"`).

---

## Rate Limit Headers

Responses include the standardized `RateLimit` header:

```
RateLimit: limit=100, remaining=95, reset=1705312200
```

| Limiter            | `standardHeaders` | `legacyHeaders` |
| ------------------ | ----------------- | --------------- |
| Default            | `"draft-8"`       | `false`         |
| IP Strict          | `true`            | `false`         |
| Strict per-ident   | `"draft-8"`       | `false`         |

> Legacy headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, etc.) are explicitly disabled on all limiters. The `ipStrictLimiter` uses `standardHeaders: true` (boolean) rather than `"draft-8"`, which enables the standard headers using the library's default format.

---

## retryAfter Computation

The `defaultRateLimiter` and `strictRateLimiter` both compute the `retryAfter` value dynamically from the `RateLimit` response header set by `express-rate-limit`:

1. Read the `RateLimit` header from the response (`res.getHeader("RateLimit")`).
2. If the header is an array (multiple policies), extract the smallest `t=` value from each policy string.
3. If the header is a string, extract the `t=` value directly (format: `limit=100; r=0; t=790`).
4. If no `t=` value can be parsed, fall back to `Math.ceil(options.windowMs / 1000)`.
5. Convert seconds to a human-readable string via `secondsToDuration()`.

The `ipStrictLimiter` uses a simpler approach — the duration is hardcoded from `RATE_LIMIT.STRICT_WINDOW_MS / 1000` and embedded directly in the error message, with no `retryAfter` in the `details` object.

---

## Custom Rate Limiter

You can create a custom rate limiter using `createRateLimiter()`:

```javascript
const { createRateLimiter } = require("@el-zazo/server-creator/src/middleware/rate-limit");

const customLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: "Custom limit exceeded",
});
```

> **Important:** The package's `index.js` only exports `DB` and `Server`. `createRateLimiter` and the pre-built limiters are not part of the public API surface. To use them, import directly from `@el-zazo/server-creator/src/middleware/rate-limit`.

Custom limiters are primarily useful when integrated through `otherRoutes` middleware or by modifying the server setup.

---

## Configuration Reference

### Constants (`RATE_LIMIT`)

| Constant              | Value         | Description                          |
| --------------------- | ------------- | ------------------------------------ |
| `DEFAULT_WINDOW_MS`   | `900000`      | Default window: 15 minutes           |
| `DEFAULT_MAX_REQUESTS`| `100`         | Default max: 100 requests per window |
| `STRICT_WINDOW_MS`    | `60000`       | Strict window: 1 minute              |
| `STRICT_MAX_REQUESTS` | `5`           | Strict max: 5 requests per window    |

### `createRateLimiter(options)`

| Option            | Type      | Default     | Description                            |
| ----------------- | --------- | ----------- | -------------------------------------- |
| `windowMs`        | `Number`  | `900000`    | Time window in milliseconds.           |
| `max`             | `Number`  | `100`       | Max requests per window per key.       |
| `message`         | `String`  | See below   | Error message when limit is exceeded.  |
| `standardHeaders` | `String`  | `"draft-8"` | Standard header format.                |
| `legacyHeaders`   | `Boolean` | `false`     | Enable legacy `X-RateLimit-*` headers. |

**Default message:** `"Too many requests from this IP, please try again later"`

The `createRateLimiter` function includes a custom `handler` that creates a `RateLimitError` with a computed `retryAfter` detail (see [retryAfter Computation](#retryafter-computation)). If you pass your own `handler` in the options, it will override this behavior.

### Pre-built Limiters

| Export               | Window | Max | Key                | Message                                        |
| -------------------- | ------ | --- | ------------------ | ---------------------------------------------- |
| `defaultRateLimiter` | 15 min | 100 | IP                 | "Too many requests from this IP..."            |
| `ipStrictLimiter`    | 1 min  | 15  | IP                 | "Too many attempts from this IP..."            |
| `strictRateLimiter`  | 1 min  | 5   | `IP_identifier`    | "Too many authentication attempts..."          |

---

## Examples

### Default Behavior (no configuration needed)

```javascript
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" },
  },
});

db.start();
// All endpoints: 100 req / 15 min (per IP)
// Auth endpoints: additional 15 req / 1 min (per IP) + 5 req / 1 min (per IP+identifier)
```

### Understanding the Layered Effect

```
Client makes 6 POST /login requests with the same email in 1 minute:

Request 1-5: → Passes default limiter (100/15min per IP)
              → Passes IP strict limiter (15/1min per IP)
              → Passes per-identifier limiter (5/1min per IP+email)
              → Handled normally

Request 6:   → Passes default limiter (100/15min per IP)
              → Passes IP strict limiter (15/1min per IP)
              → BLOCKED by per-identifier limiter (5/1min per IP+email exceeded)
              → Returns 429 "Too many authentication attempts..."
```

```
Client makes 16 POST /login requests with different emails in 1 minute:

Requests 1-15: → Passes default limiter (100/15min per IP)
                → Passes IP strict limiter (15/1min per IP)
                → Each passes per-identifier limiter (5/1min per IP+email, different keys)
                → Handled normally

Request 16:    → Passes default limiter (100/15min per IP)
                → BLOCKED by IP strict limiter (15/1min per IP exceeded)
                → Returns 429 "Too many attempts from this IP..."
```

```
Client makes 101 GET /users requests in 15 minutes:

Request 1-100: → Passes default limiter
                → Handled normally

Request 101:   → BLOCKED by default limiter (100/15min exceeded)
                → Returns 429 "Too many requests from this IP..."
```

---

← [Back to README](../README.md)
