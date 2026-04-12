function checkDuplicate(candidate, openPRs, recentClosedPRs) {
  const allPRs = [...openPRs, ...recentClosedPRs];
  if (candidate.source === "github_issue") {
    const issueNumber = candidate.metadata.issueNumber;
    const matchByIssue = allPRs.filter((pr) => {
      const bodyMention = pr.body?.includes(`#${issueNumber}`) ?? false;
      const titleMention = pr.title.includes(`#${issueNumber}`);
      const branchMention = pr.head.ref.includes(String(issueNumber));
      return bodyMention || titleMention || branchMention;
    });
    if (matchByIssue.length > 0) {
      return {
        risk: "likely_duplicate",
        matchedPRs: matchByIssue.map((pr) => pr.number),
        reason: `Issue #${issueNumber} is already referenced in PR(s): ${matchByIssue.map((pr) => `#${pr.number}`).join(", ")}`
      };
    }
  }
  if (candidate.source === "integration_gap") {
    const scenarioId = candidate.metadata.scenarioId;
    const matchByScenario = allPRs.filter((pr) => {
      return pr.title.includes(scenarioId) || (pr.body?.includes(scenarioId) ?? false);
    });
    if (matchByScenario.length > 0) {
      return {
        risk: "likely_duplicate",
        matchedPRs: matchByScenario.map((pr) => pr.number),
        reason: `Scenario ${scenarioId} already covered in PR(s): ${matchByScenario.map((pr) => `#${pr.number}`).join(", ")}`
      };
    }
  }
  const titleWords = candidate.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const titleMatches = allPRs.filter((pr) => {
    const prTitleLower = pr.title.toLowerCase();
    const matchCount = titleWords.filter((word) => prTitleLower.includes(word)).length;
    return matchCount >= titleWords.length * 0.6;
  });
  if (titleMatches.length > 0) {
    return {
      risk: "medium",
      matchedPRs: titleMatches.map((pr) => pr.number),
      reason: `Title similarity with PR(s): ${titleMatches.map((pr) => `#${pr.number}`).join(", ")}`
    };
  }
  return { risk: "none", matchedPRs: [], reason: "" };
}
export {
  checkDuplicate
};
//# sourceMappingURL=duplicates.js.map
