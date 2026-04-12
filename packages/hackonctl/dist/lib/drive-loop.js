function shouldContinueGreenDriveLoopImmediately(dispatchCapacity, cycle) {
  if (dispatchCapacity <= 0) {
    return false;
  }
  if (cycle.dispatchedTaskIds.length > 0) {
    return true;
  }
  if (cycle.discoveryBatches.some((batch) => batch.qualifiedTaskIds.length > 0)) {
    return true;
  }
  return cycle.progressResults.some((result) => result.result.exitCode === 0);
}
export {
  shouldContinueGreenDriveLoopImmediately
};
//# sourceMappingURL=drive-loop.js.map
