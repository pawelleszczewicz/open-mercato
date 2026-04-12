import { evaluateReviewGate } from "./review-state.js";
function selectJudgePendingTasks(tasks, targetId) {
  return tasks.filter((task) => task.targetId === targetId && task.state === "judge_pending" && Boolean(task.prNumber));
}
function isRejectedPullRequest(pullRequest) {
  return Boolean(pullRequest.closedAt) && !pullRequest.mergedAt && hasPullRequestLabel(pullRequest, "rejected");
}
function isDuplicatePullRequest(pullRequest) {
  return Boolean(pullRequest.closedAt) && !pullRequest.mergedAt && hasPullRequestLabel(pullRequest, "duplicate");
}
function isChangesRequestedPullRequest(pullRequest, snapshot) {
  if (pullRequest.mergedAt || pullRequest.closedAt) {
    return false;
  }
  if (hasPullRequestLabel(pullRequest, "changes-requested")) {
    return true;
  }
  if (!snapshot) {
    return false;
  }
  return evaluateReviewGate(snapshot).disposition === "changes_requested";
}
function extractLatestJudgeRejectionReason(snapshot) {
  if (!snapshot) {
    return null;
  }
  const entries = [
    ...snapshot.comments.map((comment, index) => ({
      source: "comment",
      body: comment.body.trim(),
      authorLogin: comment.authorLogin,
      createdAt: comment.createdAt,
      sortKey: buildSortKey(comment.createdAt, index)
    })),
    ...snapshot.reviews.map((review, index) => ({
      source: "review",
      body: review.body.trim(),
      authorLogin: review.authorLogin,
      createdAt: review.submittedAt,
      sortKey: buildSortKey(review.submittedAt, snapshot.comments.length + index)
    }))
  ];
  const latest = entries.filter((entry) => entry.body.length > 0 && !isCoordinatorGeneratedComment(entry.body)).sort((left, right) => right.sortKey - left.sortKey)[0];
  if (!latest) {
    return null;
  }
  return {
    source: latest.source,
    body: latest.body,
    authorLogin: latest.authorLogin,
    createdAt: latest.createdAt
  };
}
function parseJudgeDiscussionDirective(message) {
  const trimmed = message.trim();
  const agreeMatch = trimmed.match(/^\[discussion-agent\]\s+Agree:\s*([\s\S]+)$/i);
  if (agreeMatch) {
    return {
      disposition: "agree",
      body: (agreeMatch[1] ?? "").trim()
    };
  }
  const disagreeMatch = trimmed.match(/^\[discussion-agent\]\s+Disagree:\s*([\s\S]+)$/i);
  if (disagreeMatch) {
    return {
      disposition: "disagree",
      body: (disagreeMatch[1] ?? "").trim()
    };
  }
  return {
    disposition: "unknown",
    body: trimmed
  };
}
function buildSortKey(timestamp, index) {
  const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
  if (Number.isFinite(parsed)) {
    return parsed * 1e4 + index;
  }
  return index;
}
function isCoordinatorGeneratedComment(body) {
  return /^\[(reviewer|implementer|coordinator)-agent\]/i.test(body.trim());
}
function hasPullRequestLabel(pullRequest, expectedLabel) {
  const normalizedExpectedLabel = expectedLabel.trim().toLowerCase();
  return pullRequest.labels.some((label) => label.trim().toLowerCase() === normalizedExpectedLabel);
}
export {
  extractLatestJudgeRejectionReason,
  isChangesRequestedPullRequest,
  isDuplicatePullRequest,
  isRejectedPullRequest,
  parseJudgeDiscussionDirective,
  selectJudgePendingTasks
};
//# sourceMappingURL=judge-sync.js.map
