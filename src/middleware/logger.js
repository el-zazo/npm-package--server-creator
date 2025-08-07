function loggerMiddleware(req, res, next) {
  console.log(`\n\n${req.method} - ${req.route.path} - ${req.originalUrl}\n\n`);
  next();
}

module.exports = { loggerMiddleware };
