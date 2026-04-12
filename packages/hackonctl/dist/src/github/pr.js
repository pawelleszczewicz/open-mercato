import { getWorktreeDiffStats } from "../gates/diff-check.js";
function buildPRBody(params) {
  const { task, summary, worktreePath, baseBranch, gateResults } = params;
  const sourceLabel = task.source.type === "github_issue" ? `GitHub issue #${task.source.id}` : task.source.type === "integration_gap" ? `Integration test gap: ${task.source.id}` : `Repository signal: ${task.source.id}`;
  const diffStats = getWorktreeDiffStats(worktreePath, baseBranch);
  const fileList = diffStats.files.map((f) => `- ${f}`).join("\n");
  const validationSection = gateResults && gateResults.length > 0 ? gateResults.map((g) => `- ${g}`).join("\n") : "- (pending)";
  return `Source: ${sourceLabel}

## Summary
${summary}

## Changes
${fileList}
- Diff: +${diffStats.additions} / -${diffStats.deletions} (${diffStats.totalLines} total lines)

## Validation
${validationSection}

## Expected Contribution Classes
${task.expectedClasses.map((c) => `- ${c}`).join("\n")}
`;
}
async function createDraftPR(github, config, task, body) {
  const head = `${config.github.forkOwner}:${task.branchName}`;
  return github.createPullRequest({
    owner: config.github.upstreamOwner,
    repo: config.github.upstreamRepo,
    title: task.source.title,
    body,
    head,
    base: config.github.baseBranch,
    draft: true
  });
}
async function markPRReady(github, config, prNumber) {
  return github.updatePullRequest({
    owner: config.github.upstreamOwner,
    repo: config.github.upstreamRepo,
    number: prNumber,
    draft: false
  });
}
export {
  buildPRBody,
  createDraftPR,
  markPRReady
};
//# sourceMappingURL=pr.js.map
