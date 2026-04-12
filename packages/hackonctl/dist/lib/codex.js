import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, writeJsonFileAtomic } from "./fs.js";
import { getTaskBlockersDir, getTaskRunsDir } from "./runtime-paths.js";
import { isIntegrationScenarioGapTask } from "./task-focus.js";
async function runCodexAgent(runtimePaths, config, task, role, promptPath, cwd, executor) {
  const roleConfig = resolveCodexRoleConfig(config, task, role);
  const runsDir = getTaskRunsDir(runtimePaths, task.taskId);
  const blockersDir = getTaskBlockersDir(runtimePaths, task.taskId);
  await ensureDir(runsDir);
  await ensureDir(blockersDir);
  const runId = `${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${role}`;
  const stdoutPath = path.join(runsDir, `${runId}.stdout.log`);
  const stderrPath = path.join(runsDir, `${runId}.stderr.log`);
  const lastMessagePath = path.join(runsDir, `${runId}.last-message.txt`);
  const artifactPath = path.join(runsDir, `${runId}.json`);
  const promptText = await fs.readFile(promptPath, "utf8");
  const command = [
    config.codex.binary,
    "exec",
    "--json",
    "--model",
    roleConfig.model,
    "--sandbox",
    roleConfig.sandboxMode,
    "--cd",
    cwd,
    "--add-dir",
    runtimePaths.repoRoot,
    "--output-last-message",
    lastMessagePath,
    "-"
  ];
  let attempt = 0;
  let lastSummary = "";
  let blockerArtifact = null;
  let finalResult = null;
  while (attempt <= roleConfig.maxAutomaticRetries) {
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const result = await executor.run(command[0], command.slice(1), {
      cwd,
      timeoutMs: roleConfig.timeoutMs,
      stdoutFilePath: stdoutPath,
      stderrFilePath: stderrPath,
      stdinText: promptText
    });
    const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
    const lastMessage = await fs.readFile(lastMessagePath, "utf8").catch(() => "");
    lastSummary = lastMessage;
    const blockerReason = detectBlockerReason(result.stdout, result.stderr, result.exitCode, result.timedOut);
    const status = blockerReason ? "blocked" : result.exitCode === 0 ? "completed" : "failed";
    let blockerArtifactPath = null;
    if (blockerReason) {
      blockerArtifact = await createBlockerArtifact(blockersDir, {
        reason: blockerReason,
        summary: summarizeBlocker(blockerReason, result.stdout, result.stderr),
        createdAt: finishedAt,
        role,
        runId,
        relatedTaskId: task.taskId,
        stdoutPath,
        stderrPath
      });
      blockerArtifactPath = path.join(blockersDir, `${runId}-${blockerReason}.json`);
    }
    finalResult = {
      role,
      runId,
      startedAt,
      finishedAt,
      status,
      command,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdoutPath,
      stderrPath,
      promptPath,
      lastMessagePath,
      blockerArtifactPath,
      retryCount: attempt
    };
    await writeJsonFileAtomic(artifactPath, finalResult);
    if (status === "completed") {
      return { runArtifact: finalResult, blockerArtifact, lastMessage };
    }
    if (blockerReason || !isTransientFailure(result.stdout, result.stderr) || attempt >= roleConfig.maxAutomaticRetries) {
      return { runArtifact: finalResult, blockerArtifact, lastMessage };
    }
    attempt += 1;
  }
  if (!finalResult) {
    throw new Error("Codex run failed before producing an artifact.");
  }
  return { runArtifact: finalResult, blockerArtifact, lastMessage: lastSummary };
}
function resolveCodexRoleConfig(config, task, role) {
  if (role === "implementer" && isIntegrationScenarioGapTask(task)) {
    return config.codex.testImplementer;
  }
  return config.codex[role];
}
async function createBlockerArtifact(blockersDir, blocker) {
  const filePath = path.join(blockersDir, `${blocker.runId}-${blocker.reason}.json`);
  await writeJsonFileAtomic(filePath, blocker);
  return blocker;
}
function detectBlockerReason(stdout, stderr, exitCode, timedOut) {
  const combined = `${stdout}
${stderr}`.toLowerCase();
  if (timedOut) return "timeout_exceeded";
  if (exitCode !== 0 && /blocker:\s*permission_blocked|approval required|requires approval|permission denied/.test(combined)) {
    return "permission_blocked";
  }
  if (exitCode !== 0 && /not found|enoent/.test(combined) && /codex|gh|git|yarn|npx/.test(combined)) {
    return "tool_missing";
  }
  return null;
}
function summarizeBlocker(reason, stdout, stderr) {
  const combined = `${stdout}
${stderr}`.trim();
  const firstLine = combined.split("\n").find((line) => line.trim().length > 0) ?? "No additional output.";
  switch (reason) {
    case "permission_blocked":
      return `Approval-sensitive operation blocked the agent run. ${firstLine}`;
    case "tool_missing":
      return `Required command is unavailable for the agent run. ${firstLine}`;
    case "timeout_exceeded":
      return `Agent run exceeded the configured timeout. ${firstLine}`;
    default:
      return firstLine;
  }
}
function isTransientFailure(stdout, stderr) {
  const combined = `${stdout}
${stderr}`.toLowerCase();
  return /econnreset|timed out|temporary failure|connection reset|5\d\d/.test(combined);
}
export {
  runCodexAgent
};
//# sourceMappingURL=codex.js.map
