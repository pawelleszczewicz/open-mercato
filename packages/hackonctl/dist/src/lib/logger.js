const LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
const LEVEL_PREFIX = {
  debug: "[DEBUG]",
  info: "[INFO]",
  warn: "[WARN]",
  error: "[ERROR]"
};
class Logger {
  constructor(minLevel = "info") {
    this.minLevel = minLevel;
  }
  shouldLog(level) {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel];
  }
  debug(message, ...args) {
    if (this.shouldLog("debug")) {
      console.log(`${LEVEL_PREFIX.debug} ${message}`, ...args);
    }
  }
  info(message, ...args) {
    if (this.shouldLog("info")) {
      console.log(`${LEVEL_PREFIX.info} ${message}`, ...args);
    }
  }
  warn(message, ...args) {
    if (this.shouldLog("warn")) {
      console.warn(`${LEVEL_PREFIX.warn} ${message}`, ...args);
    }
  }
  error(message, ...args) {
    if (this.shouldLog("error")) {
      console.error(`${LEVEL_PREFIX.error} ${message}`, ...args);
    }
  }
}
const logger = new Logger();
export {
  Logger,
  logger
};
//# sourceMappingURL=logger.js.map
