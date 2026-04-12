import fs from "node:fs/promises";
import path from "node:path";
import { getTaskContextPath, getTaskPromptsDir } from "./runtime-paths.js";
import { ensureDir } from "./fs.js";
import { extractIntegrationScenarioIds, isIntegrationScenarioGapTask, isIntegrationTestTask } from "./task-focus.js";
async function writeTaskContext(runtimePaths, task, options) {
  const contextPath = getTaskContextPath(runtimePaths, task.taskId);
  const promptsDir = getTaskPromptsDir(runtimePaths, task.taskId);
  await ensureDir(path.dirname(contextPath));
  await ensureDir(promptsDir);
  const context = [
    "# HackOn Task Context",
    "",
    `- Task ID: ${task.taskId}`,
    `- Target: ${task.targetId}`,
    `- Source: ${task.sourceType}:${task.sourceId}`,
    `- Title: ${task.sourceTitle}`,
    `- Lane: ${task.lane}`,
    `- Risk zone: ${task.riskZone}`,
    `- Base branch: ${options.target.defaultBaseBranch}`,
    `- Worktree: ${options.worktreePath}`,
    `- Branch: ${task.branchName ?? "(unassigned)"}`,
    "",
    "## Source Evidence",
    ...task.sourceEvidence.map((item) => `- ${item}`),
    "",
    "## Candidate Paths",
    ...task.candidatePaths.map((item) => `- ${item}`),
    "",
    "## Validation Profiles",
    ...task.validationProfileIds.map((item) => `- ${item}`),
    "",
    "## Required Guides",
    ...options.guideFiles.map((item) => `- ${item}`),
    "",
    "## Duplicate Risk",
    `- Class: ${task.duplicateRiskClass}`,
    ...task.duplicateSignals.map((signal) => `- ${signal.summary}`),
    "",
    "## Current Blockers",
    ...task.blockers.length > 0 ? task.blockers.map((blocker) => `- ${blocker.reason}: ${blocker.summary} (artifact: ${blocker.artifactPath})`) : ["- None"],
    "",
    "## Last Coordinator Decision",
    task.lastCoordinatorDecision ? `- ${task.lastCoordinatorDecision.decision} ${task.lastCoordinatorDecision.rationale}` : "- None",
    ""
  ].join("\n");
  await fs.writeFile(contextPath, context + "\n", "utf8");
  const implementerPromptPath = path.join(promptsDir, "implementer.md");
  const reviewerPromptPath = path.join(promptsDir, "reviewer.md");
  await fs.writeFile(implementerPromptPath, buildRolePrompt("implementer", task, options.worktreePath, options.guideFiles), "utf8");
  await fs.writeFile(reviewerPromptPath, buildRolePrompt("reviewer", task, options.worktreePath, options.guideFiles), "utf8");
  return { contextPath, implementerPromptPath, reviewerPromptPath };
}
function buildRolePrompt(role, task, worktreePath, guideFiles) {
  const requiresIntegrationTestGuidance = isIntegrationTestTask(task);
  const isDedicatedIntegrationGapTask = isIntegrationScenarioGapTask(task);
  const integrationScenarioIds = extractIntegrationScenarioIds(task);
  const integrationScenarioLabel = integrationScenarioIds.join(", ") || "(unspecified scenario)";
  const preferredIntegrationScenarioId = integrationScenarioIds[0] ?? "TC-XXX-000";
  if (role === "implementer") {
    return [
      `You are the implementer agent for HackOn task ${task.taskId}.`,
      `Work only inside ${worktreePath}.`,
      "Read the listed guide files before editing touched areas.",
      ...guideFiles.map((item) => `Guide: ${item}`),
      "",
      "Constraints:",
      "- Do not write shared coordinator state.",
      "- Do not open browsers or GUI apps.",
      "- Use non-interactive commands only.",
      '- If an action would require approval or would escape the workspace sandbox, stop immediately and print a single line starting with "BLOCKER: permission_blocked".',
      "- If you add or update screenshots, they must come from the real Open Mercato app UI and match the current product behavior.",
      ...requiresIntegrationTestGuidance ? [
        "- This task is expected to create or repair Playwright integration coverage.",
        "- Follow the QA and integration-test guide files listed above; prefer module-local `__integration__/TC-*.spec.ts` coverage over ad hoc test scripts."
      ] : [],
      ...isDedicatedIntegrationGapTask ? [
        `- This task belongs to the dedicated integration-test-gap pillar for scenario IDs: ${integrationScenarioLabel}.`,
        "- Do not stop at editing the scenario markdown. Close the gap by adding or repairing the matching module-local Playwright spec file.",
        `- Use \`yarn mercato test:integration:spec-coverage --json\` to confirm ${integrationScenarioLabel} is no longer reported as uncovered.`,
        `- When approval-sensitive validation is allowed, prefer targeted runs such as \`yarn mercato test:integration --filter ${preferredIntegrationScenarioId}\` over full-suite Playwright runs.`
      ] : [],
      "- Summarize the implementation outcome and validation evidence in the final message.",
      "",
      `Source: ${task.sourceType}:${task.sourceId}`,
      `Title: ${task.sourceTitle}`,
      `Candidate paths: ${task.candidatePaths.join(", ") || "(unspecified)"}`,
      `Expected contribution classes: ${task.expectedContributionClasses.join(", ") || "(unspecified)"}`,
      `Duplicate risk: ${task.duplicateRiskClass}`,
      ...task.blockers.length > 0 ? [
        "Current blockers:",
        ...task.blockers.map((blocker) => `- ${blocker.reason}: ${blocker.summary} (artifact: ${blocker.artifactPath})`),
        "- Address the blocker findings first. Inspect the referenced artifact files before editing."
      ] : [],
      task.differentiationNote ? `Differentiation note: ${task.differentiationNote}` : ""
    ].filter(Boolean).join("\n");
  }
  return [
    `You are the reviewer agent for HackOn task ${task.taskId}.`,
    `Review only the current changes in ${worktreePath}.`,
    "Read the listed guide files before evaluating compliance.",
    ...guideFiles.map((item) => `Guide: ${item}`),
    "",
    "Review scope:",
    `- Candidate paths: ${task.candidatePaths.join(", ") || "(unspecified)"}`,
    `- Expected contribution classes: ${task.expectedContributionClasses.join(", ") || "(unspecified)"}`,
    `- Selected validation profiles: ${task.validationProfileIds.join(", ") || "(none)"}`,
    ...requiresIntegrationTestGuidance ? ["- This task is expected to add or repair Playwright integration coverage and follow the listed QA guide files."] : [],
    ...isDedicatedIntegrationGapTask ? [
      `- This task belongs to the dedicated integration-test-gap pillar for scenario IDs: ${integrationScenarioLabel}.`,
      "- Confirm the matching scenario IDs are no longer uncovered in spec-coverage output, and only treat the targeted gap IDs as mandatory for this review."
    ] : [],
    "- The coordinator already runs scoped, baseline-aware validation separately.",
    "- Use the branch diff, touched-area behavior, and existing validation evidence as the primary review inputs.",
    "- Do not treat unrelated repo-wide test or build failures as blocking unless you can tie them directly to this branch or show they are new relative to baseline.",
    "- If you rerun commands, keep them scoped to the touched area whenever practical.",
    "- If the change adds or updates screenshots, confirm they come from the real Open Mercato app UI and still match the documented behavior.",
    ...task.blockers.length > 0 ? [
      "",
      "Current blockers to verify explicitly:",
      ...task.blockers.map((blocker) => `- ${blocker.reason}: ${blocker.summary} (artifact: ${blocker.artifactPath})`),
      "- Treat the blocker findings as mandatory regression checks for this review."
    ] : [],
    ...task.lastCoordinatorDecision ? [
      "",
      `Last coordinator decision: ${task.lastCoordinatorDecision.decision} ${task.lastCoordinatorDecision.rationale}`
    ] : [],
    "",
    "Output contract:",
    '- If you find blocking issues, start the final message with "[reviewer-agent] Blocking:" and list concrete findings.',
    '- If you only find minor follow-ups, start the final message with "[reviewer-agent] Non-blocking:".',
    '- If the change is ready, start the final message with "[reviewer-agent] Ready:".',
    "",
    "Do not write coordinator state directly."
  ].join("\n");
}
export {
  writeTaskContext
};
//# sourceMappingURL=context.js.map
