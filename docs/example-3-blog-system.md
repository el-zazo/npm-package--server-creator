# Example 3: Multi-Collection Blog System

This example demonstrates a complete blog system with posts, comments, categories, and tags. It showcases complex routing, custom middleware, and advanced configuration.

## Step 1: Database Schema

```javascript
// schemas/blog.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Category Schema
const categorySchema = new Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true 
  },
  description: { 
    type: String 
  },
  color: { 
    type: String, 
    default: "#3498db" 
  },
  parentCategory: { 
    type: Schema.Types.ObjectId, 
    ref: "categories" 
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  order: { 
    type: Number, 
    default: 0 
  }
}, { timestamps: true, versionKey: false });

// Tag Schema
const tagSchema = new Schema({
  name: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true 
  },
  usageCount: { 
    type: Number, 
    default: 0 
  }
}, { timestamps: true, versionKey: false });

// Post Schema
const postSchema = new Schema({
  title: { 
    type: String, 
    required: true,
    trim: true
  },
  slug: { 
    type: String, 
    required: true, 
    unique: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  excerpt: { 
    type: String 
  },
  featuredImage: { 
    type: String 
  },
  author: { 
    type: Schema.Types.ObjectId, 
    ref: "users",
    required: true 
  },
  category: { 
    type: Schema.Types.ObjectId, 
    ref: "categories" 
  },
  tags: [{ 
    type: Schema.Types.ObjectId, 
    ref: "tags" 
  }],
  status: { 
    type: String, 
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  isFeatured: { 
    type: Boolean, 
    default: false 
  },
  viewCount: { 
    type: Number, 
    default: 0 
  },
  publishedAt: { 
    type: Date 
  }
}, { timestamps: true, versionKey: false });

// Comment Schema
const commentSchema = new Schema({
  post: { 
    type: Schema.Types.ObjectId, 
    ref: "posts",
    required: true 
  },
  author: { 
    type: Schema.Types.ObjectId, 
    ref: "users",
    required: true 
  },
  parentComment: { 
    type: Schema.Types.ObjectId, 
    ref: "comments" 
  },
  content: { 
    type: String, 
    required: true 
  },
  isApproved: { 
    type: Boolean, 
    default: false 
  },
  isSpam: { 
    type: Boolean, 
    default: false 
  }
}, { timestamps: true, versionKey: false });

// User Schema (for blog authors)
const userSchema = new Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    lowercase: true
  },
  email: { 
    type: String, 
    required: true, 
    unique: true,
    lowercase: true
  },
  password: { 
    type: String, 
    required: true 
  },
  displayName: { 
    type: String 
  },
  avatar: { 
    type: String 
  },
  bio: { 
    type: String 
  },
  role: { 
    type: String, 
    enum: ['admin', 'editor', 'author', 'subscriber'],
    default: 'subscriber'
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true, versionKey: false });

// Indexes
postSchema.index({ title: 'text', content: 'text' });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ author: 1 });
commentSchema.index({ post: 1, createdAt: -1 });

module.exports = {
  categorySchema,
  tagSchema,
  postSchema,
  commentSchema,
  userSchema
};
```

## Step 2: Server Creation

```javascript
// server-blog.js
const { DB } = require("@el-zazo/server-creator");
const { 
  categorySchema, 
  tagSchema, 
  postSchema, 
  commentSchema,
  userSchema 
} = require("./schemas/blog");

// Create the blog server
const db = new DB({
  dbType: "mongodb",
  
  adapterConfig: {
    mongodb: {
      uri: process.env.MONGODB_URI || "mongodb://localhost:27017/blogDB",
      connectionOptions: {
        maxPoolSize: 10
      },
      cache: {
        enabled: true,
        ttl: 180000,    // 3 minutes for blog (frequently updated)
        maxSize: 150
      }
    }
  },

  collections: {
    // Blog Users (authors, editors, admins)
    users: {
      schema: userSchema,
      prefix: "/api/auth",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById",
          "login", "register", "refreshToken", "getUserByToken"
        ],
        auth: {
          keys: {
            identifiantKey: "email",
            passwordKey: "password"
          },
          additionalFields: {
            username: require("joi").string().alphanum().min(3).max(30).required(),
            displayName: require("joi").string().max(50).optional()
          },
          usePasswordHash: true,
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
          collectionAccess: {
            accessDefault: false,
            collections: {
              "admins": true,
              "editors": ["getAll", "getOneById", "addOne", "updateOneById"],
              "authors": ["getAll", "getOneById"],
              "subscribers": ["getUserByToken"]
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "blog-secret-key-789",
            tokenFrom: "header"
          }
        }
      }
    },

    // Categories - hierarchical content organization
    categories: {
      schema: categorySchema,
      prefix: "/api/categories",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: ["addOne", "updateOneById", "deleteById"],
          collectionAccess: {
            accessDefault: false,
            collections: {
              "admins": true,
              "editors": ["getAll", "getOneById", "addOne", "updateOneById"]
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "blog-secret-key-789"
          }
        }
      }
    },

    // Tags - flexible content labeling
    tags: {
      schema: tagSchema,
      prefix: "/api/tags",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: ["addOne", "updateOneById", "deleteById"],
          collectionAccess: {
            accessDefault: false,
            collections: {
              "admins": true,
              "editors": true
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "blog-secret-key-789"
          }
        }
      }
    },

    // Posts - main content
    posts: {
      schema: postSchema,
      prefix: "/api/posts",
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
          // Published posts are public, drafts need auth
          protectedRoutes: ["addOne", "updateOneById", "deleteById"],
          collectionAccess: {
            accessDefault: true,   // Public read access by default
            collections: {
              "admins": true,
              "editors": true,
              "authors": ["getAll", "getOneById", "addOne", "updateOneById"],
              "subscribers": ["getAll", "getOneById"]
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "blog-secret-key-789"
          }
        }
      }
    },

    // Comments - user engagement
    comments: {
      schema: commentSchema,
      prefix: "/api/comments",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: ["updateOneById", "deleteById"],
          // Anyone can read, only auth can create
          collectionAccess: {
            accessDefault: true,
            collections: {
              "admins": true,
              "editors": true,
              "authors": true,
              "subscribers": ["getAll", "getOneById", "addOne"]
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "blog-secret-key-789"
          }
        }
      }
    }
  },

  // Custom routes for blog-specific functionality
  otherRoutes: [
    // Health check
    {
      method: "GET",
      path: "/health",
      handler: (req, res) => {
        res.json({ 
          status: "ok", 
          blog: "My Awesome Blog",
          version: "1.0.0"
        });
      }
    },

    // Get posts by category (custom endpoint)
    {
      method: "GET",
      path: "/posts/category/:slug",
      handler: async (req, res) => {
        // This would query posts by category slug
        res.json({ 
          success: true, 
          message: "Posts by category endpoint" 
        });
      }
    },

    // Get posts by tag (custom endpoint)
    {
      method: "GET",
      path: "/posts/tag/:slug",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          message: "Posts by tag endpoint" 
        });
      }
    },

    // Get featured posts (custom endpoint)
    {
      method: "GET",
      path: "/posts/featured",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          data: [] 
        });
      }
    },

    // Get recent comments
    {
      method: "GET",
      path: "/comments/recent",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          data: [] 
        });
      }
    },

    // Search posts (public)
    {
      method: "POST",
      path: "/search",
      handler: async (req, res) => {
        res.json({ 
          success: true, 
          message: "Global search endpoint" 
        });
      }
    }
  ],

  serverOptions: {
    port: process.env.PORT || 3002,
    corsOptions: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
      credentials: true
    }
  }
});

// Start the server
db.start()
  .then(() => console.log("Blog Server started on port 3002"))
  .catch(err => console.error("Failed to start server:", err));
```

## What Was Created

### API Endpoints

**Users (Authors)** (`/api/auth`):

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /api/auth | Admins, Editors |
| GET | /api/auth/:id | Admins, Editors |
| POST | /api/auth/search | Admins, Editors |
| POST | /api/auth | Admins, Editors |
| PUT | /api/auth/:id | Admins, Editors |
| DELETE | /api/auth/:id | Admins only |
| POST | /api/auth/login | Public |
| POST | /api/auth/register | Public |
| POST | /api/auth/refresh-token | Public |
| GET | /api/auth/me | Authenticated users |

**Categories** (`/api/categories`):

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /api/categories | Public |
| GET | /api/categories/:id | Public |
| POST | /api/categories/search | Public |
| POST | /api/categories | Admins, Editors |
| PUT | /api/categories/:id | Admins, Editors |
| DELETE | /api/categories/:id | Admins only |

**Tags** (`/api/tags`):

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /api/tags | Public |
| POST | /api/tags/search | Public |
| POST | /api/tags | Admins, Editors |
| PUT | /api/tags/:id | Admins, Editors |
| DELETE | /api/tags/:id | Admins only |

**Posts** (`/api/posts`):

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /api/posts | Public |
| GET | /api/posts/:id | Public |
| POST | /api/posts/search | Public |
| POST | /api/posts | Authenticated |
| PUT | /api/posts/:id | Authenticated |
| DELETE | /api/posts/:id | Admins, Editors |

**Comments** (`/api/comments`):

| Method | Endpoint | Access |
|--------|----------|--------|
| GET | /api/comments | Public |
| GET | /api/comments/:id | Public |
| POST | /api/comments/search | Public |
| POST | /api/comments | Authenticated |
| PUT | /api/comments/:id | Admins, Editors |
| DELETE | /api/comments/:id | Admins, Editors |

**Custom Endpoints**:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /health | Health check |
| GET | /posts/category/:slug | Posts by category |
| GET | /posts/tag/:slug | Posts by tag |
| GET | /posts/featured | Featured posts |
| GET | /comments/recent | Recent comments |
| POST | /search | Global search |

### Data Relationships

```
users (authors)
  ↓
posts (have author, category, tags)
  ↓
comments (linked to posts and users)
  ↑
categories ← posts
tags ← posts
```

### Role-Based Access Matrix

| Role | Users | Categories | Tags | Posts | Comments |
|------|-------|------------|------|-------|----------|
| **admin** | Full | Full | Full | Full | Full |
| **editor** | Read/Create | Full | Full | Full | Full |
| **author** | Read | - | - | Own/Full | Own |
| **subscriber** | - | Read | Read | Read | Read/Create |

### Features Enabled

1. **5 Collections** - Users, Categories, Tags, Posts, Comments
2. **Custom API Prefixes** - `/api/auth` for users (cleaner URLs)
3. **Role-Based Access** - 4 user roles with different permissions
4. **Public/Private Mix** - Posts and comments have public reads
5. **Custom Endpoints** - Category/tag filtering, featured posts
6. **Text Search** - Full-text search on posts
7. **Hierarchical Categories** - Parent-child category support
8. **Comment Threading** - Parent comment references

### Usage Examples

```bash
# Register a blog admin
curl -X POST http://localhost:3002/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@blog.com",
    "password": "admin123",
    "displayName": "Blog Admin",
    "role": "admin"
  }'

# Login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@blog.com", "password": "admin123"}'

# Create a category (admin/editor)
curl -X POST http://localhost:3002/api/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "Technology", "slug": "technology", "color": "#e74c3c"}'

# Create a tag (admin/editor)
curl -X POST http://localhost:3002/api/tags \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "JavaScript", "slug": "javascript"}'

# Create a post (authenticated)
curl -X POST http://localhost:3002/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "title": "Getting Started with Node.js",
    "slug": "getting-started-nodejs",
    "content": "Full article content here...",
    "excerpt": "Learn Node.js basics",
    "status": "published",
    "category": "<category_id>",
    "tags": ["<tag_id>"]
  }'

# Get all published posts (public)
curl http://localhost:3002/api/posts

# Search posts (public)
curl -X POST http://localhost:3002/api/posts/search \
  -H "Content-Type: application/json" \
  -d '{"query": {"title": {"$regex": "Node.js"}}}'

# Add comment (authenticated)
curl -X POST http://localhost:3002/api/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"post": "<post_id>", "content": "Great article!"}'

# Custom endpoint - posts by category
curl http://localhost:3002/posts/category/technology

# Custom endpoint - featured posts
curl http://localhost:3002/posts/featured
```

### Database Collections Created

1. **users** - Blog authors with roles (admin, editor, author, subscriber)
2. **categories** - Hierarchical content categories
3. **tags** - Flexible labeling system
4. **posts** - Main blog content with rich metadata
5. **comments** - User comments with approval system
