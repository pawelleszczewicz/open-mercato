async function readPRState(github, owner, repo, prNumber) {
  const pr = await github.getPullRequest(owner, repo, prNumber);
  const reviews = await github.getPullRequestReviews(owner, repo, prNumber);
  const labels = pr.labels.map((l) => l.name);
  const significantReviews = reviews.filter((r) => r.state !== "PENDING" && r.state !== "COMMENTED" && r.submitted_at !== null).sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
  const latestReview = significantReviews[0] ?? null;
  const maintainerAssociations = ["OWNER", "MEMBER", "COLLABORATOR"];
  const hasMaintainerApproval = significantReviews.some(
    (r) => r.state === "APPROVED" && maintainerAssociations.includes(r.author_association)
  );
  return { pr, reviews, labels, latestReview, hasMaintainerApproval };
}
export {
  readPRState
};
//# sourceMappingURL=state-reader.js.map
