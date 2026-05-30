const { logger } = require("../utils/logger");

function loggerMiddleware(req, res, next) {
  logger("info", "Request", { method: req.method, path: req.route?.path || "unknown", url: req.originalUrl });
  next();
}

module.exports = { loggerMiddleware };
