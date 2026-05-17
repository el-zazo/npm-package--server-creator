# Database Adapters

How the package connects to and maps your MongoDB or MySQL database using explicitly configured collections.

## Table of Contents

- [Overview](#overview)
- [Adapter Architecture](#adapter-architecture)
- [MongoDB Adapter](#mongodb-adapter)
  - [Connection](#connection)
  - [Collection Listing](#collection-listing)
  - [Model Generation](#model-generation)
  - [Default Schema Behavior](#default-schema-behavior)
- [MongoDB Model](#mongodb-model)
  - [CRUD Methods](#crud-methods)
  - [NoSQL Injection Protection](#nosql-injection-protection)
- [MySQL Adapter](#mysql-adapter)
  - [Connection](#connection-1)
  - [Table Listing](#table-listing)
  - [Model Generation](#model-generation-1)
  - [Auto Type Mapping](#auto-type-mapping)
  - [Default Model Options](#default-model-options)
- [MySQL Model](#mysql-model)
  - [CRUD Methods](#crud-methods-1)
  - [Filter Normalization](#filter-normalization)
- [Shared Adapter Behavior](#shared-adapter-behavior)
  - [Model Name Formatting](#model-name-formatting)
  - [Caching](#caching)
  - [Custom Schemas](#custom-schemas)
- [Switching Database Type](#switching-database-type)

---

## Overview

The package supports two database systems via dedicated adapters:

| Database | Adapter Class    | ORM/Driver |
| -------- | ---------------- | ---------- |
| MongoDB  | `MongoDBAdapter` | Mongoose   |
| MySQL    | `MySQLAdapter`   | Sequelize  |

The adapter is selected via the `dbType` option in the `DB` class constructor:

```javascript
const db = new DB({
  dbType: "mongodb", // or "mysql"
  adapterConfig: { ... }
});
```

> **Allowlist model:** The `DB` class does **not** auto-discover collections or tables from the database. Only collections explicitly listed in `options.collections` will have models and routes generated. An empty `collections` object causes a startup error.

---

## Adapter Architecture

Both adapters extend the abstract `DatabaseAdapter` base class and implement:

| Method                       | Purpose                                |
| ---------------------------- | -------------------------------------- |
| `connect()`                  | Establish database connection.         |
| `disconnect()`               | Close database connection.             |
| `ping()`                     | Verify database connectivity.          |
| `getAllCollections()`        | List all collections/tables.           |
| `createModel(name, options)` | Create a model for a collection/table. |

Each adapter also inherits:

- `formatModelName(collectionName)` — Converts collection names to singular PascalCase model names using `pluralize.singular()`.
- `cache` — A `Cache` instance shared across all models created by this adapter.

---

## MongoDB Adapter

**Class:** `MongoDBAdapter`
**ORM:** Mongoose

### Connection

- **Default URI:** `"mongodb://0.0.0.0:27017/auto-server"`
- **Default options:** `{}`

```javascript
adapterConfig: {
  mongodb: {
    uri: "mongodb+srv://user:pass@cluster.mongodb.net/mydb",
    connectionOptions: {
      dbName: "mydb",
      ssl: true
    }
  }
}
```

**Behavior:**

- Sets `mongoose.set("strictQuery", true)` before connecting to prevent unexpected query behavior and suppress deprecation warnings in Mongoose 8+.
- Calls `mongoose.connect(uri, connectionOptions)`.
- Stores the mongoose connection instance.
- On error → throws `Error("Failed to connect to MongoDB: ...")`.

**Ping:**

- Checks `mongoose.connection.readyState === 1` before pinging.
- Executes `mongoose.connection.db.admin().ping()`.
- Throws `Error("MongoDB is not connected")` if not connected.

---

### Collection Listing

- Calls `mongoose.connection.db.listCollections().toArray()`.
- Returns an array of collection names.
- Automatically cached under key `"all_collections"`.

> **Note:** This method lists all collections in the database, but the `DB` class only creates models/routes for collections explicitly listed in `options.collections`. Unlisted collections are simply ignored.

---

### Model Generation

For each explicitly configured collection:

1. Check if `collectionOptions.schema` is provided.
2. If **yes** → use it directly as the Mongoose schema.
3. If **no** → create a schema with:
   - `strict: false` — allows any fields.
   - `strictQuery: false` — allows query filters on fields not defined in the schema.
   - `collection: collectionName` — explicitly sets the collection name.
   - `versionKey: false` — no `__v` field.
4. Resolve model name: `collectionOptions.modelName` or `formatModelName(collectionName)`.
5. Try to reuse an existing Mongoose model via `mongoose.model(modelName)`. If it doesn't exist, create a new one with `mongoose.model(modelName, schema)`.
6. Wrap in a `MongoDBModel` instance with the adapter's cache.

> Models are cached under key `"model_<collectionName>"`. Subsequent calls with the same collection name return the cached model instance.

---

### Default Schema Behavior

When no custom schema is provided:

```javascript
new mongoose.Schema(
  {},
  {
    strict: false,
    strictQuery: false,
    collection: collectionName,
    versionKey: false,
  },
);
```

This means:

- Any field can be stored — no validation at the database level.
- Query filters can use fields not defined in the schema (no strictQuery enforcement).
- The collection name is explicitly set (not derived from the model name).
- No `__v` version key is added to documents.

---

## MongoDB Model

**Class:** `MongoDBModel`

Each `MongoDBModel` instance wraps a Mongoose model and exposes a consistent CRUD interface. It also includes built-in NoSQL injection protection and automatic cache invalidation.

### CRUD Methods

| Method                      | Returns                     | Cache Behavior                        |
| --------------------------- | --------------------------- | ------------------------------------- |
| `getAll(options)`            | `Array` of documents        | Cached; invalidated on writes         |
| `getOneById(id, options)`   | Single document             | Cached; invalidated on writes         |
| `getMany(query, options)`   | `Array` of documents        | Cached (if query ≤ 100 chars); invalidated on writes |
| `addOne(data)`              | Created document            | Invalidates cache                     |
| `addMany(dataArray)`        | `Array` of created documents | Invalidates cache                    |
| `updateOneById(id, data)`   | Updated document            | Invalidates cache                     |
| `updateManyByFilter(filter, data)` | `{ affectedCount }`  | Invalidates cache                     |
| `deleteOneById(id)`         | Deleted document            | Invalidates cache                     |
| `deleteManyByFilter(filter)` | `{ deletedCount }`         | Invalidates cache                     |
| `count(query)`              | `Number`                    | Not cached (query sanitized)          |

**Options for read methods:**

| Option   | Type     | Default | Description                      |
| -------- | -------- | ------- | -------------------------------- |
| `sort`   | `Object` | `{}`    | Sorting criteria.                |
| `limit`  | `Number` | `100`   | Maximum documents to return.     |
| `skip`   | `Number` | `0`     | Number of documents to skip.     |
| `fields` | `Object` | `null`  | Field selection (include/exclude). |

**Write method details:**

- `updateOneById` wraps update data in `{ $set: data }` to prevent MongoDB operator injection, and passes `runValidators: true`.
- `updateManyByFilter` also wraps in `{ $set: data }`.
- All write methods call `cache.invalidateByPrefix(collectionName)` after success to ensure stale data is never served.

**Error handling:**

- `getOneById`, `updateOneById`, `deleteOneById` → `NotFoundError` if document not found.
- Invalid MongoDB ObjectId → `ValidationError("Invalid ID format: ...")`.
- Mongoose validation errors → `ValidationError` with field-level error details.
- Duplicate key errors (code 11000) → `ValidationError("Duplicate key error")`.

---

### NoSQL Injection Protection

The `MongoDBModel` applies two layers of protection on all user-supplied filter/query objects:

**1. Filter normalization (`normalizeFilter`):**

Converts user-friendly `"or"` and `"and"` keys to MongoDB `$or` and `$and` operators recursively. This must run before sanitization so the converted operators are recognized by the allowlist.

```javascript
// Input:  { or: [{ name: "Alice" }, { name: "Bob" }] }
// Output: { $or: [{ name: "Alice" }, { name: "Bob" }] }
```

**2. Query sanitization (`sanitizeMongoQuery`):**

Recursively strips any `$`-prefixed key that is **not** in the `ALLOWED_MONGO_OPERATORS` allowlist. This prevents injection of dangerous operators like `$where`, `$function`, `$accumulator`, etc.

**Allowed operators:**

```
$eq, $ne, $gt, $gte, $lt, $lte,
$in, $nin, $exists, $type,
$size, $all, $elemMatch,
$or, $and, $not, $nor
```

**Applied on:** `getMany()`, `updateManyByFilter()`, `deleteManyByFilter()`, `count()`.

---

## MySQL Adapter

**Class:** `MySQLAdapter`
**ORM:** Sequelize

### Connection

| Option     | Default         |
| ---------- | --------------- |
| `host`     | `"localhost"`   |
| `port`     | `3306`          |
| `database` | `"auto_server"` |
| `username` | `"root"`        |
| `password` | `""`            |

```javascript
adapterConfig: {
  mysql: {
    host: "localhost",
    port: 3306,
    database: "my_database",
    username: "root",
    password: "secret",
    connectionOptions: {
      logging: false,
      pool: { max: 10, min: 2 }
    }
  }
}
```

**Behavior:**

- Creates a `new Sequelize(database, username, password, { host, port, dialect: "mysql", ...connectionOptions })`.
- Calls `sequelize.authenticate()` to verify the connection.
- On error → throws `Error("Failed to connect to MySQL: ...")`.

> The `dialect` is always `"mysql"`. The `logging` option defaults to `false` via `DATABASE.MYSQL.DEFAULT_OPTIONS`. Custom `connectionOptions` are spread **after** `dialect`, `host`, and `port`, so they can override the defaults.

**Ping:**

- Checks `this.sequelize` is not null before pinging.
- Calls `sequelize.authenticate()`.
- Throws `Error("MySQL is not connected")` if not connected.

---

### Table Listing

- Executes: `SELECT table_name FROM information_schema.tables WHERE table_schema = ?` using parameterized query (`replacements: [this.database]`).
- Returns an array of table names (tries both `table_name` and `TABLE_NAME` keys for compatibility).
- Automatically cached under key `"all_collections"`.

> **Security:** The database name is passed as a parameterized replacement, not interpolated into the SQL string. This prevents SQL injection.

---

### Model Generation

For each explicitly configured table:

1. Check if `tableOptions.schema` is provided.
2. If **yes** → use it directly as the Sequelize model definition.
3. If **no** → execute `sequelize.getQueryInterface().describeTable(tableName)` and auto-map the columns.
4. Resolve model name: `tableOptions.modelName` or `formatModelName(tableName)`.
5. Create a Sequelize model via `sequelize.define(modelName, schema, { tableName, timestamps: false, ...tableOptions.modelOptions })`.
6. Wrap in a `MySQLModel` instance with the adapter's cache.

> Models are cached under key `"model_<tableName>"`. Subsequent calls with the same table name return the cached model instance.

---

### Auto Type Mapping

When no custom schema is provided, MySQL column types are auto-discovered using `sequelize.getQueryInterface().describeTable(tableName)` and mapped to Sequelize types:

| MySQL Type Contains          | Sequelize Type      |
| ---------------------------- | ------------------- |
| `int`                        | `DataTypes.INTEGER` |
| `varchar`, `text`            | `DataTypes.STRING`  |
| `date`                       | `DataTypes.DATE`    |
| `decimal`, `float`, `double` | `DataTypes.FLOAT`   |
| `boolean`, `tinyint(1)`      | `DataTypes.BOOLEAN` |
| _anything else_              | `DataTypes.STRING`  |

Each column is mapped with:

| Property        | Source                                              |
| --------------- | --------------------------------------------------- |
| `type`          | Mapped from `columnInfo.type` (lowercased)          |
| `allowNull`     | `columnInfo.allowNull === true` or `"YES"`          |
| `primaryKey`    | `columnInfo.primaryKey === true`                    |
| `defaultValue`  | `columnInfo.defaultValue` (`"NULL"` → `null`)       |
| `autoIncrement` | `columnInfo.autoIncrement === true`                 |

> For auto-increment fields, `defaultValue` is removed (handled by the database).

> **Why `describeTable()` instead of raw SQL?** `describeTable()` is Sequelize's built-in, dialect-aware method. It returns a normalized structure that works consistently across Sequelize versions and MySQL configurations, unlike raw `SHOW COLUMNS` which can vary in output format.

---

### Default Model Options

When no custom `modelOptions` are provided:

```javascript
{
  tableName: tableName,
  timestamps: false
}
```

- `timestamps: false` — Sequelize will not expect `createdAt` / `updatedAt` columns.
- Override with `collectionOptions.modelOptions`:

```javascript
collections: {
  users: {
    modelOptions: {
      timestamps: true
    }
  }
}
```

> Custom `modelOptions` are spread **after** the defaults (`tableName`, `timestamps: false`), so you can override any default value.

---

## MySQL Model

**Class:** `MySQLModel`

Each `MySQLModel` instance wraps a Sequelize model and exposes a consistent CRUD interface with automatic cache invalidation and filter normalization.

### CRUD Methods

| Method                      | Returns                     | Cache Behavior                        |
| --------------------------- | --------------------------- | ------------------------------------- |
| `getAll(options)`            | `Array` of records          | Cached; invalidated on writes         |
| `getOneById(id, options)`   | Single record               | Cached; invalidated on writes         |
| `getMany(query, options)`   | `Array` of records          | Cached (if query ≤ 100 chars); invalidated on writes |
| `addOne(data)`              | Created record              | Invalidates cache                     |
| `addMany(dataArray)`        | `Array` of created records  | Invalidates cache                     |
| `updateOneById(id, data)`   | Updated record              | Invalidates cache                     |
| `updateManyByFilter(filter, data)` | `{ affectedCount }`  | Invalidates cache                     |
| `deleteOneById(id)`         | Deleted record              | Invalidates cache                     |
| `deleteManyByFilter(filter)` | `{ deletedCount }`         | Invalidates cache                     |
| `count(query)`              | `Number`                    | Not cached                            |

**Field selection:** MySQL uses `#processFieldSelection()` to convert the MongoDB-style `{ field: 0|1 }` format to Sequelize `attributes`:

- All values `1` → `["field1", "field2"]` (include list).
- All values `0` → `{ exclude: ["field1", "field2"] }` (exclude list).
- Mixed → only fields with value `1` are included.

**Sort format conversion:** Sort objects are converted from MongoDB-style `{ field: 1|-1 }` to Sequelize `[["field", "ASC"|"DESC"]]`.

**Error handling:**

- `getOneById`, `updateOneById`, `deleteOneById` → `NotFoundError` if record not found.
- `SequelizeValidationError` → `ValidationError` with field-level error details.
- `SequelizeUniqueConstraintError` → `ValidationError("Duplicate key error")` with field details.

---

### Filter Normalization

The `MySQLModel` applies `normalizeMySQLFilter()` on all user-supplied filter/query objects. This converts user-friendly `"or"` and `"and"` keys to Sequelize `Op.or` and `Op.and` Symbol-based operators:

```javascript
// Input:  { or: [{ name: "Alice" }, { name: "Bob" }], age: 25 }
// Output: { [Op.or]: [{ name: "Alice" }, { name: "Bob" }], age: 25 }
```

**Applied on:** `getMany()`, `updateManyByFilter()`, `deleteManyByFilter()`, `count()`.

> This mirrors the MongoDB `normalizeFilter()` function but uses Sequelize's Symbol-based operators instead of `$or`/`$and` strings.

---

## Shared Adapter Behavior

### Model Name Formatting

The `formatModelName()` method converts collection/table names to singular PascalCase model names using the `pluralize` library:

1. Singularize via `pluralize.singular(collectionName)`.
2. Split by `"_"`.
3. Capitalize the first letter of each part.

| Input             | Singularized    | Output          |
| ----------------- | --------------- | --------------- |
| `"users"`         | `"user"`        | `"User"`        |
| `"user_profiles"` | `"user_profile"` | `"UserProfile"` |
| `"categories"`    | `"category"`    | `"Category"`    |
| `"data"`          | `"datum"`       | `"Datum"`       |

> The `pluralize` library handles irregular plurals correctly (e.g., `"categories"` → `"category"` → `"Category"`). If the automatic name is not what you want, use the `modelName` option to override.

---

### Caching

Both adapters create a `Cache` instance from the adapter config's `cache` option:

| Option    | Default  | Description                   |
| --------- | -------- | ----------------------------- |
| `enabled` | `true`   | Enable/disable caching.       |
| `ttl`     | `300000` | Cache lifetime in ms (5 min). |
| `maxSize` | `100`    | Maximum cached items.         |

The cache is shared across:

- Collection/table list queries.
- Model creation queries.
- All model CRUD operations (passed to each model instance).

**Cache features:**

- **LRU eviction:** When the cache reaches `maxSize`, the least recently used item is evicted. On every `get()`, the accessed item is moved to the end of the internal Map.
- **Thundering herd protection:** If a computation for the same key is already in progress, the same Promise is returned to all callers, preventing duplicate concurrent database queries.
- **Prefix-based invalidation:** Uses a `prefixIndex` Map for O(k) prefix-based lookups (where k is the number of keys with that prefix). All write operations (`addOne`, `addMany`, `updateOneById`, `updateManyByFilter`, `deleteOneById`, `deleteManyByFilter`) call `invalidateByPrefix(collectionName)` to ensure stale data is never served.
- **Mid-flight cancellation:** If a cache entry is invalidated while a computation is in progress, the result will not be stored (prevents stale data from re-entering the cache after invalidation).
- **Complex query bypass:** Queries with a serialized length greater than 100 characters skip caching entirely to avoid excessive memory usage with large cache keys.

**Cache key format:**

| Query Type      | Cache Key Pattern                                                |
| --------------- | ---------------------------------------------------------------- |
| List all        | `<collection>::all::<sort>_<limit>_<skip>_<fields>`              |
| By ID           | `<collection>::id::<id>_<fields>`                                |
| By query        | `<collection>::query::<query>_<sort>_<limit>_<skip>_<fields>`    |

---

### Custom Schemas

Both adapters accept a custom schema via `collectionOptions.schema`:

**MongoDB — Mongoose schema:**

```javascript
collections: {
  users: {
    schema: new mongoose.Schema({
      name: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      role: { type: String, default: "user" },
    })
  }
}
```

**MySQL — Sequelize definition:**

```javascript
collections: {
  users: {
    schema: {
      name: { type: DataTypes.STRING, allowNull: false },
      email: { type: DataTypes.STRING, allowNull: false, unique: true },
      role: { type: DataTypes.STRING, defaultValue: "user" }
    }
  }
}
```

---

## Switching Database Type

Switching between databases only requires changing `dbType` and `adapterConfig`:

```javascript
// MongoDB
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: { uri: "mongodb://0.0.0.0:27017/my_app" },
  },
  collections: {
    users: {},
  },
});

// MySQL
const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: "localhost",
      database: "my_app",
      username: "root",
      password: "secret",
    },
  },
  collections: {
    users: {},
  },
});
```

> An unsupported `dbType` throws a `ValidationError("Unsupported database type: <type>")`. Accepted values are `"mongodb"` and `"mysql"` only.

---

← [Back to README](../README.md)
