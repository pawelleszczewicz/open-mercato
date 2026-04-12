const defaultPrunableWorktreeStates = [
  "abandoned",
  "judge_pending",
  "judge_approved",
  "judge_adjusted",
  "judge_rejected"
];
function isTaskWorktreePrunable(task, allowedStates = defaultPrunableWorktreeStates) {
  return Boolean(task.worktreePath) && allowedStates.includes(task.state);
}
function selectPrunableTaskWorktrees(tasks, allowedStates = defaultPrunableWorktreeStates) {
  return tasks.filter((task) => isTaskWorktreePrunable(task, allowedStates));
}
export {
  defaultPrunableWorktreeStates,
  isTaskWorktreePrunable,
  selectPrunableTaskWorktrees
};
//# sourceMappingURL=prune.js.map
