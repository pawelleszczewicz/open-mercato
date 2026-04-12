import { getLatestReview, hasMaintainerApproval } from "../github/state-reader.js";
function derivePortalStatus(pr) {
  return pr.draft ? "not_submitted" : "submitted";
}
function deriveJudgeStatus(pr, reviews) {
  if (pr.draft) return "not_started";
  const labelNames = pr.labels.map((l) => l.name);
  if (labelNames.includes("judge-rejected")) return "rejected";
  if (labelNames.includes("score-adjusted")) return "adjusted";
  if (hasMaintainerApproval(reviews)) return "approved";
  return "pending";
}
function deriveState(input) {
  const { task, pr, reviews, branchExists } = input;
  if (task.abandoned) return "abandoned";
  if (task.prNumber === null || pr === null) {
    return branchExists ? "implementing" : "registered";
  }
  if (pr.merged_at !== null) return "merged";
  if (pr.state === "closed") return "closed";
  const labelNames = pr.labels.map((l) => l.name);
  if (!pr.draft) {
    if (labelNames.includes("judge-rejected")) return "judge_rejected";
    if (labelNames.includes("judge-approved") || hasMaintainerApproval(reviews)) {
      return "judge_approved";
    }
    return "judge_pending";
  }
  const latestReview = getLatestReview(reviews);
  if (latestReview?.state === "CHANGES_REQUESTED") return "changes_requested";
  if (latestReview?.state === "APPROVED") return "approved";
  return "draft";
}
export {
  deriveJudgeStatus,
  derivePortalStatus,
  deriveState
};
//# sourceMappingURL=derive.js.map
