/**
 * Server class for initializing Express app and managing routers
 */
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { SERVER } = require("./utils/constants");
const { errorHandler } = require("./utils/errors");
const { defaultRateLimiter } = require("./middleware/rate-limit");

class Server {
  /**
   * Create a new Server instance
   * @param {Object} options - Server options
   * @param {number} options.port - Port to listen on
   * @param {Object} options.corsOptions - CORS configuration options
   */
  constructor(options = {}) {
    this.port = options.port || SERVER.DEFAULT_PORT;

    // Merge custom CORS options with defaults
    this.corsOptions = options.corsOptions ? { ...SERVER.CORS.DEFAULT_OPTIONS, ...options.corsOptions } : SERVER.CORS.DEFAULT_OPTIONS;

    this.app = express();
    this.routers = [];

    this.initializeMiddleware();
  }

  /**
   * Initialize middleware
   */
  initializeMiddleware() {
    // Parse JSON bodies with increased size limit for file uploads
    this.app.use(express.json({ limit: "10mb" }));

    // Parse URL-encoded bodies with increased size limit
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Enable CORS with merged default and custom options
    // This allows for flexible CORS configuration through server options
    this.app.use(cors(this.corsOptions));

    // Parse cookies
    this.app.use(cookieParser());

    // Apply rate limiting to all requests
    this.app.use(defaultRateLimiter);
  }

  /**
   * Add a router to the server
   * @param {Object} router - Router instance
   * @param {string} prefix - Route prefix
   * @param {Array} middleware - Optional middleware to apply to this router
   * @returns {Server} - Server instance for chaining
   */
  addRouter(router, prefix = "/api", middleware = []) {
    if (!router || !router.router) {
      throw new Error("Invalid router provided");
    }

    // Store router for reference
    this.routers.push({ router, prefix, middleware });

    // Add router to app with any middleware
    if (middleware && middleware.length > 0) {
      this.app.use(prefix, middleware, router.router);
    } else {
      this.app.use(prefix, router.router);
    }

    console.log(`Added router with prefix: ${prefix}`);
    return this;
  }

  /**
   * Start the server and listen on the configured port
   * @param {Function} callback - Optional callback function to execute after server starts
   * @returns {Object} - HTTP server instance
   */
  start(callback) {
    console.log(`Starting server with ${this.routers.length} routers on port ${this.port}...`);

    // Add default error handler at the end of middleware chain
    // This ensures it's added after all routes are defined
    this.app.use(errorHandler);

    return this.app.listen(this.port, () => {
      console.log(`Server running at http://localhost:${this.port}`);
      if (callback && typeof callback === "function") {
        callback();
      }
    });
  }
}

module.exports = Server;
