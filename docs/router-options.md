# Router Options in Auto-Server

This document explains how to configure router options in Auto-Server to customize API routes.

## Table of Contents

- [Overview](#overview)
- [Global Router Options](#global-router-options)
- [Collection-Specific Router Options](#collection-specific-router-options)
- [Available Routes](#available-routes)
- [Custom Routes](#custom-routes)
- [Custom Middleware](#custom-middleware)
- [Authentication Configuration](#authentication-configuration)
- [Examples](#examples)

## Overview

Auto-Server allows you to configure router options at both the global level (applied to all collections) and the collection-specific level. Router options control which routes are enabled, what middleware is applied, and how authentication is configured.

## Global Router Options

Global router options are applied to all collections unless overridden at the collection level:

```javascript
const db = new DB({
  // Other options...
  routerOptions: {
    // Routes to enable (default: all routes)
    routes: ['getAll', 'getOneById', 'search', 'addOne', 'updateOneById', 'deleteById'],
    
    // Middleware to apply to all routes
    middleware: [
      (req, res, next) => {
        console.log(`Global middleware: ${req.method} ${req.path}`);
        next();
      },
    ],
    
    // Authentication options
    auth: {
      // Auth configuration...
    },
  },
});
```

## Collection-Specific Router Options

Collection-specific router options override global options for a specific collection:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other collection options...
      routerOptions: {
        // Routes to enable for this collection
        routes: ['getAll', 'getOneById', 'search'],
        
        // Middleware to apply to this collection's routes
        middleware: [
          (req, res, next) => {
            console.log(`Users middleware: ${req.method} ${req.path}`);
            next();
          },
        ],
        
        // Authentication options for this collection
        auth: {
          // Auth configuration...
        },
      },
    },
  },
});
```

## Available Routes

Auto-Server provides the following routes that can be enabled or disabled:

### CRUD Routes

| Route Name | HTTP Method | Path | Description |
|------------|------------|------|-------------|
| `getAll` | GET | / | Get all documents with pagination |
| `getOneById` | GET | /:id | Get a single document by ID |
| `search` | POST | /search | Search documents with query |
| `addOne` | POST | / | Add a new document |
| `addMany` | POST | /many | Add multiple documents |
| `updateOneById` | PUT | /:id | Update a document by ID |
| `updateMany` | PUT | /many | Update multiple documents |
| `deleteById` | DELETE | /:id | Delete a document by ID |
| `deleteMany` | DELETE | /many | Delete multiple documents |

### Authentication Routes

| Route Name | HTTP Method | Path | Description |
|------------|------------|------|-------------|
| `login` | POST | /login | Authenticate user and get token |
| `register` | POST | /register | Register a new user |
| `refreshToken` | POST | /refresh-token | Refresh an existing token |
| `getUserByToken` | GET | /me | Get current user info from token |

## Custom Routes

In addition to the automatically generated routes for collections, you can define custom routes using the `otherRoutes` option in the DB constructor. These routes can have any HTTP method, path, and handler function, and can be protected with authentication and collection-based access control.

```javascript
const db = new DB({
  // Database configuration...
  otherRoutes: [
    {
      method: 'GET',
      path: '/health',
      handler: (req, res) => {
        res.json({ status: 'ok', timestamp: new Date() });
      }
    },
    {
      method: 'POST',
      path: '/webhook',
      handler: (req, res, next) => {
        // Process webhook data
        try {
          // Your webhook logic here
          res.json({ success: true });
        } catch (error) {
          next(error);
        }
      },
      isProtected: true,
      prefix: "/api/v1", // Custom prefix for this route (default: '')
      collectionAccess: {
        accessDefault: false,
        collections: {
          admins: true,
          users: false
        }
      },
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET,
        tokenFrom: 'header',
        headerName: 'X-Webhook-Auth',
        passthrough: false
      }
    }
  ]
});
```

### Custom Route Options

| Option | Type | Description | Default |
|--------|------|-------------|--------|
| `method` | String | HTTP method (GET, POST, PUT, DELETE, etc.) | Required |
| `path` | String | Route path | Required |
| `handler` | Function | Route handler function | Required |
| `middleware` | Array | Middleware to apply to this route | `[]` |
| `isProtected` | Boolean | Whether this route requires authentication | `false` |
| `prefix` | String | Route prefix | `''` (empty string) |
| `collectionAccess` | Object | Collection-based access control | - |
| `authMiddlewareOptions` | Object | Authentication middleware configuration | - |

## Custom Middleware

You can apply custom middleware to all routes in a collection:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other collection options...
      routerOptions: {
        middleware: [
          // Logging middleware
          (req, res, next) => {
            console.log(`Request to users: ${req.method} ${req.path}`);
            next();
          },
          // Request timing middleware
          (req, res, next) => {
            const start = Date.now();
            res.on('finish', () => {
              const duration = Date.now() - start;
              console.log(`Request completed in ${duration}ms`);
            });
            next();
          },
        ],
      },
    },
  },
});
```

## Authentication Configuration

You can configure authentication options for each collection:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other collection options...
      routerOptions: {
        auth: {
          // Authentication keys configuration
          keys: {
            identifiantKey: 'email', // Field used as identifier (default: 'email')
            passwordKey: 'password', // Field used for password (default: 'password')
          },
          
          // Additional fields for registration schema
          additionalFields: {
            firstname: Joi.string().required(),
            lastname: Joi.string().required(),
            // Add any other fields with Joi validation
          },
          
          // Auth routes to enable
          routes: ['login', 'register', 'refreshToken'],
          
          // Routes that require authentication
          protectedRoutes: true, // true = all routes, or specify an array of route names
          
          // JWT middleware options
          authMiddlewareOptions: {
            secret: 'your-secret-key', // JWT secret key
            tokenFrom: 'header', // Where to get token from: 'header', 'query', 'cookie', or 'body'
            headerName: 'Authorization', // Name of the header containing the token
            passthrough: false, // If true, request will continue even without token
          },
          
          // Collection-based access control
          collectionAccess: {
            accessDefault: true, // Default access for collections not specified
            collections: {
              // Collection-specific access rules
              users: ['getAll', 'getOneById'], // Specific routes allowed
              admins: true, // All routes allowed
              guests: false, // No routes allowed
            },
          },
        },
      },
    },
  },
});
```

## Examples

### Read-Only API

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  routerOptions: {
    // Only enable read operations
    routes: ['getAll', 'getOneById', 'search'],
  },
});

db.start();
```

### Custom Middleware for Logging

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  routerOptions: {
    middleware: [
      // Request logging middleware
      (req, res, next) => {
        console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
        next();
      },
    ],
  },
});

db.start();
```

### Different Routes for Different Collections

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  collections: {
    users: {
      // Users collection with authentication
      routerOptions: {
        routes: ['getAll', 'getOneById', 'search', 'login', 'register'],
        auth: {
          routes: ['login', 'register'],
          protectedRoutes: ['getAll', 'getOneById', 'search'],
        },
      },
    },
    products: {
      // Products collection with full CRUD
      routerOptions: {
        routes: ['getAll', 'getOneById', 'search', 'addOne', 'updateOneById', 'deleteById'],
        auth: {
          protectedRoutes: ['addOne', 'updateOneById', 'deleteById'],
        },
      },
    },
    logs: {
      // Logs collection with read-only access
      routerOptions: {
        routes: ['getAll', 'search'],
        auth: {
          protectedRoutes: true,
        },
      },
    },
  },
});

db.start();
```

### Role-Based Access Control

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  collections: {
    users: {
      // Users collection with authentication
      routerOptions: {
        auth: {
          routes: ['login', 'register'],
          protectedRoutes: true,
        },
      },
    },
    products: {
      // Products collection with role-based access
      routerOptions: {
        auth: {
          protectedRoutes: true,
          collectionAccess: {
            accessDefault: false,
            collections: {
              admins: true, // Admins can access all routes
              editors: ['getAll', 'getOneById', 'search', 'addOne', 'updateOneById'], // Editors can't delete
              users: ['getAll', 'getOneById', 'search'], // Users have read-only access
            },
          },
        },
      },
    },
  },
});

db.start();
```