import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema } from "./schema.js";
class ConfigError extends Error {
  constructor(message, details) {
    super(message);
    this.details = details;
    this.name = "ConfigError";
  }
}
function loadConfig(rootDir, filename = "hackonctl.config.json") {
  const configPath = resolve(rootDir, filename);
  if (!existsSync(configPath)) {
    throw new ConfigError(
      `Config file not found: ${configPath}
Run 'hackonctl init' to create one.`
    );
  }
  let raw;
  try {
    const content = readFileSync(configPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    throw new ConfigError(`Failed to parse config file: ${configPath}`, err);
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(
      `Invalid config:
${result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`,
      result.error
    );
  }
  return result.data;
}
function resolveConfigPaths(config, rootDir) {
  return {
    targetDir: resolve(rootDir, config.workspace.targetDir),
    worktreeDir: resolve(rootDir, config.workspace.worktreeDir),
    registryFile: resolve(rootDir, config.workspace.registryFile)
  };
}
export {
  ConfigError,
  loadConfig,
  resolveConfigPaths
};
//# sourceMappingURL=loader.js.map
