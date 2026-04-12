import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { configSchema } from "./schema.js";
const CONFIG_FILENAME = "hackonctl.config.json";
function loadConfig(basePath) {
  const configPath = resolve(basePath, CONFIG_FILENAME);
  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}
Run 'hackonctl init' to create one.`
    );
  }
  const raw = readFileSync(configPath, "utf-8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}`);
  }
  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid config in ${configPath}:
${issues}`);
  }
  return result.data;
}
function configExists(basePath) {
  return existsSync(resolve(basePath, CONFIG_FILENAME));
}
export {
  configExists,
  loadConfig
};
//# sourceMappingURL=loader.js.map
