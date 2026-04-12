import { globToRegExp, normalizePath } from "./strings.js";
function getLaneGuardrail(config, lane) {
  return config.policy.laneGuardrails[lane];
}
function evaluateChangePolicy(guardrail, summary) {
  const reasons = [];
  if (summary.changedFiles.length > guardrail.maxChangedFiles) {
    reasons.push(`Changed file count ${summary.changedFiles.length} exceeds limit ${guardrail.maxChangedFiles}.`);
  }
  if (summary.totalDiffLines > guardrail.maxDiffLines) {
    reasons.push(`Diff line count ${summary.totalDiffLines} exceeds limit ${guardrail.maxDiffLines}.`);
  }
  const forbiddenMatches = summary.changedFiles.filter(
    (filePath) => guardrail.forbiddenPathPatterns.some((pattern) => globToRegExp(pattern).test(normalizePath(filePath)))
  );
  if (forbiddenMatches.length > 0) {
    reasons.push(`Forbidden path changes detected: ${forbiddenMatches.join(", ")}.`);
  }
  return {
    status: reasons.length > 0 ? "blocked" : "passed",
    reasons,
    summary: {
      ...summary,
      changedFiles: [...summary.changedFiles].sort()
    }
  };
}
export {
  evaluateChangePolicy,
  getLaneGuardrail
};
//# sourceMappingURL=change-policy.js.map
