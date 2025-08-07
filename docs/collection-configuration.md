# Collection Configuration in Auto-Server

This document explains how to configure collections (MongoDB) or tables (MySQL) in Auto-Server.

## Table of Contents

- [Overview](#overview)
- [Basic Configuration](#basic-configuration)
- [Schema Definition](#schema-definition)
  - [MongoDB Schemas](#mongodb-schemas)
  - [MySQL Schemas](#mysql-schemas)
- [Fields Configuration](#fields-configuration)
- [Router Options](#router-options)
- [Custom Prefixes](#custom-prefixes)
- [Disabling Collections](#disabling-collections)
- [Collection-Specific Authentication](#collection-specific-authentication)
- [Examples](#examples)

## Overview

Auto-Server allows you to configure collections through the `collections` option in the DB constructor. Each collection can have its own schema, router options, and custom prefix.

## Basic Configuration

Here's a basic collection configuration:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      schema: UserSchema, // Mongoose schema or Sequelize model definition
      prefix: '/api/users', // Custom API prefix
      fields: { username: 1, email: 1 }, // Fields to include in all responses
      routerOptions: {
        // Router-specific options
      },
    },
    products: {
      schema: ProductSchema,
      prefix: '/api/products',
      fields: { name: 1, price: 1, description: 1 }, // Fields to include in all responses
      // Other options...
    },
  },
});
```

## Schema Definition

### MongoDB Schemas

For MongoDB, you can define schemas using Mongoose:

```javascript
const { Schema } = require('mongoose');

const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const db = new DB({
  // Other options...
  collections: {
    users: {
      schema: UserSchema,
      // Other options...
    },
  },
});
```

### MySQL Schemas

For MySQL, you can define schemas using Sequelize data types:

```javascript
const { DataTypes } = require('sequelize');

const db = new DB({
  dbType: 'mysql',
  // Other options...
  collections: {
    users: {
      schema: {
        username: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        password: { type: DataTypes.STRING, allowNull: false },
        isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
        createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      // Optional: specify a custom model name
      modelName: 'User',
      // Other options...
    },
  },
});
```

## Fields Configuration

You can configure which fields are included or excluded in API responses for each collection using the `fields` option. This provides a global field selection that applies to all routes for the collection.

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other options...
      fields: { 
        username: 1,  // Include username field
        email: 1,     // Include email field
        password: 0,  // Exclude password field
        // Other fields will be included by default
      },
    },
  },
});
```

The `fields` configuration uses the same format as MongoDB's projection:
- `{ fieldName: 1 }` - Include this field in the response
- `{ fieldName: 0 }` - Exclude this field from the response

When a client makes a request with their own field selection (using the `fields` query parameter), their selection will be merged with the global configuration, with the client's selection taking precedence.

For example, if the global configuration is `{ username: 1, email: 1, password: 0 }` and the client requests `fields=username,bio`, the final field selection will be `{ username: 1, bio: 1, password: 0 }`.

## Router Options

You can configure router options for each collection:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other options...
      routerOptions: {
        // Routes to enable (default: all routes)
        routes: ['getAll', 'getOneById', 'search', 'addOne', 'updateOneById', 'deleteById'],
        
        // Middleware to apply to all routes
        middleware: [
          (req, res, next) => {
            console.log(`Request to users collection: ${req.method} ${req.path}`);
            next();
          },
        ],
        
        // Authentication options
        auth: {
          // Auth configuration...
        },
      },
    },
  },
});
```

## Custom Prefixes

By default, the API prefix for a collection is the collection name (e.g., `/users`). You can customize this with the `prefix` option:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      prefix: '/v1/users', // Custom prefix
      // Other options...
    },
  },
});
```

## Disabling Collections

You can disable a collection by setting the `enabled` option to `false`:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other options...
    },
    logs: {
      enabled: false, // This collection will be ignored
      // Other options...
    },
  },
});
```

## Collection-Specific Authentication

You can configure authentication options for each collection:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other options...
      routerOptions: {
        auth: {
          // Enable specific auth routes
          routes: ['login', 'register', 'refreshToken'],
          
          // Configure auth keys
          keys: {
            identifiantKey: 'username', // Field used as identifier
            passwordKey: 'password', // Field used for password
          },
          
          // Protect specific routes
          protectedRoutes: ['updateOneById', 'deleteById'],
          
          // Collection-based access control
          collectionAccess: {
            // Configuration...
          },
        },
      },
    },
  },
});
```

## Examples

### Complete Collection Configuration Example

Here's a complete example showing various collection configuration options including fields configuration:

```javascript
const { Schema } = require('mongoose');
const { DataTypes } = require('sequelize');

// Define MongoDB schemas
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const ProductSchema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  category: { type: String },
  inStock: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const db = new DB({
  // Database configuration
  dbType: 'mongodb',
  adapterConfig: {
    mongodb: {
      uri: 'mongodb://localhost:27017/my-app',
    },
  },
  
  // Global router options
  routerOptions: {
    auth: {
      // Auth configuration
      keys: {
        identifiantKey: 'email',
        passwordKey: 'password',
      },
      protectedRoutes: ['addOne', 'updateOneById', 'deleteById'],
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || 'your-secret-key',
      },
    },
  },
  
  // Collection configurations
  collections: {
    users: {
      schema: UserSchema,
      prefix: '/api/users',
      // Fields configuration - control which fields are returned in responses
      fields: { 
        username: 1,
        email: 1,
        isAdmin: 1,
        createdAt: 1,
        password: 0, // Explicitly exclude password from all responses
      },
      routerOptions: {
        // Collection-specific router options
        routes: ['getAll', 'getOneById', 'addOne', 'updateOneById', 'deleteById', 'login', 'register'],
      },
    },
    products: {
      schema: ProductSchema,
      prefix: '/api/products',
      // Fields configuration
      fields: {
        name: 1,
        price: 1,
        description: 1,
        category: 1,
        inStock: 1,
      },
      routerOptions: {
        // No auth required for product routes
        auth: {
          protectedRoutes: false,
        },
      },
    },
  },
});

// Connect to database and start server
db.connect()
  .then(() => db.initializeServer())
  .then(() => console.log('Server started'))
  .catch(err => console.error('Error starting server:', err));
```

### MongoDB Collection Configuration

```javascript
const { Schema } = require('mongoose');
const { DB } = require('@elzazo/auto-server');

// Define schemas
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const ProductSchema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Create DB instance
const db = new DB({
  adapterConfig: {
    mongodb: {
      uri: 'mongodb://localhost:27017/my-store',
    },
  },
  collections: {
    users: {
      schema: UserSchema,
      prefix: '/api/users',
      routerOptions: {
        routes: ['getAll', 'getOneById', 'search', 'addOne', 'updateOneById', 'deleteById', 'login', 'register'],
        middleware: [
          (req, res, next) => {
            console.log(`Request to users: ${req.method} ${req.path}`);
            next();
          },
        ],
        auth: {
          routes: ['login', 'register'],
          protectedRoutes: ['updateOneById', 'deleteById'],
        },
      },
    },
    products: {
      schema: ProductSchema,
      prefix: '/api/products',
      routerOptions: {
        routes: ['getAll', 'getOneById', 'search', 'addOne', 'updateOneById', 'deleteById'],
        auth: {
          protectedRoutes: ['addOne', 'updateOneById', 'deleteById'],
        },
      },
    },
  },
});

db.start();
```

### MySQL Collection Configuration

```javascript
const { DataTypes } = require('sequelize');
const { DB } = require('@elzazo/auto-server');

// Create DB instance
const db = new DB({
  dbType: 'mysql',
  adapterConfig: {
    mysql: {
      host: 'localhost',
      port: 3306,
      database: 'my_store',
      username: 'root',
      password: 'password',
    },
  },
  collections: {
    users: {
      schema: {
        username: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        password: { type: DataTypes.STRING, allowNull: false },
        isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
        createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      modelName: 'User', // Optional: custom model name
      prefix: '/api/users',
      routerOptions: {
        auth: {
          routes: ['login', 'register'],
          protectedRoutes: true,
        },
      },
    },
    products: {
      schema: {
        name: { type: DataTypes.STRING, allowNull: false },
        price: { type: DataTypes.FLOAT, allowNull: false },
        description: { type: DataTypes.TEXT },
        createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      modelName: 'Product', // Optional: custom model name
      prefix: '/api/products',
      routerOptions: {
        auth: {
          protectedRoutes: ['addOne', 'updateOneById', 'deleteById'],
        },
      },
    },
  },
});

db.start();
```