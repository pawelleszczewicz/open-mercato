import path from "node:path";
import { ensureDir, writeJsonFileAtomic } from "./fs.js";
import { getTaskArtifactRoot } from "./runtime-paths.js";
import { extractIntegrationScenarioIds, isIntegrationScenarioGapTask } from "./task-focus.js";
async function runValidationProfiles(runtimePaths, config, _target, task, worktreePath, canonicalClonePath, executor, options = {}) {
  const profiles = resolveProfiles(config, task.validationProfileIds);
  const artifacts = [];
  const validationsDir = path.join(getTaskArtifactRoot(runtimePaths, task.taskId), "validation");
  await ensureDir(validationsDir);
  for (const profile of profiles) {
    for (const command of resolveValidationCommands(profile, task)) {
      const executionDecision = resolveExecutionDecision(profile, {
        allowApprovalSensitiveProfiles: options.allowApprovalSensitiveProfiles ?? false,
        includeOptionalProfiles: options.includeOptionalProfiles ?? false
      });
      if (executionDecision !== "run") {
        const artifact2 = {
          taskId: task.taskId,
          profileId: profile.id,
          required: profile.required,
          command,
          targetResult: null,
          worktreeResult: null,
          newFindings: [],
          status: executionDecision,
          note: executionDecision === "blocked" ? "Approval-sensitive required validation was not explicitly allowed." : profile.autonomyClass === "optional" ? "Optional validation profile was not requested." : "Approval-sensitive advisory validation was skipped because it was not explicitly allowed."
        };
        artifacts.push(artifact2);
        await writeJsonFileAtomic(path.join(validationsDir, `${profile.id}-${sanitizeCommand(command)}.json`), artifact2);
        continue;
      }
      const baseline = profile.baselineProfile === "target_head" ? await runValidationCommand(
        command,
        resolveBaselineCwd(profile.cwdMode, runtimePaths.repoRoot, canonicalClonePath),
        profile.parser,
        executor,
        task
      ) : null;
      const worktree = await runValidationCommand(
        command,
        resolveWorktreeCwd(profile.cwdMode, runtimePaths.repoRoot, canonicalClonePath, worktreePath),
        profile.parser,
        executor,
        task
      );
      const newFindings = profile.baselineProfile === "target_head" ? worktree.findings.filter((finding) => !(baseline?.findings.includes(finding) ?? false)) : worktree.exitCode !== 0 ? worktree.findings.length > 0 ? worktree.findings : [`exit:${worktree.exitCode}`] : [];
      const artifact = {
        taskId: task.taskId,
        profileId: profile.id,
        required: profile.required,
        command,
        targetResult: baseline,
        worktreeResult: worktree,
        newFindings,
        status: newFindings.length > 0 ? "failed" : "passed",
        note: null
      };
      artifacts.push(artifact);
      await writeJsonFileAtomic(path.join(validationsDir, `${profile.id}-${sanitizeCommand(command)}.json`), artifact);
    }
  }
  return {
    artifacts,
    hasRequiredFailures: artifacts.some((artifact) => artifact.status === "failed" && artifact.required),
    hasBlockingIssues: artifacts.some((artifact) => artifact.status === "blocked")
  };
}
function resolveProfiles(config, profileIds) {
  return profileIds.map((profileId) => config.validationProfiles.find((profile) => profile.id === profileId)).filter((profile) => Boolean(profile));
}
function resolveBaselineCwd(cwdMode, repoRoot, canonicalClonePath) {
  switch (cwdMode) {
    case "repo_root":
      return repoRoot;
    case "target_root":
      return canonicalClonePath;
    case "worktree":
      return canonicalClonePath;
  }
}
function resolveWorktreeCwd(cwdMode, repoRoot, canonicalClonePath, worktreePath) {
  switch (cwdMode) {
    case "repo_root":
      return repoRoot;
    case "target_root":
      return canonicalClonePath;
    case "worktree":
      return worktreePath;
  }
}
function resolveExecutionDecision(profile, options) {
  if (profile.autonomyClass === "optional" && !options.includeOptionalProfiles) {
    return "skipped";
  }
  if (profile.autonomyClass === "approval_sensitive" && !options.allowApprovalSensitiveProfiles) {
    return profile.required ? "blocked" : "skipped";
  }
  return "run";
}
function resolveValidationCommands(profile, task) {
  if (profile.id === "integration-tests" && isIntegrationScenarioGapTask(task)) {
    const scenarioIds = extractIntegrationScenarioIds(task);
    if (scenarioIds.length > 0) {
      return scenarioIds.map((scenarioId) => ["yarn", "mercato", "test:integration", "--filter", scenarioId]);
    }
  }
  return profile.commands;
}
async function runValidationCommand(command, cwd, parser, executor, task) {
  const result = await executor.run(command[0] ?? "", command.slice(1), {
    cwd,
    timeoutMs: 20 * 60 * 1e3
  });
  return {
    exitCode: result.exitCode,
    findings: normalizeFindings(result.stdout, result.stderr, parser, result.exitCode, task)
  };
}
function normalizeFindings(stdout, stderr, parser, exitCode, task) {
  if (parser === "exit_code") {
    return exitCode === 0 ? [] : [`exit:${exitCode}`];
  }
  if (parser === "integration_spec_coverage") {
    return normalizeIntegrationSpecCoverageFindings(stdout, stderr, exitCode, task);
  }
  const combined = `${stdout}
${stderr}`;
  return [...new Set(combined.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).slice(-40))];
}
function normalizeIntegrationSpecCoverageFindings(stdout, stderr, exitCode, task) {
  const report = parseIntegrationSpecCoverageReport(`${stdout}
${stderr}`);
  const scenarioIds = extractIntegrationScenarioIds(task);
  if (report) {
    const uncoveredIds = scenarioIds.length > 0 ? scenarioIds.filter((scenarioId) => report.uncoveredScenarioIds.includes(scenarioId)) : report.uncoveredScenarioIds;
    return uncoveredIds.map((scenarioId) => `uncovered:${scenarioId}`);
  }
  if (exitCode === 0) {
    return [];
  }
  const fallbackFindings = `${stdout}
${stderr}`.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).slice(-10);
  return fallbackFindings.length > 0 ? fallbackFindings : [`exit:${exitCode}`];
}
function parseIntegrationSpecCoverageReport(output) {
  const firstBrace = output.indexOf("{");
  const lastBrace = output.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(output.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }
  const report = parsed;
  return {
    uncoveredScenarioIds: Array.isArray(report.uncoveredScenarioIds) ? report.uncoveredScenarioIds.filter((value) => typeof value === "string" && value.length > 0).map((value) => value.toUpperCase()) : []
  };
}
function sanitizeCommand(command) {
  return command.join("-").replace(/[^a-z0-9-]+/gi, "_");
}
export {
  runValidationProfiles
};
//# sourceMappingURL=validation.js.map
