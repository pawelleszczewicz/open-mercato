function log(level, message, data) {
  const prefix = {
    info: "\x1B[36m[info]\x1B[0m",
    warn: "\x1B[33m[warn]\x1B[0m",
    error: "\x1B[31m[error]\x1B[0m",
    debug: "\x1B[90m[debug]\x1B[0m"
  }[level];
  const line = data ? `${prefix} ${message} ${JSON.stringify(data)}` : `${prefix} ${message}`;
  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}
export {
  log
};
//# sourceMappingURL=logger.js.map
