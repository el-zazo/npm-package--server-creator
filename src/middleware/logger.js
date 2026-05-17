function loggerMiddleware(req, res, next) {
  console.log(`\n\n${req.method} - ${req.route?.path || "unknown"} - ${req.originalUrl}\n\n`);
  next();
}

module.exports = { loggerMiddleware };
