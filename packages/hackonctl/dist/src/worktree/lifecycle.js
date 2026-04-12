import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { shellOrThrow, shell } from "../lib/shell.js";
function createWorktree(basePath, config, taskId, branchName) {
  const worktreeDir = resolve(basePath, config.workspace.worktreeDir, taskId);
  if (existsSync(worktreeDir)) {
    return worktreeDir;
  }
  const targetDir = resolve(basePath, config.workspace.targetDir);
  shellOrThrow(
    `git worktree add "${worktreeDir}" -b "${branchName}" "${config.github.baseBranch}"`,
    { cwd: targetDir }
  );
  return worktreeDir;
}
function removeWorktree(basePath, config, taskId, branchName) {
  const worktreeDir = resolve(basePath, config.workspace.worktreeDir, taskId);
  if (!existsSync(worktreeDir)) return;
  const targetDir = resolve(basePath, config.workspace.targetDir);
  shell(`git worktree remove "${worktreeDir}" --force`, { cwd: targetDir });
  shell(`git branch -D "${branchName}"`, { cwd: targetDir });
}
function worktreeExists(basePath, config, taskId) {
  const worktreeDir = resolve(basePath, config.workspace.worktreeDir, taskId);
  return existsSync(worktreeDir);
}
function listWorktrees(basePath, config) {
  const targetDir = resolve(basePath, config.workspace.targetDir);
  const result = shell("git worktree list --porcelain", { cwd: targetDir });
  if (!result.success) return [];
  return result.stdout.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.replace("worktree ", ""));
}
export {
  createWorktree,
  listWorktrees,
  removeWorktree,
  worktreeExists
};
//# sourceMappingURL=lifecycle.js.map
