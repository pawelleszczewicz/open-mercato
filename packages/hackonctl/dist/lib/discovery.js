import { z } from "zod";
import path from "node:path";
import { getTargetById, matchAreaRules } from "./area-rules.js";
import { pathExists, writeJsonFileAtomic } from "./fs.js";
import { discoverRepoSignals } from "./repo-signals.js";
import { getDiscoverySnapshotPath } from "./runtime-paths.js";
import { runDuplicateCheck } from "./duplicates.js";
import { normalizePath } from "./strings.js";
import { isIntegrationScenarioGapTask } from "./task-focus.js";
import { duplicateRiskSchema, laneSchema, riskZoneSchema, sourceTypeSchema } from "./types.js";
const greenLaneValues = ["docs", "tests", "simple_bugs"];
const githubIssueSearchPageSize = 50;
const maxGitHubIssueSearchBudget = 250;
const discoveryQueryLaneSchema = z.enum(greenLaneValues);
const discoveryCandidateSchema = z.object({
  candidateId: z.string().min(1),
  targetId: z.string().min(1),
  sourceType: sourceTypeSchema,
  sourceId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceUrl: z.string().min(1),
  sourceEvidence: z.array(z.string()),
  candidatePaths: z.array(z.string()),
  expectedContributionClasses: z.array(z.string()),
  lane: laneSchema,
  riskZone: riskZoneSchema,
  primaryAreaOwners: z.array(z.string()),
  validationProfileIds: z.array(z.string()),
  duplicateRiskClass: duplicateRiskSchema,
  duplicateSignals: z.array(z.any()).default([]),
  score: z.number().int(),
  scoreReasons: z.array(z.string()),
  labels: z.array(z.string()),
  assigneeLogins: z.array(z.string()),
  comments: z.number().int().nonnegative(),
  updatedAt: z.string().nullable()
});
const discoverySnapshotSchema = z.object({
  snapshotId: z.string().min(1),
  generatedAt: z.string().min(1),
  targetId: z.string().min(1),
  lanes: z.array(discoveryQueryLaneSchema),
  limit: z.number().int().positive(),
  queries: z.array(z.object({
    lane: discoveryQueryLaneSchema,
    query: z.string().min(1)
  })),
  candidates: z.array(discoveryCandidateSchema),
  snapshotPath: z.string().min(1)
});
async function discoverCandidates(request, options) {
  const target = getTargetById(options.config, request.targetId);
  const localTasks = await options.stateStore.listTasks();
  const trackedSourceKeys = /* @__PURE__ */ new Set([
    ...localTasks.map((task) => makeDiscoverySourceKey(task.sourceType, task.sourceId)),
    ...request.excludeSourceKeys ?? []
  ]);
  const shouldDiscoverGitHubIssues = request.includeGitHubIssues !== false;
  const shouldDiscoverRepoSignals = request.includeRepoSignals !== false;
  const githubAvailable = shouldDiscoverGitHubIssues ? await options.githubProvider.isAvailable(target) : false;
  if (!githubAvailable && !shouldDiscoverRepoSignals) {
    throw new Error("GitHub provider is unavailable, so candidate discovery cannot query open issues.");
  }
  const requestedGreenLanes = request.lanes.filter((lane) => greenLaneValues.includes(lane));
  const discoveryLanes = requestedGreenLanes.length > 0 ? requestedGreenLanes : [...greenLaneValues];
  const queryPlan = buildQueryPlan(discoveryLanes);
  const rawIssueLimit = Math.min(Math.max(request.limit * 20, 100), maxGitHubIssueSearchBudget);
  const seenIssueNumbers = /* @__PURE__ */ new Set();
  const issues = [];
  if (githubAvailable) {
    for (const query of queryPlan) {
      const discoveredIssues = await discoverPaginatedGithubIssues(target, query.query, rawIssueLimit, trackedSourceKeys, seenIssueNumbers, options.githubProvider);
      issues.push(...discoveredIssues);
    }
  }
  const upstreamPullRequests = githubAvailable ? await options.githubProvider.searchPotentialDuplicatePullRequests(target, null) : [];
  const candidates = [];
  for (const issue of issues) {
    const candidate = await buildGithubIssueDiscoveryCandidate(issue, {
      target,
      localTasks,
      upstreamPullRequests
    });
    if (!discoveryLanes.includes(candidate.lane)) {
      continue;
    }
    candidates.push(candidate);
  }
  if (shouldDiscoverRepoSignals) {
    const targetClonePath = path.resolve(options.runtimePaths.repoRoot, target.clonePath);
    const repoSignals = await pathExists(targetClonePath) ? await discoverRepoSignals(targetClonePath, {
      coordinatorRepoRoot: options.runtimePaths.repoRoot,
      executor: options.executor
    }) : [];
    for (const repoSignal of repoSignals) {
      if (trackedSourceKeys.has(makeDiscoverySourceKey("repo_signal", repoSignal.sourceId))) {
        continue;
      }
      const candidate = await buildRepoSignalDiscoveryCandidate(repoSignal, {
        target,
        localTasks,
        upstreamPullRequests
      });
      if (!discoveryLanes.includes(candidate.lane)) {
        continue;
      }
      candidates.push(candidate);
    }
  }
  const rankedCandidates = candidates.sort(compareCandidates).slice(0, request.limit);
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const snapshotId = `discover-${generatedAt.replace(/[:.]/g, "-").replace(/Z$/, "Z")}`;
  const snapshotPath = getDiscoverySnapshotPath(options.runtimePaths, snapshotId);
  const snapshot = discoverySnapshotSchema.parse({
    snapshotId,
    generatedAt,
    targetId: request.targetId,
    lanes: discoveryLanes,
    limit: request.limit,
    queries: queryPlan,
    candidates: rankedCandidates,
    snapshotPath
  });
  await writeJsonFileAtomic(snapshotPath, snapshot);
  await writeJsonFileAtomic(options.runtimePaths.stateDiscoveryLatestFilePath, snapshot);
  return snapshot;
}
async function buildGithubIssueDiscoveryCandidate(issue, options) {
  const candidatePaths = extractCandidatePaths(issue);
  const expectedContributionClasses = inferContributionClasses(issue);
  const selection = refineDiscoverySelection(issue, candidatePaths, matchAreaRules(options.target, candidatePaths, issue.title, expectedContributionClasses));
  const duplicateCheck = await runDuplicateCheck({
    taskId: `DISC-${issue.number}`,
    sourceType: "github_issue",
    sourceId: String(issue.number),
    sourceTitle: issue.title,
    sourceEvidence: extractEvidence(issue),
    candidatePaths,
    contributionGroupId: `issue-${issue.number}`,
    branchName: null
  }, {
    target: options.target,
    localTasks: options.localTasks,
    upstreamPullRequests: options.upstreamPullRequests
  });
  const score = scoreCandidate(issue, selection.lane, selection.riskZone, candidatePaths, duplicateCheck);
  return discoveryCandidateSchema.parse({
    candidateId: `ISSUE-${issue.number}`,
    targetId: options.target.id,
    sourceType: "github_issue",
    sourceId: String(issue.number),
    sourceTitle: issue.title,
    sourceUrl: issue.url,
    sourceEvidence: extractEvidence(issue),
    candidatePaths,
    expectedContributionClasses: selection.expectedContributionClasses,
    lane: selection.lane,
    riskZone: selection.riskZone,
    primaryAreaOwners: selection.primaryAreaOwners,
    validationProfileIds: selection.validationProfileIds,
    duplicateRiskClass: duplicateCheck.duplicateRiskClass,
    duplicateSignals: duplicateCheck.signals,
    score: score.value,
    scoreReasons: score.reasons,
    labels: issue.labels,
    assigneeLogins: issue.assigneeLogins,
    comments: issue.comments,
    updatedAt: issue.updatedAt
  });
}
async function buildRepoSignalDiscoveryCandidate(repoSignal, options) {
  const selection = matchAreaRules(options.target, repoSignal.candidatePaths, repoSignal.sourceTitle, repoSignal.expectedContributionClasses);
  const duplicateCheck = await runDuplicateCheck({
    taskId: `DISC-${repoSignal.sourceId}`,
    sourceType: "repo_signal",
    sourceId: repoSignal.sourceId,
    sourceTitle: repoSignal.sourceTitle,
    sourceEvidence: repoSignal.sourceEvidence,
    candidatePaths: repoSignal.candidatePaths,
    contributionGroupId: repoSignal.sourceId,
    branchName: null
  }, {
    target: options.target,
    localTasks: options.localTasks,
    upstreamPullRequests: options.upstreamPullRequests
  });
  const score = scoreRepoSignalCandidate(selection.lane, selection.riskZone, repoSignal.candidatePaths, duplicateCheck, repoSignal.sourceTitle);
  return discoveryCandidateSchema.parse({
    candidateId: repoSignal.sourceId,
    targetId: options.target.id,
    sourceType: "repo_signal",
    sourceId: repoSignal.sourceId,
    sourceTitle: repoSignal.sourceTitle,
    sourceUrl: repoSignal.sourceUrl,
    sourceEvidence: repoSignal.sourceEvidence,
    candidatePaths: repoSignal.candidatePaths,
    expectedContributionClasses: selection.expectedContributionClasses,
    lane: selection.lane,
    riskZone: selection.riskZone,
    primaryAreaOwners: selection.primaryAreaOwners,
    validationProfileIds: selection.validationProfileIds,
    duplicateRiskClass: duplicateCheck.duplicateRiskClass,
    duplicateSignals: duplicateCheck.signals,
    score: score.value,
    scoreReasons: score.reasons,
    labels: [],
    assigneeLogins: [],
    comments: 0,
    updatedAt: repoSignal.updatedAt
  });
}
function buildQueryPlan(lanes) {
  const queries = [];
  for (const lane of lanes) {
    const laneQueries = lane === "docs" ? [
      "state:open label:documentation",
      "state:open label:docs",
      "state:open readme",
      'state:open "user guide"',
      'state:open "broken link" docs'
    ] : lane === "tests" ? [
      "state:open label:test",
      "state:open label:qa",
      "state:open coverage",
      'state:open "regression test"',
      'state:open "skipped test"'
    ] : [
      "state:open label:bug",
      "state:open regression",
      "state:open fix",
      "state:open typo",
      'state:open "empty state"'
    ];
    for (const query of laneQueries) {
      queries.push({ lane, query });
    }
  }
  return queries;
}
async function discoverPaginatedGithubIssues(target, query, rawIssueLimit, trackedSourceKeys, seenIssueNumbers, githubProvider) {
  const issues = [];
  const maxPages = Math.max(1, Math.ceil(rawIssueLimit / githubIssueSearchPageSize));
  for (let page = 1; page <= maxPages; page += 1) {
    const remainingBudget = rawIssueLimit - (page - 1) * githubIssueSearchPageSize;
    if (remainingBudget <= 0) {
      break;
    }
    const pageSize = Math.min(githubIssueSearchPageSize, remainingBudget);
    const discoveredIssues = await githubProvider.searchIssues(target, query, pageSize, page);
    if (discoveredIssues.length === 0) {
      break;
    }
    for (const issue of discoveredIssues) {
      if (seenIssueNumbers.has(issue.number)) {
        continue;
      }
      if (trackedSourceKeys.has(makeDiscoverySourceKey("github_issue", String(issue.number)))) {
        continue;
      }
      seenIssueNumbers.add(issue.number);
      issues.push(issue);
    }
    if (discoveredIssues.length < pageSize) {
      break;
    }
  }
  return issues;
}
function extractCandidatePaths(issue) {
  const values = /* @__PURE__ */ new Set();
  const combined = `${issue.title}
${issue.body}`;
  const pathPatterns = [
    /\b(?:README\.md|CONTRIBUTING\.md|docker-compose\.yml)\b/gi,
    /\b(?:apps|packages|docs|src)\/[A-Za-z0-9_./-]+\b/g,
    /`([^`]+?\.(?:ts|tsx|js|jsx|md|json|yml|yaml))`/g,
    /`(@open-mercato\/[a-z0-9-]+)`/g
  ];
  for (const pattern of pathPatterns) {
    for (const match of combined.matchAll(pattern)) {
      const rawValue = (match[1] ?? match[0] ?? "").trim();
      if (!rawValue) {
        continue;
      }
      if (rawValue.startsWith("@open-mercato/")) {
        values.add(normalizePath(`packages/${rawValue.replace("@open-mercato/", "")}`));
        continue;
      }
      values.add(normalizePath(rawValue.replace(/`/g, "")));
    }
  }
  return [...values].slice(0, 8);
}
function extractEvidence(issue) {
  const lines = issue.body.replace(/```[\s\S]*?```/g, " ").split("\n").map((line) => line.replace(/^[-*#>\s]+/, "").trim()).filter(Boolean).filter((line) => !/^```/.test(line));
  const evidence = [];
  for (const line of lines) {
    if (line.length < 12) {
      continue;
    }
    evidence.push(line.slice(0, 240));
    if (evidence.length >= 3) {
      break;
    }
  }
  if (evidence.length === 0) {
    evidence.push(`GitHub issue #${issue.number} requires follow-up based on its reported problem statement.`);
  }
  return evidence;
}
function inferContributionClasses(issue) {
  const classes = /* @__PURE__ */ new Set();
  const normalizedTitle = issue.title.toLowerCase();
  const normalizedBody = issue.body.toLowerCase();
  const labels = issue.labels.map((label) => label.toLowerCase());
  if (labels.some((label) => /doc|documentation/.test(label)) || /(docs?|readme|contributing|guide)/.test(normalizedTitle)) {
    classes.add("docs");
  }
  if (labels.some((label) => /test|qa/.test(label)) || /(test|coverage|assert)/.test(normalizedTitle) || /(test|coverage|assert)/.test(normalizedBody)) {
    classes.add("tests");
  }
  if (labels.some((label) => /bug/.test(label)) || /(bug|fix|broken|regression|error)/.test(normalizedTitle)) {
    classes.add("bugfix");
  }
  if (classes.size === 0) {
    classes.add("bugfix");
  }
  return [...classes];
}
function scoreCandidate(issue, lane, riskZone, candidatePaths, duplicateCheck) {
  const title = issue.title.toLowerCase();
  const body = issue.body.toLowerCase();
  const labels = issue.labels.map((label) => label.toLowerCase());
  let value = lane === "docs" ? 94 : lane === "tests" ? 90 : lane === "simple_bugs" ? 86 : 40;
  const reasons = [`Lane ${lane} base score.`];
  if (riskZone === "low") {
    value += 8;
    reasons.push("Low risk zone.");
  } else if (riskZone === "high") {
    value -= 20;
    reasons.push("High risk zone penalty.");
  }
  if (candidatePaths.length > 0) {
    value += 8;
    reasons.push("Issue references concrete paths.");
    if (candidatePaths.length === 1) {
      value += 4;
      reasons.push("Single-file or single-area scope signal.");
    }
  } else {
    value -= 8;
    reasons.push("No concrete file or module path found in the issue.");
  }
  if (lane === "docs" && labels.some((label) => /doc|documentation/.test(label))) {
    value += 10;
    reasons.push("Documentation label boosts confidence.");
  }
  if (lane === "docs" && candidatePaths.length > 0 && candidatePaths.every((candidatePath) => /\.mdx?$/i.test(candidatePath) || candidatePath.startsWith("docs/") || candidatePath.startsWith("apps/docs/"))) {
    value += 8;
    reasons.push("Docs-only path scope.");
  }
  if (issue.assigneeLogins.length > 0) {
    value -= 12;
    reasons.push("Issue is already assigned.");
  }
  if (issue.comments >= 5) {
    value -= 6;
    reasons.push("Higher discussion count suggests active churn.");
  }
  if (duplicateCheck.duplicateRiskClass === "split_risk") {
    value -= 18;
    reasons.push("Split-risk duplicate signal detected.");
  } else if (duplicateCheck.duplicateRiskClass === "likely_duplicate") {
    value -= 40;
    reasons.push("Likely-duplicate signal detected.");
  } else if (duplicateCheck.duplicateRiskClass === "hard_duplicate") {
    value = Math.min(value, -100);
    reasons.push("Hard-duplicate signal detected.");
  }
  if (/(?:^|\b)(feat:|feature|phase|refactor|implement)\b/.test(title)) {
    value -= lane === "experimental" ? 0 : 28;
    reasons.push("Feature-oriented title penalty.");
  }
  if (/^task:/.test(title)) {
    value -= 18;
    reasons.push("Task-oriented title penalty.");
  }
  if (/\bspec-\d+\b|\bimplement\b/.test(title)) {
    value -= 24;
    reasons.push("Implementation-spec scope penalty.");
  }
  if (/\bacross\b|\bentire\b|\bwhole\b|\bsystem\b/.test(title)) {
    value -= 18;
    reasons.push("Cross-cutting scope signal penalty.");
  }
  if (lane === "simple_bugs" && labels.some((label) => /framework|architecture/.test(label))) {
    value -= 10;
    reasons.push("Framework or architecture label penalty.");
  }
  if (lane === "simple_bugs" && /\bcompatibility\b|\bnext\.js\b|\besm\b|\bportal\b|\blayout\b|\bmiddleware\b|\bprovider\b|\brouter\b/.test(`${title} ${body}`)) {
    value -= 20;
    reasons.push("Architecture or runtime-coupling penalty.");
  }
  return {
    value,
    reasons
  };
}
function scoreRepoSignalCandidate(lane, riskZone, candidatePaths, duplicateCheck, sourceTitle) {
  let value = lane === "docs" ? 112 : lane === "tests" ? 114 : lane === "simple_bugs" ? 100 : 44;
  const reasons = ["Repository signal includes exact local evidence."];
  if (riskZone === "low") {
    value += 10;
    reasons.push("Low risk zone.");
  } else if (riskZone === "high") {
    value -= 18;
    reasons.push("High risk zone penalty.");
  }
  if (candidatePaths.length > 0) {
    value += 8;
    reasons.push("Repository signal points at concrete file paths.");
    if (candidatePaths.length === 1) {
      value += 4;
      reasons.push("Single-file scope signal.");
    }
  } else {
    value -= 6;
    reasons.push("Repository signal did not resolve a concrete file path.");
  }
  if (lane === "docs" && candidatePaths.length > 0 && candidatePaths.every((candidatePath) => /\.mdx?$/i.test(candidatePath) || candidatePath.startsWith("docs/") || candidatePath.startsWith("apps/docs/"))) {
    value += 8;
    reasons.push("Docs-only path scope.");
  }
  if (lane === "tests" && candidatePaths.every((candidatePath) => /(?:^|\/)(?:__tests__|tests?)\/|(?:test|spec)\.[jt]sx?$/i.test(candidatePath))) {
    value += 6;
    reasons.push("Existing test-file scope keeps the task bounded.");
  }
  if (isIntegrationScenarioGapTask({ sourceType: "repo_signal", sourceTitle, candidatePaths })) {
    value += 10;
    reasons.push("Dedicated integration-scenario gap signal.");
  }
  applyDuplicatePenalty(reasons, duplicateCheck, {
    likelyDuplicatePenalty: 36,
    splitRiskPenalty: 16
  }, (nextValue) => {
    value = nextValue;
  }, value);
  return {
    value,
    reasons
  };
}
function refineDiscoverySelection(issue, candidatePaths, selection) {
  const labels = issue.labels.map((label) => label.toLowerCase());
  const title = issue.title.toLowerCase();
  const body = issue.body.toLowerCase();
  const docsOnlyPaths = candidatePaths.length > 0 && candidatePaths.every((candidatePath) => /\.md$/i.test(candidatePath) || candidatePath.startsWith("docs/"));
  const testsOnlyPaths = candidatePaths.length > 0 && candidatePaths.every((candidatePath) => /(?:^|\/)(?:__tests__|tests?)\/|(?:test|spec)\.[jt]sx?$/i.test(candidatePath));
  const explicitDocsSignal = labels.some((label) => /doc|documentation/.test(label)) || /^docs?:/.test(title) || docsOnlyPaths;
  const explicitTestSignal = labels.some((label) => /test|qa/.test(label)) || /^tests?:/.test(title) || testsOnlyPaths;
  const explicitBugSignal = labels.some((label) => /bug/.test(label)) || /^(bug|fix|regression):/.test(title);
  const featureSignal = labels.some((label) => /feature|enhancement/.test(label)) || /^(feat|feature):/.test(title) || /\bphase\b|\brefactor\b|\bimplement\b/.test(title);
  const architectureComplexitySignals = [
    /\broot cause\b/,
    /\bsuggested fix\b/,
    /\btemplate sync\b/,
    /\bmiddleware\b/,
    /\blayout\b/,
    /\bprovider\b/,
    /\buseeffect\b/,
    /\bunmount\b/,
    /\bremount\b/
  ];
  const architectureComplexityHits = architectureComplexitySignals.filter((pattern) => pattern.test(title) || pattern.test(body)).length;
  if (selection.lane === "docs" && !explicitDocsSignal && featureSignal) {
    return {
      ...selection,
      lane: "experimental",
      riskZone: "high",
      expectedContributionClasses: selection.expectedContributionClasses.filter((value) => value !== "docs")
    };
  }
  if (selection.lane === "tests" && !explicitTestSignal && featureSignal) {
    return {
      ...selection,
      lane: "experimental",
      riskZone: "high",
      expectedContributionClasses: selection.expectedContributionClasses.filter((value) => value !== "tests")
    };
  }
  if (selection.lane === "simple_bugs" && !explicitBugSignal && featureSignal) {
    return {
      ...selection,
      lane: "experimental",
      riskZone: "high",
      expectedContributionClasses: selection.expectedContributionClasses.filter((value) => value !== "bugfix")
    };
  }
  if (selection.lane === "simple_bugs" && (architectureComplexityHits >= 3 || architectureComplexityHits >= 2 && candidatePaths.length >= 2)) {
    return {
      ...selection,
      lane: "experimental",
      riskZone: "high"
    };
  }
  return selection;
}
function compareCandidates(left, right) {
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  const leftSourcePriority = left.sourceType === "github_issue" ? 0 : 1;
  const rightSourcePriority = right.sourceType === "github_issue" ? 0 : 1;
  if (leftSourcePriority !== rightSourcePriority) {
    return leftSourcePriority - rightSourcePriority;
  }
  const leftUpdated = left.updatedAt ? Date.parse(left.updatedAt) : 0;
  const rightUpdated = right.updatedAt ? Date.parse(right.updatedAt) : 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }
  return left.sourceTitle.localeCompare(right.sourceTitle);
}
function parseDiscoveryLanes(values) {
  const parsed = values.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed.map((value) => laneSchema.parse(value)) : [...greenLaneValues];
}
function summarizeDiscoveryCandidate(candidate) {
  return [
    candidate.candidateId,
    String(candidate.score),
    candidate.lane,
    candidate.duplicateRiskClass,
    candidate.sourceType === "github_issue" ? `#${candidate.sourceId}` : candidate.sourceId,
    candidate.sourceTitle
  ].join("	");
}
function buildDiscoveryQualificationHint(candidate) {
  if (candidate.sourceType === "github_issue") {
    return `hackonctl qualify github:${candidate.sourceId}`;
  }
  const parts = [
    "hackonctl qualify",
    escapeCliValue(candidate.sourceId),
    "--title",
    escapeCliValue(candidate.sourceTitle),
    ...candidate.sourceEvidence.flatMap((evidence) => ["--evidence", escapeCliValue(evidence)]),
    ...candidate.candidatePaths.flatMap((candidatePath) => ["--path", escapeCliValue(candidatePath)]),
    ...candidate.expectedContributionClasses.flatMap((contributionClass) => ["--class", escapeCliValue(contributionClass)])
  ];
  return parts.join(" ");
}
function makeDiscoverySourceKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}
function applyDuplicatePenalty(reasons, duplicateCheck, penalties, setValue, currentValue) {
  if (duplicateCheck.duplicateRiskClass === "split_risk") {
    setValue(currentValue - penalties.splitRiskPenalty);
    reasons.push("Split-risk duplicate signal detected.");
    return;
  }
  if (duplicateCheck.duplicateRiskClass === "likely_duplicate") {
    setValue(currentValue - penalties.likelyDuplicatePenalty);
    reasons.push("Likely-duplicate signal detected.");
    return;
  }
  if (duplicateCheck.duplicateRiskClass === "hard_duplicate") {
    setValue(Math.min(currentValue, -100));
    reasons.push("Hard-duplicate signal detected.");
  }
}
function escapeCliValue(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
export {
  buildDiscoveryQualificationHint,
  discoverCandidates,
  discoverySnapshotSchema,
  extractCandidatePaths,
  extractEvidence,
  inferContributionClasses,
  makeDiscoverySourceKey,
  parseDiscoveryLanes,
  summarizeDiscoveryCandidate
};
//# sourceMappingURL=discovery.js.map
