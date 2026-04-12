function normalizePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "");
}
function splitCommaList(values) {
  return values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
}
function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function titleSimilarity(left, right) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (leftTokens.size + rightTokens.size - intersection);
}
function tokenize(value) {
  return value.toLowerCase().split(/[^a-z0-9]+/).map((item) => item.trim()).filter((item) => item.length >= 3);
}
function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  const regex = normalized.replace(/\*\*/g, "__DOUBLE_WILDCARD__").replace(/\*/g, "__SINGLE_WILDCARD__").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/__DOUBLE_WILDCARD__/g, ".*").replace(/__SINGLE_WILDCARD__/g, "[^/]*");
  return new RegExp(`^${regex}$`);
}
export {
  globToRegExp,
  normalizePath,
  slugify,
  splitCommaList,
  titleSimilarity
};
//# sourceMappingURL=strings.js.map
