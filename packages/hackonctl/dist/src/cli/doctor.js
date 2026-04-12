import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { shell } from "../lib/shell.js";
import { configExists } from "../config/loader.js";
function runDiagnostics(basePath, config) {
  const checks = [];
  checks.push({
    name: "Config file",
    status: configExists(basePath) ? "ok" : "fail",
    message: configExists(basePath) ? "hackonctl.config.json found" : "hackonctl.config.json missing \u2014 run hackonctl init"
  });
  if (!config) {
    return checks;
  }
  const targetDir = resolve(basePath, config.workspace.targetDir);
  const targetExists = existsSync(targetDir);
  checks.push({
    name: "Target clone",
    status: targetExists ? "ok" : "warn",
    message: targetExists ? `Found at ${targetDir}` : `Not found at ${targetDir}`
  });
  const worktreeDir = resolve(basePath, config.workspace.worktreeDir);
  checks.push({
    name: "Worktree directory",
    status: existsSync(worktreeDir) ? "ok" : "warn",
    message: existsSync(worktreeDir) ? `Found at ${worktreeDir}` : `Not found at ${worktreeDir}`
  });
  const gitResult = shell("git --version");
  checks.push({
    name: "Git",
    status: gitResult.success ? "ok" : "fail",
    message: gitResult.success ? gitResult.stdout : "git not found"
  });
  const yarnResult = shell("yarn --version");
  checks.push({
    name: "Yarn",
    status: yarnResult.success ? "ok" : "fail",
    message: yarnResult.success ? `v${yarnResult.stdout}` : "yarn not found"
  });
  const registryPath = resolve(basePath, config.workspace.registryFile);
  checks.push({
    name: "Registry",
    status: existsSync(registryPath) ? "ok" : "warn",
    message: existsSync(registryPath) ? `Found at ${registryPath}` : "No registry yet (will be created on first qualify)"
  });
  return checks;
}
function formatDiagnostics(checks) {
  const statusSymbol = { ok: "\x1B[32m\u2713\x1B[0m", warn: "\x1B[33m!\x1B[0m", fail: "\x1B[31m\u2717\x1B[0m" };
  return checks.map((c) => `  ${statusSymbol[c.status]} ${c.name.padEnd(20)} ${c.message}`).join("\n");
}
export {
  formatDiagnostics,
  runDiagnostics
};
//# sourceMappingURL=doctor.js.map
