function parseArgs(argv) {
  const flags = /* @__PURE__ */ new Map();
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index] ?? "";
    if (!current.startsWith("--")) {
      positionals.push(current);
      continue;
    }
    const trimmed = current.slice(2);
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex >= 0) {
      const key = trimmed.slice(0, equalsIndex);
      const value = trimmed.slice(equalsIndex + 1);
      appendFlag(flags, key, value);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      appendFlag(flags, trimmed, "true");
      continue;
    }
    appendFlag(flags, trimmed, next);
    index += 1;
  }
  return { positionals, flags };
}
function appendFlag(flags, key, value) {
  const existing = flags.get(key) ?? [];
  existing.push(value);
  flags.set(key, existing);
}
function getFlagValue(parsed, key) {
  return parsed.flags.get(key)?.at(-1);
}
function getFlagValues(parsed, key) {
  return parsed.flags.get(key) ?? [];
}
function hasFlag(parsed, key) {
  return parsed.flags.has(key);
}
export {
  getFlagValue,
  getFlagValues,
  hasFlag,
  parseArgs
};
//# sourceMappingURL=argv.js.map
