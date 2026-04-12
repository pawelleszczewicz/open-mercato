function generateReviewerPrompt(task, prNumber) {
  return `# Review: PR #${prNumber} \u2014 ${task.source.title}

## Task Context
- Task ID: ${task.taskId}
- Lane: ${task.lane}
- Risk: ${task.riskZone}
- Expected classes: ${task.expectedClasses.join(", ")}

## Review Checklist
1. Does the change address the stated problem?
2. Is the diff minimal and focused?
3. Are there any unintended side effects?
4. Does it follow the repository's coding conventions (see AGENTS.md)?
5. Are tests included where appropriate?
6. Is the PR description accurate?

## For Bug Fixes
- Is the root cause identified and fixed (not just symptoms)?
- Is there a test that reproduces the original bug?

## For Tests
- Do the tests actually assert meaningful behavior?
- Are tests deterministic and independent?
- Do they follow existing test patterns?

## For Docs
- Is the content accurate and clear?
- Are links valid?
- Is formatting consistent with existing docs?

## Output
Post your review as a GitHub PR review using the [reviewer-agent] prefix.
If changes are needed, use "REQUEST_CHANGES" with specific file/line references.
If the PR is good, use "APPROVE".
`;
}
export {
  generateReviewerPrompt
};
//# sourceMappingURL=reviewer.js.map
