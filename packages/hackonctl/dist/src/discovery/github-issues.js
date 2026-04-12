const BUG_LABELS = ["bug", "fix", "defect", "regression"];
const DOC_LABELS = ["documentation", "docs"];
const TEST_LABELS = ["test", "testing", "coverage"];
function classifyIssue(issue) {
  const labelNames = issue.labels.map((l) => l.name.toLowerCase());
  const titleLower = issue.title.toLowerCase();
  if (labelNames.some((l) => DOC_LABELS.includes(l)) || titleLower.startsWith("docs:")) {
    return { lane: "docs", risk: "green", classes: ["docs"], points: 2 };
  }
  if (labelNames.some((l) => TEST_LABELS.includes(l)) || titleLower.startsWith("test:")) {
    return { lane: "tests", risk: "green", classes: ["tests"], points: 3 };
  }
  const isCritical = labelNames.includes("critical") || labelNames.includes("security");
  if (labelNames.some((l) => BUG_LABELS.includes(l)) || titleLower.startsWith("bug:") || titleLower.startsWith("fix:")) {
    if (isCritical) {
      return { lane: "experimental", risk: "red", classes: ["critical_bugfix"], points: 10 };
    }
    return { lane: "simple_bugs", risk: "green", classes: ["bugfix"], points: 5 };
  }
  return { lane: "simple_bugs", risk: "yellow", classes: ["bugfix"], points: 5 };
}
async function discoverGithubIssues(github, owner, repo, filterLabels, maxCandidates) {
  const allIssues = [];
  let page = 1;
  while (allIssues.length < maxCandidates) {
    const issues = await github.listIssues({
      owner,
      repo,
      state: "open",
      labels: filterLabels.length > 0 ? filterLabels.join(",") : void 0,
      page,
      perPage: 100
    });
    if (issues.length === 0) break;
    allIssues.push(...issues);
    page++;
  }
  const unassigned = allIssues.filter((issue) => issue.assignee === null).slice(0, maxCandidates);
  const candidates = unassigned.map((issue) => {
    const classification = classifyIssue(issue);
    return {
      id: `github:${issue.number}`,
      source: "github_issue",
      title: issue.title,
      description: issue.body ?? "",
      suggestedLane: classification.lane,
      suggestedRisk: classification.risk,
      expectedClasses: classification.classes,
      expectedPoints: classification.points,
      confidence: "medium",
      metadata: { issueNumber: issue.number, labels: issue.labels.map((l) => l.name) }
    };
  });
  return {
    candidates,
    source: "github_issue",
    discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
export {
  discoverGithubIssues
};
//# sourceMappingURL=github-issues.js.map
