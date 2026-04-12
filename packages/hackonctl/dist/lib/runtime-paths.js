import path from "node:path";
function resolveRuntimePaths(repoRoot, configFilePath, config) {
  const stateDir = path.resolve(repoRoot, config.runtime.stateDir);
  const workspaceDir = path.resolve(repoRoot, config.runtime.workspaceDir);
  return {
    repoRoot,
    configFilePath,
    stateDir,
    stateDiscoveryDir: path.join(stateDir, "discovery"),
    stateDiscoveryLatestFilePath: path.join(stateDir, "discovery", "latest.json"),
    stateTasksDir: path.join(stateDir, "tasks"),
    stateLocksDir: path.join(stateDir, "locks"),
    stateMetaFilePath: path.join(stateDir, "meta.json"),
    workspaceDir,
    targetsDir: path.join(workspaceDir, "targets"),
    artifactsDir: path.join(workspaceDir, "artifacts"),
    discoveryArtifactsDir: path.join(workspaceDir, "artifacts", "discovery"),
    driveGreenArtifactsDir: path.join(workspaceDir, "artifacts", "drive-green"),
    driveGreenCyclesDir: path.join(workspaceDir, "artifacts", "drive-green", "cycles"),
    driveGreenLatestFilePath: path.join(workspaceDir, "artifacts", "drive-green", "latest.json"),
    worktreesDir: path.join(workspaceDir, "worktrees")
  };
}
function getTaskArtifactRoot(paths, taskId) {
  return path.join(paths.artifactsDir, taskId);
}
function getTaskRunsDir(paths, taskId) {
  return path.join(getTaskArtifactRoot(paths, taskId), "runs");
}
function getTaskBlockersDir(paths, taskId) {
  return path.join(getTaskArtifactRoot(paths, taskId), "blockers");
}
function getTaskPromptsDir(paths, taskId) {
  return path.join(getTaskArtifactRoot(paths, taskId), "prompts");
}
function getTaskContextPath(paths, taskId) {
  return path.join(getTaskArtifactRoot(paths, taskId), "task-context.md");
}
function getDiscoverySnapshotPath(paths, snapshotId) {
  return path.join(paths.discoveryArtifactsDir, `${snapshotId}.json`);
}
function getDriveGreenCycleArtifactPath(paths, cycleId) {
  return path.join(paths.driveGreenCyclesDir, `${cycleId}.json`);
}
export {
  getDiscoverySnapshotPath,
  getDriveGreenCycleArtifactPath,
  getTaskArtifactRoot,
  getTaskBlockersDir,
  getTaskContextPath,
  getTaskPromptsDir,
  getTaskRunsDir,
  resolveRuntimePaths
};
//# sourceMappingURL=runtime-paths.js.map
