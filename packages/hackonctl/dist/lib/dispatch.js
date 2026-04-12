import path from "node:path";
import { isIntegrationScenarioGapTask } from "./task-focus.js";
const maxAutonomousGreenLaneConcurrency = 10;
const greenLaneDriveActiveStates = /* @__PURE__ */ new Set([
  "implementing",
  "validating",
  "draft_pr_open",
  "review_in_progress",
  "changes_requested",
  "blocked"
]);
const greenLaneQueuedStates = /* @__PURE__ */ new Set([
  "qualified",
  "workspace_prepared"
]);
const greenLaneProgressableStates = /* @__PURE__ */ new Set([
  "implementing",
  "validating",
  "draft_pr_open",
  "review_in_progress",
  "changes_requested",
  "blocked"
]);
const greenLaneProgressStatePriority = {
  blocked: 0,
  review_in_progress: 0,
  changes_requested: 1,
  draft_pr_open: 2,
  validating: 3,
  implementing: 4
};
function selectGreenLaneDispatchCandidates(snapshot, limit) {
  const selected = [];
  const skipped = [];
  for (const candidate of snapshot.candidates) {
    const reasons = [];
    const title = candidate.sourceTitle.toLowerCase();
    const labels = candidate.labels.map((label) => label.toLowerCase());
    const docsOnlyPaths = candidate.candidatePaths.length > 0 && candidate.candidatePaths.every((candidatePath) => /\.mdx?$/i.test(candidatePath) || candidatePath.startsWith("docs/") || candidatePath.startsWith("apps/docs/"));
    const narrowPathScope = candidate.candidatePaths.length > 0 && candidate.candidatePaths.length <= 2;
    const boundedFeatureLikeIssue = candidate.sourceType === "github_issue" && candidate.score >= 96 && (candidate.lane === "docs" && docsOnlyPaths && narrowPathScope || candidate.lane === "tests" && narrowPathScope);
    const architectureEvidence = candidate.sourceEvidence.join(" ").toLowerCase();
    if (!["docs", "tests", "simple_bugs"].includes(candidate.lane)) {
      reasons.push(`Lane ${candidate.lane} is not auto-dispatchable.`);
    }
    if (candidate.duplicateRiskClass !== "none") {
      reasons.push(`Duplicate risk is ${candidate.duplicateRiskClass}.`);
    }
    if (candidate.assigneeLogins.length > 0) {
      reasons.push("Issue already has an assignee.");
    }
    if (candidate.score < 85) {
      reasons.push(`Score ${candidate.score} is below the auto-dispatch threshold.`);
    }
    if (/^(feat|feature):/.test(title) && !boundedFeatureLikeIssue) {
      reasons.push("Feature-style title requires manual review instead of auto-dispatch.");
    }
    if (/^task:/.test(title) && !boundedFeatureLikeIssue) {
      reasons.push("Task-style title requires manual review instead of auto-dispatch.");
    }
    if (candidate.lane === "docs" && !labels.some((label) => /doc|documentation/.test(label)) && !docsOnlyPaths) {
      reasons.push("Docs auto-dispatch requires a documentation label or docs-only file scope.");
    }
    if (candidate.lane === "tests" && /\ball\b|\bstream\b|\bhigh-risk flows\b|\bqa scenarios\b/.test(title)) {
      reasons.push("Test title suggests a broad campaign rather than a bounded green-lane task.");
    }
    if (candidate.lane === "simple_bugs" && labels.some((label) => /framework|architecture/.test(label))) {
      reasons.push("Framework or architecture bugs require manual review before dispatch.");
    }
    if (candidate.lane === "simple_bugs" && /\bcompatibility\b|\bnext\.js\b|\besm\b|\bportal\b|\blayout\b|\bmiddleware\b|\bprovider\b|\brouter\b/.test(`${title} ${architectureEvidence}`)) {
      reasons.push("Architecture or runtime-coupled bugs require manual review before dispatch.");
    }
    if (reasons.length > 0) {
      skipped.push({ candidate, reasons });
      continue;
    }
    if (selected.length < limit) {
      selected.push(candidate);
    } else {
      skipped.push({ candidate, reasons: ["Selection limit reached."] });
    }
  }
  return { selected, skipped };
}
function isGreenLaneDriveActiveTask(task) {
  if (!["docs", "tests", "simple_bugs"].includes(task.lane)) {
    return false;
  }
  if (!greenLaneDriveActiveStates.has(task.state)) {
    return false;
  }
  if (task.state === "blocked") {
    return isRetryableBlockedTask(task);
  }
  return true;
}
function countGreenLaneDriveActiveTasks(tasks) {
  return tasks.filter((task) => isGreenLaneDriveActiveTask(task)).length;
}
function isQueuedGreenLaneTask(task) {
  return ["docs", "tests", "simple_bugs"].includes(task.lane) && greenLaneQueuedStates.has(task.state);
}
function selectQueuedGreenLaneTasks(tasks, limit) {
  return tasks.filter((task) => isQueuedGreenLaneTask(task)).sort(compareQueuedGreenLaneTasks).slice(0, Math.max(limit, 0));
}
function isProgressableGreenLaneTask(task) {
  if (!["docs", "tests", "simple_bugs"].includes(task.lane) || !greenLaneProgressableStates.has(task.state)) {
    return false;
  }
  if (task.state !== "blocked") {
    return true;
  }
  return isRetryableBlockedTask(task);
}
function selectProgressableGreenLaneTasks(tasks, limit) {
  return tasks.filter((task) => isProgressableGreenLaneTask(task)).sort(compareProgressableGreenLaneTasks).slice(0, Math.max(limit, 0));
}
function compareQueuedGreenLaneTasks(left, right) {
  const leftSourcePriority = left.sourceType === "github_issue" ? 0 : isIntegrationScenarioGapTask(left) ? 1 : 2;
  const rightSourcePriority = right.sourceType === "github_issue" ? 0 : isIntegrationScenarioGapTask(right) ? 1 : 2;
  if (leftSourcePriority !== rightSourcePriority) {
    return leftSourcePriority - rightSourcePriority;
  }
  const leftCreatedAt = Date.parse(left.createdAt);
  const rightCreatedAt = Date.parse(right.createdAt);
  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
    return leftCreatedAt - rightCreatedAt;
  }
  return left.taskId.localeCompare(right.taskId);
}
function compareProgressableGreenLaneTasks(left, right) {
  const leftStatePriority = greenLaneProgressStatePriority[left.state] ?? Number.MAX_SAFE_INTEGER;
  const rightStatePriority = greenLaneProgressStatePriority[right.state] ?? Number.MAX_SAFE_INTEGER;
  if (leftStatePriority !== rightStatePriority) {
    return leftStatePriority - rightStatePriority;
  }
  return compareQueuedGreenLaneTasks(left, right);
}
function isRetryableGithubProviderBlockedTask(task) {
  return task.state === "blocked" && Boolean(task.prNumber) && task.blockers.length > 0 && task.blockers.every((blocker) => blocker.reason === "github_provider_unavailable");
}
function isRetryableDuplicateCheckpointBlockedTask(task) {
  if (task.state !== "blocked" || !task.prNumber || task.blockers.length > 0 || task.duplicateRiskClass !== "likely_duplicate") {
    return false;
  }
  if (!task.lastCoordinatorDecision?.decision.startsWith("Blocked at duplicate checkpoint ")) {
    return false;
  }
  const blockedAt = Date.parse(task.lastCoordinatorDecision.at);
  return !task.eventLog.some((event) => {
    if (event.type !== "ready.retry.duplicate") {
      return false;
    }
    if (!Number.isFinite(blockedAt)) {
      return true;
    }
    return Date.parse(event.at) >= blockedAt;
  });
}
function isRetryableBlockedTask(task) {
  return isRetryableGithubProviderBlockedTask(task) || isRetryableDuplicateCheckpointBlockedTask(task);
}
async function startTasksInParallel(taskIds, options) {
  const queue = [...taskIds];
  const results = [];
  const workerCount = Math.max(1, Math.min(options.concurrency, maxAutonomousGreenLaneConcurrency, taskIds.length));
  const cliPath = path.resolve(options.repoRoot, "packages/hackonctl/dist/bin.js");
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const taskId = queue.shift();
      if (!taskId) {
        return;
      }
      const result = await options.executor.run(process.execPath, [cliPath, "start", taskId], {
        cwd: options.repoRoot,
        timeoutMs: options.timeoutMs
      });
      results.push({ taskId, result });
    }
  }));
  return results;
}
async function progressGreenLaneTasksInParallel(taskIds, options) {
  const queue = [...taskIds];
  const results = [];
  const workerCount = Math.max(1, Math.min(options.concurrency, maxAutonomousGreenLaneConcurrency, taskIds.length));
  const cliPath = path.resolve(options.repoRoot, "packages/hackonctl/dist/bin.js");
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (queue.length > 0) {
      const taskId = queue.shift();
      if (!taskId) {
        return;
      }
      const taskResults = await runGreenLaneTaskWorkflow(taskId, cliPath, options);
      results.push(...taskResults);
    }
  }));
  return results;
}
async function runGreenLaneTaskWorkflow(taskId, cliPath, options) {
  const results = [];
  let task = await options.getTask(taskId);
  if (task.state === "blocked" && isRetryableBlockedTask(task)) {
    results.push(await runTaskStep(taskId, "ready", [taskId], cliPath, options));
    return results;
  }
  const startedWithPrNumber = Boolean(task.prNumber);
  let updatedExistingPrThisCycle = false;
  if (task.state === "changes_requested") {
    const startResult = await runTaskStep(taskId, "start", [taskId], cliPath, options);
    results.push(startResult);
    if (startResult.result.exitCode !== 0) {
      return results;
    }
    updatedExistingPrThisCycle = startedWithPrNumber;
    task = await options.getTask(taskId);
  }
  if (task.state === "implementing" || task.state === "validating") {
    const validationResult = await runTaskStep(taskId, "validate", [taskId], cliPath, options);
    results.push(validationResult);
    if (validationResult.result.exitCode !== 0) {
      return results;
    }
    updatedExistingPrThisCycle = updatedExistingPrThisCycle || startedWithPrNumber;
    task = await options.getTask(taskId);
  }
  if (task.state === "implementing" && !task.prNumber) {
    const prOpenResult = await runTaskStep(taskId, "pr_open", ["open", taskId], cliPath, options);
    results.push(prOpenResult);
    if (prOpenResult.result.exitCode !== 0) {
      return results;
    }
    task = await options.getTask(taskId);
  } else if (updatedExistingPrThisCycle && task.state === "draft_pr_open" && task.prNumber) {
    const prSyncResult = await runTaskStep(taskId, "pr_sync", ["sync", taskId], cliPath, options);
    results.push(prSyncResult);
    if (prSyncResult.result.exitCode !== 0) {
      return results;
    }
    task = await options.getTask(taskId);
  }
  if ((task.state === "draft_pr_open" || task.state === "review_in_progress") && task.prNumber) {
    results.push(await runTaskStep(taskId, "ready", [taskId], cliPath, options));
  }
  return results;
}
async function runTaskStep(taskId, step, commandArgs, cliPath, options) {
  const command = step === "pr_open" || step === "pr_sync" ? ["pr", ...commandArgs] : step === "start" ? ["start", ...commandArgs] : [step === "validate" ? "validate" : "ready", ...commandArgs];
  const result = await options.executor.run(process.execPath, [cliPath, ...command], {
    cwd: options.repoRoot,
    timeoutMs: options.timeoutMsByStep[step]
  });
  return {
    taskId,
    step,
    result
  };
}
export {
  countGreenLaneDriveActiveTasks,
  isGreenLaneDriveActiveTask,
  isProgressableGreenLaneTask,
  isQueuedGreenLaneTask,
  maxAutonomousGreenLaneConcurrency,
  progressGreenLaneTasksInParallel,
  selectGreenLaneDispatchCandidates,
  selectProgressableGreenLaneTasks,
  selectQueuedGreenLaneTasks,
  startTasksInParallel
};
//# sourceMappingURL=dispatch.js.map
