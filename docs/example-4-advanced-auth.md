# Example 4: Advanced Authentication & Token Sources

This example demonstrates advanced authentication features including:
- Multiple token extraction methods (header, query, cookie, body)
- Token passthrough for optional auth
- Custom JWT configuration
- Mobile API optimization

## Step 1: Database Schema

```javascript
// schemas/mobile-api.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// User Schema with extended profile
const userSchema = new Schema({
  // Authentication fields
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true,
    trim: true
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  
  // Profile fields
  displayName: { 
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  avatar: { 
    type: String 
  },
  bio: { 
    type: String 
  },
  dateOfBirth: {
    type: Date
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other', 'prefer_not_to_say'],
    default: 'prefer_not_to_say'
  },
  
  // Account settings
  role: { 
    type: String, 
    enum: ['super_admin', 'admin', 'moderator', 'user', 'guest'],
    default: 'user'
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  lastLogin: {
    type: Date
  },
  
  // Social connections
  socialLinks: {
    twitter: String,
    facebook: String,
    instagram: String,
    linkedin: String
  },
  
  // Preferences
  preferences: {
    language: { type: String, default: 'en' },
    theme: { type: String, default: 'light' },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    }
  }
}, { 
  timestamps: true, 
  versionKey: false 
});

// Device Schema for mobile API tracking
const deviceSchema = new Schema({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: "users",
    required: true 
  },
  deviceId: { 
    type: String, 
    required: true,
    unique: true 
  },
  deviceType: { 
    type: String, 
    enum: ['ios', 'android', 'web', 'desktop'],
    required: true 
  },
  deviceName: { 
    type: String 
  },
  pushToken: { 
    type: String 
  },
  appVersion: { 
    type: String 
  },
  lastActive: { 
    type: Date, 
    default: Date.now 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true, 
  versionKey: false 
});

// Session Schema for tracking user sessions
const sessionSchema = new Schema({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: "users",
    required: true 
  },
  device: { 
    type: Schema.Types.ObjectId, 
    ref: "devices" 
  },
  token: { 
    type: String, 
    required: true,
    unique: true 
  },
  ipAddress: { 
    type: String 
  },
  userAgent: { 
    type: String 
  },
  expiresAt: { 
    type: Date,
    required: true 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { 
  timestamps: true, 
  versionKey: false 
});

// Refresh Token Schema
const refreshTokenSchema = new Schema({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: "users",
    required: true 
  },
  token: { 
    type: String, 
    required: true,
    unique: true 
  },
  deviceId: { 
    type: String 
  },
  expiresAt: { 
    type: Date,
    required: true 
  },
  isUsed: { 
    type: Boolean, 
    default: false 
  },
  isRevoked: { 
    type: Boolean, 
    default: false 
  }
}, { 
  timestamps: true, 
  versionKey: false 
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
sessionSchema.index({ user: 1, isActive: 1 });
refreshTokenSchema.index({ user: 1, isUsed: 1, isRevoked: 1 });

module.exports = {
  userSchema,
  deviceSchema,
  sessionSchema,
  refreshTokenSchema
};
```

## Step 2: Server Creation

```javascript
// server-mobile.js
const { DB } = require("@el-zazo/server-creator");
const { 
  userSchema, 
  deviceSchema, 
  sessionSchema,
  refreshTokenSchema 
} = require("./schemas/mobile-api");

// Create the mobile API server
const db = new DB({
  dbType: "mongodb",
  
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI || "mongodb://localhost:27017/mobileAPI",
      connectionOptions: {
        maxPoolSize: 20  // Higher for mobile API
      },
      cache: {
        enabled: true,
        ttl: 60000,    // 1 minute - shorter for mobile
        maxSize: 500
      }
    }
  },

  // Global router options with advanced auth
  routerOptions: {
    // Authentication keys
    auth: {
      keys: {
        identifiantKey: "email",
        passwordKey: "password"
      },
      additionalFields: {
        username: require("joi").string().alphanum().min(3).max(30).required(),
        displayName: require("joi").string().max(50).optional(),
        phone: require("joi").string().pattern(/^\+?[\d\s-]+$/).optional()
      },
      usePasswordHash: true,
      routes: ["login", "register", "refreshToken", "getUserByToken"],
      protectedRoutes: [
        "getAll", "getOneById", "addOne", 
        "updateOneById", "deleteById"
      ],
      
      // Collection-based access
      collectionAccess: {
        accessDefault: false,
        collections: {
          "super_admins": true,
          "admins": true,
          "moderators": ["getAll", "getOneById", "search"],
          "users": ["getAll", "getOneById", "getUserByToken"],
          "guests": false
        }
      },
      
      // Advanced JWT configuration
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "mobile-api-secret-key-999",
        
        // Token extraction: header, query, cookie, or body
        // This example shows different options for different use cases
        tokenFrom: "header",
        headerName: "Authorization",
        queryParam: "auth_token",
        cookieName: "app_token",
        bodyField: "token",
        
        // Allow requests without token (passthrough)
        // Useful for optional authentication
        passthrough: true
      }
    }
  },

  collections: {
    // Main user collection with full auth
    users: {
      schema: userSchema,
      prefix: "/api/v1/users",
      routerOptions: {
        auth: {
          // Inherit global auth but customize
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true
        }
      }
    },

    // Devices - managed by the app
    devices: {
      schema: deviceSchema,
      prefix: "/api/v1/devices",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: true,
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "mobile-api-secret-key-999",
            // Mobile apps might prefer query param token
            tokenFrom: "query"
          }
        }
      }
    },

    // Sessions - track active sessions
    sessions: {
      schema: sessionSchema,
      prefix: "/api/v1/sessions",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: true,
          // Sessions can use body token (for logout)
          tokenFrom: "body",
          passthrough: false
        }
      }
    },

    // Refresh tokens - separate collection
    refreshTokens: {
      schema: refreshTokenSchema,
      prefix: "/api/v1/refresh-tokens",
      routerOptions: {
        // No CRUD routes - managed programmatically
        routes: []
      }
    }
  },

  // Custom routes for mobile-specific functionality
  otherRoutes: [
    // Health check (public)
    {
      method: "GET",
      path: "/health",
      handler: (req, res) => {
        res.json({ 
          status: "ok", 
          api: "Mobile API v1",
          timestamp: new Date().toISOString()
        });
      }
    },

    // Login with device info (mobile optimized)
    {
      method: "POST",
      path: "/auth/login-mobile",
      handler: async (req, res) => {
        // Custom login that also registers device
        res.json({ 
          success: true, 
          message: "Login with device registration" 
        });
      }
    },

    // Register device (query token)
    {
      method: "POST",
      path: "/devices/register",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          message: "Device registered" 
        });
      },
      isProtected: true,
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "mobile-api-secret-key-999",
        tokenFrom: "query"  // Mobile apps often use query param
      }
    },

    // Logout (body token)
    {
      method: "POST",
      path: "/auth/logout",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          message: "Logged out successfully" 
        });
      },
      isProtected: true,
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "mobile-api-secret-key-999",
        tokenFrom: "body"  // Logout can send token in body
      }
    },

    // Revoke all sessions (header token)
    {
      method: "POST",
      path: "/auth/revoke-all",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          message: "All sessions revoked" 
        });
      },
      isProtected: true,
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "mobile-api-secret-key-999",
        tokenFrom: "header"
      }
    },

    // Optional auth endpoint (passthrough enabled)
    {
      method: "GET",
      path: "/feed",
      handler: async (req, res) => {
        // Works with or without token
        const userId = req.user?._id;
        res.json({ 
          success: true, 
          data: { 
            posts: [],
            userId: userId || null,
            personalized: !!userId
          } 
        });
      },
      isProtected: true,
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "mobile-api-secret-key-999",
        passthrough: true  // Token optional
      }
    },

    // Public content (no auth)
    {
      method: "GET",
      path: "/public/content",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          data: { 
            banner: "...",
            featured: []
          } 
        });
      }
    }
  ],

  serverOptions: {
    port: process.env.PORT || 3003,
    corsOptions: {
      origin: [
        "http://localhost:3000",
        "http://localhost:8080",
        "http://localhost:8100",  // Mobile dev server
        "https://yourdomain.com",
        "https://app.yourdomain.com"  // Mobile app domain
      ],
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Content-Type", 
        "Authorization", 
        "X-Requested-With",
        "X-Device-ID",
        "X-App-Version",
        "Accept-Language"
      ],
      credentials: true,
      maxAge: 86400
    }
  }
});

// Start the server
db.start()
  .then(() => console.log("Mobile API Server started on port 3003"))
  .catch(err => console.error("Failed to start server:", err));
```

## What Was Created

### API Endpoints

**Users** (`/api/v1/users`):

| Method | Endpoint | Access | Token From |
|--------|----------|--------|------------|
| GET | /api/v1/users | Authenticated | Header |
| GET | /api/v1/users/:id | Authenticated | Header |
| POST | /api/v1/users/search | Authenticated | Header |
| POST | /api/v1/users | Authenticated | Header |
| PUT | /api/v1/users/:id | Authenticated | Header |
| DELETE | /api/v1/users/:id | Admins | Header |
| POST | /api/v1/users/login | Public | - |
| POST | /api/v1/users/register | Public | - |
| POST | /api/v1/users/refresh-token | Public | - |
| GET | /api/v1/users/me | Authenticated | Header |

**Devices** (`/api/v1/devices`):

| Method | Endpoint | Access | Token From |
|--------|----------|--------|------------|
| GET | /api/v1/devices | Authenticated | Query Param |
| GET | /api/v1/devices/:id | Authenticated | Query Param |
| POST | /api/v1/devices/search | Authenticated | Query Param |
| POST | /api/v1/devices | Authenticated | Query Param |
| PUT | /api/v1/devices/:id | Authenticated | Query Param |
| DELETE | /api/v1/devices/:id | Authenticated | Query Param |

**Sessions** (`/api/v1/sessions`):

| Method | Endpoint | Access | Token From |
|--------|----------|--------|------------|
| GET | /api/v1/sessions | Authenticated | Body |
| GET | /api/v1/sessions/:id | Authenticated | Body |
| POST | /api/v1/sessions/search | Authenticated | Body |
| DELETE | /api/v1/sessions/:id | Authenticated | Body |

**Custom Endpoints**:

| Method | Endpoint | Description | Token Source |
|--------|----------|-------------|--------------|
| GET | /health | Health check | None (public) |
| POST | /auth/login-mobile | Login + register device | Body |
| POST | /devices/register | Register device | Query param |
| POST | /auth/logout | Logout | Body |
| POST | /auth/revoke-all | Revoke all sessions | Header |
| GET | /feed | Personalized feed | Header (optional) |
| GET | /public/content | Public content | None |

### Token Extraction Methods

The server supports multiple ways to extract JWT tokens:

| Method | How to Use | Use Case |
|--------|------------|----------|
| **header** | `Authorization: Bearer <token>` | Web apps, REST clients |
| **query** | `/api/devices?auth_token=<token>` | Mobile apps, deep links |
| **cookie** | Cookie: `app_token=<token>` | Browser sessions |
| **body** | `{"token": "<token>"}` | Form submissions, logout |

### Features Enabled

1. **Multiple Token Sources** - Different endpoints use different extraction methods
2. **Passthrough Mode** - `/feed` works with or without authentication
3. **Device Management** - Track multiple devices per user
4. **Session Management** - Track and revoke active sessions
5. **Token Refresh** - Separate refresh token collection
6. **Mobile Optimization** - Short cache TTL, query param support
7. **Extended CORS** - Support for mobile dev servers
8. **Custom Headers** - X-Device-ID, X-App-Version support

### Usage Examples

```bash
# 1. Register new user
curl -X POST http://localhost:3003/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@mobile.com",
    "username": "mobileuser",
    "password": "password123",
    "displayName": "Mobile User",
    "phone": "+1234567890"
  }'

# 2. Login (returns token)
curl -X POST http://localhost:3003/api/v1/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@mobile.com", "password": "password123"}'

# 3. Use token in header (standard)
curl http://localhost:3003/api/v1/users/me \
  -H "Authorization: Bearer <token>"

# 4. Register device with query param token
curl -X POST http://localhost:3003/devices/register \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: device-123" \
  -H "X-App-Version: 1.0.0" \
  -d '{"deviceId": "device-123", "deviceType": "ios", "deviceName": "iPhone 14"}' \
  "?auth_token=<token>"

# 5. Logout with body token
curl -X POST http://localhost:3003/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"token": "<token>"}'

# 6. Feed - works WITH token (personalized)
curl http://localhost:3003/feed \
  -H "Authorization: Bearer <token>"
# Response: {"success":true,"data":{"posts":[],"userId":"...","personalized":true}}

# 7. Feed - works WITHOUT token (generic)
curl http://localhost:3003/feed
# Response: {"success":true,"data":{"posts":[],"userId":null,"personalized":false}}

# 8. Public content (no auth needed)
curl http://localhost:3003/public/content

# 9. Refresh token
curl -X POST http://localhost:3003/api/v1/users/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"token": "<expired_token>"}'

# 10. Get devices with query token
curl "http://localhost:3003/api/v1/devices?auth_token=<token>"
```

### Advanced Token Configuration

The package allows different auth middleware options per route:

```javascript
// Example: Different token sources for different routes
{
  // Standard header auth
  authMiddlewareOptions: {
    tokenFrom: "header",
    secret: "secret"
  }
}

// Query param auth (mobile)
{
  authMiddlewareOptions: {
    tokenFrom: "query",
    secret: "secret"
  }
}

// Body token (forms)
{
  authMiddlewareOptions: {
    tokenFrom: "body",
    secret: "secret"
  }
}

// Optional auth (passthrough)
{
  authMiddlewareOptions: {
    tokenFrom: "header",
    secret: "secret",
    passthrough: true  // Request continues even without token
  }
}
```

### Database Collections

1. **users** - Extended user profiles with social links and preferences
2. **devices** - Mobile device registration and tracking
3. **sessions** - Active session management
4. **refreshTokens** - Token refresh mechanism
