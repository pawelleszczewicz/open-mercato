async function checkDuplicates(candidate, github, owner, repo) {
  const openPRs = await getAllPRs(github, owner, repo, "open");
  const recentClosedPRs = await github.listPullRequests(owner, repo, {
    state: "closed",
    per_page: 50,
    page: 1
  });
  const allPRs = [...openPRs, ...recentClosedPRs];
  const matches = [];
  for (const pr of allPRs) {
    const reasons = [];
    if (candidate.sourceType === "github_issue") {
      if (pr.title.includes(`#${candidate.sourceId}`) || pr.body?.includes(`#${candidate.sourceId}`)) {
        reasons.push(`References issue #${candidate.sourceId}`);
      }
      if (pr.body?.includes(`issue ${candidate.sourceId}`) || pr.body?.includes(`issue #${candidate.sourceId}`)) {
        reasons.push(`Mentions issue ${candidate.sourceId}`);
      }
    }
    if (candidate.sourceType === "integration_gap") {
      if (pr.title.includes(candidate.sourceId) || pr.body?.includes(candidate.sourceId)) {
        reasons.push(`References scenario ${candidate.sourceId}`);
      }
    }
    if (candidate.sourceType === "repo_signal") {
      const signalPath = candidate.candidatePaths[0];
      if (signalPath && pr.body?.includes(signalPath)) {
        reasons.push(`References same file path: ${signalPath}`);
      }
    }
    if (normalizeTitle(pr.title) === normalizeTitle(candidate.title)) {
      reasons.push("Identical normalized title");
    }
    if (reasons.length > 0) {
      matches.push({ number: pr.number, title: pr.title, reason: reasons.join("; ") });
    }
  }
  return {
    risk: scoreRisk(matches),
    matchedPRs: matches
  };
}
async function getAllPRs(github, owner, repo, state) {
  const allPRs = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const prs = await github.listPullRequests(owner, repo, { state, per_page: perPage, page });
    allPRs.push(...prs);
    if (prs.length < perPage) break;
    page++;
  }
  return allPRs;
}
function normalizeTitle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}
function scoreRisk(matches) {
  if (matches.length === 0) return "none";
  const hasExactMatch = matches.some((m) => m.reason.includes("Identical normalized title"));
  const hasIssueRef = matches.some((m) => m.reason.includes("References issue"));
  const hasScenarioRef = matches.some((m) => m.reason.includes("References scenario"));
  if (hasExactMatch || hasIssueRef || hasScenarioRef) return "likely_duplicate";
  if (matches.length >= 2) return "medium";
  return "low";
}
export {
  checkDuplicates
};
//# sourceMappingURL=duplicates.js.map
