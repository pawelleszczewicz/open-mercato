import { resolve } from "node:path";
function resolveWorkspacePaths(rootDir, config) {
  return {
    root: rootDir,
    targetDir: resolve(rootDir, config.workspace.targetDir),
    worktreeDir: resolve(rootDir, config.workspace.worktreeDir),
    registryFile: resolve(rootDir, config.workspace.registryFile),
    configFile: resolve(rootDir, "hackonctl.config.json")
  };
}
function worktreePath(worktreeDir, taskId) {
  return resolve(worktreeDir, taskId);
}
export {
  resolveWorkspacePaths,
  worktreePath
};
//# sourceMappingURL=paths.js.map
