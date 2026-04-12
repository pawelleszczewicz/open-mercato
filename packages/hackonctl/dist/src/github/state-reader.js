async function fetchPRState(github, owner, repo, prNumber) {
  const [pr, reviews] = await Promise.all([
    github.getPullRequest({ owner, repo, number: prNumber }),
    github.getPullRequestReviews({ owner, repo, number: prNumber })
  ]);
  return { pr, reviews };
}
function getLatestReview(reviews) {
  const actionable = reviews.filter(
    (r) => r.state === "APPROVED" || r.state === "CHANGES_REQUESTED"
  );
  if (actionable.length === 0) return null;
  return actionable.sort((a, b) => {
    const dateA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
    const dateB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
    return dateB - dateA;
  })[0];
}
function hasMaintainerApproval(reviews) {
  const maintainerRoles = ["COLLABORATOR", "MEMBER", "OWNER"];
  return reviews.some(
    (r) => r.state === "APPROVED" && maintainerRoles.includes(r.author_association)
  );
}
async function fetchAllOpenPRs(github, owner, repo, baseBranch) {
  const allPRs = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const batch = await github.listPullRequests({
      owner,
      repo,
      state: "open",
      base: baseBranch,
      page,
      perPage
    });
    allPRs.push(...batch);
    if (batch.length < perPage) break;
    page++;
  }
  return allPRs;
}
async function fetchRecentClosedPRs(github, owner, repo, limit = 50) {
  return github.listPullRequests({
    owner,
    repo,
    state: "closed",
    perPage: Math.min(limit, 100)
  });
}
export {
  fetchAllOpenPRs,
  fetchPRState,
  fetchRecentClosedPRs,
  getLatestReview,
  hasMaintainerApproval
};
//# sourceMappingURL=state-reader.js.map
