# Example 2: MySQL with Full Authentication

This example demonstrates a MySQL server with employees and departments, featuring full authentication and role-based access control.

## Step 1: Database Schema

```javascript
// schemas/mysql.js
const { DataTypes } = require("sequelize");

// Employee Schema
const employeeSchema = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  firstName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'first_name'
  },
  lastName: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'last_name'
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  departmentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'department_id',
    references: {
      model: 'departments',
      key: 'id'
    }
  },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'employee', 'intern'),
    defaultValue: 'employee'
  },
  salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  hireDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'hire_date'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
};

// Department Schema
const departmentSchema = {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  budget: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  location: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
};

module.exports = {
  employeeSchema,
  departmentSchema
};
```

## Step 2: Server Creation

```javascript
// server-mysql.js
const { DB } = require("@el-zazo/server-creator");
const { employeeSchema, departmentSchema } = require("./schemas/mysql");

// Create the database server
const db = new DB({
  // Database type
  dbType: "mysql",
  
  // MySQL configuration
  adapterConfig: {
    mysql: {
      host: process.env.MYSQL_HOST || "localhost",
      port: parseInt(process.env.MYSQL_PORT) || 3306,
      database: process.env.MYSQL_DATABASE || "companyDB",
      username: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "password",
      connectionOptions: {
        dialect: "mysql",
        logging: false,
        pool: {
          max: 10,
          min: 2,
          acquire: 30000,
          idle: 10000
        }
      },
      cache: {
        enabled: true,
        ttl: 600000,    // 10 minutes
        maxSize: 200
      }
    }
  },

  // Collections configuration
  collections: {
    // Employee collection with authentication and role-based access
    employees: {
      schema: employeeSchema,
      prefix: "/api/employees",
      modelName: "Employee",
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
          additionalFields: {
            firstName: require("joi").string().max(50).required(),
            lastName: require("joi").string().max(50).required()
          },
          usePasswordHash: true,
          routes: ["login", "register", "refreshToken", "getUserByToken"],
          protectedRoutes: true,
          collectionAccess: {
            accessDefault: false,
            collections: {
              "admins": true,
              "managers": ["getAll", "getOneById", "search", "addOne", "updateOneById"],
              "employees": ["getAll", "getOneById"],
              "interns": ["getAll"]
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "company-secret-key-456",
            tokenFrom: "header",
            headerName: "Authorization"
          }
        }
      }
    },

    // Department collection - admin/manager only
    departments: {
      schema: departmentSchema,
      prefix: "/api/departments",
      modelName: "Department",
      routerOptions: {
        routes: [
          "getAll", "getOneById", "search",
          "addOne", "updateOneById",
          "deleteById"
        ],
        auth: {
          routes: [],
          protectedRoutes: true,
          collectionAccess: {
            accessDefault: false,
            collections: {
              "admins": true,
              "managers": ["getAll", "getOneById", "search"]
            }
          },
          authMiddlewareOptions: {
            secret: process.env.JWT_SECRET || "company-secret-key-456",
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
          database: "MySQL"
        });
      }
    },
    {
      method: "GET",
      path: "/stats",
      handler: async (req, res) => {
        // This would typically fetch from database
        res.json({
          totalEmployees: 0,
          totalDepartments: 0
        });
      },
      isProtected: true,
      authMiddlewareOptions: {
        secret: process.env.JWT_SECRET || "company-secret-key-456"
      },
      collectionAccess: {
        accessDefault: false,
        collections: {
          "admins": true,
          "managers": true
        }
      }
    }
  ],

  // Server configuration
  serverOptions: {
    port: process.env.PORT || 3001,
    corsOptions: {
      origin: ["http://localhost:3000", "http://localhost:8080"],
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      maxAge: 3600
    }
  }
});

// Start the server
db.start()
  .then(() => console.log("MySQL Server started on port 3001"))
  .catch(err => console.error("Failed to start server:", err));
```

## What Was Created

### API Endpoints

**Employees Collection** (`/api/employees`):

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | /api/employees | Get all employees | Yes (role-based) |
| GET | /api/employees/:id | Get employee by ID | Yes (role-based) |
| POST | /api/employees/search | Search employees | Yes (role-based) |
| POST | /api/employees | Create employee | Yes - admins only |
| POST | /api/employees/many | Create multiple employees | Yes - admins only |
| PUT | /api/employees/:id | Update employee | Yes - admins/managers |
| PUT | /api/employees/many | Update multiple employees | Yes - admins only |
| DELETE | /api/employees/:id | Delete employee | Yes - admins only |
| DELETE | /api/employees/many | Delete multiple employees | Yes - admins only |
| POST | /api/employees/login | Employee login | No |
| POST | /api/employees/register | Employee registration | No |
| POST | /api/employees/refresh-token | Refresh token | No |
| GET | /api/employees/me | Get current user | Yes |

**Departments Collection** (`/api/departments`):

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | /api/departments | Get all departments | Yes - admins/managers |
| GET | /api/departments/:id | Get department by ID | Yes - admins/managers |
| POST | /api/departments/search | Search departments | Yes - admins/managers |
| POST | /api/departments | Create department | Yes - admins only |
| PUT | /api/departments/:id | Update department | Yes - admins only |
| DELETE | /api/departments/:id | Delete department | Yes - admins only |

### Role-Based Access Control

The employee collection uses the `role` field from the user data to determine access:

| Role | Access Level |
|------|--------------|
| **admin** | Full access to all routes |
| **manager** | Read all, create, update (not delete) |
| **employee** | Read own and list all |
| **intern** | Read-only list access |

### Features Enabled

1. **MySQL Connection** - Connects to `companyDB` with connection pooling
2. **Extended Caching** - 10-minute cache for better performance
3. **JWT Authentication** - Token-based auth with role claims
4. **Collection-Based Access Control** - Granular permissions
5. **Restricted CORS** - Only localhost:3000 and localhost:8080
6. **Custom Registration Fields** - firstName, lastName required
7. **Token Refresh** - Auto-expiring token renewal

### Usage Examples

```bash
# Register a new admin
curl -X POST http://localhost:3001/api/employees/register \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane@company.com",
    "password": "securePass123",
    "role": "admin"
  }'

# Login as manager
curl -X POST http://localhost:3001/api/employees/login \
  -H "Content-Type: application/json" \
  -d '{"email": "manager@company.com", "password": "password"}'

# Response includes token with role:
# {
#   "success": true,
#   "data": {
#     "user": { "id": 1, "email": "...", "role": "manager", ... },
#     "token": "eyJhbGciOiJIUzI1..."
#   }
# }

# Get all employees (manager or admin)
curl http://localhost:3001/api/employees \
  -H "Authorization: Bearer <manager_token>"

# Create department (admin only)
curl -X POST http://localhost:3001/api/departments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <admin_token>" \
  -d '{
    "name": "Engineering",
    "description": "Software development team",
    "budget": 500000,
    "location": "Building A"
  }'
```

### Database Tables Created

The server will create (or use existing) tables:

1. **employees** - With all employee data and role tracking
2. **departments** - Department information with budget

Both tables include proper timestamps and soft-delete capabilities via `isActive` flag.
