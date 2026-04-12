import { readPRState } from "../github/state-reader.js";
import { exec } from "../lib/shell.js";
function branchExists(branchName, cwd) {
  const result = exec(`git rev-parse --verify ${branchName}`, { cwd: cwd ?? process.cwd() });
  return result.success;
}
function derivePortalStatus(draft) {
  return draft ? "not_submitted" : "submitted";
}
function deriveJudgeStatus(draft, labels, hasMaintainerApproval) {
  if (draft) return "not_started";
  if (labels.includes("judge-rejected")) return "rejected";
  if (labels.includes("score-adjusted")) return "adjusted";
  if (hasMaintainerApproval) return "approved";
  return "pending";
}
function deriveStateFromPRState(task, prState) {
  const { pr, labels, latestReview, hasMaintainerApproval } = prState;
  if (pr.merged_at !== null) return "merged";
  if (pr.state === "closed") return "closed";
  if (!pr.draft) {
    if (labels.includes("judge-rejected")) return "judge_rejected";
    if (labels.includes("judge-approved") || hasMaintainerApproval) return "judge_approved";
    return "judge_pending";
  }
  if (latestReview?.state === "CHANGES_REQUESTED") return "changes_requested";
  if (latestReview?.state === "APPROVED") return "approved";
  return "draft";
}
async function deriveTaskState(task, github, owner, repo, cwd) {
  if (task.abandoned) {
    return { state: "abandoned", portalStatus: "not_submitted", judgeStatus: "not_started", prState: null };
  }
  if (task.prNumber === null) {
    const state2 = branchExists(task.branchName, cwd) ? "implementing" : "registered";
    return { state: state2, portalStatus: "not_submitted", judgeStatus: "not_started", prState: null };
  }
  const prState = await readPRState(github, owner, repo, task.prNumber);
  const state = deriveStateFromPRState(task, prState);
  const portalStatus = derivePortalStatus(prState.pr.draft);
  const judgeStatus = deriveJudgeStatus(prState.pr.draft, prState.labels, prState.hasMaintainerApproval);
  return { state, portalStatus, judgeStatus, prState };
}
export {
  branchExists,
  deriveJudgeStatus,
  derivePortalStatus,
  deriveStateFromPRState,
  deriveTaskState
};
//# sourceMappingURL=derive.js.map
