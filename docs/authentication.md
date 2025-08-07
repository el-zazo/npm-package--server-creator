# Authentication in Auto-Server

Auto-Server provides a flexible authentication system based on JSON Web Tokens (JWT). This document explains how to configure and use authentication features.

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
  - [Global Authentication](#global-authentication)
  - [Collection-Specific Authentication](#collection-specific-authentication)
- [Authentication Routes](#authentication-routes)
  - [Login](#login)
  - [Register](#register)
  - [Refresh Token](#refresh-token)
  - [Get User by Token](#get-user-by-token)
- [Protected Routes](#protected-routes)
  - [Custom Route Authentication](#custom-route-authentication)
- [Collection-Based Access Control](#collection-based-access-control)
- [Token Handling](#token-handling)
  - [Token Extraction](#token-extraction)
  - [Token Verification](#token-verification)
- [Examples](#examples)

## Overview

Auto-Server's authentication system provides:

- User registration and login endpoints
- JWT token generation and verification
- Token refresh functionality
- Route protection based on authentication
- Collection-based access control
- Customizable token extraction from various sources (headers, cookies, etc.)

## Configuration

### Global Authentication

You can configure authentication globally for all collections:

```javascript
const db = new DB({
  // Other options...
  routerOptions: {
    auth: {
      // Authentication keys configuration
      keys: {
        identifiantKey: 'email', // Field used as identifier (default: 'email')
        passwordKey: 'password', // Field used for password (default: 'password')
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
});
```

### Collection-Specific Authentication

You can also configure authentication for specific collections, which will override global settings:

```javascript
const db = new DB({
  // Other options...
  collections: {
    users: {
      // Other collection options...
      routerOptions: {
        auth: {
          // Collection-specific auth configuration
          keys: {
            identifiantKey: 'username', // Override global identifier key
            passwordKey: 'password',
          },
          routes: ['login', 'register'], // Only enable these auth routes
          protectedRoutes: ['updateOneById', 'deleteById'], // Only protect these routes
        },
      },
    },
  },
});
```

## Authentication Routes

### Login

**Endpoint:** `POST /{prefix}/login`

**Request Body:**

```json
{
  "email": "user@example.com", // or whatever is configured as identifiantKey
  "password": "password123"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "123",
      "email": "user@example.com",
      // Other user fields (password is excluded)
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Register

**Endpoint:** `POST /{prefix}/register`

**Request Body:**

```json
{
  "email": "newuser@example.com", // or whatever is configured as identifiantKey
  "password": "password123",
  // Other user fields
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "456",
      "email": "newuser@example.com",
      // Other user fields (password is excluded)
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Refresh Token

**Endpoint:** `POST /{prefix}/refresh-token`

**Request Body:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "123",
      "email": "user@example.com",
      // Other user fields (password is excluded)
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Get User by Token

**Endpoint:** `GET /{prefix}/me`

**Headers:**

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**

```json
{
  "success": true,
  "data": {
    "_id": "123",
    "email": "user@example.com",
    // Other user fields (password is excluded)
  }
}
```

## Protected Routes

You can protect routes by setting the `protectedRoutes` option:

```javascript
// Protect all routes
protectedRoutes: true

// Protect specific routes
protectedRoutes: ['addOne', 'updateOneById', 'deleteById']

// Don't protect any routes
protectedRoutes: false
```

Protected routes require a valid JWT token in the request.

### Custom Route Authentication

For custom routes defined through the `otherRoutes` option in the DB constructor, you can protect individual routes by setting the `isProtected` flag and configuring authentication options:

```javascript
otherRoutes: [
  {
    method: 'POST',
    path: '/webhook',
    handler: (req, res, next) => {
      // Handler logic
    },
    isProtected: true, // Require authentication for this route
    prefix: "/api/v1", // Custom prefix for this route
    authMiddlewareOptions: {
      secret: process.env.JWT_SECRET,
      tokenFrom: 'header',
      headerName: 'X-Webhook-Auth',
      passthrough: false
    },
    collectionAccess: {
      accessDefault: false,
      collections: {
        "admins": true,
      }
    }
  }
]
```

The `authMiddlewareOptions` parameter allows you to override the global authentication settings for this specific route:

## Collection-Based Access Control

Collection-based access control allows you to restrict access to specific routes based on the user's collection:

```javascript
collectionAccess: {
  accessDefault: false, // Default access for collections not specified
  collections: {
    // Users from the 'admins' collection have access to all routes
    admins: true, // or '*' or 'all'
    
    // Users from the 'users' collection have access to specific routes
    users: ['getAll', 'getOneById', 'search'],
    
    // Users from the 'guests' collection have no access
    guests: false, // or 'none'
  },
},
```

The user's collection is determined by the `_collection` field in the JWT token payload, which is set when the token is generated during login or registration.

## Token Handling

### Token Extraction

Auto-Server can extract tokens from various sources:

```javascript
authMiddlewareOptions: {
  tokenFrom: 'header', // Default: extract from header
  headerName: 'Authorization', // Default header name
  
  // Other options:
  tokenFrom: 'query', // Extract from query parameter
  queryParam: 'token', // Query parameter name
  
  tokenFrom: 'cookie', // Extract from cookie
  cookieName: 'token', // Cookie name
  
  tokenFrom: 'body', // Extract from request body
  bodyField: 'token', // Body field name
}
```

### Token Verification

Tokens are verified using the JWT secret key specified in the `authMiddlewareOptions.secret` option. If the token is invalid or expired, the request will be rejected with an appropriate error message.

## Examples

### Basic Authentication Setup

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  collections: {
    users: {
      // Collection configuration...
      routerOptions: {
        auth: {
          routes: ['login', 'register', 'refreshToken'],
          protectedRoutes: true,
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || 'your-secret-key',
          },
        },
      },
    },
  },
});

db.start();
```

### Custom Authentication Fields

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  collections: {
    users: {
      // Collection configuration...
      routerOptions: {
        auth: {
          keys: {
            identifiantKey: 'username', // Use username instead of email
            passwordKey: 'pass', // Use pass instead of password
          },
          routes: ['login', 'register'],
          protectedRoutes: true,
        },
      },
    },
  },
});

db.start();
```

### Additional Registration Fields

You can specify additional fields for the registration schema using the `additionalFields` property in the auth configuration. This allows you to validate custom fields during user registration.

```javascript
const Joi = require('joi');
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  collections: {
    users: {
      // Collection configuration...
      routerOptions: {
        auth: {
          keys: {
            identifiantKey: 'email',
            passwordKey: 'password',
          },
          // Define additional fields for registration
          additionalFields: {
            firstname: Joi.string().required(),
            lastname: Joi.string().required(),
            age: Joi.number().integer().min(18).required(),
            phone: Joi.string().pattern(/^\d{10}$/)
          },
          routes: ['login', 'register'],
          protectedRoutes: true,
        },
      },
    },
  },
});

db.start();
```

With this configuration, the registration endpoint will validate the additional fields according to the specified Joi schemas. These fields will be stored in the user document along with the identifiant and password.

### Role-Based Access Control

```javascript
const { DB } = require('@elzazo/auto-server');

const db = new DB({
  // Database configuration...
  collections: {
    users: {
      // Collection configuration...
      routerOptions: {
        auth: {
          routes: ['login', 'register'],
          protectedRoutes: true,
        },
      },
    },
    products: {
      // Collection configuration...
      routerOptions: {
        auth: {
          protectedRoutes: true,
          collectionAccess: {
            accessDefault: false,
            collections: {
              admins: true, // Admins can access all product routes
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