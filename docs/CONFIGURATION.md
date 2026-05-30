# Configuration

Complete reference for configuring the `DB`, `Server`, and `Router` classes to tailor your auto-generated API to your exact needs.

## Table of Contents

- [Environment Variables](#environment-variables)
- [DB Class](#db-class)
- [collections.<collectionName>](#collectionscollectionname)
- [Server Class](#server-class)
- [Router Class](#router-class)
- [otherRoutes](#otherroutes)
- [Examples](#examples)

---

## Environment Variables

Recommended environment variables for your `.env` file.

| Variable           | Description                                    | Required            |
| ------------------ | ---------------------------------------------- | ------------------- |
| `JWT_SECRET`       | Secret key used to sign and verify JWT tokens. | Yes (if auth used)  |
| `GITHUB_NPM_TOKEN` | GitHub token required to install the package.  | No                  |

> ⚠️ **Security Warning:** `JWT_SECRET` has **no default value**. The authentication middleware will throw an `AuthenticationError` at request time if the secret is not provided. The Router constructor will also throw at startup if protected routes are configured without a secret. Never hard-code secrets in your source code — always use environment variables.

**Example `.env` file:**

```env
# Authentication
JWT_SECRET=your_super_secret_jwt_key_123

# GitHub Package Registry
GITHUB_NPM_TOKEN=ghp_your_github_token_here
```

---

## DB Class

The main orchestrator. It handles database connection, creates models for explicitly listed collections, generates routers, and binds them to the server.

**Signature:** `new DB(options)`

> **Allowlist model:** Only collections explicitly listed in `options.collections` will have routes generated. There is no auto-discovery of database tables/collections. An empty `collections` object will cause a startup error.

### `dbType`

- **Type:** `String`
- **Default:** `"mongodb"`
- **Required:** No

The database type to use. Accepted values: `"mongodb"`, `"mysql"`.

### `adapterConfig`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

Configuration object passed directly to the chosen database adapter.

<details>
<summary>MongoDB — adapterConfig.mongodb</summary>

### `uri`

- **Type:** `String`
- **Default:** `"mongodb://0.0.0.0:27017/auto-server"`
- **Required:** No

MongoDB connection URI. Include credentials and database name directly in the URI.

```javascript
adapterConfig: {
  mongodb: {
    uri: "mongodb+srv://user:pass@cluster.mongodb.net/mydb"
  }
}
```

### `connectionOptions`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

Mongoose connection options passed directly to `mongoose.connect()`. See [Mongoose docs](https://mongoosejs.com/docs/connections.html#options) for all available options. Common options include:

| Option       | Type      | Description                                   |
| ------------ | --------- | --------------------------------------------- |
| `dbName`     | `String`  | Database name if not in the URI.              |
| `ssl`        | `Boolean` | Enable SSL connection.                        |
| `authSource` | `String`  | Database used for authentication credentials. |

### `cache`

| Option    | Type      | Default  | Description                            |
| --------- | --------- | -------- | -------------------------------------- |
| `enabled` | `Boolean` | `true`   | Enable/disable in-memory cache.        |
| `ttl`     | `Number`  | `300000` | Cache lifetime in ms (default: 5 min). |
| `maxSize` | `Number`  | `100`    | Maximum cached items.                  |

</details>

<details>
<summary>MySQL — adapterConfig.mysql</summary>

### `host`

- **Type:** `String`
- **Default:** `"localhost"`
- **Required:** No

MySQL host address.

### `port`

- **Type:** `Number`
- **Default:** `3306`
- **Required:** No

MySQL port.

### `database`

- **Type:** `String`
- **Default:** `"auto_server"`
- **Required:** No

MySQL database name.

### `username`

- **Type:** `String`
- **Default:** `"root"`
- **Required:** No

MySQL username.

### `password`

- **Type:** `String`
- **Default:** `""`
- **Required:** No

MySQL password.

### `connectionOptions`

- **Type:** `Object`
- **Default:** See below
- **Required:** No

Sequelize connection options. Default values:

| Option         | Type      | Default   | Description                                   |
| -------------- | --------- | --------- | --------------------------------------------- |
| `dialect`      | `String`  | `"mysql"` | Sequelize dialect.                            |
| `logging`      | `Boolean` | `false`   | Enable Sequelize query logging.               |
| `pool.max`     | `Number`  | `5`       | Max connection pool size.                     |
| `pool.min`     | `Number`  | `0`       | Min connection pool size.                     |
| `pool.acquire` | `Number`  | `30000`   | Time (ms) to acquire a connection.            |
| `pool.idle`    | `Number`  | `10000`   | Time (ms) before idle connection is released. |

### `cache`

| Option    | Type      | Default  | Description                            |
| --------- | --------- | -------- | -------------------------------------- |
| `enabled` | `Boolean` | `true`   | Enable/disable in-memory cache.        |
| `ttl`     | `Number`  | `300000` | Cache lifetime in ms (default: 5 min). |
| `maxSize` | `Number`  | `100`    | Maximum cached items.                  |

</details>

### `globalRouterOptions`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

Default router options applied to all collections unless overridden.
**Note:** Only the following options are inherited globally:

- `routes`
- `middleware`
- `auth.authMiddlewareOptions`

Other options like `fields`, `auth.keys`, `auth.routes`, `auth.protectedRoutes`, or `auth.collectionAccess` must be configured directly inside `collections.<collectionName>.routerOptions`.

```javascript
globalRouterOptions: {
  routes: ["getAll", "getOneById"],
  middleware: [myCustomMiddleware],
  auth: {
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET
    }
  }
}
```

> **`authMiddlewareOptions` inheritance:** When `globalRouterOptions.auth.authMiddlewareOptions` is set, it is **always** copied into each collection's final router options during preparation, overriding any collection-level `authMiddlewareOptions`. This means `authMiddlewareOptions` is effectively global-only — setting it per-collection has no effect.

### `collections`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** Yes

Explicit collection configuration. Only collections listed here will have models and routes generated. **An empty object will cause a startup error** — you must specify at least one collection.

```javascript
// This will throw at startup:
const db = new DB({ collections: {} });

// Correct: specify at least one collection
const db = new DB({
  collections: {
    users: { /* options */ }
  }
});
```

See [collections.<collectionName>](#collectionscollectionname).

### `logs`

- **Type:** `Object`
- **Default:** `{ enabled: true, level: "debug" }`
- **Required:** No

Logger configuration. Controls the built-in structured logger that outputs JSON-formatted log entries to the console.

| Option     | Type      | Default    | Description                                                        |
| ---------- | --------- | ---------- | ------------------------------------------------------------------ |
| `enabled`  | `Boolean` | `true`     | Master switch. `false` silences ALL log output.                    |
| `level`    | `String`  | `"debug"`  | Minimum log level. One of `"debug"`, `"info"`, `"warn"`, `"error"`. |

Log levels (lowest → highest priority): `debug` < `info` < `warn` < `error`. When `level` is set to `"info"`, for example, `debug` messages are suppressed while `info`, `warn`, and `error` messages are printed.

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: { mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" } },
  logs: {
    enabled: true,
    level: "info",  // suppress debug messages in production
  },
  collections: { users: {} },
});
```

### `otherRoutes`

- **Type:** `Array`
- **Default:** `[]`
- **Required:** No

Custom routes that aren't tied to a database model. See [otherRoutes](#otherroutes).

### `server`

- **Type:** `Server`
- **Default:** A new `Server` instance is created automatically.
- **Required:** No

An existing `Server` instance to use instead of creating a new one. When provided, `serverOptions` is ignored.

### `serverOptions`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

Options passed to the `Server` class if `server` is not provided. See [Server Class](#server-class).

---

## collections.<collectionName>

Dynamic configuration targeting a specific database collection or table by its exact name. Each key in the `collections` object is the collection/table name, and its value is the configuration for that collection.

```javascript
collections: {
  users: { /* specific options for 'users' collection */ },
  products: { enabled: false } // disable 'products' — routes will not be generated
}
```

### `enabled`

- **Type:** `Boolean`
- **Default:** `true`
- **Required:** No

Set to `false` to skip generating routes for this collection/table. The collection entry still needs to exist in the `collections` object, but no model or router will be created for it.

### `prefix`

- **Type:** `String`
- **Default:** `"/<collectionName>"`
- **Required:** No

Custom route prefix. This is the path segment under `/api` where the collection's routes will be mounted. For example, `prefix: "/auth"` on a `users` collection results in routes at `/api/auth/...` instead of `/api/users/...`.

### `modelName`

- **Type:** `String`
- **Default:** Formatted name (singular, PascalCase via `pluralize.singular()`)
- **Required:** No

Custom model name (e.g., `"User"`). The default converts the collection name to singular PascalCase (e.g., `"order_items"` → `"OrderItem"`).

### `schema`

- **Type:** `Object`
- **Default:** Auto-generated
- **Required:** No

Custom Mongoose schema or Sequelize model definition.

- **MongoDB:** Defaults to a schema with `strict: false`, `collection: <collectionName>`, and `versionKey: false` (allows all fields, no `__v`).
- **MySQL:** Defaults to a schema auto-generated from the table's column structure using `sequelize.getQueryInterface().describeTable()`, with `timestamps: false`.

### `modelOptions`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

_(MySQL only)_ Additional Sequelize model options passed as the third argument to `sequelize.define()`. These are spread after the default `{ tableName, timestamps: false }`, so you can override defaults. Common usage:

```javascript
modelOptions: { timestamps: true }  // Enable createdAt/updatedAt columns
```

### `routerOptions`

- **Type:** `Object`
- **Default:** `{}`
- **Required:** No

Router options specific to this collection. This uses the exact same structure as the [Router Class](#router-class) configuration and will be merged with `globalRouterOptions` (global values are used as fallbacks for `routes`, `middleware`, and `auth.authMiddlewareOptions`).

---

## Server Class

Manages the Express application instance, global middleware, health check endpoint, and HTTP server lifecycle (including graceful shutdown).

**Signature:** `new Server(options)`

| Option        | Type     | Default     | Description                                         |
| ------------- | -------- | ----------- | --------------------------------------------------- |
| `port`        | `Number` | `3000`      | The port the HTTP server will listen on.            |
| `corsOptions` | `Object` | See details | CORS configuration passed to the `cors` middleware. |

<details>
<summary>corsOptions details</summary>

| Option           | Type              | Default                                       | Description                                      |
| ---------------- | ----------------- | --------------------------------------------- | ------------------------------------------------ |
| `origin`         | `String \| Array \| Boolean` | `false`                              | Allowed origins. `false` disables CORS entirely. |
| `methods`        | `Array`           | `["GET", "POST", "PUT", "DELETE", "OPTIONS"]` | Allowed HTTP methods.                            |
| `allowedHeaders` | `Array`           | `["Content-Type", "Authorization"]`           | Allowed request headers.                         |
| `credentials`    | `Boolean`         | `false`                                       | Enable CORS credentials (cookies, auth headers). |

> **CORS is disabled by default.** The default `origin: false` and `credentials: false` means cross-origin requests will be rejected. To enable CORS, set `origin` to a specific domain or array of domains. If you need credentials (cookies, authorization headers), you must set both `origin` to a specific value (not `"*"`) and `credentials: true`.

Custom `corsOptions` are **merged** with the defaults, so you only need to specify the properties you want to override:

```javascript
serverOptions: {
  corsOptions: {
    origin: "https://yourdomain.com",
    credentials: true
  }
}
```

</details>

### Built-in Middleware

The Server class automatically applies the following middleware in order. These cannot be disabled or reordered:

| Middleware         | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `trust proxy`      | Set to `1` for correct IP detection behind proxies.  |
| `helmet()`         | Sets security-related HTTP headers.                  |
| `express.json()`   | Parses JSON bodies (1mb limit).                      |
| `express.urlencoded()` | Parses URL-encoded bodies (1mb limit, extended). |
| `cors()`           | CORS handling with configurable options.             |
| `cookieParser()`   | Parses Cookie header into `req.cookies`.             |
| `defaultRateLimiter` | Rate limiting (100 requests / 15 minutes).        |

### Health Check Endpoint

A `/health` endpoint is automatically registered **before** all other routes, so it is always accessible regardless of route ordering or authentication configuration.

**Response (healthy):**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "database": "connected"
}
```

**Response (degraded — DB error):**

```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "database": "error"
}
```

Returns HTTP `503` when the database is unreachable.

### Graceful Shutdown

The server handles `SIGTERM` and `SIGINT` signals for graceful shutdown:

1. Stops accepting new connections.
2. Waits for existing requests to complete.
3. Disconnects the database.
4. Waits 100ms for cleanup handlers to flush, then exits with code 0.
5. If shutdown takes longer than 10 seconds, forces exit with code 1.

---

## Router Class

Defines how routes are generated for a specific model. Applied via `globalRouterOptions` or `collections.<name>.routerOptions`.

**Signature:** `new Router(model, options)`

### `routes`

- **Type:** `Array`
- **Default:** All 9 CRUD routes
- **Required:** No

List of route names to generate. Unknown route names (not in the default list) are silently ignored.

| Route Name      | Method   | Description                          |
| --------------- | -------- | ------------------------------------ |
| `getAll`        | `GET`    | Fetch all records with pagination.   |
| `getOneById`    | `GET`    | Fetch a single record by ID.         |
| `search`        | `POST`   | Search records with complex queries. |
| `addOne`        | `POST`   | Create a single record.              |
| `addMany`       | `POST`   | Create multiple records (max 500).   |
| `updateOneById` | `PUT`    | Update a single record by ID.        |
| `updateMany`    | `PUT`    | Update multiple records by filter.   |
| `deleteById`    | `DELETE` | Delete a single record by ID.        |
| `deleteMany`    | `DELETE` | Delete multiple records by filter.   |

### `middleware`

- **Type:** `Array`
- **Default:** `[]`
- **Required:** No

Array of Express middlewares applied to all routes in this router. These run via `router.use()` before any route-specific middleware.

### `fields`

- **Type:** `Object`
- **Default:** `null` (all included)
- **Required:** No

Specifies which fields will be included or excluded from the route responses. This is configured as a `routerOptions` property (i.e., `collections.<name>.routerOptions.fields`), not at the collection level. If not set, all fields are returned by default (sensitive fields like passwords are always stripped by `sanitizeDocument`).

Use dynamic keys with `1` (include) or `0` (exclude). Request-level `?fields=` parameters are merged with this configuration, but collection-level `0` (exclude) rules cannot be overridden by request parameters.

```javascript
collections: {
  users: {
    routerOptions: {
      fields: {
        password: 0, // Exclude password from all responses
        email: 1     // Include email
      }
    }
  }
}
```

### `auth`

- **Type:** `Object`
- **Default:** `null`
- **Required:** No

Authentication configuration for this router. See [AUTHENTICATION.md](./AUTHENTICATION.md) for the full guide.

<details>
<summary>auth.keys</summary>

Defines the field names used for credentials.

| Option           | Type     | Default      | Description                                                                |
| ---------------- | -------- | ------------ | -------------------------------------------------------------------------- |
| `identifiantKey` | `String` | `"email"`    | The field used as identifier. If `"email"`, Joi enforces email validation. |
| `passwordKey`    | `String` | `"password"` | The field used for the password.                                           |

</details>

<details>
<summary>auth.additionalFields</summary>

Additional Joi schemas to merge into the register validation. Dynamic keys represent the field names. Each value must be a valid Joi schema object — the Router constructor will throw if a non-Joi value is provided.

```javascript
auth: {
  additionalFields: {
    name: Joi.string().required(),
    age: Joi.number().min(18)
  }
}
```

</details>

<details>
<summary>auth.routes</summary>

- **Type:** `Array`
- **Default:** `[]`

Auth routes to enable. Available routes:

- `"login"`
- `"register"`
- `"refreshToken"`
- `"getUserByToken"`

> Auth routes (`login`, `register`, `refreshToken`) automatically receive `ipStrictLimiter` and `strictRateLimiter` middleware for brute-force protection.

</details>

<details>
<summary>auth.protectedRoutes</summary>

- **Type:** `Array | Boolean`
- **Default:** `false`

Determines which routes require JWT authentication.

- `false`: No CRUD routes are protected.
- `true`: All 9 CRUD routes + `getUserByToken` are protected.
- `Array`: Only the listed route names are protected.

> `getUserByToken` is **always protected** whenever auth middleware is present, regardless of this setting.

```javascript
auth: {
  protectedRoutes: ["getAll", "getOneById", "getUserByToken"]
}
```

</details>

<details>
<summary>auth.usePasswordHash</summary>

- **Type:** `Boolean`
- **Default:** `true`

If `false`, passwords are stored and compared in plain text (using timing-safe comparison). **Use this for dev/testing only.**

</details>

<details>
<summary>auth.collectionAccess</summary>

Access control based on the user's `_collection` attribute (set automatically during login from the model's `collectionName`).

| Option          | Type      | Default | Description                                       |
| --------------- | --------- | ------- | ------------------------------------------------- |
| `accessDefault` | `Boolean` | `true`  | Default access if user's collection isn't listed. |
| `collections`   | `Object`  | `{}`    | Rules per user collection (role).                 |

Dynamic keys inside `collections` accept:

- `true`, `"all"`, `"*"` → Full access
- `false`, `"none"` → No access
- `Array` → List of allowed route names

```javascript
auth: {
  collectionAccess: {
    accessDefault: false, // Deny by default
    collections: {
      admins: true,           // Full access
      viewers: ["getAll"],    // Read only
      banned: "none",         // No access
    }
  }
}
```

</details>

<details>
<summary>auth.authMiddlewareOptions</summary>

Configuration for the JWT authentication middleware. **This must be set globally** via `globalRouterOptions.auth.authMiddlewareOptions` — per-collection values are overwritten during preparation.

| Option        | Type      | Default         | Description                                                          |
| ------------- | --------- | --------------- | -------------------------------------------------------------------- |
| `secret`      | `String`  | **(required)**  | The JWT secret key. No default — throws if missing.                  |
| `tokenFrom`   | `String`  | `"header"`      | Where to get the token: `"header"`, `"query"`, `"cookie"`, `"body"`. |
| `headerName`  | `String`  | `"Authorization"` | Header name if `tokenFrom` is `"header"`.                          |
| `queryParam`  | `String`  | `"token"`       | Query param if `tokenFrom` is `"query"`.                             |
| `cookieName`  | `String`  | `"token"`       | Cookie name if `tokenFrom` is `"cookie"`.                            |
| `bodyField`   | `String`  | `"token"`       | Body field if `tokenFrom` is `"body"`.                               |
| `passthrough` | `Boolean` | `false`         | If `true`, allows requests without a token to proceed.               |

```javascript
// Example: Read token from cookies
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

</details>

---

## otherRoutes

Custom routes that aren't tied to a database model. Each item in the array accepts the following options:

- **`method`** (`String`, required): HTTP method. Supported: `"GET"`, `"POST"`, `"PUT"`, `"PATCH"`, `"DELETE"`, `"OPTIONS"`, `"HEAD"`.
- **`path`** (`String`, required): Route path (e.g., `"/custom"`).
- **`handler`** (`Function`, required): Express route handler `(req, res, next) => {}`.
- **`middleware`** (`Array`): Additional middleware specific to this route. Default: `[]`.
- **`isProtected`** (`Boolean`): If `true`, applies authentication middleware using the global `authMiddlewareOptions`. Default: `false`.
- **`prefix`** (`String`): Route prefix for mounting. Default: `"/api"`.
- **`routeName`** (`String`): Optional name used in error messages and as the key for collection access checks. Defaults to the route's `path`.
- **`collectionAccess`** (`Object`): Collection-based access control for this route (same structure as `auth.collectionAccess`).
- **`authMiddlewareOptions`** (`Object`): **Ignored.** Authentication always uses `globalRouterOptions.auth.authMiddlewareOptions`. Setting this property has no effect.

> **Startup validation:** If `isProtected: true` is set on any otherRoute but `globalRouterOptions.auth.authMiddlewareOptions.secret` is not provided, the server will throw an error at startup.

**Full Example:**

```javascript
otherRoutes: [
  {
    method: "POST",
    path: "/contact",
    handler: (req, res) => {
      res.json({ message: "Contact form received" });
    },
    isProtected: false,
    prefix: "/api/public",
  },
  {
    method: "GET",
    path: "/admin-stats",
    routeName: "admin-stats",
    handler: (req, res) => {
      res.json({ stats: "..." });
    },
    isProtected: true,
    collectionAccess: {
      accessDefault: false,
      collections: { admins: true },
    },
  },
];
```

---

## Examples

### Minimal Setup

```javascript
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" },
  },
  collections: {
    users: {},
  },
});

db.start();
```

### MongoDB Advanced Setup

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI,
      connectionOptions: { dbName: "my_app_db" },
      cache: { enabled: true, ttl: 600000, maxSize: 200 },
    },
  },
  serverOptions: { port: 8080 },
  collections: {
    users: {
      routerOptions: {
        routes: ["getAll", "getOneById", "addOne"],
      },
    },
    posts: {},
  },
});

db.start(() => console.log("Running on port 8080"));
```

### MySQL Advanced Setup

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: process.env.MYSQL_HOST,
      database: "app_db",
      username: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      cache: { enabled: true, ttl: 300000 },
    },
  },
  serverOptions: { port: 3000 },
  collections: {
    users: {
      modelOptions: { timestamps: true },
    },
    orders: {},
  },
});

db.start();
```

### Auth + collectionAccess Full Example

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: process.env.MONGODB_URI },
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
      prefix: "/auth",
      routerOptions: {
        routes: ["getAll", "getOneById"],
        fields: { password: 0 }, // Never return passwords
        auth: {
          keys: { identifiantKey: "email", passwordKey: "password" },
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: ["getAll", "getOneById"],
          collectionAccess: {
            accessDefault: false,
            collections: {
              admins: true,
              viewers: ["getAll", "getOneById"],
            },
          },
        },
      },
    },
  },
  otherRoutes: [
    {
      method: "GET",
      path: "/admin-stats",
      handler: (req, res) => res.json({ stats: "..." }),
      isProtected: true,
      collectionAccess: {
        accessDefault: false,
        collections: { admins: true },
      },
    },
  ],
});

db.start();
```

### Enable CORS with Credentials

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" },
  },
  serverOptions: {
    corsOptions: {
      origin: "https://yourdomain.com",
      credentials: true,
    },
  },
  collections: {
    users: {},
  },
});
```

---

← [Back to README](../README.md)
