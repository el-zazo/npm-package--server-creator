# 🛤️ API Routes

Complete reference for all auto-generated CRUD and Auth routes, plus the health check endpoint and custom routes feature.

## Table of Contents

- [Route URL Structure](#route-url-structure)
- [Middleware Stack](#middleware-stack)
- [Health Check Endpoint](#health-check-endpoint)
- [CRUD Routes](#crud-routes)
  - [GET / — getAll](#get---getall)
  - [GET /:id — getOneById](#getid---getonebyid)
  - [POST /search — search](#postsearch---search)
  - [POST / — addOne](#post---addone)
  - [POST /many — addMany](#postmany---addmany)
  - [PUT /:id — updateOneById](#putid---updateonebyid)
  - [PUT /many — updateMany](#putmany---updatemany)
  - [DELETE /:id — deleteById](#deleteid---deletebyid)
  - [DELETE /many — deleteMany](#deletemany---deletemany)
- [Auth Routes](#auth-routes)
  - [POST /login — login](#postlogin---login)
  - [POST /register — register](#postregister---register)
  - [POST /refresh-token — refreshToken](#postrefresh-token---refreshtoken)
  - [GET /me — getUserByToken](#getme---getuserbytoken)
- [Custom Routes (otherRoutes)](#custom-routes-otherroutes)
- [Route Protection & Collection Access](#route-protection--collection-access)
- [Sensitive Field Handling](#sensitive-field-handling)
- [Route Order](#route-order)

---

## Route URL Structure

All collection routes are mounted under a prefix composed of:

```
{collectionPrefix}/{routePath}
```

| Segment            | Default               | Configured Via              |
| ------------------ | --------------------- | --------------------------- |
| `collectionPrefix` | `"/<collectionName>"` | `collections.<name>.prefix` |
| `routePath`        | e.g. `"/"`, `"/:id"`  | Fixed per route (see tables below) |

**Example:** For a collection named `users` with default settings:

```
GET /users          → getAll
GET /users/:id      → getOneById
POST /users/search  → search
POST /users/login   → login
```

> **Note:** Only collections explicitly listed in the `options.collections` allowlist will have routes generated. Collections not listed are not exposed.

---

## Middleware Stack

The middleware applied to each route depends on whether it is protected. Note that the `defaultRateLimiter` (100 requests per 15 minutes per IP) is applied globally at the server level and runs before any route-specific middleware.

**Protected route:**

```
loggerMiddleware → auth.middleware → collectionAccessCheck → validationMiddleware → handler
```

**Unprotected route:**

```
loggerMiddleware → validationMiddleware → handler
```

**Auth routes** (`login`, `register`, `refreshToken`) are not considered "protected" (they do not require a valid JWT to access), but they include `ipStrictLimiter` and `strictRateLimiter` as their validation middleware:

```
loggerMiddleware → ipStrictLimiter → strictRateLimiter → validationMiddleware → handler
```

| Limiter              | Scope            | Limit                                 |
| -------------------- | ---------------- | ------------------------------------- |
| `defaultRateLimiter` | All endpoints    | 100 requests per 15 minutes per IP    |
| `ipStrictLimiter`    | Auth endpoints   | 15 requests per 1 minute per IP       |
| `strictRateLimiter`  | Auth endpoints   | 5 requests per 1 minute per IP+identifier |

The `strictRateLimiter` combines the client IP with the request identifier (`req.body.email`, `req.body.username`, or `req.body.identifier`) to prevent bypass via rotating identifiers.

---

## Health Check Endpoint

A `/health` endpoint is always available at the server root, registered **before** all other routes. It does not require authentication.

```
GET /health
```

**Response (healthy):**

```json
{
  "status": "ok",
  "timestamp": "2026-05-17T10:30:00.000Z",
  "uptime": 123.456,
  "database": "connected"
}
```

**Response (database unreachable):**

```json
{
  "status": "degraded",
  "timestamp": "2026-05-17T10:30:00.000Z",
  "uptime": 123.456,
  "database": "error"
}
```

Returns HTTP `503 Service Unavailable` when the database is unreachable.

---

## CRUD Routes

### GET / — getAll

Fetch all records with optional pagination, sorting, and field selection.

**Validation:** `query` — `schemas.crud.getAll`

| Query Param     | Type     | Default   | Description                            |
| --------------- | -------- | --------- | -------------------------------------- |
| `sort`          | `String` | —         | Sort expression (e.g. `field1:1,field2:-1` or JSON). |
| `page`          | `Number` | `1`       | Page number (min 1).                   |
| `per_page`      | `Number` | `10`      | Items per page (max 100).              |
| `fields`        | `String` | —         | Field selection expression (e.g. `name,email,-password` or JSON). |
| `no_pagination` | `String` | `"false"` | Set to `"true"`, `"True"`, or `"1"` to disable pagination and return all results. |

**Response (with pagination):**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 50,
    "total_pages": 5,
    "current_page": 1,
    "per_page": 10,
    "has_next_page": true,
    "has_prev_page": false,
    "next_page": 2,
    "prev_page": null
  }
}
```

**Response (without pagination — `no_pagination=true`):**

```json
{
  "success": true,
  "data": [...],
  "total": 50
}
```

> **Security:** Sensitive fields (`password`, `passwordHash`, `__v`, and any custom `passwordKey`) are automatically stripped from all response documents. The `fields` parameter cannot be used to select sensitive fields — they are forced to exclusion (0) even if explicitly requested with value 1.

> **Field configuration:** If a `fields` option is configured on the collection's router options (`routerOptions.fields`), it is merged with the request `fields` parameter. Collection-level exclusions (value `0`) cannot be overridden by the request.

---

### GET /:id — getOneById

Fetch a single record by its ID.

**Validation:** `params` — `schemas.crud.getOneById` + `query` — `schemas.crud.getOneByIdQuery`

| Param | Type               | Description                                    |
| ----- | ------------------ | ---------------------------------------------- |
| `id`  | `String \| Number` | MongoDB ObjectId, integer, or other string ID. |

| Query Param | Type     | Default | Description                 |
| ----------- | -------- | ------- | --------------------------- |
| `fields`    | `String` | —       | Field selection expression. |

**Response:**

```json
{
  "success": true,
  "data": { "_id": "...", "name": "..." }
}
```

> **Security:** Sensitive fields are stripped from the response. The `fields` query parameter cannot override exclusion of sensitive fields. Collection-level field configuration is also applied when configured.

---

### POST /search — search

Search records with a complex query, pagination, sorting, and field selection.

**Validation:** `body` — `schemas.crud.search`

| Body Field      | Type               | Default | Description                          |
| --------------- | ------------------ | ------- | ------------------------------------ |
| `query`         | `Object`           | `{}`    | Filter criteria.                     |
| `sort`          | `Object`           | `{}`    | Sort criteria.                       |
| `fields`        | `Object \| String` | —       | Field selection.                     |
| `page`          | `Number`           | `1`     | Page number (min 1).                 |
| `per_page`      | `Number`           | `10`    | Items per page (max 100).            |
| `no_pagination` | `Boolean`          | `false` | Set to `true` to disable pagination. |

> **Note:** Unlike `getAll` where `no_pagination` is a string query parameter, in `search` it is a boolean in the request body.

**Request Example:**

```json
{
  "query": { "status": "active" },
  "sort": { "createdAt": -1 },
  "page": 2,
  "per_page": 20
}
```

**Response:** Same structure as `getAll` (with or without pagination).

> **Security:**
> - Sort fields are sanitized — fields starting with `$` or matching sensitive names (case-insensitive) are silently removed. The `fields` parameter is sanitized similarly.
> - The `query` object is sanitized to remove dangerous NoSQL operators (`$where`, `$expr`, `$function`, `$accumulator`) that could allow arbitrary code execution or bypass intended logic.
> - Sensitive field names (e.g. `password`, `passwordHash`) are stripped from the query filter to prevent blind NoSQL injection attacks that probe for password hashes.

---

### POST / — addOne

Create a single record.

**Validation:** `body` — `schemas.crud.addOne` (object with at least 1 field)

**Request Example:**

```json
{
  "name": "John",
  "email": "john@example.com"
}
```

**Response:** Status `201`

```json
{
  "success": true,
  "data": { "_id": "...", "name": "John", "email": "john@example.com" }
}
```

> **Security:** Sensitive fields are stripped from the response document. After creation, the cache for the collection is invalidated.

---

### POST /many — addMany

Create multiple records at once.

**Validation:** `body` — `schemas.crud.addMany` (array of objects, min 1 item, each with min 1 field)

| Constraint       | Value | Description                                |
| ---------------- | ----- | ------------------------------------------ |
| Max batch size   | `500` | Requests with more than 500 items are rejected. |

**Request Example:**

```json
[
  { "name": "John", "email": "john@example.com" },
  { "name": "Jane", "email": "jane@example.com" }
]
```

**Response:** Status `201`

```json
{
  "success": true,
  "data": [
    { "_id": "...", "name": "John", "email": "john@example.com" },
    { "_id": "...", "name": "Jane", "email": "jane@example.com" }
  ]
}
```

> **Security:** Batch sizes exceeding 500 documents are rejected with a `ValidationError`. Sensitive fields are stripped from response documents.

---

### PUT /:id — updateOneById

Update a single record by its ID.

**Validation:** `params` — `schemas.crud.updateOneByIdParams` + `body` — `schemas.crud.updateOneByIdBody`

| Param | Type               | Description |
| ----- | ------------------ | ----------- |
| `id`  | `String \| Number` | Record ID.  |

**Body:** Object with at least 1 field to update.

**Request Example:**

```json
{
  "name": "Updated Name"
}
```

**Response:**

```json
{
  "success": true,
  "data": { "_id": "...", "name": "Updated Name" }
}
```

> **Security:**
> - The request body is sanitized to remove dangerous NoSQL operators (`$where`, `$expr`, `$function`, `$accumulator`) before processing.
> - **Password auto-hashing:** If the body contains the configured password key (default: `password`), the value is automatically hashed using bcrypt before storing. This respects the `auth.usePasswordHash` setting — if set to `false`, the password is stored as plain text instead.
> - For MongoDB, updates are wrapped in `$set` to prevent MongoDB operator injection. Schema validators are run on update. The collection cache is invalidated after the update.

---

### PUT /many — updateMany

Update multiple records matching a filter.

**Validation:** `body` — `schemas.crud.updateMany`

| Body Field | Type     | Description                    |
| ---------- | -------- | ------------------------------ |
| `filter`   | `Object` | Filter criteria (min 1 field). |
| `update`   | `Object` | Update data (min 1 field).     |

**Request Example:**

```json
{
  "filter": { "status": "pending" },
  "update": { "status": "active" }
}
```

**Response:**

```json
{
  "success": true,
  "data": { "affectedCount": 5 }
}
```

> ⚠️ **Safety:**
> - Empty filter objects are rejected to prevent accidental mass updates. This includes filters with only empty `or`/`and` arrays like `{ or: [{}] }`. The check is recursive, so nested combinations like `{ and: [{ or: [{}] }] }` are also detected as effectively empty.
> - Both the `filter` and `update` objects are sanitized to remove dangerous NoSQL operators (`$where`, `$expr`, `$function`, `$accumulator`).
> - **Password auto-hashing:** If the `update` object contains the configured password key (default: `password`), the value is automatically hashed using bcrypt before storing. This respects the `auth.usePasswordHash` setting.
> - For MongoDB, the filter is sanitized against NoSQL injection and the update is wrapped in `$set`. For MySQL, `or`/`and` keys are normalized to Sequelize `Op.or`/`Op.and`.

---

### DELETE /:id — deleteById

Delete a single record by its ID.

**Validation:** `params` — `schemas.crud.deleteById`

| Param | Type               | Description |
| ----- | ------------------ | ----------- |
| `id`  | `String \| Number` | Record ID.  |

**Response:**

```json
{
  "success": true,
  "data": { "_id": "...", "name": "Deleted Record" }
}
```

---

### DELETE /many — deleteMany

Delete multiple records matching a filter.

**Validation:** `body` — `schemas.crud.deleteMany`

| Body Field | Type     | Description                    |
| ---------- | -------- | ------------------------------ |
| `filter`   | `Object` | Filter criteria (min 1 field). |

**Request Example:**

```json
{
  "filter": { "status": "archived" }
}
```

**Response:**

```json
{
  "success": true,
  "data": { "deletedCount": 3 }
}
```

> ⚠️ **Safety:**
> - Empty filter objects are rejected to prevent accidental mass deletions. The same recursive emptiness check as `updateMany` applies — filters with only empty `or`/`and` arrays (including nested combinations) are detected as effectively empty.
> - The filter object is sanitized to remove dangerous NoSQL operators (`$where`, `$expr`, `$function`, `$accumulator`) before processing.

---

## Auth Routes

Auth routes are only generated when configured via `auth.routes` in the router options (at either the collection level or `globalRouterOptions`). A JWT secret **must** be provided via `auth.authMiddlewareOptions.secret` (or the `JWT_SECRET` environment variable) whenever auth routes or protected routes are enabled.

### Token Lifecycle

| Token Type    | Expiry | Purpose                                      |
| ------------- | ------ | -------------------------------------------- |
| Access token  | `24h`  | Authenticates API requests.                  |
| Refresh token | `7d`   | Obtains new access tokens without re-login.   |

Both tokens include a `_collection` claim for collection-based access control. Refresh tokens also include a `jti` (unique ID) for rotation tracking.

### POST /login — login

Authenticate a user and return access and refresh tokens.

**Validation:** `ipStrictLimiter` → `strictRateLimiter` → `body` — `schemas.auth.login`

| Body Field         | Type     | Description                |
| ------------------ | -------- | -------------------------- |
| `[identifiantKey]` | `String` | Identifier (default: `email`). |
| `[passwordKey]`    | `String` | Password.                  |

> If `identifiantKey` is `"email"` (the default), the value must be a valid email address.

**Request Example (default keys):**

```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "user@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

> **Notes:**
> - The password field is always removed from the `user` object in the response.
> - The token includes a `_collection` claim for collection-based access control.
> - **Timing attack protection:** When a user is not found, a dummy bcrypt comparison is performed so that both "user not found" and "wrong password" take approximately the same time. This prevents user enumeration via response timing.
> - **Password hashing:** By default, passwords are hashed with bcrypt (10 salt rounds). Set `auth.usePasswordHash: false` to store passwords as plain text (not recommended for production). When hashing is disabled, timing-safe comparison (SHA-256 + `crypto.timingSafeEqual`) is used for verification.

---

### POST /register — register

Register a new user and return access and refresh tokens.

**Validation:** `ipStrictLimiter` → `strictRateLimiter` → `body` — `schemas.auth.register`

| Body Field            | Type     | Description                         |
| --------------------- | -------- | ----------------------------------- |
| `[identifiantKey]`    | `String` | Identifier (default: `email`).      |
| `[passwordKey]`       | `String` | Password (min 6 characters).        |
| `...additionalFields` | _varies_ | Any extra fields defined in schema. |

> **`additionalFields`** must be Joi schema objects. For example:
> ```javascript
> auth: {
>   additionalFields: {
>     name: Joi.string().min(2).max(50),
>     role: Joi.string().valid("admin", "user").default("user"),
>   }
> }
> ```

**Request Example (default keys):**

```json
{
  "email": "new@example.com",
  "password": "secret123"
}
```

**Response:** Status `201`

```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "new@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

> - Returns a `409 Conflict` if a user with the same identifier already exists.
> - Passwords are hashed with bcrypt by default (`auth.usePasswordHash: true`). The hash is stored in the database; the plain password is never returned in responses.

---

### POST /refresh-token — refreshToken

Exchange a refresh token for new access and refresh tokens. Implements **refresh token rotation** — the old refresh token is revoked and a new one is issued each time.

**Validation:** `ipStrictLimiter` → `strictRateLimiter` → `body` — `schemas.auth.refreshToken`

| Body Field | Type     | Description            |
| ---------- | -------- | ---------------------- |
| `token`    | `String` | Current refresh token. |

**Request Example:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "user@example.com" },
    "token": "eyJhbGciOiJIUzI1NiIs...(new access token)",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...(new refresh token)"
  }
}
```

> **Rotation behavior:**
> - Each refresh token has a unique `jti` (UUID). When a refresh token is used, its `jti` is checked against the token store and then **revoked** (deleted). A new refresh token with a new `jti` is issued.
> - If a previously used (revoked) refresh token is submitted, the request is rejected with `401 Unauthorized: "Refresh token has been revoked or already used"`.
> - **Expired refresh tokens are rejected** — if the refresh token has expired, the server returns `401 Unauthorized: "Refresh token has expired"`. Users must re-authenticate by logging in again. Expired tokens are **not** accepted even if they have not been revoked.
> - The user is re-fetched from the database to ensure they still exist before issuing new tokens.
> - Refresh token IDs are stored in a file-based store (`.refresh-tokens.json` in the working directory). Expired tokens are cleaned up every 10 minutes. For multi-instance deployments, replace this with a shared store like Redis.

---

### GET /me — getUserByToken

Get the current user's data from their JWT token. This route is **always protected** — it requires authentication regardless of the `protectedRoutes` configuration.

**Validation:** None (uses token only)

**Requires:** Authentication (always protected)

**Response:**

```json
{
  "success": true,
  "data": { "_id": "...", "email": "user@example.com" }
}
```

> - The user is re-fetched from the database using the `_id` or `id` from the token payload to return the latest data.
> - The password field is always removed from the response.
> - Unlike other protected routes that can be toggled via `protectedRoutes` config, `getUserByToken` is in the `ALWAYS_PROTECTED_ROUTES` list and cannot be made public.

---

## Custom Routes (otherRoutes)

In addition to auto-generated CRUD and auth routes, you can define custom routes via the `otherRoutes` option on the `DB` constructor. These routes are not tied to any collection and are mounted on standalone Express routers.

**Configuration:**

```javascript
const db = new DB({
  // ... other options
  otherRoutes: [
    {
      method: "get",          // HTTP method: get, post, put, patch, delete, options, head
      path: "/stats",         // Route path
      handler: (req, res) => {// Route handler function
        res.json({ message: "Stats endpoint" });
      },
      middleware: [],          // Optional: additional middleware functions
      isProtected: false,      // Optional: require JWT authentication (default: false)
      prefix: "/api",         // Optional: route prefix (default: "/api")
      collectionAccess: null,  // Optional: collection-based access control
    },
  ],
  globalRouterOptions: {
    auth: {
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET,  // Required if any otherRoute has isProtected: true
      },
    },
  },
});
```

| Field              | Type      | Default  | Description                                                    |
| ------------------ | --------- | -------- | -------------------------------------------------------------- |
| `method`           | `String`  | required | HTTP method (`get`, `post`, `put`, `patch`, `delete`, `options`, `head`). |
| `path`             | `String`  | required | Route path (e.g. `"/stats"`).                                  |
| `handler`          | `Function`| required | Express route handler `(req, res) => { ... }`.                 |
| `middleware`       | `Array`   | `[]`     | Additional middleware to apply before the handler.              |
| `isProtected`      | `Boolean` | `false`  | If `true`, JWT authentication middleware is applied.            |
| `prefix`           | `String`  | `"/api"` | Route prefix for mounting.                                     |
| `collectionAccess` | `Object`  | `null`   | Collection-based access control (same structure as for collection routes). |

### Custom Routes Middleware Stack

**Protected custom route with `collectionAccess`:**

```
loggerMiddleware → authMiddleware → collectionAccessCheck → ...middleware → handler
```

**Protected custom route without `collectionAccess`:**

```
loggerMiddleware → authMiddleware → ...middleware → handler
```

**Unprotected custom route:**

```
loggerMiddleware → ...middleware → handler
```

> **Auth for custom routes:** When `isProtected: true`, the auth middleware uses the `authMiddlewareOptions` from `globalRouterOptions.auth`. A JWT secret must be configured, otherwise an error is thrown at startup. The `loggerMiddleware` is always applied to custom routes. Individual `otherRoutes[].authMiddlewareOptions` fields are **not used** — only the global `globalRouterOptions.auth.authMiddlewareOptions` is applied.

---

## Route Protection & Collection Access

### Route Protection

Routes can be protected by configuring `auth.protectedRoutes` in the router options. When a route is protected, the JWT auth middleware is applied before the handler.

| `protectedRoutes` Value | Behavior                                                        |
| ----------------------- | --------------------------------------------------------------- |
| Not set / `undefined`   | No CRUD routes are protected. Auth routes use their own logic.  |
| `true`                  | All CRUD routes + `getUserByToken` are protected.               |
| `Array`                 | Only the named routes in the array are protected.               |

**Always protected routes:** `getUserByToken` is always protected regardless of the `protectedRoutes` setting.

**Default protected routes list:** `getAll`, `getOneById`, `search`, `addOne`, `addMany`, `updateOneById`, `updateMany`, `deleteById`, `deleteMany`, `getUserByToken`.

When auth is enabled but `protectedRoutes` is not explicitly set, CRUD routes remain **unprotected** — only routes listed in `protectedRoutes` (or those in `ALWAYS_PROTECTED_ROUTES`) require authentication.

### Collection-Based Access Control

When a protected route is accessed, you can further restrict access based on the user's `_collection` claim (set automatically in the JWT upon login/register). Configure `auth.collectionAccess` in the router options:

```javascript
auth: {
  collectionAccess: {
    accessDefault: true,   // Default access for collections not specified
    collections: {
      admins: ["*"],       // Full access to all routes (also: "all" or true)
      editors: ["getAll", "getOneById", "search", "addOne", "updateOneById"],
      viewers: ["getAll", "getOneById", "search"],
      guests: "none",      // No access (also: false)
    },
  },
}
```

| `collectionAccess` Field | Type      | Default | Description                                     |
| ------------------------ | --------- | ------- | ----------------------------------------------- |
| `accessDefault`          | `Boolean` | `true`  | Default access for collections not in `collections`. |
| `collections`            | `Object`  | `{}`    | Map of collection names to allowed route names. |

**Access values per collection:**

| Value              | Meaning                                   |
| ------------------ | ----------------------------------------- |
| `"*"`, `"all"`, `true` | Full access to all routes.            |
| `"none"`, `false`  | No access to any routes.                  |
| `Array` of strings | Access only to the named routes.          |

Auth routes (`login`, `register`, `refreshToken`, `getUserByToken`) always bypass collection access checks — they are always accessible to authenticated users.

When a user's `_collection` claim does not match any entry in `collections`, the `accessDefault` is used. If the user has no `_collection` claim at all, `accessDefault` also applies.

---

## Sensitive Field Handling

The API automatically protects sensitive fields from being exposed or manipulated:

### Response Sanitization

All CRUD route responses automatically strip these fields (case-insensitive match):

- `password`
- `passwordHash`
- `__v`

Additionally, any custom `passwordKey` configured in `auth.keys.passwordKey` is also stripped. Sanitization is recursive — sensitive fields are removed from nested objects and arrays within the response document. The sanitization handles Mongoose documents (via `toObject()`), Sequelize instances (via `get({ plain: true })`), and plain JavaScript objects uniformly.

### Field Selection Security

When using the `fields` query parameter or body field, the following sensitive fields are **forced to exclusion (0)** even if a user explicitly requests them with value 1:

- `password`, `passwordhash`, `password_hash`
- `salt`, `secret`, `token`, `refreshtoken`
- `__v`

Fields starting with `$` are also stripped to prevent MongoDB operator injection via field projection.

### Sort Field Security

Sort fields are sanitized to prevent injection:

- Fields starting with `$` are silently removed (MongoDB operator injection prevention).
- Sensitive field names (case-insensitive) are silently removed from sort criteria.

### NoSQL Query Sanitization

For routes that accept user-provided filter or update objects (`search`, `updateOneById`, `updateMany`, `deleteMany`), the following dangerous MongoDB operators are stripped to prevent NoSQL injection and arbitrary code execution:

- `$where` — allows arbitrary JavaScript execution
- `$expr` — allows expression-based queries that can bypass logic
- `$function` — allows arbitrary function execution
- `$accumulator` — allows custom accumulation logic

Additionally, in the `search` route, sensitive field names (e.g. `password`, `passwordHash`) are stripped from the query filter to prevent blind NoSQL injection attacks that could probe for password hashes.

---

## Route Order

Routes are registered in the following order to avoid path conflicts:

| Order | Route Name       | Method   | Path             |
| ----- | ---------------- | -------- | ---------------- |
| 1     | `getUserByToken` | `GET`    | `/me`            |
| 2     | `login`          | `POST`   | `/login`         |
| 3     | `register`       | `POST`   | `/register`      |
| 4     | `refreshToken`   | `POST`   | `/refresh-token` |
| 5     | `getAll`         | `GET`    | `/`              |
| 6     | `getOneById`     | `GET`    | `/:id`           |
| 7     | `search`         | `POST`   | `/search`        |
| 8     | `addOne`         | `POST`   | `/`              |
| 9     | `addMany`        | `POST`   | `/many`          |
| 10    | `updateMany`     | `PUT`    | `/many`          |
| 11    | `updateOneById`  | `PUT`    | `/:id`           |
| 12    | `deleteMany`     | `DELETE` | `/many`          |
| 13    | `deleteById`     | `DELETE` | `/:id`           |

Duplicates are removed before sorting, so each route name appears at most once regardless of how it was specified.

---

← [Back to README](../README.md)
