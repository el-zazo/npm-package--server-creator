# Pagination, Sorting & Filtering

Guide to paginating, sorting, and selecting fields on your auto-generated API routes.

## Table of Contents

- [Overview](#overview)
- [Pagination](#pagination)
  - [Query Pagination (GET routes)](#query-pagination-get-routes)
  - [Body Pagination (POST /search)](#body-pagination-post-search)
  - [Disabling Pagination](#disabling-pagination)
  - [Pagination Response](#pagination-response)
- [Sorting](#sorting)
  - [Sort via Query String (GET routes)](#sort-via-query-string-get-routes)
  - [Sort via Body (POST /search)](#sort-via-body-post-search)
  - [Sort Format Reference](#sort-format-reference)
  - [Sort Sanitization](#sort-sanitization)
- [Field Selection](#field-selection)
  - [Fields via Query String (GET routes)](#fields-via-query-string-get-routes)
  - [Fields via Body (POST /search)](#fields-via-body-post-search)
  - [Field Format Reference](#field-format-reference)
  - [Field Sanitization](#field-sanitization)
  - [Collection-Level Field Configuration](#collection-level-field-configuration)
  - [Merge Rules](#merge-rules)
- [Response Sanitization](#response-sanitization)
- [Filtering (POST /search)](#filtering-post-search)
  - [Basic Filters](#basic-filters)
  - [Complex Filters](#complex-filters)
  - [MongoDB Query Sanitization](#mongodb-query-sanitization)
  - [MySQL Query Normalization](#mysql-query-normalization)
- [Bulk Operation Safety (Empty Filter Protection)](#bulk-operation-safety-empty-filter-protection)
- [Quick Reference Table](#quick-reference-table)

---

## Overview

All list endpoints (`getAll` and `search`) support pagination, sorting, and field selection. The `getOneById` route supports field selection only.

| Feature         | `getAll` (GET)  | `getOneById` (GET) | `search` (POST) |
| --------------- | --------------- | ------------------ | --------------- |
| Pagination      | Query params    | —                  | Body params     |
| Sorting         | Query param     | —                  | Body param      |
| Field selection | Query param     | Query param        | Body param      |
| Filtering       | —               | —                  | Body param      |

---

## Pagination

### Query Pagination (GET routes)

Pagination parameters are passed as query strings on `GET /` routes.

| Parameter  | Type     | Default | Description               |
| ---------- | -------- | ------- | ------------------------- |
| `page`     | `Number` | `1`     | Page number (min 1).      |
| `per_page` | `Number` | `10`    | Items per page (max 100). |

```
GET /users?page=2&per_page=20
```

> `per_page` is automatically capped at `100` even if a higher value is provided.

---

### Body Pagination (POST /search)

Pagination parameters are passed in the request body on `POST /search`.

| Parameter  | Type     | Default | Description               |
| ---------- | -------- | ------- | ------------------------- |
| `page`     | `Number` | `1`     | Page number (min 1).      |
| `per_page` | `Number` | `10`    | Items per page (max 100). |

```json
{
  "query": { "status": "active" },
  "page": 2,
  "per_page": 20
}
```

---

### Disabling Pagination

To return all results without pagination metadata, use the `no_pagination` parameter.

| Route    | Parameter       | Values that disable pagination                           |
| -------- | --------------- | ------------------------------------------------------- |
| `getAll` | `no_pagination` | `"true"`, `"True"`, or `"1"` (query strings are always strings) |
| `search` | `no_pagination` | `true` (boolean)                                        |

> **Note:** The type differs because query parameters are always strings, while body parameters preserve their type.

For `getAll`, the Joi validation schema accepts six string values: `"false"`, `"true"`, `"False"`, `"True"`, `"0"`, `"1"`. However, only `"true"`, `"True"`, and `"1"` actually disable pagination (checked by the `NO_PAGINATION_OPTIONS` list at runtime). The other values (`"false"`, `"False"`, `"0"`) keep pagination enabled.

For `search`, the Joi schema validates `no_pagination` as a boolean (`true`/`false`), and only `true` disables pagination.

**GET example:**

```
GET /users?no_pagination=true
GET /users?no_pagination=True
GET /users?no_pagination=1
```

**POST example:**

```json
{
  "query": {},
  "no_pagination": true
}
```

When pagination is disabled, the response includes `total` instead of `pagination`:

```json
{
  "success": true,
  "data": [...],
  "total": 50
}
```

---

### Pagination Response

When pagination is enabled, the response includes a `pagination` object:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 50,
    "total_pages": 5,
    "current_page": 2,
    "per_page": 10,
    "has_next_page": true,
    "has_prev_page": true,
    "next_page": 3,
    "prev_page": 1
  }
}
```

| Field           | Type             | Description                       |
| --------------- | ---------------- | --------------------------------- |
| `total`         | `Number`         | Total number of matching records. |
| `total_pages`   | `Number`         | Total number of pages.            |
| `current_page`  | `Number`         | Current page number.              |
| `per_page`      | `Number`         | Number of items per page.         |
| `has_next_page` | `Boolean`        | Whether a next page exists.       |
| `has_prev_page` | `Boolean`        | Whether a previous page exists.   |
| `next_page`     | `Number \| null` | Next page number or `null`.       |
| `prev_page`     | `Number \| null` | Previous page number or `null`.   |

The `total` count is obtained via a separate `model.count()` query before fetching the paginated results. For `getAll`, the count query is always `{}` (all documents). For `search`, the count uses the same `query` filter from the request body.

---

## Sorting

### Sort via Query String (GET routes)

Pass a `sort` query parameter on `GET /` routes.

```
GET /users?sort=name:1,createdAt:-1
```

### Sort via Body (POST /search)

Pass a `sort` object in the request body on `POST /search`. The sort object is sanitized via `sanitizeSortFields()` before use.

```json
{
  "query": {},
  "sort": { "name": 1, "createdAt": -1 }
}
```

---

### Sort Format Reference

For query string parameters, two formats are supported:

**1. JSON string:**

```
?sort={"name":1,"createdAt":-1}
```

**2. URL-friendly string:**

```
?sort=name:1,createdAt:-1
```

| Direction  | Value | Meaning           |
| ---------- | ----- | ----------------- |
| Ascending  | `1`   | A → Z, low → high |
| Descending | `-1`  | Z → A, high → low |

> If a direction value cannot be parsed, it defaults to `1` (ascending).

For body parameters, pass a plain object:

```json
{ "name": 1, "createdAt": -1 }
```

---

### Sort Sanitization

After parsing, sort objects are sanitized by `sanitizeSortFields()` to prevent abuse:

1. **MongoDB operator injection:** Any field starting with `$` is silently removed (e.g., `$where` would be stripped).
2. **Sensitive field exclusion:** The following field names are blocked from sorting (case-insensitive check):

| Blocked sort field   | Reason                              |
| -------------------- | ------------------------------------ |
| `password`           | Prevents sorting by password hash   |
| `passwordhash`       | Prevents sorting by password hash   |
| `password_hash`      | Prevents sorting by password hash   |
| `salt`               | Prevents sorting by salt value      |
| `secret`             | Prevents sorting by secrets         |
| `token`              | Prevents sorting by tokens          |
| `refreshtoken`       | Prevents sorting by refresh tokens  |
| `__v`                | Internal MongoDB version key        |

> Blocked fields are silently removed from the sort object — no error is thrown. The remaining sort fields are applied normally.

---

## Field Selection

### Fields via Query String (GET routes)

Pass a `fields` query parameter on `GET /` or `GET /:id` routes.

```
GET /users?fields=name,email
GET /users?fields=name,email,-password
GET /users?fields={"name":1,"email":1}
```

### Fields via Body (POST /search)

Pass a `fields` value in the request body on `POST /search`.

```json
{
  "query": {},
  "fields": { "name": 1, "email": 1 }
}
```

Or as a string:

```json
{
  "query": {},
  "fields": "name,email,-password"
}
```

---

### Field Format Reference

Three formats are supported:

**1. URL-friendly string:**

```
fields=name,email,-password
```

- Fields without prefix → included (`1`)
- Fields with `-` prefix → excluded (`0`)

**2. JSON string:**

```
fields={"name":1,"password":0}
```

**3. Object (body only):**

```json
{ "name": 1, "password": 0 }
```

**Rules:**

| Value | Meaning       |
| ----- | ------------- |
| `1`   | Include field |
| `0`   | Exclude field |

> String values `"0"` and `"1"` are automatically converted to numbers. Any other value causes a validation error.

---

### Field Sanitization

After parsing, field selection objects are sanitized by `sanitizeFieldsParam()` to prevent security bypasses:

1. **MongoDB operator injection:** Any key starting with `$` is silently removed.
2. **Sensitive field forced exclusion:** The following field names are forced to `0` (excluded) if they appear with value `1` in the request. This prevents attackers from bypassing `sanitizeDocument` by explicitly requesting sensitive fields via the `?fields=` parameter (case-insensitive check):

| Forced-exclude field | Behavior                              |
| -------------------- | ------------------------------------- |
| `password`           | Always excluded (`0`), never included |
| `passwordhash`       | Always excluded (`0`), never included |
| `password_hash`      | Always excluded (`0`), never included |
| `salt`               | Always excluded (`0`), never included |
| `secret`             | Always excluded (`0`), never included |
| `token`              | Always excluded (`0`), never included |
| `refreshtoken`       | Always excluded (`0`), never included |
| `__v`                | Always excluded (`0`), never included |

> Even if a client requests `?fields=password:1`, the sanitization forces it to `0`. This is a defense-in-depth measure alongside the response-level `sanitizeDocument()`.

---

### Collection-Level Field Configuration

You can define default field rules at the collection level using the `fields` option in `routerOptions`:

```javascript
collections: {
  users: {
    routerOptions: {
      fields: {
        password: 0,
        internalNotes: 0
      }
    }
  }
}
```

This ensures `password` and `internalNotes` are never returned in any response, regardless of what the client requests. The `fields` configuration is stored on the Router instance as `fieldsConfig` and applied in all read routes (`getAll`, `getOneById`, `search`).

---

### Merge Rules

When both collection-level fields and request-level fields are provided, they are merged by `mergeFieldsConfiguration()` with these rules:

| Scenario               | Result                       |
| ---------------------- | ---------------------------- |
| Neither provided       | `null` — all fields returned |
| Only request fields    | Request fields used as-is    |
| Only collection fields | Collection fields used as-is |
| Both provided          | Merged — see rules below     |

**Merge behavior when both are present:**

1. Start with the collection fields as the base.
2. For each request field:
   - If the collection has the field set to `0` (exclude) → **request is ignored**. The field stays excluded.
   - Otherwise → the request value overrides.

```javascript
// Collection config
fields: { password: 0, email: 1, name: 1 }

// Request: ?fields=password:1,phone:1
// Result:  { password: 0, email: 1, name: 1, phone: 1 }
//          password stays 0 — cannot be overridden
```

> Collection-level exclusions (`0`) are **enforced** — clients cannot override them to include a field. This works in combination with the field sanitization described above, providing two layers of protection: the sanitization forces known-sensitive names to `0`, and the merge rules enforce collection-level `0` values.

---

## Response Sanitization

All read responses are automatically sanitized by `sanitizeDocument()`, which strips sensitive fields from the response data regardless of what was requested via field selection. This is a defense-in-depth measure.

**Built-in stripped fields** (case-insensitive matching):

| Field          | Description                    |
| -------------- | ------------------------------ |
| `password`     | Password values                |
| `passwordHash` | Password hash values           |
| `__v`          | MongoDB version key            |

**Dynamic stripped fields:**

If the collection has auth configured with a custom `passwordKey`, that key is also stripped. For example, if `passwordKey: "secretCode"`, then `secretCode` is removed from all responses.

**How it works:**

- For Mongoose documents: calls `doc.toObject()` first, then recursively strips.
- For Sequelize instances: calls `doc.get({ plain: true })`, then recursively strips.
- For plain objects: clones with `{ ...doc }`, then recursively strips.
- Nested objects and arrays are sanitized recursively.

---

## Filtering (POST /search)

### Basic Filters

Pass a `query` object matching fields to their values:

```json
{
  "query": {
    "status": "active",
    "role": "admin"
  }
}
```

The query is **not** passed directly to the database — it is normalized and sanitized first:

- **MongoDB:** Normalized via `normalizeFilter()`, then sanitized via `sanitizeMongoQuery()`
- **MySQL:** Normalized via `normalizeMySQLFilter()`

---

### Complex Filters

For advanced queries, use `or` and `and` operators:

```json
{
  "query": {
    "or": [{ "status": "active" }, { "status": "pending" }],
    "and": [{ "role": "admin" }]
  }
}
```

**Conversion:**

| Database | `or` becomes | `and` becomes |
| -------- | ------------ | ------------- |
| MongoDB  | `$or`        | `$and`        |
| MySQL    | `Op.or`      | `Op.and`      |

> The original `or` and `and` keys are removed from the filter object before execution. The normalization is recursive — nested `or`/`and` inside arrays are also converted.

---

### MongoDB Query Sanitization

MongoDB queries are sanitized in two stages by `MongoDBModel`:

**Stage 1 — `normalizeFilter()`**: Recursively converts user-friendly `or`/`and` keys to MongoDB `$or`/`$and` operators. This must run before sanitization so that the converted operators are recognized by the allowlist.

**Stage 2 — `sanitizeMongoQuery()`**: Recursively strips any key starting with `$` that is **not** in the operator allowlist. This prevents NoSQL injection attacks where users inject dangerous operators like `$where`, `$function`, `$accumulator`, etc.

**Allowed MongoDB operators:**

| Category     | Operators                                              |
| ------------ | ------------------------------------------------------ |
| Comparison   | `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`            |
| Membership   | `$in`, `$nin`                                          |
| Element      | `$exists`, `$type`                                     |
| Array        | `$size`, `$all`, `$elemMatch`                          |
| Logical      | `$or`, `$and`, `$not`, `$nor`                          |

Any other `$`-prefixed operator is silently stripped from the query. This means:

- `{ $where: "sleep(5000)" }` → `{}` (attack prevented)
- `{ $function: {...} }` → `{}` (attack prevented)
- `{ status: "active", $or: [...] }` → `{ status: "active", $or: [...] }` (safe operators preserved)

---

### MySQL Query Normalization

MySQL queries are normalized by `normalizeMySQLFilter()`, which recursively converts:

- `or` (array) → `Op.or` (Sequelize Symbol-based operator)
- `and` (array) → `Op.and` (Sequelize Symbol-based operator)

Unlike MongoDB, there is no additional sanitization layer for MySQL because Sequelize parameterizes queries, preventing SQL injection by design.

---

## Bulk Operation Safety (Empty Filter Protection)

The `updateMany` and `deleteMany` endpoints enforce a safety check to prevent accidentally modifying or deleting all documents. The `isFilterEffectivelyEmpty()` function catches not just empty objects but also deceptively "empty" filters:

| Filter                              | Empty? | Reason                                    |
| ------------------------------------ | ------ | ----------------------------------------- |
| `{}`                                 | Yes    | No constraints at all                     |
| `{ or: [] }`                         | Yes    | Empty array = no constraints              |
| `{ or: [{}] }`                       | Yes    | Array of empty objects = no constraints   |
| `{ $or: [{}] }`                      | Yes    | Already-normalized empty form             |
| `{ and: [{ or: [{}] }] }`           | Yes    | Nested empty combinations                 |
| `{ status: "active" }`              | No     | Has a real field constraint               |
| `{ or: [{ status: "active" }] }`    | No     | Array contains a non-empty constraint     |

When an effectively empty filter is detected, a `ValidationError` is returned:

```json
{
  "success": false,
  "error": {
    "message": "Empty filter is not allowed for safety reasons.",
    "type": "ValidationError",
    "statusCode": 400,
    "details": {},
    "timestamp": "..."
  }
}
```

---

## Quick Reference Table

| Feature       | Parameter       | GET Route        | POST /search           | Default |
| ------------- | --------------- | ---------------- | ---------------------- | ------- |
| Page          | `page`          | Query (`string`) | Body (`number`)        | `1`     |
| Per page      | `per_page`      | Query (`string`) | Body (`number`)        | `10`    |
| Max per page  | —               | Capped at `100`  | Capped at `100`        | `100`   |
| No pagination | `no_pagination` | Query (`"true"`, `"True"`, or `"1"`) | Body (`true`) | — |
| Sort          | `sort`          | Query (`string`) | Body (`object`)        | `{}`    |
| Fields        | `fields`        | Query (`string`) | Body (`object/string`) | —       |
| Filter        | `query`         | —                | Body (`object`)        | `{}`    |

---

← [Back to README](../README.md)
