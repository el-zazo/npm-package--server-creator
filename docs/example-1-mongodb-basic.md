# Example 1: MongoDB Basic Setup

This example demonstrates a basic MongoDB server with users and products collections.

## Step 1: Database Schema

```javascript
// schemas/mongodb.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// User Schema
const userSchema = new Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  roles: [{ 
    type: String,
    enum: ['user', 'admin', 'manager', 'guest'],
    default: ['user']
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  },
  profile: {
    avatar: String,
    bio: String,
    phone: String
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  versionKey: false 
});

// Add indexes
userSchema.index({ email: 1 });
userSchema.index({ roles: 1 });
userSchema.index({ createdAt: -1 });

// Product Schema
const productSchema = new Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String 
  },
  price: { 
    type: Number, 
    required: true,
    min: 0
  },
  category: { 
    type: String,
    enum: ['electronics', 'clothing', 'food', 'books', 'other'],
    default: 'other'
  },
  inStock: { 
    type: Boolean, 
    default: true 
  },
  quantity: {
    type: Number,
    default: 0,
    min: 0
  },
  tags: [{ 
    type: String 
  }],
  images: [{
    url: String,
    alt: String
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  timestamps: true,
  versionKey: false 
});

// Add indexes
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ price: 1 });

module.exports = {
  userSchema,
  productSchema
};
```

## Step 2: Server Creation

```javascript
// server-basic.js
const { DB } = require("@el-zazo/server-creator");
const { userSchema, productSchema } = require("./schemas/mongodb");

// Create the database server
const db = new DB({
  // Database type
  dbType: "mongodb",
  
  // MongoDB configuration
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI || "mongodb://localhost:27017/shopDB",
      connectionOptions: {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000
      },
      cache: {
        enabled: true,
        ttl: 300000,    // 5 minutes
        maxSize: 100
      }
    }
  },

  // Collections configuration
  collections: {
    // User collection with full CRUD and authentication
    users: {
      schema: userSchema,
      prefix: "/api/users",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "addMany",
          "updateOneById", "updateMany",
          "deleteById", "deleteMany",
          "login", "register", "refreshToken", "getUserByToken"
        ],
        auth: {
          keys: {
            identifiantKey: "email",
            passwordKey: "password"
          },
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: ["getAll", "getOneById", "addOne", "updateOneById", "deleteById"],
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "my-secret-key-123",
            tokenFrom: "header"
          }
        }
      }
    },

    // Product collection - public read, authenticated write
    products: {
      schema: productSchema,
      prefix: "/api/products",
      fields: {
        __v: 0
      },
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: ["addOne", "updateOneById", "deleteById"],
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "my-secret-key-123",
            tokenFrom: "header"
          }
        }
      }
    }
  },

  // Custom routes
  otherRoutes: [
    {
      method: "GET",
      path: "/health",
      handler: (req, res) => {
        res.json({ 
          status: "ok", 
          timestamp: new Date().toISOString(),
          uptime: process.uptime()
        });
      }
    }
  ],

  // Server configuration
  serverOptions: {
    port: process.env.PORT || 3000,
    corsOptions: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true
    }
  }
});

// Start the server
db.start()
  .then(() => console.log("Server started successfully"))
  .catch(err => console.error("Failed to start server:", err));
```

## What Was Created

### API Endpoints

**Users Collection** (`/api/users`):

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | /api/users | Get all users | Yes |
| GET | /api/users/:id | Get user by ID | Yes |
| POST | /api/users/search | Search users | Yes |
| POST | /api/users | Create user | Yes |
| POST | /api/users/many | Create multiple users | Yes |
| PUT | /api/users/:id | Update user | Yes |
| PUT | /api/users/many | Update multiple users | Yes |
| DELETE | /api/users/:id | Delete user | Yes |
| DELETE | /api/users/many | Delete multiple users | Yes |
| POST | /api/users/login | User login | No |
| POST | /api/users/register | User registration | No |
| POST | /api/users/refresh-token | Refresh JWT token | No |
| GET | /api/users/me | Get current user | Yes |

**Products Collection** (`/api/products`):

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | /api/products | Get all products | No |
| GET | /api/products/:id | Get product by ID | No |
| POST | /api/products/search | Search products | No |
| POST | /api/products | Create product | Yes |
| PUT | /api/products/:id | Update product | Yes |
| DELETE | /api/products/:id | Delete product | Yes |

**Custom Endpoints**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |

### Features Enabled

1. **MongoDB Connection** - Connects to `shopDB` database with connection pooling
2. **Caching** - 5-minute cache for read operations
3. **Authentication** - JWT-based auth for users collection
4. **Rate Limiting** - 100 requests/15min general, 5 requests/1min for auth
5. **CORS** - Enabled for all origins
6. **Field Selection** - Products exclude `__v` field by default

### Usage Examples

```bash
# Register a new user
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "password": "password123"}'

# Login
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "password123"}'

# Get all products (no auth needed)
curl http://localhost:3000/api/products

# Create product (auth required)
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "Laptop", "price": 999, "category": "electronics"}'
```
