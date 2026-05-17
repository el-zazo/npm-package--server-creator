# Examples

Practical, copy-paste-ready examples for common setups and deployment scenarios.

## Table of Contents

- [MongoDB Examples](#mongodb-examples)
  - [Minimal MongoDB Setup](#minimal-mongodb-setup)
  - [MongoDB with Auth](#mongodb-with-auth)
  - [MongoDB with Custom Schema](#mongodb-with-custom-schema)
  - [MongoDB with Cache Tuning](#mongodb-with-cache-tuning)
- [MySQL Examples](#mysql-examples)
  - [Minimal MySQL Setup](#minimal-mysql-setup)
  - [MySQL with Auth](#mysql-with-auth)
  - [MySQL with Custom Schema](#mysql-with-custom-schema)
- [Multi-Collection Examples](#multi-collection-examples)
  - [Auth + Protected Resources](#auth--protected-resources)
  - [Collection-Based Access Control](#collection-based-access-control)
- [Custom Routes Examples](#custom-routes-examples)
  - [Public Custom Route](#public-custom-route)
  - [Protected Custom Route](#protected-custom-route)
  - [Custom Route with Prefix and Collection Access](#custom-route-with-prefix-and-collection-access)
- [Advanced Examples](#advanced-examples)
  - [Selective CRUD Routes](#selective-crud-routes)
  - [Field Exclusion](#field-exclusion)
  - [Search Route](#search-route)
  - [Global Middleware](#global-middleware)
  - [Disabling a Collection](#disabling-a-collection)
  - [Custom Model Name](#custom-model-name)
  - [Registration with Additional Fields](#registration-with-additional-fields)
  - [Plain-Text Password Mode](#plain-text-password-mode)
- [Deployment Examples](#deployment-examples)
  - [Environment Variables](#environment-variables)
  - [Docker Compose with MongoDB](#docker-compose-with-mongodb)

---

> **Important:** `options.collections` is an **allowlist**, not auto-discovery. You must explicitly list every collection that should receive routes. If `collections` is empty or omitted, the server will throw an error at startup: `"DB configuration error: options.collections cannot be empty."`

> **Note on `authMiddlewareOptions`:** The JWT `secret` (and all other `authMiddlewareOptions` such as `tokenFrom`, `headerName`, etc.) must be set in `globalRouterOptions.auth.authMiddlewareOptions`. Values placed inside a collection's `routerOptions.auth.authMiddlewareOptions` are ignored — the merge logic always replaces them with the global settings.

---

## MongoDB Examples

### Minimal MongoDB Setup

The simplest possible configuration — specify one collection and let the server generate all CRUD routes for it.

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI || "mongodb://0.0.0.0:27017/auto-server",
    },
  },
  collections: {
    products: {},
  },
});

db.start(() => {
  console.log("API running at http://localhost:3000");
});
```

**Result:** The `products` collection gets full CRUD routes at `/products`.

| Route | Method | Path |
|-------|--------|------|
| getAll | GET | `/products` |
| getOneById | GET | `/products/:id` |
| search | POST | `/products/search` |
| addOne | POST | `/products` |
| addMany | POST | `/products/many` |
| updateOneById | PUT | `/products/:id` |
| updateMany | PUT | `/products/many` |
| deleteById | DELETE | `/products/:id` |
| deleteMany | DELETE | `/products/many` |

---

### MongoDB with Auth

Add login, register, refresh-token, and profile routes for a `users` collection.

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI,
    },
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
        fields: { password: 0 },
        auth: {
          keys: { identifiantKey: "email", passwordKey: "password" },
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
        },
      },
    },
  },
});

db.start(() => {
  console.log("API running with auth at http://localhost:3000");
});
```

**Result:**

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh-token`
- `GET /auth/me` (always protected)
- All other `users` CRUD routes (protected via `protectedRoutes: true`)

The `fields: { password: 0 }` setting ensures the `password` field is never returned in any response, even if a client requests it via `?fields=password`.

Auth routes (`login`, `register`, `refreshToken`) are automatically protected by two additional rate limiters beyond the global one: an IP-only limiter (15 requests/minute per IP) and a per-identifier limiter (5 requests/minute per IP+identifier).

---

### MongoDB with Custom Schema

Provide a Mongoose schema instead of using the default `strict: false` schema.

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");
const mongoose = require("mongoose");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI,
    },
  },
  collections: {
    products: {
      schema: new mongoose.Schema(
        {
          name: { type: String, required: true },
          price: { type: Number, required: true, min: 0 },
          category: { type: String, index: true },
          inStock: { type: Boolean, default: true },
        },
        {
          timestamps: true,
        },
      ),
    },
  },
});

db.start();
```

**Result:** The `products` collection uses the custom schema with Mongoose validation, timestamps, and indexes. Without a custom schema, the default uses `{ strict: false, versionKey: false }`.

---

### MongoDB with Cache Tuning

Override the default cache settings (5-minute TTL, 100-item max) for a read-heavy collection.

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI,
      cache: {
        enabled: true,
        ttl: 10 * 60 * 1000,  // 10 minutes
        maxSize: 200,
      },
    },
  },
  collections: {
    articles: {},
    categories: {},
  },
});

db.start();
```

**Result:** Both collections share the cache with 10-minute TTL and a maximum of 200 entries. Cache can also be disabled per adapter by setting `cache.enabled: false`.

---

## MySQL Examples

### Minimal MySQL Setup

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: process.env.MYSQL_HOST || "localhost",
      database: process.env.MYSQL_DATABASE || "auto_server",
      username: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
    },
  },
  collections: {
    orders: {},
  },
});

db.start(() => {
  console.log("API running at http://localhost:3000");
});
```

**Result:** The `orders` table gets full CRUD routes. Column types are auto-detected via `describeTable()`. The default database name is `auto_server` if not specified.

---

### MySQL with Auth

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: process.env.MYSQL_HOST,
      database: "my_app",
      username: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
    },
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
        fields: { password: 0 },
        auth: {
          keys: { identifiantKey: "email", passwordKey: "password" },
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: [
            "getAll",
            "getOneById",
            "updateOneById",
            "deleteById",
          ],
        },
      },
    },
  },
});

db.start();
```

**Result:** Auth routes at `/users/login`, `/users/register`, `/users/refresh-token`, `/users/me`. The listed CRUD routes are protected; `addOne` and `addMany` remain public.

---

### MySQL with Custom Schema

Override the auto-detected schema for a specific table:

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");
const { DataTypes } = require("sequelize");

const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: "localhost",
      database: "my_app",
      username: "root",
      password: "secret",
    },
  },
  collections: {
    orders: {
      schema: {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        total: { type: DataTypes.FLOAT, allowNull: false },
        status: { type: DataTypes.STRING, defaultValue: "pending" },
        customer_id: { type: DataTypes.INTEGER, allowNull: false },
      },
      modelOptions: { timestamps: true },
    },
  },
});

db.start();
```

**Result:** The `orders` table uses the custom Sequelize schema with timestamps enabled. Without a custom schema, auto-detection uses `describeTable()` and timestamps are disabled by default.

---

## Multi-Collection Examples

### Auth + Protected Resources

One collection handles auth; other collections are protected and require a token.

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
        fields: { password: 0 },
        auth: {
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: ["getAll", "getOneById"],
        },
      },
    },
    posts: {
      routerOptions: {
        auth: {
          protectedRoutes: true,
        },
      },
    },
    comments: {
      routerOptions: {
        auth: {
          protectedRoutes: ["getAll", "getOneById"],
        },
      },
    },
  },
});

db.start();
```

**Result:**

- `/auth/*` — auth routes + protected `getAll` and `getOneById` on users
- `/posts/*` — all routes protected
- `/comments/*` — only `GET` routes protected

The `authMiddlewareOptions.secret` is specified once in `globalRouterOptions` and shared across all collections. There is no need to repeat it inside each collection's `routerOptions.auth`.

---

### Collection-Based Access Control

Different users get different access levels based on their collection. The `_collection` claim is embedded in the JWT automatically based on the model's collection name.

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
      routerOptions: {
        fields: { password: 0 },
        auth: {
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
          collectionAccess: {
            accessDefault: false,
            collections: {
              users: true,
              admins: true,
              editors: ["getAll", "getOneById", "addOne", "updateOneById"],
              viewers: ["getAll", "getOneById"],
            },
          },
        },
      },
    },
  },
});

db.start();
```

**Result:**

- A user with `_collection: "users"` or `_collection: "admins"` → full access to all routes
- A user with `_collection: "editors"` → read + create + update only
- A user with `_collection: "viewers"` → read only
- Any other collection → denied (`accessDefault` is `false`)

The `collections` map inside `collectionAccess` uses the collection name as the key. Values can be `true` (all access), `false`/`"none"` (no access), or an array of allowed route names.

---

## Custom Routes Examples

### Public Custom Route

A route that does not require authentication. Note: a built-in `/health` endpoint already exists, so this example uses a different path.

```javascript
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" },
  },
  collections: {
    products: {},
  },
  otherRoutes: [
    {
      method: "GET",
      path: "/status",
      handler: (req, res) => {
        res.json({ status: "ok", timestamp: new Date().toISOString() });
      },
    },
  ],
});

db.start();
```

**Result:** `GET /api/status` — public, no auth, mounted under the default `/api` prefix. The built-in `GET /health` endpoint is also available automatically and returns status, uptime, and database connectivity.

---

### Protected Custom Route

A route that requires a valid JWT token:

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
      routerOptions: {
        auth: {
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
        },
      },
    },
  },
  otherRoutes: [
    {
      method: "GET",
      path: "/profile",
      handler: (req, res) => {
        res.json({ user: req.user });
      },
      isProtected: true,
    },
  ],
});

db.start();
```

**Result:** `GET /api/profile` — requires a valid token. `req.user` contains the decoded JWT payload (including `_collection` if set). `req.userCollection` contains the collection name for access-control checks.

---

### Custom Route with Prefix and Collection Access

```javascript
otherRoutes: [
  {
    method: "POST",
    path: "/contact",
    handler: (req, res) => {
      const { name, email, message } = req.body;
      res.json({ success: true, received: { name, email } });
    },
    prefix: "/api/public",
  },
  {
    method: "GET",
    path: "/stats",
    handler: (req, res) => {
      res.json({ totalUsers: 150, activeToday: 42 });
    },
    isProtected: true,
    prefix: "/api/admin",
    collectionAccess: {
      accessDefault: false,
      collections: { users: true, admins: true },
    },
  },
];
```

**Result:**

- `POST /api/public/contact` — public
- `GET /api/admin/stats` — protected, only users with `_collection: "users"` or `_collection: "admins"`

The `collectionAccess` property on custom routes works the same way as on collection routes: it checks the `_collection` claim in the JWT against the `collections` map and falls back to `accessDefault`.

---

## Advanced Examples

### Selective CRUD Routes

Generate only specific routes for a collection:

```javascript
collections: {
  logs: {
    routerOptions: {
      routes: ["getAll", "getOneById"], // read-only, no write routes
    },
  },
  settings: {
    routerOptions: {
      routes: ["getOneById", "updateOneById"], // single config get/update
    },
  },
}
```

**Result:**

- `/logs` — only `GET /` and `GET /:id`
- `/settings` — only `GET /:id` and `PUT /:id`

The full list of available route names is: `getAll`, `getOneById`, `search`, `addOne`, `addMany`, `updateOneById`, `updateMany`, `deleteById`, `deleteMany`. Auth route names (`login`, `register`, `refreshToken`, `getUserByToken`) must be added separately via `auth.routes`.

---

### Field Exclusion

Prevent sensitive fields from appearing in responses:

```javascript
collections: {
  users: {
    routerOptions: {
      fields: {
        password: 0,
        resetToken: 0,
        internalId: 0,
      },
    },
  },
}
```

**Result:** `password`, `resetToken`, and `internalId` are never returned, even if the client requests them. When a collection sets a field to `0`, client-side `?fields=` parameters cannot override it back to inclusion. Additionally, sensitive fields like `password`, `passwordHash`, `token`, and `salt` are always stripped from responses by the built-in `sanitizeDocument` function and blocked from the `?fields=` parameter by `sanitizeFieldsParam`, regardless of the `fields` configuration.

The `?fields=` query parameter supports these formats:
- Comma-separated includes: `?fields=name,email`
- Comma-separated excludes: `?fields=-password,-token`
- Mixed: `?fields=name,email,-password`
- JSON: `?fields={"name":1,"email":1}`

---

### Search Route

The `search` route (`POST /:collection/search`) accepts a JSON body for filtering, sorting, field selection, and pagination:

```javascript
// POST /products/search
{
  "query": { "category": "electronics", "inStock": true },
  "sort": { "price": -1 },
  "fields": { "name": 1, "price": 1 },
  "page": 2,
  "per_page": 20
}
```

Or without pagination:

```javascript
// POST /products/search
{
  "query": { "category": "electronics" },
  "no_pagination": true
}
```

The `query` object supports MongoDB operators for MongoDB adapters (e.g., `$or`, `$and`, `$gt`, `$in`). For MySQL, use `or`/`and` keys which are normalized to Sequelize `Op.or`/`Op.and`. Dangerous operators like `$where` and `$function` are stripped by the query sanitizer.

**Result with pagination:**

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 53,
    "total_pages": 3,
    "current_page": 2,
    "per_page": 20,
    "has_next_page": true,
    "has_prev_page": true,
    "next_page": 3,
    "prev_page": 1
  }
}
```

**Result without pagination (`no_pagination: true`):**

```json
{
  "success": true,
  "data": [...],
  "total": 53
}
```

For `getAll`, pagination can also be disabled via the query string: `GET /products?no_pagination=true`. Accepted values for the query-string version are `true`, `True`, and `1`.

---

### Global Middleware

Apply a middleware to all routes across all collections:

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" },
  },
  globalRouterOptions: {
    middleware: [myCustomMiddleware],
  },
  collections: {
    products: {},
    orders: {},
  },
});
```

**Result:** All collection routes pass through `myCustomMiddleware` before reaching the handler. Collection-level `routerOptions.middleware` overrides (does not merge with) the global middleware.

Note: the server already applies built-in middleware to all routes globally: `helmet`, `express.json` (1mb limit), `express.urlencoded` (1mb limit), `cors` (disabled by default), `cookie-parser`, and the default rate limiter (100 requests/15 minutes). You do not need to add these yourself.

---

### Disabling a Collection

Skip a collection without removing it from the configuration:

```javascript
collections: {
  users: {
    routerOptions: {
      auth: {
        routes: ["login", "register", "refreshToken", "getUserByToken"],
        protectedRoutes: true,
      },
    },
  },
  audit_logs: {
    enabled: false,  // No routes generated for this collection
  },
  products: {},
}
```

**Result:** The `audit_logs` collection is skipped entirely — no model or routes are created. All other collections behave normally.

---

### Custom Model Name

Override the auto-generated model name (which singularizes and PascalCases the collection name):

```javascript
collections: {
  user_accounts: {
    modelName: "Account",  // Override default "UserAccount"
  },
}
```

**Result:** The model is registered as `Account` instead of `UserAccount`. This affects Mongoose model registration and console log output, but not the route prefix (which stays `/user_accounts` unless overridden with `prefix`).

---

### Registration with Additional Fields

Include extra fields in the registration schema beyond the identifier and password:

```javascript
const Joi = require("joi");

collections: {
  users: {
    routerOptions: {
      auth: {
        keys: { identifiantKey: "email", passwordKey: "password" },
        routes: ["login", "register", "refreshToken", "getUserByToken"],
        protectedRoutes: true,
        additionalFields: {
          firstName: Joi.string().min(1).max(50).required(),
          lastName: Joi.string().min(1).max(50).required(),
          role: Joi.string().valid("user", "admin").default("user"),
        },
      },
    },
  },
}
```

**Result:** The `/register` endpoint now requires `firstName` and `lastName` alongside `email` and `password`. The `role` field defaults to `"user"` if not provided. All `additionalFields` values must be Joi schema objects.

---

### Plain-Text Password Mode

Disable bcrypt hashing for databases that handle hashing externally:

```javascript
collections: {
  users: {
    routerOptions: {
      auth: {
        keys: { identifiantKey: "email", passwordKey: "password" },
        routes: ["login", "register", "refreshToken", "getUserByToken"],
        protectedRoutes: true,
        usePasswordHash: false,
      },
    },
  },
}
```

**Result:** Passwords are stored and compared as plain text. By default, `usePasswordHash` is `true`, meaning passwords are hashed with bcrypt (10 salt rounds) on registration and verified with `bcrypt.compare` on login. When `usePasswordHash` is `false`, the login handler uses `timingSafeEqual` to prevent timing attacks on plain-text comparisons.

---

## Deployment Examples

### Environment Variables

```env
# Server
PORT=3000

# MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/production_db

# MySQL
MYSQL_HOST=db.example.com
MYSQL_PORT=3306
MYSQL_DATABASE=production_db
MYSQL_USER=admin
MYSQL_PASSWORD=super_secure_password

# JWT (required when using auth)
JWT_SECRET=a_very_long_random_string_at_least_32_chars
```

The default MongoDB URI is `mongodb://0.0.0.0:27017/auto-server` and the default MySQL database is `auto_server` when environment variables are not set.

---

### Docker Compose with MongoDB

```yaml
version: "3.8"

services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - MONGODB_URI=mongodb://mongo:27017/my_app
      - JWT_SECRET=your_production_secret
    depends_on:
      - mongo

  mongo:
    image: mongo:6
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db

volumes:
  mongo_data:
```

**Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Configure GitHub Packages registry
RUN echo "@el-zazo:registry=https://npm.pkg.github.com" > .npmrc && \
    echo "//npm.pkg.github.com/:_authToken=\${GITHUB_NPM_TOKEN}" >> .npmrc

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "index.js"]
```

**A complete `index.js` for production:**

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI,
    },
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
        fields: { password: 0 },
        auth: {
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
        },
      },
    },
    posts: {},
    comments: {},
  },
});

db.start();
```

The built-in health check at `GET /health` returns `{ status, uptime, database }` and responds with 503 when the database is unreachable — useful for container orchestration probes.

---

[Back to README](../README.md)
