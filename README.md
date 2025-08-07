# Auto-Server Documentation

This document provides a comprehensive reference for all parameters, options, and configurations available in the Auto-Server project.

## Table of Contents

- [Project Structure](#project-structure)
- [Security Features](#security-features)
  - [Rate Limiting](#rate-limiting)
  - [Token Refresh](#token-refresh)
  - [Input Validation](#input-validation)
- [DB Class](#db-class)
  - [Constructor Options](#constructor-options)
  - [Collection Configuration](#collection-configuration)
  - [Router Options](#router-options)
  - [Authentication Configuration](#authentication-configuration)
  - [Collection-Specific Access Rules](#collection-specific-access-rules)
- [Server Class](#server-class)
  - [Constructor Options](#constructor-options-1)
  - [CORS Configuration](#cors-configuration)
  - [Methods](#methods)
- [Router Class](#router-class)
  - [Constructor Options](#constructor-options-2)
  - [Available Routes](#available-routes)
  - [Pagination](#pagination)
  - [Field Selection](#field-selection)
- [Performance Optimizations](#performance-optimizations)
- [Database Adapters](#database-adapters)
  - [MongoDB Adapter](#mongodb-adapter)
  - [MySQL Adapter](#mysql-adapter)
  - [Default MySQL Connection Options](#default-mysql-connection-options)
- [System Constants](#system-constants)

## Project Structure

Auto-Server follows a modular architecture designed for flexibility and extensibility. The project is organized into the following key directories and files:

```
src/
├── adapters/           # Database adapters for different database systems
│   ├── DatabaseAdapter.js  # Base adapter class
│   ├── MongoDBAdapter.js   # MongoDB implementation
│   └── MySQLAdapter.js     # MySQL implementation
├── middleware/         # Express middleware functions
│   ├── auth.js             # Authentication middleware
│   ├── rate-limit.js       # Rate limiting middleware
│   └── validation.js       # Input validation middleware
├── models/             # Database models
│   ├── MongoDBModel.js     # MongoDB model implementation
│   └── MySQLModel.js       # MySQL model implementation
├── routes/             # Route definitions
│   ├── auth.js             # Authentication routes
│   ├── crud.js             # CRUD operation routes
│   └── route-config.js     # Route configuration utilities
├── utils/              # Utility functions and constants
│   ├── cache.js            # Caching implementation
│   ├── constants.js        # System-wide constants
│   ├── errors.js           # Error handling utilities
│   ├── password.js         # Password hashing utilities
│   └── token.js            # JWT token utilities
├── DB.js               # Main database class
├── Router.js           # Router class for handling routes
└── Server.js           # Server class for Express app
```

The `constants.js` file in the `utils` directory defines all the default values and configuration constants used throughout the application. These constants ensure consistency across the system and provide a central place for configuration.

## Security Features

### Rate Limiting

Auto-Server includes rate limiting to protect your API from abuse. See [**rate-limiting.md**](./rate-limiting.md) for details.

### Token Refresh

Auto-Server supports token refresh functionality, allowing clients to obtain a new JWT token without requiring the user to re-authenticate with their credentials. This enhances security by allowing shorter token expiration times while maintaining a seamless user experience.

#### How to Use Token Refresh

To refresh a token, send a POST request to the `/{prefix}/refresh-token` endpoint with the following body:

```json
{
  "token": "your-existing-jwt-token"
}
```

If the token is valid, the server will respond with a new token and the user information:

```json
{
  "success": true,
  "data": {
    "user": {
      /* user data without password */
    },
    "token": "new-jwt-token"
  }
}
```

### Input Validation

The application uses Joi for comprehensive input validation across all routes. Validation is automatically applied to:

- Request bodies
- URL parameters
- Query strings

Validation errors are returned with detailed information about which fields failed validation and why.

Example validation error response:

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
    "timestamp": "2023-06-01T12:34:56.789Z"
  }
}
```

## DB Class

The main class for handling database connections and auto-generating models and routers.

### Constructor Options

| Parameter                                 | Type    | Description                            | Default                                         |
| ----------------------------------------- | ------- | -------------------------------------- | ----------------------------------------------- |
| `dbType`                                  | String  | Database type ('mongodb' or 'mysql')   | 'mongodb'                                       |
| `adapterConfig`                           | Object  | Configuration for the database adapter | `{}`                                            |
| `adapterConfig.mongodb`                   | Object  | MongoDB adapter configuration          | -                                               |
| `adapterConfig.mongodb.uri`               | String  | MongoDB connection URI                 | 'mongodb://0.0.0.0:27017/auto-server'           |
| `adapterConfig.mongodb.connectionOptions` | Object  | Mongoose connection options            | `{}`                                            |
| `adapterConfig.mongodb.cache`             | Object  | Cache configuration for MongoDB        | -                                               |
| `adapterConfig.mongodb.cache.enabled`     | Boolean | Whether caching is enabled             | `true`                                          |
| `adapterConfig.mongodb.cache.ttl`         | Number  | Time to live in milliseconds           | `300000` (5 minutes)                            |
| `adapterConfig.mongodb.cache.maxSize`     | Number  | Maximum number of items in cache       | `100`                                           |
| `adapterConfig.mysql`                     | Object  | MySQL adapter configuration            | -                                               |
| `adapterConfig.mysql.host`                | String  | MySQL host                             | 'localhost'                                     |
| `adapterConfig.mysql.port`                | Number  | MySQL port                             | 3306                                            |
| `adapterConfig.mysql.database`            | String  | MySQL database name                    | 'auto_server'                                   |
| `adapterConfig.mysql.username`            | String  | MySQL username                         | 'root'                                          |
| `adapterConfig.mysql.password`            | String  | MySQL password                         | ''                                              |
| `adapterConfig.mysql.cache`               | Object  | Cache configuration for MySQL          | -                                               |
| `adapterConfig.mysql.cache.enabled`       | Boolean | Whether caching is enabled             | `true`                                          |
| `adapterConfig.mysql.cache.ttl`           | Number  | Time to live in milliseconds           | `300000` (5 minutes)                            |
| `adapterConfig.mysql.cache.maxSize`       | Number  | Maximum number of items in cache       | `100`                                           |
| `adapterConfig.mysql.connectionOptions`   | Object  | Sequelize connection options           | See [**Default Constants**](#default-constants) |
| `collections`                             | Object  | Collection configuration options       | `{}`                                            |
| `routerOptions`                           | Object  | Global router options                  | `{}`                                            |
| `server`                                  | Object  | Server instance                        | New Server instance                             |
| `serverOptions`                           | Object  | Server options                         | `{}`                                            |
| `serverOptions.port`                      | Number  | Port for the server to listen on       | 3000                                            |
| `serverOptions.corsOptions`               | Object  | CORS configuration options             | Default options merged with custom options      |

> **Note:** Complex queries (where the stringified query length exceeds 100 characters) are not cached to prevent cache pollution and avoid excessive memory usage.
>
> **Cached Operations:**
>
> - MongoDB: `getOneById` (single document by ID), `getMany` (multiple documents, except complex queries), Collection retrieval
> - MySQL: `getOneById` (single document by ID), `getMany` (multiple documents, except complex queries), `getAll` (all documents), Model creation

### Collection Configuration

The `collections` parameter allows you to configure each collection/table individually:

| Parameter       | Type    | Description                                | Default                                                                                                                                |
| --------------- | ------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`       | Boolean | Whether to enable this collection          | `true`                                                                                                                                 |
| `prefix`        | String  | Custom route prefix for this collection    | Collection name                                                                                                                        |
| `schema`        | Object  | Schema definition for this collection      | Auto-generated <ul><li>MySQL: based on table structure</li><li>MongoDB: empty schema with `strict: false` allowing all fields</li><ul> |
| `modelName`     | String  | Custom model name                          | Formatted collection name                                                                                                              |
| `routerOptions` | Object  | Router options specific to this collection | `{}`                                                                                                                                   |

#### Schema Examples

##### MongoDB Schema Example

```javascript
const { Schema } = require("mongoose");

// Example schema for a 'users' collection in MongoDB
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, min: 18 },
  isActive: { type: Boolean, default: true },
  roles: [String],
  address: {
    street: String,
    city: String,
    zipCode: String,
  },
  createdAt: { type: Date, default: Date.now },
});
```

##### MySQL Schema Example

```javascript
const { DataTypes } = require("sequelize");

// Example schema for a 'products' table in MySQL
const productSchema = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  category: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  inStock: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
};
```

### Router Options

Router options allow you to customize the behavior of routes for each model. These options can be specified globally in the DB constructor or individually for each collection. When specified at both levels, collection-specific options will override global options. Router options control which routes are available, what middleware is applied, and how authentication is configured.

| Parameter    | Type   | Description                       | Default                                                                                                            |
| ------------ | ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `routes`     | Array  | Routes to initialize              | ['getAll', 'getOneById', 'search', 'addOne', 'addMany', 'updateOneById', 'updateMany', 'deleteById', 'deleteMany'] |
| `middleware` | Array  | Middleware to apply to all routes | `[]`                                                                                                               |
| `auth`       | Object | Authentication configuration      | -                                                                                                                  |

### Authentication Configuration

The `routerOptions.auth` parameter allows you to configure authentication:

| Parameter                           | Type          | Description                                                         | Default                                                                      |
| ----------------------------------- | ------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `keys`                              | Object        | Authentication keys configuration                                   | -                                                                            |
| `keys.identifiantKey`               | String        | Field name for user identifier                                      | 'email'                                                                      |
| `keys.passwordKey`                  | String        | Field name for password                                             | 'password'                                                                   |
| `additionalFields`                  | Object        | Additional fields to include in registration schema                 | `{}`                                                                         |
| `usePasswordHash`                   | Boolean       | Whether to hash passwords in auth routes                            | `true`                                                                       |
| `routes`                            | Array         | Custom auth routes to add                                           | Empty Array (e.g. `['login', 'register', 'refreshToken', 'getUserByToken']`) |
| `protectedRoutes`                   | Array/Boolean | Routes that require authentication (`true` for apply to all routes) | `false`                                                                      |
| `collectionAccess`                  | Object        | Collection-based access control                                     | -                                                                            |
| `collectionAccess.accessDefault`    | Boolean       | Default access for collections not specified                        | `true`                                                                       |
| `collectionAccess.collections`      | Object        | Collection-specific access rules                                    | `{}`                                                                         |
| `authMiddlewareOptions`             | Object        | Authentication middleware options                                   | -                                                                            |
| `authMiddlewareOptions.secret`      | String        | JWT secret key                                                      | -                                                                            |
| `authMiddlewareOptions.tokenFrom`   | String        | Where to get token from                                             | 'header'                                                                     |
| `authMiddlewareOptions.headerName`  | String        | Name of the header containing the token                             | 'Authorization'                                                              |
| `authMiddlewareOptions.queryParam`  | String        | Name of the query parameter containing the token                    | 'token'                                                                      |
| `authMiddlewareOptions.cookieName`  | String        | Name of the cookie containing the token                             | 'token'                                                                      |
| `authMiddlewareOptions.bodyField`   | String        | Name of the body field containing the token                         | 'token'                                                                      |
| `authMiddlewareOptions.passthrough` | Boolean       | If true, request will continue even without token                   | `false`                                                                      |

#### Collection-Specific Access Rules

The `collectionAccess.collections` object allows you to define access rules for specific collections:
**importent note:** `protectedRoutes` must be not `false` for set access rules and `Route-Specific` must be protected to handle access rule

| Configuration  | Type           | Description                         | Example                    |
| -------------- | -------------- | ----------------------------------- | -------------------------- |
| All Access     | String/Boolean | Grant access to all routes          | `"*"`, `"all"`, or `true`  |
| No Access      | String/Boolean | Deny access to all routes           | `"none"` or `false`        |
| Route-Specific | Array          | Specify which routes are accessible | `["getAll", "getOneById"]` |

**Example Configuration:**

```js
collectionAccess: {
  accessDefault: false,  // Deny access by default
  collections: {
    "users": true,        // All access to users collection
    "products": ["getAll", "getOneById"],  // Limited access to products
    "orders": "none"     // No access to orders
  }
}
```

## Server Class

Handles the Express application and server configuration.

### Constructor Options

| Parameter     | Type   | Description                | Default                                    |
| ------------- | ------ | -------------------------- | ------------------------------------------ |
| `port`        | Number | Port to listen on          | 3000                                       |
| `corsOptions` | Object | CORS configuration options | Default options merged with custom options |

### CORS Configuration

The `corsOptions` parameter allows you to customize CORS settings. Any options you provide will be merged with the default options:

```javascript
// Default CORS options
const defaultCorsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
};

// Example: Custom CORS options
const customCorsOptions = {
  origin: "https://yourdomain.com",
  methods: ["GET", "POST"],
  maxAge: 86400, // 1 day in seconds
};

// Result after merging
// {
//   origin: 'https://yourdomain.com',
//   methods: ['GET', 'POST'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials: true,
//   maxAge: 86400
// }
```

### Methods

| Method                                  | Description                |
| --------------------------------------- | -------------------------- |
| `addRouter(router, prefix, middleware)` | Add a router to the server |
| `start(callback)`                       | Start the server           |

## Router Class

Handles Express route configuration for a model.

### Constructor Options

| Parameter            | Type   | Description                                                                                          | Default    |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------- | ---------- |
| `model`              | Object | Model instance                                                                                       | Required   |
| `options`            | Object | Router options                                                                                       | `{}`       |
| `options.routes`     | Array  | Routes to initialize                                                                                 | All routes |
| `options.middleware` | Array  | Middleware to apply to all routes                                                                    | `[]`       |
| `options.auth`       | Object | Authentication configuration (see [**Authentication Configuration**](#authentication-configuration)) | `null`     |

### Available Routes

| Route Name       | HTTP Method | Path           | Description                      |
| ---------------- | ----------- | -------------- | -------------------------------- |
| `getUserByToken` | GET         | /me            | Get current user data from token |
| `getAll`         | GET         | /              | Get all documents                |
| `getOneById`     | GET         | /:id           | Get document by ID               |
| `search`         | POST        | /search        | Search documents                 |
| `addOne`         | POST        | /              | Add one document                 |
| `addMany`        | POST        | /many          | Add multiple documents           |
| `updateOneById`  | PUT         | /:id           | Update document by ID            |
| `updateMany`     | PUT         | /many          | Update multiple documents        |
| `deleteById`     | DELETE      | /:id           | Delete document by ID            |
| `deleteMany`     | DELETE      | /many          | Delete multiple documents        |
| `login`          | POST        | /login         | User login                       |
| `register`       | POST        | /register      | User registration                |
| `refresh-token`  | POST        | /refresh-token | Refresh token                    |

### Pagination

List endpoints (`getAll` and `search`) support standardized pagination with the following query parameters:

| Parameter  | Type   | Description                               | Default |
| ---------- | ------ | ----------------------------------------- | ------- |
| `page`     | Number | Page number (1-based)                     | 1       |
| `per_page` | Number | Number of items per page (max 100)        | 10      |
| `sort`     | String | Sorting criteria (field:direction format) | \_id:1  |

Paginated responses include metadata about the pagination state:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "total": 157,
    "total_pages": 16,
    "current_page": 3,
    "per_page": 10,
    "has_next_page": true,
    "has_prev_page": true,
    "next_page": 4,
    "prev_page": 2
  }
}
```

### Field Selection

You can specify which fields to include or exclude in the response using the `fields` parameter. This helps reduce payload size and improve performance by only returning the data you need.

#### Supported Formats

1. **URL-friendly string format**:

   - Include fields: `fields=name,email,age`
   - Exclude fields: `fields=-password,-createdAt,-updatedAt`
   - Mixed: `fields=name,email,-password`

2. **JSON format**:
   - Include fields: `fields={"name":1,"email":1,"age":1}`
   - Exclude fields: `fields={"password":0,"createdAt":0,"updatedAt":0}`
   - Mixed: Not supported, use either all includes (1) or all excludes (0)

#### Examples

```
# Only return name and email fields
GET /api/users?fields=name,email

# Return all fields except password
GET /api/users?fields=-password

# Only return specific fields in search results
POST /api/users/search
Content-Type: application/json

{
  "query": { "age": { "$gt": 18 } },
  "fields": { "name": 1, "email": 1 }
}
```

## Performance Optimizations

> **Note:** Auto-Server includes an optional caching mechanism for frequently accessed data. This can significantly improve performance for read-heavy applications. See the [**DB Class Constructor Options**](#constructor-options) for cache configuration details.

## Database Adapters

### MongoDB Adapter

| Parameter           | Type   | Description                 | Default                               |
| ------------------- | ------ | --------------------------- | ------------------------------------- |
| `uri`               | String | MongoDB connection URI      | 'mongodb://0.0.0.0:27017/auto-server' |
| `connectionOptions` | Object | Mongoose connection options | `{}`                                  |

### MySQL Adapter

| Parameter           | Type   | Description                  | Default       |
| ------------------- | ------ | ---------------------------- | ------------- |
| `host`              | String | MySQL host                   | 'localhost'   |
| `port`              | Number | MySQL port                   | 3306          |
| `database`          | String | MySQL database name          | 'auto_server' |
| `username`          | String | MySQL username               | 'root'        |
| `password`          | String | MySQL password               | ''            |
| `connectionOptions` | Object | Sequelize connection options | See below     |

#### Default MySQL Connection Options

| Parameter      | Type    | Description                             | Default |
| -------------- | ------- | --------------------------------------- | ------- |
| `dialect`      | String  | Database dialect                        | 'mysql' |
| `logging`      | Boolean | Enable SQL logging                      | `false` |
| `pool.max`     | Number  | Maximum connection pool size            | 5       |
| `pool.min`     | Number  | Minimum connection pool size            | 0       |
| `pool.acquire` | Number  | Maximum time to acquire connection (ms) | 30000   |
| `pool.idle`    | Number  | Maximum idle time (ms)                  | 10000   |

## System Constants

The Auto Server framework uses a comprehensive set of constants to maintain consistency and configurability throughout the application. These constants are defined in [**constants.js**](./src/utils/constants.js) and serve as the foundation for default behaviors, configuration options, and standardized values across the system. The constants are organized into logical categories (Server, Database, Authentication, etc.) and can be overridden during initialization to customize the framework's behavior for your specific needs.
