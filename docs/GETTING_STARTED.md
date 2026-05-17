# 🚀 Getting Started

Everything you need to set up and run your auto-generated REST API in minutes. This guide covers version **1.0.0** of `@el-zazo/server-creator`.

## 📋 Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Node.js** >= 14.x
- **MongoDB** >= 4.x (if using MongoDB)
- **MySQL** >= 5.7 (if using MySQL)
- A **GitHub Personal Access Token** (with `read:packages` scope) to install the package

## 📥 Installation

1. Create or update a `.npmrc` file in your project root to authenticate with GitHub Packages:

```text
@el-zazo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_NPM_TOKEN}
```

2. Set your `GITHUB_NPM_TOKEN` in your environment variables (or replace `${GITHUB_NPM_TOKEN}` directly in the `.npmrc` file).

3. Install the package:

```bash
npm install @el-zazo/server-creator
```

## 🏁 Startup with MongoDB

Here is how to start an API server connected to a MongoDB database. Starting from v3, you must **explicitly list the collections** you want to expose — only the collections you declare will have routes generated for them.

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
    users: {},
    posts: {},
    comments: {},
  },
  serverOptions: {
    port: 3000,
  },
});

db.start(() => {
  console.log("MongoDB API is up and running!");
});
```

**Explanations:**

- `dbType: "mongodb"` tells the package to use the MongoDB adapter.
- `adapterConfig.mongodb.uri` is the connection string to your MongoDB instance. Defaults to `mongodb://0.0.0.0:27017/auto-server` if not provided.
- `collections` is an **allowlist** — only the collections named here will get routes. Each key is a collection name; the value is an options object (can be empty `{}`). Collections not listed will not be exposed.
- `serverOptions.port` sets the Express server port (defaults to `3000`).

## 🏁 Startup with MySQL

Here is how to start an API server connected to a MySQL database:

```javascript
require("dotenv").config();
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: process.env.MYSQL_HOST || "localhost",
      port: 3306,
      database: "auto_server",
      username: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
    },
  },
  collections: {
    users: {},
    products: {},
    orders: {},
  },
  serverOptions: {
    port: 3000,
  },
});

db.start(() => {
  console.log("MySQL API is up and running!");
});
```

**Explanations:**

- `dbType: "mysql"` switches the internal adapter to MySQL (using Sequelize).
- `adapterConfig.mysql` requires your database credentials. Defaults are `host: "localhost"`, `port: 3306`, `database: "auto_server"`, `username: "root"`, `password: ""`. The adapter will automatically read the table structure using Sequelize's `describeTable()` to generate models.
- If no custom schema is provided per collection, it auto-maps MySQL data types to Sequelize types.
- As with MongoDB, `collections` is required and acts as an allowlist of tables to expose.

## ⚙️ What Happens Automatically at Startup

When you call `db.start()`, the package performs the following actions behind the scenes:

1. **Database Connection:** Connects to your MongoDB or MySQL database using the configured adapter.
2. **Collection/Model Generation:** For each collection listed in `options.collections` (that is not explicitly `enabled: false`), the adapter creates an internal model:
   - _MongoDB:_ If a custom `schema` is provided, it is used; otherwise a flexible schema with `strict: false` is created.
   - _MySQL:_ If a custom `schema` is provided, it is used; otherwise the table structure is auto-discovered via `describeTable()` and MySQL types are mapped to Sequelize types.
3. **Route Generation:** For each model, generates a full set of CRUD routes (`GET`, `POST`, `PUT`, `DELETE`) and optionally Auth routes (`login`, `register`, `refreshToken`, `getUserByToken`) based on configuration.
4. **Custom Routes:** If `otherRoutes` is configured, those user-defined routes are mounted with optional authentication and collection access control.
5. **Server Launch:** Mounts all generated routers and custom routers to the Express app, applies the global error handler, and starts listening on the specified port. Graceful shutdown handlers for `SIGTERM` and `SIGINT` are registered automatically.

## 🏥 Health Check Endpoint

A `/health` endpoint is automatically registered on the server **before** any other routes. This ensures it is always accessible regardless of authentication or route configuration. The endpoint returns the server status, uptime, and database connectivity:

```json
{
  "status": "ok",
  "timestamp": "2026-05-17T10:30:00.000Z",
  "uptime": 123.456,
  "database": "connected"
}
```

If the database is unreachable, `status` becomes `"degraded"` and the response uses HTTP `503 Service Unavailable`.

## 🛡️ Built-in Middleware

The server automatically applies the following middleware on startup — no configuration needed:

| Middleware           | Purpose                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------- |
| `helmet()`           | Sets security-related HTTP headers to protect against common web vulnerabilities.         |
| `express.json()`     | Parses JSON request bodies (size limit: 1mb).                                             |
| `express.urlencoded` | Parses URL-encoded request bodies (size limit: 1mb, extended mode).                       |
| `cors()`             | Enables Cross-Origin Resource Sharing. CORS is **disabled by default** (`origin: false`). |
| `cookie-parser()`    | Parses cookies from the request (needed when `tokenFrom: "cookie"` is used).              |
| Rate limiter         | Default rate limiter: 100 requests per 15 minutes per IP.                                 |
| Trust proxy          | `trust proxy` set to `1` for correct IP detection behind load balancers.                  |

> **Note on CORS:** By default CORS rejects all cross-origin requests. To enable it, pass `corsOptions` in `serverOptions`:
>
> ```javascript
> serverOptions: {
>   port: 3000,
>   corsOptions: {
>     origin: "https://yourdomain.com",
>     credentials: true,
>   },
> }
> ```

## 📦 Exported Modules

The package exports two classes that you can use directly:

```javascript
const { DB, Server } = require("@el-zazo/server-creator");
```

- **`DB`** — The main entry point. Handles database connection, collection/model preparation, route generation, and server startup all in one `db.start()` call.
- **`Server`** — A standalone Express server class. Useful if you want to manually construct and control the server, add routers individually, or integrate with an existing Express application.

## 🔐 Environment Variables (`.env` example)

It is highly recommended to use environment variables for sensitive data. Create a `.env` file in your project root:

```env
# GitHub Package Token (for installation)
GITHUB_NPM_TOKEN=ghp_your_github_token_here

# Server
PORT=3000

# MongoDB
MONGODB_URI=mongodb://0.0.0.0:27017/auto-server

# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=auto_server
MYSQL_USER=root
MYSQL_PASSWORD=secret

# JWT Authentication
JWT_SECRET=your_super_secret_jwt_key
```

> ⚠️ **Important:** The `JWT_SECRET` environment variable is read by the package via `process.env.JWT_SECRET`. If you configure auth routes or protected routes, you **must** provide a secret either through `globalRouterOptions.auth.authMiddlewareOptions.secret` or via the `JWT_SECRET` environment variable. Unlike earlier versions, there is **no hardcoded fallback secret** — the middleware will throw an error at startup if a secret is required but not provided. **Always set this in production!**

## 🐛 Common Startup Errors and Solutions

| Error Message                    | Cause                                              | Solution                                                                           |
| -------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `Failed to connect to MongoDB`   | MongoDB is not running or URI is wrong.            | Ensure MongoDB is running and `uri` is correct. Check IP/port.                     |
| `Failed to connect to MySQL`     | Credentials are wrong or DB doesn't exist.         | Verify MySQL is running, credentials are correct, and the database is created.     |
| `JWT secret is required`         | Auth routes are enabled but no secret is provided. | Set `JWT_SECRET` in your `.env` or pass it in `globalRouterOptions.auth.authMiddlewareOptions.secret`. |
| `401 Unauthorized (npm install)` | GitHub Package token is missing or invalid.        | Ensure `GITHUB_NPM_TOKEN` is set in `.npmrc` and has `read:packages` scope.        |
| `Unsupported database type`      | `dbType` is not recognized.                        | Ensure `dbType` is either `"mongodb"` or `"mysql"`.                                |
| `options.collections cannot be empty` | No collections specified in the config.       | Add at least one collection to `options.collections`. This is an allowlist — collections not listed will not be exposed. |
| `JWT secret is required for collection "X"` | Protected routes configured without a secret. | Provide `secret` in `globalRouterOptions.auth.authMiddlewareOptions.secret`.        |

---

← [Back to README](../README.md)
