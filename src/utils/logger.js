/**
 * Centralized, configurable logger.
 * Log levels (lowest → highest priority): debug < info < warn < error
 */
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let _config = {
  enabled: true,
  level: "debug",
};

/**
 * Configure the global logger.
 */
const configureLogger = (options = {}) => {
  if (typeof options.enabled === "boolean") _config.enabled = options.enabled;
  if (options.level && LEVELS[options.level] !== undefined) _config.level = options.level;
};

/**
 * Return a shallow copy of the current logger config.
 */
const getLoggerConfig = () => ({ ..._config });

/**
 * Log a message if the current configuration allows it.
 */
const logger = (level, message, data = {}) => {
  if (!_config.enabled) return;
  if ((LEVELS[level] ?? 0) < (LEVELS[_config.level] ?? 0)) return;

  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...data,
  };

  const json = JSON.stringify(logEntry);

  switch (level) {
    case "error":
      console.error(json);
      break;
    case "warn":
      console.warn(json);
      break;
    case "info":
      console.info(json);
      break;
    case "debug":
      console.debug(json);
      break;
    default:
      console.log(json);
  }
};

module.exports = { logger, configureLogger, getLoggerConfig };
