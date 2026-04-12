import { matchAreaRules, getTargetById } from "./area-rules.js";
import { extractCandidatePaths, extractEvidence, inferContributionClasses } from "./discovery.js";
import { runDuplicateCheck } from "./duplicates.js";
import { splitCommaList, slugify } from "./strings.js";
async function qualifyTask(request, options) {
  const target = getTargetById(options.config, request.targetId);
  const parsedSource = parseSource(request.issueOrSignal);
  const issueNumber = parsedSource.sourceType === "github_issue" ? Number.parseInt(parsedSource.sourceId, 10) : null;
  const issue = issueNumber && options.githubProvider && await options.githubProvider.isAvailable(target) ? await options.githubProvider.getIssue(target, issueNumber) : null;
  let sourceTitle = request.sourceTitle?.trim();
  if (!sourceTitle) {
    sourceTitle = issue?.title;
  }
  if (!sourceTitle) {
    throw new Error("Qualification requires --title when the source title cannot be resolved from GitHub.");
  }
  const sourceEvidence = request.sourceEvidence.length > 0 ? splitCommaList(request.sourceEvidence) : issue ? extractEvidence(issue) : [];
  const candidatePaths = request.candidatePaths.length > 0 ? splitCommaList(request.candidatePaths) : issue ? extractCandidatePaths(issue) : [];
  const expectedContributionClasses = request.expectedContributionClasses.length > 0 ? splitCommaList(request.expectedContributionClasses) : issue ? inferContributionClasses(issue) : [];
  if (parsedSource.sourceType === "repo_signal") {
    if (sourceEvidence.length === 0) {
      throw new Error("Signal-backed tasks require explicit --evidence.");
    }
    if (candidatePaths.length === 0) {
      throw new Error("Signal-backed tasks require explicit --path values.");
    }
  }
  const selection = matchAreaRules(target, candidatePaths, sourceTitle, expectedContributionClasses);
  const taskId = await options.stateStore.nextTaskId();
  const contributionGroupId = request.contributionGroupId?.trim() || defaultContributionGroup(parsedSource.sourceType, parsedSource.sourceId, candidatePaths);
  const branchName = buildBranchName(selection.lane, taskId, sourceTitle);
  const discoveredTask = {
    taskId,
    targetId: request.targetId,
    sourceType: parsedSource.sourceType,
    sourceId: parsedSource.sourceId,
    sourceTitle,
    sourceEvidence,
    candidatePaths,
    expectedContributionClasses: selection.expectedContributionClasses,
    lane: selection.lane,
    riskZone: selection.riskZone,
    state: "discovered",
    duplicateRiskClass: "none",
    duplicateSignals: [],
    primaryAreaOwners: selection.primaryAreaOwners,
    validationProfileIds: selection.validationProfileIds,
    worktreePath: null,
    branchName,
    prNumber: null,
    prUrl: null,
    contributionGroupId,
    portalStatus: "not_started",
    judgeStatus: "not_started",
    blockers: [],
    lastCoordinatorDecision: null,
    differentiationNote: request.differentiationNote ?? null,
    eventLog: [
      {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        type: "task.discovered",
        message: `Task ${taskId} discovered from ${parsedSource.sourceType}:${parsedSource.sourceId}.`,
        artifactRefs: []
      }
    ],
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const duplicateCheck = await runDuplicateCheck({
    taskId,
    sourceType: discoveredTask.sourceType,
    sourceId: discoveredTask.sourceId,
    sourceTitle: discoveredTask.sourceTitle,
    sourceEvidence: discoveredTask.sourceEvidence,
    candidatePaths: discoveredTask.candidatePaths,
    contributionGroupId,
    branchName
  }, {
    target,
    localTasks: await options.stateStore.listTasks(),
    githubProvider: options.githubProvider ?? null
  });
  let finalState = "qualified";
  let decision = "Qualified for coordinator workflow.";
  if (duplicateCheck.duplicateRiskClass === "hard_duplicate") {
    finalState = "duplicate_closed";
    decision = "Closed as a hard duplicate.";
  } else if (duplicateCheck.duplicateRiskClass !== "none") {
    if (!request.allowDuplicateRisk) {
      finalState = "blocked";
      decision = "Blocked pending human override due to duplicate risk.";
    } else if (!request.differentiationNote?.trim()) {
      finalState = "blocked";
      decision = "Blocked because duplicate-risk override requires a differentiation note.";
    } else {
      decision = "Qualified with explicit human override for duplicate risk.";
    }
  }
  const task = {
    ...discoveredTask,
    state: finalState,
    duplicateRiskClass: duplicateCheck.duplicateRiskClass,
    duplicateSignals: duplicateCheck.signals,
    lastCoordinatorDecision: {
      at: (/* @__PURE__ */ new Date()).toISOString(),
      decision,
      rationale: duplicateCheck.signals.map((signal) => signal.summary).join(" ") || "No duplicate risk signals found.",
      overrideApplied: Boolean(request.allowDuplicateRisk),
      artifactRefs: []
    },
    eventLog: [
      ...discoveredTask.eventLog,
      {
        at: (/* @__PURE__ */ new Date()).toISOString(),
        type: `task.${finalState}`,
        message: decision,
        artifactRefs: []
      }
    ],
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await options.stateStore.createTask(task);
  return { task, duplicateCheck };
}
function parseSource(issueOrSignal) {
  const normalized = issueOrSignal.trim();
  const issueMatch = normalized.match(/^(?:github:|issue:|#)?(\d+)$/i);
  if (issueMatch) {
    return {
      sourceType: "github_issue",
      sourceId: issueMatch[1] ?? normalized
    };
  }
  return {
    sourceType: "repo_signal",
    sourceId: normalized
  };
}
function defaultContributionGroup(sourceType, sourceId, candidatePaths) {
  if (sourceType === "github_issue") {
    return `issue-${sourceId}`;
  }
  return candidatePaths.length > 0 ? `${sourceId}:${candidatePaths.map(slugify).join("+")}` : sourceId;
}
function buildBranchName(lane, taskId, sourceTitle) {
  const suffix = slugify(`${taskId}-${sourceTitle}`) || slugify(taskId);
  switch (lane) {
    case "docs":
      return `docs/hackon/${suffix}`;
    case "tests":
      return `test/hackon/${suffix}`;
    case "simple_bugs":
      return `fix/hackon/${suffix}`;
    case "experimental":
      return `feat/hackon/${suffix}`;
  }
}
export {
  buildBranchName,
  parseSource,
  qualifyTask
};
//# sourceMappingURL=qualification.js.map
