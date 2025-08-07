# Auto-Server API Documentation

This document provides a comprehensive reference for all API endpoints and features available in Auto-Server.

## Table of Contents

- [API Endpoints](#api-endpoints)
  - [Collection-based Endpoints](#collection-based-endpoints)
  - [CRUD Operations](#crud-operations)
  - [Authentication](#authentication)
  - [Custom Endpoints](#custom-endpoints)
- [Request Parameters](#request-parameters)
  - [Pagination](#pagination)
  - [Sorting](#sorting)
  - [Field Selection](#field-selection)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Examples](#examples)

## API Endpoints

Auto-Server provides two types of endpoints:

1. **Collection-based endpoints** - Automatically generated for each collection
2. **Custom endpoints** - Defined through the `otherRoutes` option in the DB constructor

### Collection-based Endpoints

Auto-Server automatically generates the following endpoints for each collection:

### CRUD Operations

| Endpoint           | Method | Description                       | Protected by Default |
| ------------------ | ------ | --------------------------------- | -------------------- |
| `/{prefix}/`       | GET    | Get all documents with pagination | No                   |
| `/{prefix}/:id`    | GET    | Get a single document by ID       | No                   |
| `/{prefix}/search` | POST   | Search documents with query       | No                   |
| `/{prefix}/`       | POST   | Add a new document                | No                   |
| `/{prefix}/many`   | POST   | Add multiple documents            | No                   |
| `/{prefix}/:id`    | PUT    | Update a document by ID           | No                   |
| `/{prefix}/many`   | PUT    | Update multiple documents         | No                   |
| `/{prefix}/:id`    | DELETE | Delete a document by ID           | No                   |
| `/{prefix}/many`   | DELETE | Delete multiple documents         | No                   |

### Authentication

| Endpoint                  | Method | Description                      | Protected by Default |
| ------------------------- | ------ | -------------------------------- | -------------------- |
| `/{prefix}/login`         | POST   | Authenticate user and get token  | No                   |
| `/{prefix}/register`      | POST   | Register a new user              | No                   |
| `/{prefix}/refresh-token` | POST   | Refresh an existing token        | No                   |
| `/{prefix}/me`            | GET    | Get current user info from token | Yes                  |

### Custom Endpoints

In addition to the automatically generated endpoints, you can define custom endpoints using the `otherRoutes` option in the DB constructor. These endpoints can have any HTTP method, path, and handler function, and can be protected with authentication and collection-based access control.

Example:

```javascript
const db = new DB({
  // Database configuration...
  otherRoutes: [
    {
      method: "GET",
      path: "/health",
      handler: (req, res) => {
        res.json({ status: "ok", timestamp: new Date() });
      },
    },
    {
      method: "POST",
      path: "/webhook",
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
          admins: true,
          users: "none", // or false
        },
      },
    },
  ],
});
```

See the [**Custom Routes Configuration**](../README.md#custom-routes-configuration) section in the README for more details.

## Request Parameters

### Pagination

Auto-Server supports both paginated and non-paginated data retrieval for collection endpoints. By default, all collection endpoints return paginated results.

Pagination parameters:

| Parameter       | Type    | Default | Description                                           |
| --------------- | ------- | ------- | ----------------------------------------------------- |
| `page`          | Integer | 1       | The page number to retrieve                           |
| `per_page`      | Integer | 10      | Number of items per page (max: 100\*)                 |
| `no_pagination` | Boolean | false   | Set to 'true' to retrieve all data without pagination |

Default and maximum values may vary based on your configuration

Pagination is supported for the `GET /{prefix}/` and `POST /{prefix}/search` endpoints.

For more details on pagination, see the [Pagination Documentation](./pagination.md).

**Query Parameters for GET requests:**

```
GET /{prefix}/?page=1&per_page=10
```

**Request Body for POST /search:**

```json
{
  "query": { "field": "value" },
  "page": 1,
  "per_page": 10
}
```

Defaults:

- `page`: 1
- `per_page`: 10
- Maximum `per_page`: 100

### Sorting

Sorting is supported for the `GET /{prefix}/` and `POST /{prefix}/search` endpoints.

**Query Parameters for GET requests:**

```
GET /{prefix}/?sort=field1:1,field2:-1
```

**Request Body for POST /search:**

```json
{
  "query": { "field": "value" },
  "sort": { "field1": 1, "field2": -1 }
}
```

- Use `1` for ascending order
- Use `-1` for descending order

### Field Selection

Field selection allows you to specify which fields to include or exclude in the response.

**Query Parameters for GET requests:**

```
GET /{prefix}/?fields=field1,field2,-field3
```

**Request Body for POST /search:**

```json
{
  "query": { "field": "value" },
  "fields": "field1,field2,-field3"
}
```

Alternatively, you can use JSON format:

```json
{
  "query": { "field": "value" },
  "fields": { "field1": 1, "field2": 1, "field3": 0 }
}
```

- Prefix a field with `-` to exclude it
- Use `1` to include a field
- Use `0` to exclude a field

## Response Format

All API responses follow a consistent format:

### Success Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "current_page": 1,
    "per_page": 10,
    "total": 100,
    "total_pages": 10
  }
}
```

The `pagination` object is only included for endpoints that support pagination.

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Error message",
    "type": "ErrorType",
    "statusCode": 400,
    "details": { ... },
    "timestamp": "2023-06-01T12:00:00.000Z"
  }
}
```

## Error Handling

Auto-Server provides standardized error handling with the following error types:

| Error Type          | Status Code | Description                        |
| ------------------- | ----------- | ---------------------------------- |
| ValidationError     | 400         | Invalid request parameters or body |
| AuthenticationError | 401         | Authentication failed              |
| TokenExpiredError   | 401         | JWT token has expired              |
| AccessDeniedError   | 403         | User doesn't have permission       |
| NotFoundError       | 404         | Resource not found                 |
| ConflictError       | 409         | Resource already exists            |
| RateLimitError      | 429         | Too many requests                  |
| DatabaseError       | 500         | Database operation failed          |
| InternalServerError | 500         | Unexpected server error            |

## Examples

### Get All Documents with Pagination

```http
GET /api/users?page=1&per_page=10&sort=username:1&fields=username,email
```

Response:

```json
{
  "success": true,
  "data": [
    { "username": "user1", "email": "user1@example.com" },
    { "username": "user2", "email": "user2@example.com" }
  ],
  "pagination": {
    "current_page": 1,
    "per_page": 10,
    "total": 2,
    "total_pages": 1
  }
}
```

### Get Document by ID

```http
GET /api/users/123
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "123",
    "username": "user1",
    "email": "user1@example.com",
    "createdAt": "2023-06-01T12:00:00.000Z"
  }
}
```

### Search Documents

#### With Pagination (Default)

```http
POST /api/users/search
Content-Type: application/json

{
  "query": { "username": "user1" },
  "sort": { "createdAt": -1 },
  "fields": "username,email",
  "page": 1,
  "per_page": 10
}
```

Response:

```json
{
  "success": true,
  "data": [{ "username": "user1", "email": "user1@example.com" }],
  "pagination": {
    "current_page": 1,
    "per_page": 10,
    "total": 1,
    "total_pages": 1
  }
}
```

#### Without Pagination

```http
POST /api/users/search
Content-Type: application/json

{
  "query": { "username": "user" },
  "sort": { "createdAt": -1 },
  "fields": "username,email",
  "no_pagination": true
}
```

Response:

```json
{
  "success": true,
  "data": [
    { "username": "user1", "email": "user1@example.com" },
    { "username": "user2", "email": "user2@example.com" }
  ],
  "total": 2
}
```

### Add a Document

```http
POST /api/users
Content-Type: application/json

{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "456",
    "username": "newuser",
    "email": "newuser@example.com",
    "createdAt": "2023-06-01T12:00:00.000Z"
  }
}
```

### Update a Document

```http
PUT /api/users/456
Content-Type: application/json

{
  "email": "updated@example.com"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "456",
    "username": "newuser",
    "email": "updated@example.com",
    "createdAt": "2023-06-01T12:00:00.000Z"
  }
}
```

### Delete a Document

```http
DELETE /api/users/456
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "456",
    "username": "newuser",
    "email": "updated@example.com",
    "createdAt": "2023-06-01T12:00:00.000Z"
  }
}
```

### User Login

```http
POST /api/users/login
Content-Type: application/json

{
  "email": "user1@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "123",
      "username": "user1",
      "email": "user1@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### User Registration

```http
POST /api/users/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "456",
      "username": "newuser",
      "email": "newuser@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Refresh Token

```http
POST /api/users/refresh-token
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

Response:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "123",
      "username": "user1",
      "email": "user1@example.com"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Get Current User

```http
GET /api/users/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Response:

```json
{
  "success": true,
  "data": {
    "_id": "123",
    "username": "user1",
    "email": "user1@example.com"
  }
}
```
