# Authentication

Complete guide to the JWT-based authentication system, route protection, and collection-based access control.

## Table of Contents

- [Overview](#overview)
- [Enabling Authentication](#enabling-authentication)
- [Auth Configuration](#auth-configuration)
  - [auth.keys](#authkeys)
  - [auth.routes](#authroutes)
  - [auth.protectedRoutes](#authprotectedroutes)
  - [auth.usePasswordHash](#authusepasswordhash)
  - [auth.authMiddlewareOptions](#authauthmiddlewareoptions)
  - [auth.additionalFields](#authadditionalfields)
  - [auth.collectionAccess](#authcollectionaccess)
- [Token Details](#token-details)
  - [Token Payload](#token-payload)
  - [Token Extraction](#token-extraction)
  - [Token Expiry](#token-expiry)
  - [Refresh Token Rotation](#refresh-token-rotation)
- [Auth Routes Reference](#auth-routes-reference)
- [Route Protection Behavior](#route-protection-behavior)
- [Collection-Based Access Control](#collection-based-access-control)
- [Global vs Per-Collection Auth](#global-vs-per-collection-auth)
- [Examples](#examples)

---

## Overview

The authentication system provides:

- **Register** and **Login** routes with configurable credential fields
- **JWT token** generation with collection metadata embedded
- **Refresh token rotation** — each refresh issues a new pair of tokens and revokes the old refresh token via `jti` tracking
- **Route protection** — selectively require authentication on specific routes
- **Collection-based access control** — restrict routes based on the user's collection membership
- **Profile retrieval** — get current user data from a token
- **Timing-attack protection** — constant-time password comparison and dummy hashing on login failure

---

## Enabling Authentication

Authentication is enabled by adding an `auth` object to `routerOptions` and specifying which auth routes to activate. The `authMiddlewareOptions` (JWT secret, token extraction, etc.) must be configured globally via `globalRouterOptions.auth.authMiddlewareOptions`:

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
    },
  },
},
collections: {
  users: {
    routerOptions: {
      auth: {
        routes: ["login", "register", "refreshToken", "getUserByToken"],
        protectedRoutes: true,
      },
    },
  },
}
```

Without `auth.routes`, no auth routes are generated. Without `auth.protectedRoutes`, no CRUD routes require authentication (though `getUserByToken` is always protected when auth middleware is present — see [Route Protection Behavior](#route-protection-behavior)).

> **Startup Validation:** If you configure `protectedRoutes: true`, `protectedRoutes: [...]`, or include `getUserByToken` in `auth.routes`, the Router constructor will **throw an error at startup** if no JWT secret is provided in `globalRouterOptions.auth.authMiddlewareOptions.secret`. This prevents the server from starting with an insecure configuration.

---

## Auth Configuration

### auth.keys

Defines the field names used for credentials.

- **Type:** `Object`
- **Default:** `{ identifiantKey: "email", passwordKey: "password" }`
- **Required:** No

| Option           | Type     | Default      | Description                                                                |
| ---------------- | -------- | ------------ | -------------------------------------------------------------------------- |
| `identifiantKey` | `String` | `"email"`    | The field used as identifier. If `"email"`, Joi enforces email validation. |
| `passwordKey`    | `String` | `"password"` | The field used for the password.                                           |

```javascript
auth: {
  keys: {
    identifiantKey: "username",
    passwordKey: "pass"
  }
}
```

> When `identifiantKey` is set to `"email"`, the login and register validation schemas automatically enforce email format validation. For any other value, the field is validated as a plain string. The register schema also enforces `min(6)` on the password field regardless of the key name.

---

### auth.routes

Defines which authentication routes to generate.

- **Type:** `Array`
- **Default:** `[]`
- **Required:** No

Available route names:

| Route Name       | Method | Path             | Description                                        |
| ---------------- | ------ | ---------------- | -------------------------------------------------- |
| `login`          | `POST` | `/login`         | Authenticate and get access + refresh token pair.  |
| `register`       | `POST` | `/register`      | Create account and get access + refresh token pair. |
| `refreshToken`   | `POST` | `/refresh-token` | Exchange a refresh token for a new token pair.     |
| `getUserByToken` | `GET`  | `/me`            | Get current user from token.                       |

```javascript
auth: {
  routes: ["login", "register", "getUserByToken"];
}
```

> Auth routes (`login`, `register`, `refreshToken`) automatically receive `ipStrictLimiter` and `strictRateLimiter` middleware for brute-force protection. `getUserByToken` does not receive extra rate limiting beyond the global limiter.

---

### auth.protectedRoutes

Determines which CRUD and profile routes require a valid JWT token.

- **Type:** `Array | Boolean`
- **Default:** `false`
- **Required:** No

| Value   | Behavior                                            |
| ------- | --------------------------------------------------- |
| `false` | No CRUD routes are protected.                       |
| `true`  | All 9 CRUD routes + `getUserByToken` are protected. |
| `Array` | Only the listed route names are protected.          |

Routes eligible for protection:

```
getAll, getOneById, search, addOne, addMany,
updateOneById, updateMany, deleteById, deleteMany, getUserByToken
```

> `getUserByToken` is **always** protected whenever auth middleware is present — even if `protectedRoutes` is `false` or an array that does not include it. See [Route Protection Behavior](#route-protection-behavior) for details.

> Auth routes (`login`, `register`, `refreshToken`) are **never** protected — they are not in the eligible list and they must be accessible without a token.

```javascript
auth: {
  protectedRoutes: ["getAll", "getOneById", "getUserByToken"];
}
```

---

### auth.usePasswordHash

Controls whether passwords are hashed with bcrypt before storage.

- **Type:** `Boolean`
- **Default:** `true`
- **Required:** No

| Value   | Behavior                                         |
| ------- | ------------------------------------------------ |
| `true`  | Passwords are hashed with bcrypt (10 rounds).    |
| `false` | Passwords are stored and compared as plain text. |

```javascript
auth: {
  usePasswordHash: false; // dev/testing only
}
```

> ⚠️ **Security Warning:** Never set this to `false` in production.

> Even when `usePasswordHash` is `false`, the `verifyPassword` function uses **timing-safe comparison** (SHA-256 + `crypto.timingSafeEqual`) to prevent timing attacks on plain-text passwords. This ensures that comparison time does not leak information about the password contents.

---

### auth.authMiddlewareOptions

Configuration for the JWT authentication middleware applied to protected routes.

- **Type:** `Object`
- **Required:** Yes (when any protected routes or `getUserByToken` are configured)
- **Configurable:** Only via `globalRouterOptions.auth.authMiddlewareOptions` — per-collection override is **not** supported.

| Option        | Type      | Default         | Description                                                          |
| ------------- | --------- | --------------- | -------------------------------------------------------------------- |
| `secret`      | `String`  | **(required)**  | The JWT secret key used to sign and verify tokens. No default — throws if missing. |
| `tokenFrom`   | `String`  | `"header"`      | Where to get the token: `"header"`, `"query"`, `"cookie"`, `"body"`. |
| `headerName`  | `String`  | `"Authorization"` | Header name when `tokenFrom` is `"header"`.                          |
| `queryParam`  | `String`  | `"token"`       | Query parameter name when `tokenFrom` is `"query"`.                  |
| `cookieName`  | `String`  | `"token"`       | Cookie name when `tokenFrom` is `"cookie"`.                          |
| `bodyField`   | `String`  | `"token"`       | Body field name when `tokenFrom` is `"body"`.                        |
| `passthrough` | `Boolean` | `false`         | If `true`, requests without a token proceed without error.           |

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
      tokenFrom: "cookie",
      cookieName: "auth_token"
    }
  }
}
```

> **No default secret:** The middleware will throw an `AuthenticationError` at request time if `secret` is not provided. Additionally, the Router constructor will throw at **startup** if protected routes are configured but no secret is set.

> When `tokenFrom` is `"header"` and the value starts with `"Bearer "` (case-insensitive per RFC 6750), the prefix is automatically stripped. For any other `tokenFrom` value, the raw value is used.

> If `passthrough` is `true`, the request continues even without a valid token, but `req.user` will not be set. This is useful for optional authentication where some routes should work for both authenticated and anonymous users.

---

### auth.additionalFields

Additional Joi schemas merged into the register validation.

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

```javascript
const Joi = require("joi");

auth: {
  additionalFields: {
    name: Joi.string().required(),
    age: Joi.number().min(18),
    role: Joi.string().valid("user", "admin").default("user")
  }
}
```

> These fields are only added to the **register** schema, not login. They are merged via `Object.assign`, so they can override the default fields if naming conflicts exist. Each value must be a valid Joi schema object — the Router constructor will throw if a non-Joi value is provided.

---

### auth.collectionAccess

Restricts route access based on the user's `_collection` token claim.

- **Type:** `Object`
- **Default:** `null` (no restrictions)
- **Required:** No

| Option          | Type      | Default | Description                                  |
| --------------- | --------- | ------- | -------------------------------------------- |
| `accessDefault` | `Boolean` | `true`  | Default access when collection isn't listed. |
| `collections`   | `Object`  | `{}`    | Access rules per collection name.            |

**Collection rule values:**

| Value    | Behavior                     |
| -------- | ---------------------------- |
| `true`   | Full access to all routes.   |
| `"all"`  | Full access to all routes.   |
| `"*"`    | Full access to all routes.   |
| `false`  | No access.                   |
| `"none"` | No access.                   |
| `Array`  | List of allowed route names. |

```javascript
auth: {
  collectionAccess: {
    accessDefault: false,
    collections: {
      admins: true,
      editors: ["getAll", "getOneById", "addOne", "updateOneById"],
      viewers: ["getAll", "getOneById"],
      banned: "none"
    }
  }
}
```

> Auth routes (`login`, `register`, `refreshToken`, `getUserByToken`) always bypass collection access checks — they are always accessible to authenticated users regardless of collection membership.

---

## Token Details

### Token Payload

The JWT access token payload contains:

| Field         | Source                 | Description                                 |
| ------------- | ---------------------- | ------------------------------------------- |
| User fields   | Database document      | All fields except the password field.       |
| `_collection` | `model.collectionName` | Name of the collection the user belongs to. |

The JWT **refresh token** payload additionally contains:

| Field | Source              | Description                                |
| ----- | ------------------- | ------------------------------------------ |
| `jti` | `crypto.randomUUID()` | Unique token identifier for rotation tracking. |

```javascript
// Example decoded access token payload
{
  "_id": "64a1b2c3d4e5f6g7h8i9j0k",
  "email": "user@example.com",
  "role": "admin",
  "_collection": "users",
  "iat": 1688553600,
  "exp": 1688639800
}

// Example decoded refresh token payload
{
  "_id": "64a1b2c3d4e5f6g7h8i9j0k",
  "email": "user@example.com",
  "_collection": "users",
  "jti": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "iat": 1688553600,
  "exp": 1689158400
}
```

> The `_collection` field is only included when `collectionName` is provided during token generation (which happens automatically for auth routes). The `jti` field is only included in refresh tokens and is used for rotation tracking — see [Refresh Token Rotation](#refresh-token-rotation).

---

### Token Extraction

Tokens are extracted from the request based on the `tokenFrom` option:

| Source   | Location                  | Bearer Stripping |
| -------- | ------------------------- | ---------------- |
| `header` | `req.headers[headerName]` | Yes (case-insensitive) |
| `query`  | `req.query[queryParam]`   | No               |
| `cookie` | `req.cookies[cookieName]` | No               |
| `body`   | `req.body[bodyField]`     | No               |

**Header extraction behavior:**

- If the header value is in `"Bearer <token>"` format (case-insensitive prefix), the token is extracted after the prefix.
- Otherwise, the raw header value is used as the token.
- The header name lookup is also case-insensitive (uses `headerName.toLowerCase()`).

**Examples:**

```
# Header (default)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# Query parameter
GET /users?token=eyJhbGciOiJIUzI1NiIs...

# Cookie
Cookie: token=eyJhbGciOiJIUzI1NiIs...

# Body
{ "token": "eyJhbGciOiJIUzI1NiIs..." }
```

---

### Token Expiry

Two token types are issued, each with a different expiry:

| Token Type   | Default Expiry | Source Constant           | Applied On                         |
| ------------ | -------------- | ------------------------- | ---------------------------------- |
| Access token | `"24h"`        | `AUTH.DEFAULT_TOKEN_EXPIRY` | `login`, `register`, `refreshToken` |
| Refresh token | `"7d"`        | Hardcoded in `routes/auth.js` | `login`, `register`, `refreshToken` |

> The token expiry is not configurable per route or per collection. All access tokens use the same `"24h"` default and all refresh tokens use the same `"7d"` default.

---

### Refresh Token Rotation

The authentication system implements **refresh token rotation** to prevent token reuse attacks:

1. **On login/register:** A `jti` (JWT ID) is generated using `crypto.randomUUID()` and embedded in the refresh token payload. The `jti` and its expiry are stored in a persistent token store (`.refresh-tokens.json` in the working directory).

2. **On refresh:** When a refresh token is submitted:
   - The token's `jti` is checked against the store. If the `jti` is **not found**, the token has already been used or revoked — the request is rejected with `401`.
   - The old refresh token's `jti` is **deleted** from the store (revoked).
   - A new access token and a new refresh token (with a fresh `jti`) are issued.
   - The new `jti` is stored for future validation.

3. **Expired refresh tokens:** If the submitted refresh token has expired, the request is rejected with `401 Unauthorized: "Refresh token has expired"`. Expired refresh tokens are **not** accepted — users must re-authenticate by logging in again.

4. **Automatic cleanup:** Expired refresh tokens are purged from the store every 10 minutes via a background interval (with `.unref()` so it does not prevent graceful shutdown).

**Token store location:** `{cwd}/.refresh-tokens.json`

> ⚠️ **Multi-instance note:** The file-based token store survives server restarts but is **not shared across multiple instances**. For multi-instance deployments (e.g., behind a load balancer), replace the store with Redis or a shared database.

---

## Auth Routes Reference

### Login Flow

1. Extracts `identifiantKey` and `passwordKey` from the request body.
2. Validates the request body against the login Joi schema (including `ipStrictLimiter` and `strictRateLimiter` rate limiting middleware).
3. Looks up the user with `model.getMany({ [identifiantKey]: identifiant })`.
4. **Timing-attack protection:** If the user is not found and `usePasswordHash` is `true`, a dummy bcrypt comparison is performed against a fake hash. This ensures that "user not found" and "wrong password" take roughly the same time, preventing user enumeration via timing.
5. Extracts the raw document (`_doc` for MongoDB, `dataValues` for MySQL) using `extractUserData()`.
6. Verifies the password using `verifyPassword()` — either bcrypt comparison or timing-safe plain comparison.
7. Validates that `authMiddlewareOptions.secret` is configured (throws `500 AppError` if not).
8. Generates an **access token** (24h expiry) and a **refresh token** (7d expiry with `jti`).
9. Stores the refresh token's `jti` in the token store.
10. Returns `{ success: true, data: { user, token, refreshToken } }`.

**Error responses:**

| Status | Error                 | Cause                             |
| ------ | --------------------- | --------------------------------- |
| `400`  | `ValidationError`     | Missing identifier or password.   |
| `401`  | `AuthenticationError` | User not found or wrong password. |
| `500`  | `AppError`            | JWT secret not configured.        |

---

### Register Flow

1. Extracts `identifiantKey`, `passwordKey`, and all other fields from the body.
2. Validates the request body against the register Joi schema (including `ipStrictLimiter` and `strictRateLimiter` rate limiting middleware, plus `additionalFields` if configured).
3. Checks if a user with the same identifier already exists → `409 Conflict`.
4. Hashes the password if `usePasswordHash` is `true` (10 salt rounds).
5. Creates the user with `model.addOne()`.
6. Validates that `authMiddlewareOptions.secret` is configured (throws `500 AppError` if not).
7. Generates an **access token** (24h expiry) and a **refresh token** (7d expiry with `jti`).
8. Stores the refresh token's `jti` in the token store.
9. Returns `{ success: true, data: { user, token, refreshToken } }` with status `201`.

**Error responses:**

| Status | Error             | Cause                             |
| ------ | ----------------- | --------------------------------- |
| `400`  | `ValidationError` | Missing identifier or password.   |
| `409`  | `ConflictError`   | User with same identifier exists. |
| `500`  | `AppError`        | JWT secret not configured.        |

---

### Refresh Token Flow

1. Extracts `token` from the request body.
2. Validates the request body against the `refreshToken` Joi schema (including `ipStrictLimiter` and `strictRateLimiter` rate limiting middleware).
3. Verifies the provided token using `verifyToken()`.
4. If the token has expired, returns `401 Unauthorized: "Refresh token has expired"`. Expired refresh tokens are rejected — users must log in again.
5. Checks if the refresh token's `jti` is still in the token store. If not found → `401` ("Refresh token has been revoked or already used").
6. **Revokes** the old refresh token by deleting its `jti` from the store.
7. Extracts `_id` or `id` from the decoded payload.
8. Re-fetches the user from the database to confirm they still exist.
9. Generates a new **access token** (24h expiry) and a new **refresh token** (7d expiry with fresh `jti`).
10. Stores the new `jti` in the token store.
11. Returns `{ success: true, data: { user, token, refreshToken } }`.

**Error responses:**

| Status | Error                 | Cause                                        |
| ------ | --------------------- | -------------------------------------------- |
| `400`  | `ValidationError`     | Missing token in body.                       |
| `401`  | `AuthenticationError` | Invalid or expired token (bad signature).    |
| `401`  | `AuthenticationError` | Refresh token has been revoked or already used. |
| `401`  | `AuthenticationError` | Invalid token payload (no user ID).          |
| `401`  | `AuthenticationError` | User not found in database.                  |

---

### Get User By Token Flow

1. Reads `req.user` (set by the auth middleware — this route is always protected).
2. Extracts `_id` or `id` from the decoded token.
3. Re-fetches the user from the database for latest data using `model.getOneById()`.
4. Removes the password field from the response.
5. Returns `{ success: true, data: userForResponse }`.

**Error responses:**

| Status | Error                 | Cause                       |
| ------ | --------------------- | --------------------------- |
| `401`  | `AuthenticationError` | No token provided.          |
| `401`  | `AuthenticationError` | Invalid token payload.      |
| `401`  | `AuthenticationError` | User not found in database. |

---

## Route Protection Behavior

Protection is determined by the `isProtectedRoute()` function, which runs in this order:

1. Is the route in the eligible list (`DEFAULT_PROTECTED_ROUTES`)? If **no** → not protected.
2. Is `auth.middleware` available? If **no** → not protected.
3. Is the route in `ALWAYS_PROTECTED_ROUTES` (`["getUserByToken"]`)? If **yes** → **always protected**.
4. Is `protectedRoutes` set? If **no** (undefined/null/false) → not protected.
5. Is `protectedRoutes === true`? → all eligible routes are protected.
6. Is `protectedRoutes` an array containing the route name? → protected.

**Key implications:**

- `getUserByToken` is **always** protected whenever auth middleware exists, regardless of the `protectedRoutes` setting. This is because it requires `req.user` to function.
- Simply configuring `auth` does not automatically protect other routes. You must explicitly set `protectedRoutes` to `true` or an array.
- Auth routes (`login`, `register`, `refreshToken`) are never in the eligible list, so they are never protected.

---

## Collection-Based Access Control

When a protected route is accessed, the collection access check runs **after** authentication but **before** the route handler:

```
auth.middleware → collectionAccessCheck → handler
```

**Check logic:**

1. Is the route an auth route (`login`, `register`, `refreshToken`, `getUserByToken`)? → **allow**.
2. Is `collectionAccess` configured? If **no** → **allow**.
3. Does `req.userCollection` exist (from token's `_collection`)?
   - **No:** Use `accessDefault`. If `false` → **deny**.
   - **Yes:** Look up `collections[userCollection]`.
4. No rule found for this collection? → Use `accessDefault`.
5. Rule is `true`, `"all"`, or `"*"` → **allow**.
6. Rule is an array containing the route name → **allow**.
7. Rule is `false` or `"none"` → **deny**.
8. Default → **allow**.

**Error on denial:** `AccessDeniedError` (403 Forbidden), which extends `AuthorizationError`.

---

## Global vs Per-Collection Auth

`authMiddlewareOptions` (JWT secret, token extraction settings, etc.) is configured **only** at the global level via `globalRouterOptions.auth.authMiddlewareOptions` and is automatically inherited by all collections. Per-collection override is **not** supported — if you set `authMiddlewareOptions` in a collection's `routerOptions.auth`, it will be **overwritten** by the global value during collection preparation.

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET
    }
  }
}
```

Other auth options must be set per collection:

| Option                  | Configurable Globally? |
| ----------------------- | ----------------------- |
| `authMiddlewareOptions` | ✅ Only here            |
| `keys`                  | ❌ Per-collection only   |
| `routes`                | ❌ Per-collection only   |
| `protectedRoutes`       | ❌ Per-collection only   |
| `usePasswordHash`       | ❌ Per-collection only   |
| `collectionAccess`      | ❌ Per-collection only   |
| `additionalFields`      | ❌ Per-collection only   |

---

## Examples

### Basic Auth Setup

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/auto-server" },
  },
  globalRouterOptions: {
    auth: {
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET,
      },
    },
  },
  collections: {
    users: {
      routerOptions: {
        auth: {
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
        },
      },
    },
  },
});
```

### Custom Identifier + Cookie Token

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
      tokenFrom: "cookie",
      cookieName: "auth_token",
    },
  },
},
collections: {
  users: {
    routerOptions: {
      auth: {
        keys: { identifiantKey: "username", passwordKey: "pass" },
        routes: ["login", "register"],
        protectedRoutes: ["getAll", "getOneById"],
      },
    },
  },
}
```

### Multi-Collection Access Control

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
    },
  },
},
collections: {
  users: {
    routerOptions: {
      auth: {
        routes: ["login", "register", "refreshToken", "getUserByToken"],
        protectedRoutes: true,
        collectionAccess: {
          accessDefault: false,
          collections: {
            admins: true,
            editors: ["getAll", "getOneById", "addOne", "updateOneById"],
            viewers: ["getAll", "getOneById"],
          },
        },
      },
    },
  },
  posts: {
    routerOptions: {
      auth: {
        protectedRoutes: ["addOne", "updateOneById", "deleteById"],
        collectionAccess: {
          accessDefault: true,
          collections: {
            banned: "none",
          },
        },
      },
    },
  },
}
```

### Refresh Token Usage

```javascript
// 1. Login — receive both tokens
const loginRes = await fetch("/api/users/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "user@example.com", password: "secret123" }),
});
const { data } = await loginRes.json();
// data = { user: { ... }, token: "eyJ...", refreshToken: "eyJ..." }

// 2. Use access token for API calls
const protectedRes = await fetch("/api/users", {
  headers: { Authorization: `Bearer ${data.token}` },
});

// 3. When the access token expires, refresh it
const refreshRes = await fetch("/api/users/refresh-token", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: data.refreshToken }),
});
const refreshed = await refreshRes.json();
// refreshed.data = { user: { ... }, token: "newEyJ...", refreshToken: "newEyJ..." }

// 4. The old refreshToken is now revoked — using it again returns 401
```

---

← [Back to README](../README.md)
