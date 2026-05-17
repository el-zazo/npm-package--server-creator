# Troubleshooting

Common issues, error messages, debugging tips, and frequently asked questions.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Connection Issues](#connection-issues)
- [Startup & Configuration Issues](#startup--configuration-issues)
- [Route Issues](#route-issues)
- [Authentication Issues](#authentication-issues)
- [Pagination & Query Issues](#pagination--query-issues)
- [Cache Issues](#cache-issues)
- [Rate Limiting Issues](#rate-limiting-issues)
- [Database-Specific Issues](#database-specific-issues)
- [CORS Issues](#cors-issues)
- [FAQ](#faq)

---

## Installation Issues

### `401 Unauthorized` when running `npm install`

**Cause:** GitHub Package token is missing, invalid, or lacks the `read:packages` scope.

**Solution:**

1. Verify your `.npmrc` file exists in the project root:
   ```text
   @el-zazo:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_NPM_TOKEN}
   ```
2. Ensure `GITHUB_NPM_TOKEN` is set in your environment.
3. Verify the token has the `read:packages` scope on GitHub → Settings → Developer settings → Personal access tokens.

---

### `Cannot find module '@el-zazo/server-creator'`

**Cause:** The package is not installed or the `.npmrc` is misconfigured.

**Solution:**

1. Check that the package appears in `node_modules/@el-zazo/server-creator`.
2. Run `npm install @el-zazo/server-creator` again.
3. Verify `.npmrc` is in the correct directory (project root).

---

## Connection Issues

### `Failed to connect to MongoDB`

**Cause:** MongoDB is not running, the URI is wrong, or network access is blocked.

**Solution:**

1. Verify MongoDB is running: `mongosh --eval "db.runCommand({ ping: 1 })"`.
2. Check the URI format — the default URI is `mongodb://0.0.0.0:27017/auto-server`:

   ```javascript
   // Local
   "mongodb://0.0.0.0:27017/my_database";

   // Atlas
   "mongodb+srv://user:pass@cluster.mongodb.net/my_database";
   ```

3. Ensure the IP is accessible (`0.0.0.0` vs `localhost`).
4. For Atlas: check IP whitelist and database user credentials.

---

### `Failed to connect to MySQL`

**Cause:** MySQL is not running, credentials are wrong, or the database does not exist.

**Solution:**

1. Verify MySQL is running: `mysqladmin ping -h localhost -u root -p`.
2. Confirm the database exists — the default database name is `auto_server`:
   ```sql
   CREATE DATABASE IF NOT EXISTS my_database;
   ```
3. Check credentials: host (default: `localhost`), port (default: `3306`), username (default: `root`), password (default: `""`).
4. Ensure the MySQL user has privileges on the database:
   ```sql
   GRANT ALL PRIVILEGES ON my_database.* TO 'root'@'%';
   ```

---

### `TypeError: Cannot read properties of undefined (reading 'mongodb')`

**Cause:** `adapterConfig` is not provided in the `DB` constructor options.

**Solution:** Always provide `adapterConfig` with at least one adapter key:

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_database" },
  },
});
```

---

### `Unsupported database type: <value>`

**Cause:** `dbType` is set to a value other than `"mongodb"` or `"mysql"`.

**Solution:** Use only accepted values:

```javascript
dbType: "mongodb"; // or "mysql"
```

---

## Startup & Configuration Issues

### `DB configuration error: options.collections cannot be empty`

**Cause:** The `collections` option is missing or empty. Collections is an **allowlist** — only explicitly listed collections get routes. Auto-discovery does not happen.

**Solution:** Always specify at least one collection:

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: { mongodb: { uri: "..." } },
  collections: {
    users: {},   // at least one collection required
  },
});
```

---

### `JWT secret is required for collection "<name>" when an always protected route exists`

**Cause:** Auth routes are configured with `getUserByToken` (or other always-protected routes) in `auth.routes`, or `protectedRoutes` is set, but no JWT secret is provided.

**Solution:** Set the secret in `globalRouterOptions.auth.authMiddlewareOptions`:

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
    },
  },
},
```

> **Important:** The secret must be set in `globalRouterOptions`, not in the collection's `routerOptions.auth.authMiddlewareOptions`. The merge logic in `DB.#prepareCollections()` always replaces `authMiddlewareOptions` with the global settings, so collection-level values are silently discarded.

---

### `JWT secret is required for Other Route "<name>"`

**Cause:** A custom route (`otherRoutes`) has `isProtected: true` but no JWT secret is configured in `globalRouterOptions.auth.authMiddlewareOptions`.

**Solution:** Add the secret to `globalRouterOptions`:

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
    },
  },
},
```

Custom routes always read `authMiddlewareOptions` from `globalRouterOptions`, not from the route's own `authMiddlewareOptions` property.

---

## Route Issues

### No routes are generated

**Cause:** The `collections` allowlist is empty, or all collections are disabled.

**Solution:**

1. Ensure `collections` contains at least one entry.
2. Check that no collection is disabled via `enabled: false`.
3. Verify the collection name matches the actual database collection/table name.

> The server does **not** auto-discover collections. Only names listed in `options.collections` receive routes.

---

### Auth routes (`/login`, `/register`) are missing

**Cause:** `auth.routes` is not set in the router options.

**Solution:** You must explicitly list the auth routes to generate:

```javascript
routerOptions: {
  auth: {
    routes: ["login", "register", "refreshToken", "getUserByToken"],
    // ...
  },
}
```

> Without `auth.routes`, no auth routes are created even if `auth` is configured.

---

### Routes return `401 Unauthorized` but I set up auth

**Cause:** `auth.protectedRoutes` is not explicitly set, or the JWT secret was not provided in `globalRouterOptions`.

**Solution:**

1. `protectedRoutes` must be explicitly configured. Without it, no CRUD routes are protected (except `getUserByToken`, which is always protected):

```javascript
auth: {
  protectedRoutes: true, // or an array like ["getAll", "getOneById"]
  // ...
}
```

2. Ensure the JWT secret is set in `globalRouterOptions.auth.authMiddlewareOptions.secret`. If the secret is placed only in `routerOptions.auth.authMiddlewareOptions`, it will be overwritten by the (empty) global settings during the merge, causing the auth middleware to throw `"JWT secret is required"`.

---

### Custom routes return 404

**Cause:** The route prefix or path is misconfigured.

**Solution:**

1. Remember that `otherRoutes` prefix defaults to `"/api"` — custom routes are mounted at `/api{path}` unless you override `prefix`.
2. Collection routers default to `/<collectionName>`.
3. Check the full URL: `{prefix}{path}`.

```javascript
otherRoutes: [
  {
    method: "GET",
    path: "/status",
    // prefix defaults to "/api", so route is at /api/status
    handler: (req, res) => res.json({ ok: true }),
  },
  {
    method: "GET",
    path: "/status",
    prefix: "",  // explicitly no prefix — route is at /status
    handler: (req, res) => res.json({ ok: true }),
  },
];
```

> Note: the built-in `GET /health` endpoint is always available regardless of route configuration.

---

### `getUserByToken` returns 401 even though other routes work

**Cause:** `getUserByToken` is in `ALWAYS_PROTECTED_ROUTES` — it requires authentication regardless of the `protectedRoutes` setting.

**Solution:** Always send a valid JWT token when calling `GET /me`. This route cannot be made public.

---

## Authentication Issues

### `JWT secret is required`

**Cause:** Auth middleware is invoked but no secret is provided.

**Solution:** Set the secret in `globalRouterOptions.auth.authMiddlewareOptions`:

```javascript
globalRouterOptions: {
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
    },
  },
}
```

Or set `JWT_SECRET` in your `.env` file (the `AUTH.SECRET_KEY` getter reads `process.env.JWT_SECRET` as a fallback).

---

### `JWT token has expired`

**Cause:** The access token is older than 24 hours (default expiry: `"24h"`).

**Solution:**

1. Use the `POST /refresh-token` route to get a new access token before it expires. Refresh tokens are valid for 7 days and are rotated on each use.
2. Implement token refresh logic in your client.
3. Token expiry is fixed at `"24h"` — it cannot be changed per collection.

---

### `Refresh token has been revoked or already used`

**Cause:** Refresh token rotation is enforced. Each refresh token can only be used once — after calling `/refresh-token`, the old refresh token's `jti` is deleted from the store.

**Solution:** After each refresh, store the new `refreshToken` from the response and discard the old one. Do not attempt to reuse a previously issued refresh token.

---

### `Authentication token is required` on protected routes

**Cause:** No token is sent with the request.

**Solution:** Include the token in the appropriate location. The default is the `Authorization` header, but you can configure `tokenFrom` in `authMiddlewareOptions`:

```bash
# Header (default — "Bearer" is case-insensitive per RFC 6750)
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...

# Query parameter (set tokenFrom: "query")
GET /users?token=eyJhbGciOiJIUzI1NiIs...

# Cookie (set tokenFrom: "cookie")
# Reads from the "token" cookie by default

# Body (set tokenFrom: "body")
POST /users  { "token": "eyJhbGciOiJIUzI1NiIs..." }
```

---

### `Access denied: Insufficient collection permissions`

**Cause:** The user's `_collection` claim does not have access to the requested route.

**Solution:**

1. Check the token payload — verify `_collection` is set correctly. The `_collection` value is automatically embedded in the JWT from the model's `collectionName` during login/register.
2. Review `collectionAccess.collections` in your config.
3. Ensure the user's collection is listed with the correct permissions:
   ```javascript
   collectionAccess: {
     accessDefault: false,
     collections: {
       admins: true,          // full access (also accepts "*" or "all")
       viewers: ["getAll"],   // specific routes only
     }
   }
   ```
4. If the user's `_collection` is not in the `collections` map, `accessDefault` determines the outcome (defaults to `true`).

---

### Login returns `Invalid credentials` but user exists

**Cause:** The password comparison fails. Possible reasons:

1. **Hash mismatch:** Password was stored plain but `usePasswordHash` is `true` (default), or vice versa.
2. **Wrong key:** The `identifiantKey` or `passwordKey` does not match the actual field names in the database.
3. **Password min length:** The register schema enforces `min(6)` on the password field. If the password was stored with fewer than 6 characters through another mechanism, validation at login may still fail.

**Solution:**

1. Verify the keys match your data:
   ```javascript
   auth: {
     keys: { identifiantKey: "email", passwordKey: "password" },
   }
   ```
2. If you stored plain passwords, set `usePasswordHash: false`:
   ```javascript
   auth: {
     usePasswordHash: false,
   }
   ```
   When `usePasswordHash` is `false`, passwords are compared using `timingSafeEqual` (SHA-256 hashed first to prevent length leaks).

---

### Login always takes ~100ms even for non-existent users

**Cause:** This is intentional timing-attack protection. When `usePasswordHash` is `true` (default) and a user is not found, the server performs a dummy `bcrypt.compare` with a fake hash so that the response time is consistent regardless of whether the user exists. This prevents user enumeration via timing analysis.

**Solution:** No action needed — this is a security feature, not a bug.

---

## Pagination & Query Issues

### `no_pagination=true` doesn't work on GET routes

**Cause:** Query parameters are strings. The Joi validation schema for `getAll` accepts `"true"`, `"True"`, `"1"`, `"false"`, `"False"`, and `"0"` as valid string values.

**Solution:** Use one of the accepted string values:

```
GET /users?no_pagination=true   ✅
GET /users?no_pagination=True   ✅
GET /users?no_pagination=1      ✅
```

> On `POST /search`, the body is parsed as JSON, so use the boolean: `"no_pagination": true`.

---

### Pagination returns wrong page number

**Cause:** The page calculation uses floating-point division internally.

**Solution:** Always use integer `page` and `per_page` values. Avoid setting `page=0` or negative values — the Joi validation enforces `min: 1`.

---

### `per_page` is capped at 100

**Cause:** The maximum `per_page` is hardcoded at `MODEL.PAGINATION.MAX_PER_PAGE = 100`. Values above 100 are silently clamped.

**Solution:** If you need all results, use `no_pagination=true` instead of a very large `per_page`.

---

### Sort parameter is ignored or returns a validation error

**Cause:** The sort format is invalid. Invalid sort parameters now throw a `ValidationError` instead of silently falling back to `{}`.

**Solution:** Use one of the supported formats:

```
?sort=name:1,createdAt:-1          ✅ URL-friendly (field:direction)
?sort={"name":1,"createdAt":-1}    ✅ JSON string
?sort=name                          ✅ single field (defaults to ascending: 1)
```

Sort fields are sanitized — sensitive fields like `password`, `token`, `salt` are removed, and fields starting with `$` are blocked to prevent MongoDB operator injection.

---

### Fields parameter returns all fields

**Cause:** The fields format is invalid and parsing returns `null` (no selection).

**Solution:** Use supported formats:

```
?fields=name,email                  ✅ include only name and email
?fields=name,email,-password        ✅ include name, email; exclude password
?fields={"name":1,"password":0}     ✅ JSON format
```

Sensitive fields (`password`, `passwordhash`, `salt`, `secret`, `token`, `refreshtoken`, `__v`) are always forced to exclusion (`0`) even if requested with `1`. Fields starting with `$` are stripped to prevent MongoDB operator injection.

---

### `Empty filter is not allowed for safety reasons`

**Cause:** The `updateMany` or `deleteMany` route received an empty or effectively empty filter. This safety check prevents accidental mass updates or deletions. An effectively empty filter includes `{}`, `{ or: [] }`, `{ and: [{}] }`, and nested combinations.

**Solution:** Always provide a filter with at least one real constraint:

```javascript
// ✅ Valid
{ "status": "inactive" }
{ "or": [{ "status": "pending" }, { "status": "draft" }] }

// ❌ Effectively empty — rejected
{}
{ "or": [] }
{ "and": [{}] }
```

---

### `Batch size exceeds maximum allowed limit of 500`

**Cause:** The `addMany` endpoint enforces a maximum of 500 documents per batch to prevent memory exhaustion and DoS attacks.

**Solution:** Split large batches into smaller groups of 500 or fewer documents.

---

## Cache Issues

### Data is stale after creating/updating records

**Cause:** Write operations (`addOne`, `addMany`, `updateOneById`, `updateManyByFilter`, `deleteOneById`, `deleteManyByFilter`) **do** invalidate the cache via `invalidateByPrefix()`. If data still appears stale, the issue is likely a separate cache instance, a different prefix, or the write failed silently.

**Solution:**

1. Verify the write operation succeeded by checking the response.
2. Reduce the cache TTL for frequently changing data:
   ```javascript
   cache: {
     ttl: 30000,  // 30 seconds
   }
   ```
3. Disable caching entirely for real-time data:
   ```javascript
   cache: {
     enabled: false,
   }
   ```

---

### Cache seems to not work

**Cause:** The query string exceeds 100 characters — `getMany` skips caching for large queries.

**Solution:** Simplify your query filters or accept that complex queries bypass the cache.

---

### Cache uses LRU eviction — old entries disappear unexpectedly

**Cause:** The cache uses LRU (Least Recently Used) eviction with a default `maxSize` of 100. When the cache is full, the least recently accessed item is evicted to make room for new entries.

**Solution:** Increase `maxSize` if you need to cache more items:

```javascript
cache: {
  maxSize: 500,
}
```

---

## Rate Limiting Issues

### `429 Too many requests` during development

**Cause:** The default rate limiter (`defaultRateLimiter`) allows 100 requests per 15 minutes per IP. Rapid testing can exhaust this quickly.

**Solution:**

1. Wait for the window to reset (15 minutes).
2. Restart the server — rate limit counters are stored in-memory and will reset on restart.

---

### `429` on login after 5 attempts

**Cause:** There are **two** additional rate limiters on auth routes (`login`, `register`, `refreshToken`):

| Limiter | Scope | Limit | Window |
|---------|-------|-------|--------|
| `ipStrictLimiter` | Per IP | 15 requests | 1 minute |
| `strictRateLimiter` | Per `IP_identifier` | 5 requests | 1 minute |

The `strictRateLimiter` uses a composite key of `IP_identifier` (where identifier is `req.body.email`, `req.body.username`, or `req.body.identifier`, falling back to `"unknown"`).

**Solution:** Wait 1 minute and try again. This is intentional to prevent brute-force attacks.

---

### `Too many attempts from this IP`

**Cause:** The `ipStrictLimiter` threshold (15 requests/minute per IP) has been exceeded on auth routes. This is the IP-only layer that prevents bypassing the per-identifier limiter by rotating identifiers.

**Solution:** Wait 1 minute for the window to reset.

---

## Database-Specific Issues

### MongoDB: `ValidationError: Invalid ID format`

**Cause:** The ID parameter is not a valid MongoDB ObjectId (24-character hex string).

**Solution:** Ensure IDs are 24-character hexadecimal strings:

```
GET /users/64a1b2c3d4e5f6a7b8c9d0e1   ✅ (24 hex chars)

GET /users/123                         ❌ (too short, not hex)

GET /users/abc                         ❌ (not hex)
```

Note: the Joi validation schema for `getOneById` also accepts numeric IDs (for MySQL) and arbitrary strings, so the route itself will not reject non-ObjectId strings — the `CastError` is caught by the model and re-thrown as a `ValidationError`.

---

### MySQL: Table not discovered

**Cause:** The table does not exist in the configured database, the database name is wrong, or the table is not listed in `collections`.

**Solution:**

1. Verify the table exists:
   ```sql
   USE my_database;
   SHOW TABLES;
   ```
2. Ensure `database` in the config matches the actual database name (default: `auto_server`).
3. The table must be explicitly listed in `collections` — auto-discovery does not happen.

---

### MySQL: Model name is wrong (e.g., `"Categorie"` instead of `"Category"`)

**Cause:** The `pluralize` library is used for singularization, which handles most irregular plurals correctly. However, edge cases may still produce unexpected results.

**Solution:** Override the model name explicitly:

```javascript
collections: {
  categories: {
    modelName: "Category",
  },
}
```

---

### MongoDB: Auto-detected schema is too permissive

**Cause:** Without a custom schema, the default uses `{ strict: false, versionKey: false }`, which accepts any field without validation.

**Solution:** Provide a Mongoose schema with proper validation:

```javascript
collections: {
  users: {
    schema: new mongoose.Schema({
      email: { type: String, required: true, unique: true },
      name: { type: String, required: true },
    }, { timestamps: true }),
  },
}
```

---

### MySQL: Auto-detected schema uses wrong types

**Cause:** The `describeTable()` auto-detection maps MySQL column types to Sequelize types using simple string matching. Unusual types (e.g., `JSON`, `ENUM`, `BLOB`) default to `DataTypes.STRING`.

**Solution:** Provide a custom schema with the correct Sequelize types:

```javascript
collections: {
  orders: {
    schema: {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      metadata: { type: DataTypes.JSON },
      status: { type: DataTypes.STRING },
    },
  },
}
```

---

## CORS Issues

### Requests from browser are blocked by CORS

**Cause:** CORS is disabled by default (`origin: false`). The server rejects cross-origin requests.

**Solution:** Configure CORS options via `serverOptions.corsOptions`:

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: { mongodb: { uri: "..." } },
  serverOptions: {
    corsOptions: {
      origin: "https://yourdomain.com",
      credentials: true,
    },
  },
  collections: { users: {} },
});
```

The custom options are merged with the defaults, so you only need to override the fields you want to change. The defaults are:

```javascript
{
  origin: false,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
}
```

---

## FAQ

### Can I use the package without authentication?

**Yes.** Authentication is entirely optional. Simply omit the `auth` configuration, and only CRUD routes will be generated — all unprotected.

---

### Can I disable specific CRUD routes?

**Yes.** Use the `routes` option to specify only the routes you want:

```javascript
routerOptions: {
  routes: ["getAll", "getOneById"], // read-only
}
```

The full list of available CRUD route names: `getAll`, `getOneById`, `search`, `addOne`, `addMany`, `updateOneById`, `updateMany`, `deleteById`, `deleteMany`. Auth route names (`login`, `register`, `refreshToken`, `getUserByToken`) are added separately via `auth.routes`.

---

### Can I add my own middleware to specific routes?

**Yes.** Use the `middleware` option in `routerOptions` to apply middleware to all routes of a collection:

```javascript
routerOptions: {
  middleware: [myCustomMiddleware],
}
```

For per-route middleware, use `otherRoutes` with the `middleware` array. Note that collection-level middleware **overrides** (does not merge with) `globalRouterOptions.middleware`.

---

### Does the package support PostgreSQL, SQLite, or other databases?

**No.** Only `"mongodb"` and `"mysql"` are supported.

---

### Can I use an existing Express app?

**With caution.** You can pass a pre-created `Server` instance to the `DB` constructor via the `server` option. However, replacing `server.app` with your own Express instance will lose all built-in middleware (helmet, JSON/urlencoded body parsing, CORS, cookie-parser, rate limiting, the `/health` endpoint, and the error handler). If you need custom middleware, add it through `globalRouterOptions.middleware` or `serverOptions` instead.

```javascript
const { DB, Server } = require("@el-zazo/server-creator");

const server = new Server({ port: 3000, corsOptions: { origin: "https://myapp.com" } });

const db = new DB({
  dbType: "mongodb",
  adapterConfig: { mongodb: { uri: "..." } },
  server: server,
  collections: { users: {} },
});
```

---

### Is the cache shared across all models?

**Yes.** A single `Cache` instance is created per adapter (MongoDBAdapter or MySQLAdapter) and shared across all models under that adapter. All models contribute to the same `maxSize` limit. The cache uses LRU eviction and write-through invalidation (`invalidateByPrefix`) on all write operations.

---

### What happens if I don't provide a custom schema?

- **MongoDB:** A schema with `{ strict: false, versionKey: false }` is created — any field can be stored, no `__v` field.
- **MySQL:** The table structure is auto-detected via `describeTable()` (not `SHOW COLUMNS`) and mapped to Sequelize types. Timestamps are disabled by default.

---

### Can I change the default prefix?

**Yes.** Collection prefixes can be customized via `collections.<name>.prefix`. The default is `/<collectionName>`. For custom routes (`otherRoutes`), the default prefix is `"/api"`.

---

### Where are refresh tokens stored?

Refresh tokens are stored in a file-based store (`.refresh-tokens.json` in the working directory). The store is a JSON file mapping `jti` → `{ userId, expiresAt }`. Expired tokens are cleaned up every 10 minutes. This approach works for single-instance deployments but is **not** suitable for multi-instance setups — replace it with Redis or a database store for horizontal scaling.

---

### Why does the server respond with `"Internal server error"` for unknown errors?

**Cause:** The error handler hides the original error message for unhandled exceptions to prevent information leakage. The original error message and stack trace are logged server-side via the `logger` function.

**Solution:** Check the server console output for the actual error details. This behavior is by design for production security.

---

### What built-in middleware does the server apply?

The `Server` class automatically applies the following middleware in order:

1. `trust proxy` (set to 1)
2. `helmet()` — security headers
3. `express.json({ limit: "1mb" })` — JSON body parsing
4. `express.urlencoded({ extended: true, limit: "1mb" })` — URL-encoded body parsing
5. `cors(corsOptions)` — CORS (disabled by default: `origin: false`)
6. `cookieParser()` — cookie parsing
7. `defaultRateLimiter` — 100 requests per 15 minutes per IP

Additionally, every route (including custom routes) gets the `loggerMiddleware` applied automatically.

---

← [Back to README](../README.md)
