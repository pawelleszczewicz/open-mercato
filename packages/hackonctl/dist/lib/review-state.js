function parseReviewerDirective(message) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "none";
  }
  if (/^\[reviewer-agent\]\s+Blocking:/i.test(trimmed)) {
    return "blocking";
  }
  if (/^\[reviewer-agent\]\s+Non-blocking:/i.test(trimmed)) {
    return "non_blocking";
  }
  if (/^\[reviewer-agent\]\s+Ready:/i.test(trimmed)) {
    return "ready";
  }
  return "unknown";
}
function evaluateReviewGate(snapshot) {
  const latestReviewerDirective = findLatestReviewerDirective(snapshot.comments);
  const unresolvedThreads = snapshot.reviewThreads.filter((thread) => !thread.isResolved && !thread.isOutdated);
  const disputedThreadCount = unresolvedThreads.filter((thread) => isDisputedThread(thread)).length;
  const requestedChangesReviewActive = (snapshot.reviewDecision ?? "").toUpperCase() === "CHANGES_REQUESTED";
  if (disputedThreadCount > 0) {
    return {
      disposition: "human_required",
      summary: `Found ${disputedThreadCount} disputed unresolved review thread(s).`,
      latestReviewerDirective,
      requestedChangesReviewActive,
      unresolvedThreadCount: unresolvedThreads.length,
      disputedThreadCount
    };
  }
  if (requestedChangesReviewActive || latestReviewerDirective === "blocking" || unresolvedThreads.length > 0) {
    const reasons = [];
    if (requestedChangesReviewActive) {
      reasons.push("GitHub review state is CHANGES_REQUESTED.");
    }
    if (latestReviewerDirective === "blocking") {
      reasons.push("The latest reviewer-agent PR comment is blocking.");
    }
    if (unresolvedThreads.length > 0) {
      reasons.push(`There are ${unresolvedThreads.length} unresolved non-outdated review thread(s).`);
    }
    return {
      disposition: "changes_requested",
      summary: reasons.join(" "),
      latestReviewerDirective,
      requestedChangesReviewActive,
      unresolvedThreadCount: unresolvedThreads.length,
      disputedThreadCount
    };
  }
  return {
    disposition: "ready",
    summary: "No unresolved blocking review signals remain.",
    latestReviewerDirective,
    requestedChangesReviewActive,
    unresolvedThreadCount: unresolvedThreads.length,
    disputedThreadCount
  };
}
function findLatestReviewerDirective(comments) {
  let directive = "none";
  for (const comment of comments) {
    const nextDirective = parseReviewerDirective(comment.body);
    if (nextDirective !== "none" && nextDirective !== "unknown") {
      directive = nextDirective;
    }
  }
  return directive;
}
function isDisputedThread(thread) {
  const blockingIndexes = thread.comments.map((comment, index) => ({ directive: parseReviewerDirective(comment.body), index })).filter((entry) => entry.directive === "blocking");
  if (blockingIndexes.length === 0) {
    return false;
  }
  const lastBlockingIndex = blockingIndexes[blockingIndexes.length - 1]?.index ?? -1;
  if (lastBlockingIndex < 0) {
    return false;
  }
  const laterComments = thread.comments.slice(lastBlockingIndex + 1);
  if (laterComments.length === 0) {
    return false;
  }
  const hasResolution = laterComments.some((comment) => {
    const directive = parseReviewerDirective(comment.body);
    return directive === "ready" || directive === "non_blocking";
  });
  if (hasResolution) {
    return false;
  }
  return laterComments.some((comment) => {
    const trimmed = comment.body.trim();
    if (!trimmed) {
      return false;
    }
    if (/^\[reviewer-agent\]/i.test(trimmed)) {
      return false;
    }
    return true;
  });
}
export {
  evaluateReviewGate,
  parseReviewerDirective
};
//# sourceMappingURL=review-state.js.map
