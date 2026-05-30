/**
 * Server class for initializing Express app and managing routers
 */
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const { SERVER } = require("./utils/constants");
const { errorHandler } = require("./utils/errors");
const { logger } = require("./utils/logger");
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
    this._errorHandlerAdded = false;

    this.initializeMiddleware();
    this.initializeHealthCheck();
  }

  /**
   * Initialize middleware
   */
  initializeMiddleware() {
    // Trust first proxy for correct IP detection behind load balancers
    // Users should set this to the number of proxies in their setup
    this.app.set("trust proxy", 1);

    // Set security-related HTTP headers
    this.app.use(helmet());

    // Parse JSON bodies with reasonable size limit (1mb)
    this.app.use(express.json({ limit: "1mb" }));

    // Parse URL-encoded bodies with reasonable size limit (1mb)
    this.app.use(express.urlencoded({ extended: true, limit: "1mb" }));

    // Enable CORS with merged default and custom options
    // This allows for flexible CORS configuration through server options
    this.app.use(cors(this.corsOptions));

    // Parse cookies
    this.app.use(cookieParser());

    // Apply rate limiting to all requests
    this.app.use(defaultRateLimiter);
  }

  /**
   * Initialize the /health endpoint for monitoring and container orchestration.
   * Registered before other routes so it is always accessible regardless of
   * route ordering or authentication configuration.
   */
  initializeHealthCheck() {
    this.app.get("/health", async (req, res) => {
      const health = {
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: "disconnected",
      };

      try {
        if (this.db) {
          await this.db.ping();
          health.database = "connected";
        }
        res.json(health);
      } catch (err) {
        health.status = "degraded";
        health.database = "error";
        res.status(503).json(health);
      }
    });
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

    logger("info", "Added router", { prefix });
    return this;
  }

  /**
   * Start the server and listen on the configured port
   * @param {Function} callback - Optional callback function to execute after server starts
   * @returns {Object} - HTTP server instance
   */
  start(callback) {
    logger("info", "Starting server", { port: this.port, routers: this.routers.length });

    // Add default error handler at the end of middleware chain
    // This ensures it's added after all routes are defined
    if (!this._errorHandlerAdded) {
      this.app.use(errorHandler);
      this._errorHandlerAdded = true;
    }

    const server = this.app.listen(this.port, () => {
      logger("info", "Server running", { port: this.port });
      if (callback && typeof callback === "function") {
        callback();
      }
    });

    // Handle port already in use error
    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        logger("error", "Port already in use", { port: this.port });
        process.exit(1);
      } else {
        logger("error", "Server error", { error: error.message });
      }
    });

    // Graceful shutdown: close HTTP server and disconnect database
    let isShuttingDown = false;

    const shutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger("info", "Graceful shutdown started", { signal });

      // Stop accepting new connections
      server.close(async () => {
        logger("info", "HTTP server closed");
        try {
          if (this.db) await this.db.disconnect();
          logger("info", "Database disconnected");
        } catch (err) {
          logger("error", "Error during shutdown", { error: err.message });
        }
        // Delayed exit to allow other cleanup handlers (e.g. logger flush,
        // metric reporters, custom SIGTERM listeners) to finish before
        // the process terminates.
        setTimeout(() => process.exit(0), 100);
      });

      // Force shutdown after 10 seconds if graceful shutdown hangs
      setTimeout(() => {
        logger("error", "Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    return server;
  }
}

module.exports = Server;
