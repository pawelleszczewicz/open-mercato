const transitionTable = {
  discovered: ["qualified", "blocked", "duplicate_closed", "human_required", "abandoned"],
  qualified: ["workspace_prepared", "blocked", "duplicate_closed", "abandoned"],
  workspace_prepared: ["implementing", "blocked", "abandoned"],
  implementing: ["validating", "draft_pr_open", "blocked", "human_required", "abandoned"],
  validating: ["implementing", "draft_pr_open", "blocked", "changes_requested", "abandoned"],
  draft_pr_open: ["review_in_progress", "changes_requested", "validating", "blocked", "abandoned"],
  review_in_progress: ["changes_requested", "review_complete", "human_required", "blocked", "abandoned"],
  changes_requested: ["implementing", "validating", "abandoned"],
  review_complete: ["ready_pr", "judge_pending", "blocked", "human_required", "abandoned"],
  ready_pr: ["awaiting_portal_submission", "blocked", "human_required", "abandoned"],
  human_required: ["qualified", "implementing", "review_in_progress", "ready_pr", "blocked", "abandoned"],
  awaiting_portal_submission: ["portal_submitted", "human_required", "abandoned"],
  portal_submitted: ["judge_pending", "human_required", "abandoned"],
  judge_pending: ["changes_requested", "judge_approved", "judge_adjusted", "judge_rejected", "human_required", "duplicate_closed", "abandoned"],
  judge_approved: [],
  judge_adjusted: [],
  judge_rejected: [],
  blocked: ["qualified", "implementing", "validating", "review_in_progress", "ready_pr", "human_required", "duplicate_closed", "abandoned"],
  duplicate_closed: [],
  abandoned: []
};
function canTransition(from, to) {
  return transitionTable[from].includes(to);
}
function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid state transition: ${from} -> ${to}`);
  }
}
export {
  assertTransition,
  canTransition
};
//# sourceMappingURL=transitions.js.map
