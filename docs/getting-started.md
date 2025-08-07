# Getting Started with Auto-Server

Auto-Server is a powerful Node.js library that automatically generates RESTful APIs for your database collections. It supports both MongoDB and MySQL databases and provides a wide range of features including authentication, rate limiting, and customizable routes.

## Installation

```bash
npm install @elzazo/auto-server
```

## Basic Usage

Here's a simple example to get you started with Auto-Server:

```javascript
const { DB } = require("@elzazo/auto-server");

// Create a new DB instance
const db = new DB({
  // Database configuration
  adapterConfig: {
    mongodb: {
      uri: "mongodb://localhost:27017/my-database",
    },
  },
});

// Start the server
db.start();
```

This will automatically:

1. Connect to your MongoDB database
2. Discover all collections
3. Create RESTful API endpoints for each collection
4. Start an Express server on port 3000

## MongoDB Example

Here's a more complete example using MongoDB with Mongoose schemas:

```javascript
const { Schema } = require("mongoose");
const { DB } = require("@elzazo/auto-server");

// Define your schemas
const UserSchema = new Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  isAdmin: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const ProductSchema = new Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// Create DB instance with configuration
const db = new DB({
  adapterConfig: {
    mongodb: {
      uri: "mongodb://localhost:27017/my-store",
      // Enable caching for better performance
      cache: {
        enabled: true,
        ttl: 60000, // 1 minute
        maxSize: 100,
      },
    },
  },
  // Configure collections
  collections: {
    users: {
      schema: UserSchema,
      prefix: "/api/users",
      routerOptions: {
        // Enable authentication
        auth: {
          routes: ["login", "register", "refreshToken"],
          protectedRoutes: true,
        },
      },
    },
    products: {
      schema: ProductSchema,
      prefix: "/api/products",
      routerOptions: {
        // Protect specific routes
        auth: {
          protectedRoutes: ["addOne", "updateOneById", "deleteById"],
        },
      },
    },
  },
  // Define custom routes
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
      prefix: "/api/v1", // Custom prefix for this route
      collectionAccess: {
        accessDefault: false,
        collections: {
          "users": true
        }
      }
    }
  ],
  // Global router options
  routerOptions: {
    auth: {
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "your-secret-key",
      },
    },
  },
  // Server configuration
  serverOptions: {
    port: process.env.PORT || 3000,
  },
});

// Start the server
db.start(() => {
  console.log("Server is running!");
});
```

## MySQL Example

Here's an example using MySQL with Sequelize:

```javascript
const { DataTypes } = require("sequelize");
const { DB } = require("@elzazo/auto-server");

// Create DB instance with MySQL configuration
const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: "localhost",
      port: 3306,
      database: "my_store",
      username: "root",
      password: "password",
    },
  },
  // Configure collections (tables)
  collections: {
    users: {
      schema: {
        username: { type: DataTypes.STRING, allowNull: false },
        password: { type: DataTypes.STRING, allowNull: false },
        email: { type: DataTypes.STRING, allowNull: false },
        isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
        createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
      },
      prefix: "/api/users",
      routerOptions: {
        auth: {
          routes: ["login", "register"],
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
      prefix: "/api/products",
    },
  },
  routerOptions: {
    auth: {
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "your-secret-key",
      },
    },
  },
});

// Start the server
db.start();
```

## Next Steps

Now that you have a basic understanding of Auto-Server, check out the following documentation for more details:

- [**API Documentation**](./api-documentation.md) - Complete API reference
- [**Authentication**](./authentication.md) - Learn about authentication options
- [**Rate Limiting**](./rate-limiting.md) - Protect your API from abuse
- [**Collection Configuration**](./collection-configuration.md) - Configure your collections
- [**Router Options**](./router-options.md) - Customize your API routes

## Environment Variables

Auto-Server supports the following environment variables:

- `JWT_SECRET` - Secret key for JWT token generation and verification
- `PORT` - Port for the server to listen on
