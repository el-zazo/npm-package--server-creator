# Caching

How the in-memory cache works, how to configure it, and its behavior across the system.

## Table of Contents

- [Overview](#overview)
- [Cache Configuration](#cache-configuration)
- [Cache Behavior](#cache-behavior)
  - [Reading (get)](#reading-get)
  - [Writing (set)](#writing-set)
  - [Eviction Policy](#eviction-policy)
  - [Deleting (delete)](#deleting-delete)
  - [Prefix-Based Invalidation (invalidateByPrefix)](#prefix-based-invalidation-invalidatebyprefix)
  - [Compute or Retrieve (getOrCompute)](#compute-or-retrieve-getorcompute)
- [Runtime Toggle (setEnabled)](#runtime-toggle-setenabled)
- [Where Caching Is Used](#where-caching-is-used)
  - [Adapter Level](#adapter-level)
  - [Model Level](#model-level)
- [Disabling the Cache](#disabling-the-cache)
- [Cache Key Patterns](#cache-key-patterns)
- [Limitations](#limitations)
- [Examples](#examples)

---

## Overview

The package uses an in-memory `Cache` class that stores query results with a configurable TTL (time-to-live). A single cache instance is created per database adapter and shared across all models.

**Key characteristics:**

- In-memory only (no external cache server)
- TTL-based expiration with lazy cleanup on access
- Maximum item count with **LRU** (Least Recently Used) eviction
- Prefix-based invalidation for efficient cache busting after writes
- Thundering herd protection — duplicate concurrent computations share the same Promise
- Can be enabled or disabled globally, or toggled at runtime
- Transparent to route handlers — no code changes needed

---

## Cache Configuration

Cache options are set inside the adapter configuration under the `cache` key:

```javascript
adapterConfig: {
  mongodb: {
    uri: "mongodb://0.0.0.0:27017/my_app",
    cache: {
      enabled: true,
      ttl: 300000,
      maxSize: 100
    }
  }
}
```

| Option    | Type      | Default  | Description                          |
| --------- | --------- | -------- | ------------------------------------ |
| `enabled` | `Boolean` | `true`   | Enable or disable caching.           |
| `ttl`     | `Number`  | `300000` | Time-to-live in ms (default: 5 min). |
| `maxSize` | `Number`  | `100`    | Maximum number of cached items.      |

The same structure applies to both MongoDB and MySQL adapters.

---

## Cache Behavior

### Reading (get)

1. If cache is **disabled** → returns `undefined`.
2. Looks up the key in the internal `Map`.
3. If not found → returns `undefined`.
4. If the item has **expired** (`Date.now() > item.expiry`) → deletes it and returns `undefined`.
5. Otherwise → **promotes the item to the most-recently-used position** by deleting and reinserting it at the end of the `Map`, then returns `item.value`.

> Expired items are cleaned up lazily — only when accessed, not on a timer. The promotion step is what makes the cache LRU rather than FIFO: frequently accessed items are moved to the end, protecting them from eviction.

---

### Writing (set)

1. If cache is **disabled** → no-op.
2. If the key **already exists** → removes it so the reinsert places it at the end (LRU promotion).
3. If the key is new and `cache.size >= maxSize` → evicts the **least recently used** entry (the first item in the `Map`, which is the oldest by access order).
4. Calculates expiry: `Date.now() + (customTtl || defaultTtl)`.
5. Stores `{ value, expiry }` in the internal `Map`.
6. **Updates the prefix index**: extracts the prefix from the key (everything before `"::"`), and adds the key to the `prefixIndex` Map for O(1) prefix-based invalidation.

The prefix separator is `"::"` rather than `"_"` because collection names can contain underscores (e.g. `user_sessions`), which would cause `split("_")[0]` to extract the wrong prefix.

---

### Eviction Policy

The cache uses **LRU** (Least Recently Used) eviction:

- When the cache is full, the **least recently used** item (the first item in the `Map`) is removed.
- Items **are** promoted when accessed via `get()` — frequently used items are kept longer because they move to the end of the `Map`.
- Items are also promoted when overwritten via `set()` — an existing key is removed and reinserted at the end.
- Eviction happens only during `set()`, not during `get()`.

> This is not FIFO (First-In, First-Out). A frequently accessed item will be promoted to the end of the `Map` and protected from eviction, unlike in a FIFO cache where insertion order alone determines eviction.

---

### Deleting (delete)

The `delete(key)` method removes a specific entry from the cache:

1. Removes the key from the **prefix index** (looks up the prefix via `split("::")[0]`, deletes the key from the corresponding `Set`, and cleans up empty prefix sets to avoid memory leaks).
2. Removes the key from the internal `Map`.

This method always operates, regardless of whether the cache is enabled or disabled.

---

### Prefix-Based Invalidation (invalidateByPrefix)

The `invalidateByPrefix(prefix)` method removes all cache entries whose key starts with a given prefix. It is the primary mechanism for cache busting after write operations.

1. Looks up the prefix in the `prefixIndex` Map (O(1) lookup, then O(k) where k is the number of keys with that prefix).
2. Deletes all matching keys from the internal `Map`.
3. Removes the prefix entry from `prefixIndex`.
4. **Cancels in-flight pending computations**: scans the `pending` Map for any keys starting with `prefix + "::"` and adds them to `_cancelledKeys`. This prevents stale data from being re-cached after an invalidation that occurs while a computation is still in flight.

> This method always runs, even if the cache is disabled. Since `set()` is a no-op when disabled, there is typically nothing to invalidate, but the pending-computation cancellation still applies.

**When it is called:** Every write operation (`addOne`, `addMany`, `updateOneById`, `updateManyByFilter`, `deleteOneById`, `deleteManyByFilter`) in both `MongoDBModel` and `MySQLModel` calls `this.cache?.invalidateByPrefix(this.collectionName)` after a successful write.

---

### Compute or Retrieve (getOrCompute)

The `getOrCompute(key, computeFn, ttl)` method is the primary way models interact with the cache. It combines cache lookup, computation, and thundering herd protection in a single call:

1. If cache is **disabled** → executes `computeFn()` and returns the result (no caching, no pending tracking).
2. Checks the cache via `get(key)`.
3. If a cached value exists (`!== undefined`) → returns it immediately.
4. If a computation for this key is **already in progress** (tracked in the `pending` Map) → returns the same `Promise` to the caller, avoiding duplicate concurrent computations (thundering herd protection).
5. If not → creates a new `Promise`, stores it in `pending`, executes `await computeFn()`, then:
   - If the key was **not cancelled** while in flight → stores the result via `set()`.
   - If the key **was cancelled** (via `invalidateByPrefix` during computation) → skips caching to prevent stale data from re-entering the cache, and removes the key from `_cancelledKeys`.
6. In the `finally` block → removes the key from `pending` and cleans up `_cancelledKeys` (in case the computation failed before reaching the cancellation check).

```javascript
// Internal usage pattern in models
const result = await this.cache.getOrCompute(
  "users::all::{...}",
  async () => await this.model.find({}).sort(sort).limit(limit).skip(skip),
);
```

> If `computeFn` returns `undefined`, the value is stored but will never be retrieved on subsequent calls (since `get()` returns `undefined` for misses too). This causes recomputation every time.

---

## Runtime Toggle (setEnabled)

The `setEnabled(enabled)` method allows toggling the cache on or off at runtime without recreating the cache instance:

```javascript
// Disable caching at runtime
db.dbAdapter.cache.setEnabled(false);

// Re-enable caching at runtime
db.dbAdapter.cache.setEnabled(true);
```

When disabled, `get()` returns `undefined`, `set()` is a no-op, and `getOrCompute()` always executes the compute function. The internal `Map` and `prefixIndex` are **not** cleared — existing entries remain but become unreachable until the cache is re-enabled.

---

## Where Caching Is Used

### Adapter Level

The adapter caches two types of data:

| Cache Key           | Data                                       | When Refreshed    |
| ------------------- | ------------------------------------------ | ----------------- |
| `"all_collections"` | List of collection/table names             | After TTL expires |
| `"model_<name>"`    | Model instance (MongoDBModel / MySQLModel) | After TTL expires |

**Note:** Adapter-level cache keys use `_` as their separator (e.g. `model_users`), not the `"::"` prefix separator used at the model level. This means `invalidateByPrefix("users")` will clear model-level keys like `users::all::...` but will **not** clear adapter-level keys like `model_users`. Adapter-level entries rely solely on TTL expiration.

**Implication:** Once the collection list or a model is cached, it does not reflect database schema changes until the TTL expires or the cache is fully cleared.

---

### Model Level

Both `MongoDBModel` and `MySQLModel` use the shared cache for read operations. All write operations invalidate the cache for their collection via `invalidateByPrefix`.

| Method               | Cached?  | Invalidates? | Cache Key Pattern                                                    |
| -------------------- | -------- | ------------ | -------------------------------------------------------------------- |
| `getAll`             | Yes      | —            | `{collection}::all::{params}`                                        |
| `getOneById`         | Yes      | —            | `{collection}::id::{id}_{fields}`                                    |
| `getMany`            | Yes*     | —            | `{collection}::query::{query}_{params}`                              |
| `addOne`             | No       | Yes          | —                                                                    |
| `addMany`            | No       | Yes          | —                                                                    |
| `updateOneById`      | No       | Yes          | —                                                                    |
| `updateManyByFilter` | No       | Yes          | —                                                                    |
| `deleteOneById`      | No       | Yes          | —                                                                    |
| `deleteManyByFilter` | No       | Yes          | —                                                                    |
| `count`              | No       | No           | —                                                                    |

_\* `getMany` skips caching when `JSON.stringify(query).length > 100` to avoid excessive memory usage._

**Detailed key formats by adapter:**

**MongoDBModel:**

| Method       | Cache Key Format                                                                  |
| ------------ | --------------------------------------------------------------------------------- |
| `getAll`     | `{collection}::all::{sort}_{limit}_{skip}_{fields}`                               |
| `getOneById` | `{collection}::id::{id}_{fields}`                                                 |
| `getMany`    | `{collection}::query::{queryStr}_{sort}_{limit}_{skip}_{fields}`                  |

**MySQLModel:**

| Method       | Cache Key Format                                                                  |
| ------------ | --------------------------------------------------------------------------------- |
| `getAll`     | `{collection}::all::{options}` (entire options object serialized)                 |
| `getOneById` | `{collection}::id::{id}_{fields}`                                                 |
| `getMany`    | `{collection}::query::{queryStr}_{options}` (entire options object serialized)    |

> **Write-through invalidation:** All write operations (`addOne`, `addMany`, `updateOneById`, `updateManyByFilter`, `deleteOneById`, `deleteManyByFilter`) call `invalidateByPrefix(collectionName)` after a successful write. This clears all cached read results for that collection, ensuring stale data is never served. In-flight `getOrCompute` computations are also cancelled to prevent stale data from being re-cached.

---

## Disabling the Cache

Set `enabled: false` in the cache configuration:

```javascript
adapterConfig: {
  mongodb: {
    uri: "mongodb://0.0.0.0:27017/my_app",
    cache: { enabled: false }
  }
}
```

When disabled:

- `get()` → always returns `undefined`.
- `set()` → no-op (nothing is stored).
- `getOrCompute()` → always executes `computeFn()`, no caching, no pending tracking.
- `delete()`, `clear()`, and `invalidateByPrefix()` → still operate on the internal data structures. Since `set()` is a no-op when disabled, there is typically nothing to delete, but these methods are safe to call regardless.

You can also toggle the cache at runtime using `setEnabled()` (see [Runtime Toggle](#runtime-toggle-setenabled)).

---

## Cache Key Patterns

Cache keys are constructed using `"::"` as the dedicated prefix separator between the collection name and the operation:

```
{collectionName}::{operation}_{serializedParams}
```

The `"::"` separator was chosen over `"_"` because collection names can contain underscores (e.g. `user_sessions`), which would cause `split("_")[0]` to extract the wrong prefix. The `"::"` separator ensures that `split("::")[0]` always correctly extracts the collection name for prefix-based invalidation.

**Examples:**

```
users::all::{"name":1}_0_0_null
users::id::64a1b2c3d4e5f6g7h8i9j0k_null
users::query::{"status":"active"}_{"createdAt":-1}_10_0_null
products::all::{"price":1,"name":1}
```

> Long or complex queries produce long cache keys. The `getMany` method skips caching when the serialized query exceeds 100 characters to prevent memory bloat.

---

## Limitations

- **Adapter-level keys are not prefix-invalidated:** Keys like `model_users` and `all_collections` use `_` rather than `::`, so `invalidateByPrefix` won't clear them. They rely solely on TTL expiration.
- **In-memory only:** Cache is lost on server restart. No persistence.
- **`undefined` values:** If a query returns `undefined`, it is stored but never retrieved — causing recomputation every time.
- **Shared across models:** All models from the same adapter share one cache instance and `maxSize` limit.
- **No per-model TTL:** All cached items use the same TTL (unless a custom TTL is passed to `getOrCompute`).
- **Large query skip:** Queries with serialized length > 100 characters bypass caching entirely (only for `getMany`).
- **Count not cached:** The `count()` method always queries the database directly.

---

## Examples

### Default Cache (5 min, 100 items)

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: "mongodb://0.0.0.0:27017/my_app",
      // cache defaults: enabled=true, ttl=300000, maxSize=100
    },
  },
});
```

### Extended Cache (10 min, 200 items)

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: "mongodb://0.0.0.0:27017/my_app",
      cache: {
        enabled: true,
        ttl: 600000, // 10 minutes
        maxSize: 200,
      },
    },
  },
});
```

### Cache Disabled (always query the database)

```javascript
const db = new DB({
  dbType: "mysql",
  adapterConfig: {
    mysql: {
      host: "localhost",
      database: "my_app",
      username: "root",
      password: "secret",
      cache: { enabled: false },
    },
  },
});
```

### Short Cache for Frequently Changing Data

```javascript
const db = new DB({
  dbType: "mongodb",
  adapterConfig: {
    mongodb: {
      uri: "mongodb://0.0.0.0:27017/realtime_app",
      cache: {
        enabled: true,
        ttl: 30000, // 30 seconds
        maxSize: 50,
      },
    },
  },
});
```

### Runtime Cache Toggle

```javascript
// Access the cache instance from the adapter
const cache = db.dbAdapter.cache;

// Disable caching (e.g. during a data migration)
cache.setEnabled(false);

// Re-enable after migration
cache.setEnabled(true);

// Manually clear all cached entries
cache.clear();
```

---

← [Back to README](../README.md)
