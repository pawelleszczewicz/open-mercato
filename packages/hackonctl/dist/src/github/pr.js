function buildPRBody(params) {
  const { task, summary, changedFiles, gateResults, review } = params;
  const sourceLabel = task.source.type === "github_issue" ? `GitHub issue #${task.source.id}` : task.source.type === "integration_gap" ? `Integration test gap: ${task.source.id}` : `Repository signal: ${task.source.id}`;
  const fileList = changedFiles.slice(0, 20).map((f) => `- \`${f}\``).join("\n");
  const moreFiles = changedFiles.length > 20 ? `
- ... and ${changedFiles.length - 20} more files` : "";
  const diff = gateResults.diffStats;
  const diffSummary = `+${diff.linesAdded} / -${diff.linesRemoved} (${diff.totalLines} total lines, ${diff.filesChanged} files)`;
  const gateList = gateResults.results.map(
    (r) => `- ${r.passed ? "PASS" : "FAIL"} ${r.gate} (${r.duration}ms)`
  ).join("\n");
  const sections = [];
  sections.push(`Source: ${sourceLabel} \u2014 ${task.source.title}`);
  sections.push("");
  sections.push("## Summary");
  sections.push(summary);
  sections.push("");
  sections.push("## Changes");
  sections.push(`${fileList}${moreFiles}`);
  sections.push(`- Diff: ${diffSummary}`);
  if (review) {
    sections.push("");
    sections.push("## Review Summary");
    sections.push(`- Rounds: ${review.rounds}${review.rounds > 1 ? ` \u2014 ${formatConcernsSummary(review.concerns)}` : ""}`);
    sections.push(`- Concerns raised: ${review.concerns.length === 0 ? "None" : review.concerns.join("; ")}`);
    sections.push(`- Reviewer verdict: ${review.verdict === "approved" ? "Approved" : "Approved with notes"}`);
    sections.push(`- Confidence: ${capitalize(review.confidence)}`);
    if (review.notes) {
      sections.push(`- Notes: ${review.notes}`);
    }
  }
  sections.push("");
  sections.push("## Validation");
  sections.push(gateList);
  sections.push("");
  sections.push("## Expected Contribution Classes");
  sections.push(task.expectedClasses.map((c) => `- ${c}`).join("\n"));
  return sections.join("\n") + "\n";
}
function formatConcernsSummary(concerns) {
  if (concerns.length === 0) return "clean on first pass";
  if (concerns.length === 1) return `fixed: ${concerns[0]}`;
  return `fixed ${concerns.length} issues`;
}
function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
async function createDraftPR(github, config, task, body) {
  const title = formatPRTitle(task);
  return github.createPullRequest(
    config.github.upstreamOwner,
    config.github.upstreamRepo,
    {
      title,
      body,
      head: `${config.github.forkOwner}:${task.branchName}`,
      base: config.github.baseBranch,
      draft: true
    }
  );
}
function formatPRTitle(task) {
  const prefixMap = {
    bugfix: "fix",
    critical_bugfix: "fix",
    tests: "tests",
    docs: "docs"
  };
  const prefix = prefixMap[task.expectedClasses[0]] ?? "chore";
  return `${prefix}: ${task.source.title}`;
}
export {
  buildPRBody,
  createDraftPR,
  formatPRTitle
};
//# sourceMappingURL=pr.js.map
