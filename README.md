# 🚀 Server Creator

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js->=14-green.svg)](https://nodejs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Supported-green.svg)](https://www.mongodb.com/)
[![MySQL](https://img.shields.io/badge/MySQL-Supported-blue.svg)](https://www.mysql.com/)

Automatically generate a fully-featured Express REST API from your MongoDB or MySQL database in seconds.

## 💡 What Problem Does It Solve?

Tired of writing the same repetitive CRUD boilerplate, authentication logic, pagination, validation, and error handling for every new project? **`@el-zazo/server-creator`** solves this by connecting directly to your database, discovering your tables or collections, and instantly spinning up a production-ready API. No manual route creation, no redundant code—just plug in your database and go.

## ✨ Features

- 📦 **Auto-CRUD Generation** – Instantly creates `GET`, `POST`, `PUT`, `DELETE` routes for every table/collection.
- 🔐 **Authentication System** – Ready-to-use `Register`, `Login`, `Refresh Token`, and `Profile` routes.
- 🛡️ **JWT Protection** – Secure your routes easily with JSON Web Tokens.
- 🔒 **Collection-Based Access Control** – Restrict route access based on the user's collection membership.
- ✅ **Data Validation** – Automatic request validation using Joi schemas.
- ⏱️ **Rate Limiting** – Built-in anti-spam protection for general and sensitive endpoints.
- ⚡ **In-Memory Cache** – TTL-based caching to optimize database query performance.
- 📄 **Pagination & Sorting** – Effortless data navigation, sorting, and field selection.
- 🛑 **Error Handling** – Clean, standardized JSON error responses across the entire API.
- 🌐 **Dual Database Support** – Works seamlessly with MongoDB (Mongoose) and MySQL (Sequelize).
- 🌐 **CORS Support** – Configurable Cross-Origin Resource Sharing out of the box.
- 🔧 **Custom Routes** – Add your own routes alongside auto-generated ones with optional auth protection.
- 📝 **Request Logging** – Built-in console logging for all incoming requests.

## 📥 Installation

Since this package is hosted on GitHub Packages, you need to configure your `.npmrc` file to authenticate.

1. Create or update a `.npmrc` file in your project root:

```text
  @el-zazo:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${GITHUB_NPM_TOKEN}
```

2. Set your `GITHUB_NPM_TOKEN` environment variable (or replace it directly in the `.npmrc` file with your Personal Access Token).

3. Install the package:

```bash
  npm install @el-zazo/server-creator
```

## ⚡ Quick Start

Get a fully functional API in just a few lines of code:

```javascript
const { DB } = require("@el-zazo/server-creator");

const db = new DB({
  dbType: "mongodb", // or "mysql"
  adapterConfig: {
    mongodb: { uri: "mongodb://localhost:27017/my_database" },
  },
  collections: {
    users: {},
    posts: {},
  },
  serverOptions: { port: 3000 },
});

db.start(() => {
  console.log("API is ready at http://localhost:3000");
});
```

## 📑 Table of Contents

- [README (You are here)](#)
- [Getting Started](docs/GETTING_STARTED.md)
- [Configuration](docs/CONFIGURATION.md)
- [API Routes](docs/API_ROUTES.md)
- [Pagination, Sorting & Filtering](docs/PAGINATION_SORTING_FILTERING.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Database Adapters](docs/DATABASE_ADAPTERS.md)
- [Caching](docs/CACHING.md)
- [Error Handling](docs/ERROR_HANDLING.md)
- [Rate Limiting](docs/RATE_LIMITING.md)
- [Examples](docs/EXAMPLES.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## 📚 Documentation

| File                                                                    | Description                                                        |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [GETTING_STARTED.md](docs/GETTING_STARTED.md)                           | Prerequisites, installation, and your first launch.                |
| [CONFIGURATION.md](docs/CONFIGURATION.md)                               | Complete options reference for `DB`, `Server`, and `Router`.       |
| [API_ROUTES.md](docs/API_ROUTES.md)                                     | Detailed documentation of all auto-generated CRUD and Auth routes. |
| [PAGINATION_SORTING_FILTERING.md](docs/PAGINATION_SORTING_FILTERING.md) | How to use query parameters to paginate, sort, and filter data.    |
| [AUTHENTICATION.md](docs/AUTHENTICATION.md)                             | JWT system, login/register flow, and route protection.             |
| [DATABASE_ADAPTERS.md](docs/DATABASE_ADAPTERS.md)                       | How MongoDB and MySQL adapters discover and map your data.         |
| [CACHING.md](docs/CACHING.md)                                           | In-memory caching mechanism and TTL configuration.                 |
| [ERROR_HANDLING.md](docs/ERROR_HANDLING.md)                             | Custom error classes and standardized JSON error responses.        |
| [RATE_LIMITING.md](docs/RATE_LIMITING.md)                               | Anti-spam configuration and rate limit behaviors.                  |
| [EXAMPLES.md](docs/EXAMPLES.md)                                         | Full-stack examples (MongoDB, MySQL, React, Deployment).           |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)                           | Common issues, debugging tips, and FAQ.                            |

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

← [Back to Top](#-server-creator)
