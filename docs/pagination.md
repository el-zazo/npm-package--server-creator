# Pagination in API Requests

## Overview

The API supports both paginated and non-paginated data retrieval for collection endpoints. By default, all collection endpoints return paginated results to optimize performance and reduce response size.

## Pagination Parameters

| Parameter       | Type    | Default | Description                                           |
| --------------- | ------- | ------- | ----------------------------------------------------- |
| `page`          | Integer | 1       | The page number to retrieve                           |
| `per_page`      | Integer | 10      | Number of items per page (max: 100\*)                 |
| `no_pagination` | Boolean | false   | Set to 'true' to retrieve all data without pagination |

\*Default and maximum values may vary based on your configuration in constants.js

## Paginated Response Format

When using pagination, the response includes a `pagination` object with metadata:

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "current_page": 1,
    "per_page": 20,
    "total": 100,
    "total_pages": 5
  }
}
```

## Non-Paginated Response Format

When `no_pagination=true` is specified, all data is returned without pagination metadata:

```json
{
  "success": true,
  "data": [...],
  "total": 100
}
```

## Examples

### GET Requests

#### Paginated Request (Default)

```
GET /api/products?page=2&per_page=10
```

#### Non-Paginated Request (All Data)

```
GET /api/products?no_pagination=true
```

### POST Search Requests

#### Paginated Search Request (Default)

```json
POST /api/products/search
Content-Type: application/json

{
  "query": { "category": "gaming" },
  "page": 2,
  "per_page": 10
}
```

#### Non-Paginated Search Request (All Data)

```json
POST /api/products/search
Content-Type: application/json

{
  "query": { "category": "gaming" },
  "no_pagination": true
}
```

## Important Notes

- Using `no_pagination=true` may impact performance for collections with large amounts of data
- Consider using pagination for optimal performance when dealing with large datasets
- The `sort` and `fields` parameters work with both paginated and non-paginated requests
