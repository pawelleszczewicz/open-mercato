import { activeTaskStates } from "./types.js";
import { normalizePath, titleSimilarity } from "./strings.js";
async function runDuplicateCheck(candidate, options) {
  const signals = [];
  signals.push(...scoreLocalTasks(candidate, options.localTasks));
  const upstreamPrs = options.upstreamPullRequests ?? (options.githubProvider && await options.githubProvider.isAvailable(options.target) ? await options.githubProvider.searchPotentialDuplicatePullRequests(
    options.target,
    candidate.sourceType === "github_issue" ? Number.parseInt(candidate.sourceId, 10) : null
  ) : null);
  if (upstreamPrs) {
    signals.push(...scorePullRequests(candidate, upstreamPrs));
  }
  return {
    duplicateRiskClass: summarizeDuplicateRisk(signals),
    signals
  };
}
function summarizeDuplicateRisk(signals) {
  if (signals.some((signal) => signal.duplicateRiskClass === "hard_duplicate")) {
    return "hard_duplicate";
  }
  if (signals.some((signal) => signal.duplicateRiskClass === "likely_duplicate")) {
    return "likely_duplicate";
  }
  if (signals.some((signal) => signal.duplicateRiskClass === "split_risk")) {
    return "split_risk";
  }
  return "none";
}
function scoreLocalTasks(candidate, localTasks) {
  const activeTasks = localTasks.filter((task) => activeTaskStates.has(task.state) && !(task.state === "blocked" && task.duplicateRiskClass === "split_risk"));
  const signals = [];
  for (const task of activeTasks) {
    if (task.taskId === candidate.taskId) {
      continue;
    }
    if (task.sourceType === candidate.sourceType && task.sourceId === candidate.sourceId) {
      signals.push({
        kind: "local-same-source",
        duplicateRiskClass: "hard_duplicate",
        summary: `Local active task ${task.taskId} already owns the same source (${candidate.sourceType}:${candidate.sourceId}).`,
        source: "local",
        relatedTaskId: task.taskId,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        overlapPaths: sharedPaths(candidate.candidatePaths, task.candidatePaths)
      });
      continue;
    }
    if (candidate.contributionGroupId && task.contributionGroupId && candidate.contributionGroupId === task.contributionGroupId) {
      signals.push({
        kind: "local-contribution-group",
        duplicateRiskClass: "split_risk",
        summary: `Local task ${task.taskId} is already assigned to contribution group ${candidate.contributionGroupId}.`,
        source: "local",
        relatedTaskId: task.taskId,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        overlapPaths: sharedPaths(candidate.candidatePaths, task.candidatePaths)
      });
    }
    const overlap = sharedPaths(candidate.candidatePaths, task.candidatePaths);
    if (overlap.length > 0) {
      const riskClass = overlap.length >= 2 ? "likely_duplicate" : "split_risk";
      signals.push({
        kind: "local-path-overlap",
        duplicateRiskClass: riskClass,
        summary: `Local active task ${task.taskId} overlaps changed paths (${overlap.join(", ")}).`,
        source: "local",
        relatedTaskId: task.taskId,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        overlapPaths: overlap
      });
    }
    if (task.branchName && candidate.branchName && task.branchName === candidate.branchName) {
      signals.push({
        kind: "local-branch-name",
        duplicateRiskClass: "hard_duplicate",
        summary: `Local active task ${task.taskId} already uses branch ${candidate.branchName}.`,
        source: "local",
        relatedTaskId: task.taskId,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        overlapPaths: []
      });
    }
  }
  return dedupeSignals(signals);
}
function scorePullRequests(candidate, pullRequests) {
  const signals = [];
  const issueReference = candidate.sourceType === "github_issue" ? `#${candidate.sourceId}` : null;
  for (const pullRequest of pullRequests) {
    if (candidate.branchName && pullRequest.headRefName && candidate.branchName === pullRequest.headRefName) {
      continue;
    }
    const overlap = sharedPaths(candidate.candidatePaths, pullRequest.files.map((file) => file.path));
    const similarity = titleSimilarity(candidate.sourceTitle, pullRequest.title);
    const issueLinked = issueReference ? hasExactIssueReference(pullRequest.title, candidate.sourceId) || hasExactIssueReference(pullRequest.body ?? "", candidate.sourceId) : false;
    const merged = Boolean(pullRequest.mergedAt);
    const closed = !merged && Boolean(pullRequest.closedAt);
    if (issueLinked && merged) {
      signals.push({
        kind: "upstream-merged-issue",
        duplicateRiskClass: "hard_duplicate",
        summary: `Merged upstream PR #${pullRequest.number} already references ${issueReference}.`,
        source: "github",
        relatedTaskId: null,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        overlapPaths: overlap
      });
      continue;
    }
    if (issueLinked && pullRequest.state.toUpperCase() === "OPEN") {
      signals.push({
        kind: "upstream-open-issue",
        duplicateRiskClass: "likely_duplicate",
        summary: `Open upstream PR #${pullRequest.number} already references ${issueReference}.`,
        source: "github",
        relatedTaskId: null,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        overlapPaths: overlap
      });
      continue;
    }
    if (similarity >= 0.75 && merged) {
      if (!shouldTreatTitleSimilarityAsDuplicate(candidate.sourceTitle, pullRequest.title, overlap)) {
        continue;
      }
      signals.push({
        kind: "upstream-merged-similarity",
        duplicateRiskClass: "hard_duplicate",
        summary: `Merged upstream PR #${pullRequest.number} is strongly similar to this task title.`,
        source: "github",
        relatedTaskId: null,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        overlapPaths: overlap
      });
      continue;
    }
    if (similarity >= 0.6 && pullRequest.state.toUpperCase() === "OPEN") {
      if (!shouldTreatTitleSimilarityAsDuplicate(candidate.sourceTitle, pullRequest.title, overlap)) {
        continue;
      }
      signals.push({
        kind: "upstream-open-similarity",
        duplicateRiskClass: "likely_duplicate",
        summary: `Open upstream PR #${pullRequest.number} is strongly similar to this task title.`,
        source: "github",
        relatedTaskId: null,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        overlapPaths: overlap
      });
      continue;
    }
    if (overlap.length >= 2 && !closed) {
      signals.push({
        kind: "upstream-path-overlap",
        duplicateRiskClass: "likely_duplicate",
        summary: `Upstream PR #${pullRequest.number} overlaps the predicted changed area.`,
        source: "github",
        relatedTaskId: null,
        prNumber: pullRequest.number,
        prUrl: pullRequest.url,
        overlapPaths: overlap
      });
    }
  }
  return dedupeSignals(signals);
}
function sharedPaths(left, right) {
  const rightSet = new Set(right.map(normalizePath));
  return [...new Set(left.map(normalizePath).filter((value) => rightSet.has(value)))];
}
function shouldTreatTitleSimilarityAsDuplicate(candidateTitle, pullRequestTitle, overlapPaths) {
  if (overlapPaths.length > 0) {
    return true;
  }
  return !(isGenericLowLevelCoverageTitle(candidateTitle) && isGenericLowLevelCoverageTitle(pullRequestTitle));
}
function hasExactIssueReference(text, issueId) {
  return new RegExp(`#${escapeRegExp(issueId)}(?!\\d)`, "i").test(text);
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function isGenericLowLevelCoverageTitle(title) {
  return /^tests:\s+add low-level coverage for\s+/i.test(title.trim());
}
function dedupeSignals(signals) {
  const seen = /* @__PURE__ */ new Set();
  return signals.filter((signal) => {
    const key = `${signal.kind}:${signal.relatedTaskId ?? "na"}:${signal.prNumber ?? "na"}:${signal.summary}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
export {
  runDuplicateCheck,
  summarizeDuplicateRisk
};
//# sourceMappingURL=duplicates.js.map
