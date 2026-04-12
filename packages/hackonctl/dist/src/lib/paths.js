import { resolve } from "node:path";
function resolveWorkspacePaths(basePath, config) {
  return {
    targetDir: resolve(basePath, config.workspace.targetDir),
    worktreeDir: resolve(basePath, config.workspace.worktreeDir),
    registryFile: config.workspace.registryFile,
    configFile: resolve(basePath, "hackonctl.config.json")
  };
}
function worktreePath(basePath, config, taskId) {
  return resolve(basePath, config.workspace.worktreeDir, taskId);
}
export {
  resolveWorkspacePaths,
  worktreePath
};
//# sourceMappingURL=paths.js.map
