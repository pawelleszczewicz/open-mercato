#!/usr/bin/env node
import { resolve } from "node:path";
import { printHelp } from "../src/cli/commands.js";
import { loadConfig, configExists } from "../src/config/loader.js";
import { RegistryStore } from "../src/registry/store.js";
import { runDiagnostics, formatDiagnostics } from "../src/cli/doctor.js";
import { log } from "../src/lib/logger.js";
const args = process.argv.slice(2);
const command = args[0];
const basePath = process.cwd();
if (!command || command === "help" || command === "--help") {
  printHelp();
  process.exit(0);
}
if (command === "doctor") {
  let config2 = null;
  try {
    config2 = configExists(basePath) ? loadConfig(basePath) : null;
  } catch (err) {
    log("warn", `Config exists but is invalid: ${err.message}`);
  }
  const checks = runDiagnostics(basePath, config2);
  console.log("\nhackonctl diagnostics:\n");
  console.log(formatDiagnostics(checks));
  console.log("");
  process.exit(checks.some((c) => c.status === "fail") ? 1 : 0);
}
if (command === "init") {
  const { writeFileSync, existsSync } = await import("node:fs");
  const configPath = resolve(basePath, "hackonctl.config.json");
  if (existsSync(configPath)) {
    log("warn", "Config already exists at hackonctl.config.json");
    process.exit(0);
  }
  const template = {
    version: 1,
    github: {
      operatorUsername: "YOUR_GITHUB_USERNAME",
      forkOwner: "YOUR_FORK_OWNER"
    }
  };
  writeFileSync(configPath, JSON.stringify(template, null, 2) + "\n");
  log("info", `Created hackonctl.config.json \u2014 edit github.operatorUsername and github.forkOwner`);
  process.exit(0);
}
let config;
try {
  config = loadConfig(basePath);
} catch (err) {
  log("error", err.message);
  process.exit(1);
}
const registry = new RegistryStore(basePath, config.workspace.registryFile);
switch (command) {
  case "status": {
    const taskId = args[1];
    const tasks = taskId ? [registry.getTask(taskId)].filter(Boolean) : registry.getAllTasks();
    if (tasks.length === 0) {
      console.log(taskId ? `Task ${taskId} not found.` : "No tasks registered.");
      break;
    }
    const header = `${"Task".padEnd(10)} ${"Lane".padEnd(14)} ${"Source".padEnd(15)} ${"PR".padEnd(8)} ${"Abandoned".padEnd(10)} Title`;
    console.log(header);
    console.log("-".repeat(90));
    for (const task of tasks) {
      if (!task) continue;
      const prCol = task.prNumber ? `#${task.prNumber}` : "-";
      const sourceCol = task.source.type === "github_issue" ? `issue #${task.source.id}` : task.source.type.slice(0, 14);
      console.log(
        `${task.taskId.padEnd(10)} ${task.lane.padEnd(14)} ${sourceCol.padEnd(15)} ${prCol.padEnd(8)} ${String(task.abandoned).padEnd(10)} ${task.source.title.slice(0, 40)}`
      );
    }
    break;
  }
  case "start": {
    const taskId = args[1];
    if (!taskId) {
      log("error", "Usage: hackonctl start <taskId>");
      process.exit(1);
    }
    const task = registry.getTask(taskId);
    if (!task) {
      log("error", `Task not found: ${taskId}`);
      process.exit(1);
    }
    const { createWorktree } = await import("../src/worktree/lifecycle.js");
    const wtPath = createWorktree(basePath, config, task.taskId, task.branchName);
    log("info", `Worktree ready at ${wtPath}`);
    break;
  }
  case "gate": {
    const taskId = args[1];
    if (!taskId) {
      log("error", "Usage: hackonctl gate <taskId>");
      process.exit(1);
    }
    const task = registry.getTask(taskId);
    if (!task) {
      log("error", `Task not found: ${taskId}`);
      process.exit(1);
    }
    const { worktreePath } = await import("../src/lib/paths.js");
    const wtPath = worktreePath(basePath, config, task.taskId);
    const { runGates } = await import("../src/gates/runner.js");
    const gateResult = runGates(wtPath, task.lane, config);
    for (const r of gateResult.results) {
      const symbol = r.passed ? "\x1B[32m\u2713\x1B[0m" : "\x1B[31m\u2717\x1B[0m";
      console.log(`  ${symbol} ${r.gate} (${r.durationMs}ms)`);
      if (!r.passed && r.output) {
        console.log(`    ${r.output.slice(0, 200)}`);
      }
    }
    console.log(gateResult.allPassed ? "\nAll gates passed." : "\nGates FAILED.");
    process.exit(gateResult.allPassed ? 0 : 1);
    break;
  }
  case "close": {
    const taskId = args[1];
    if (!taskId) {
      log("error", "Usage: hackonctl close <taskId>");
      process.exit(1);
    }
    const task = registry.getTask(taskId);
    if (!task) {
      log("error", `Task not found: ${taskId}`);
      process.exit(1);
    }
    const { removeWorktree } = await import("../src/worktree/lifecycle.js");
    removeWorktree(basePath, config, task.taskId, task.branchName);
    registry.updateTask(taskId, { abandoned: true });
    log("info", `Task ${taskId} abandoned and worktree cleaned up.`);
    break;
  }
  case "discover":
  case "queue":
  case "qualify":
  case "pr":
  case "review":
  case "ready": {
    log("info", `Command '${command}' is available \u2014 use it through the coordinator agent which has MCP access for GitHub operations.`);
    log("info", `The hackonctl library exports all required functions for programmatic use.`);
    break;
  }
  default:
    log("error", `Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}
//# sourceMappingURL=hackonctl.js.map
