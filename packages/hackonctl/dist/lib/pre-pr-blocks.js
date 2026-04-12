function shouldAutoAbandonPrePrBlockedTask(task, checkpoint) {
  if (!["before_validation", "before_draft_pr_open"].includes(checkpoint)) {
    return false;
  }
  return task.prNumber == null && task.prUrl == null;
}
export {
  shouldAutoAbandonPrePrBlockedTask
};
//# sourceMappingURL=pre-pr-blocks.js.map
