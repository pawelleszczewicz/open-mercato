import { existsSync } from "node:fs";
import { exec, execOrThrow } from "../lib/shell.js";
import { worktreePath } from "../lib/paths.js";
function createWorktree(worktreeDir, taskId, branchName, baseBranch) {
  const path = worktreePath(worktreeDir, taskId);
  if (existsSync(path)) {
    return path;
  }
  execOrThrow(`git worktree add "${path}" -b "${branchName}" "${baseBranch}"`);
  return path;
}
function removeWorktree(worktreeDir, taskId) {
  const path = worktreePath(worktreeDir, taskId);
  if (!existsSync(path)) return;
  exec(`git worktree remove "${path}" --force`);
}
function listWorktrees() {
  const result = exec("git worktree list --porcelain");
  if (!result.success) return [];
  return result.stdout.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.replace("worktree ", ""));
}
function worktreeExists(worktreeDir, taskId) {
  const path = worktreePath(worktreeDir, taskId);
  return existsSync(path);
}
export {
  createWorktree,
  listWorktrees,
  removeWorktree,
  worktreeExists
};
//# sourceMappingURL=lifecycle.js.map
