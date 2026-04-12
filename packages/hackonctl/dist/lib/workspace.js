import path from "node:path";
import { ensureDir } from "./fs.js";
async function ensureRuntimeLayout(runtimePaths, config) {
  await ensureDir(runtimePaths.stateDir);
  await ensureDir(runtimePaths.stateDiscoveryDir);
  await ensureDir(runtimePaths.stateTasksDir);
  await ensureDir(runtimePaths.stateLocksDir);
  await ensureDir(runtimePaths.workspaceDir);
  await ensureDir(runtimePaths.targetsDir);
  await ensureDir(runtimePaths.worktreesDir);
  await ensureDir(runtimePaths.artifactsDir);
  await ensureDir(runtimePaths.discoveryArtifactsDir);
  await ensureDir(runtimePaths.driveGreenArtifactsDir);
  await ensureDir(runtimePaths.driveGreenCyclesDir);
  for (const target of config.targets) {
    await ensureTargetLayout(runtimePaths.repoRoot, target);
  }
}
async function ensureTargetLayout(repoRoot, target) {
  await ensureDir(path.dirname(path.resolve(repoRoot, target.clonePath)));
  await ensureDir(path.resolve(repoRoot, target.worktreeRoot));
  await ensureDir(path.resolve(repoRoot, target.artifactRoot));
}
export {
  ensureRuntimeLayout,
  ensureTargetLayout
};
//# sourceMappingURL=workspace.js.map
