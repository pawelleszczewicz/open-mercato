import { shell } from "../lib/shell.js";
function getWorktreeDiffStats(worktreePath, baseBranch) {
  const nameResult = shell(`git diff --name-only ${baseBranch}...HEAD`, { cwd: worktreePath });
  const files = nameResult.success ? nameResult.stdout.split("\n").filter(Boolean) : [];
  const numstatResult = shell(`git diff --numstat ${baseBranch}...HEAD`, { cwd: worktreePath });
  let additions = 0;
  let deletions = 0;
  if (numstatResult.success && numstatResult.stdout) {
    for (const line of numstatResult.stdout.split("\n").filter(Boolean)) {
      const parts = line.split("	");
      additions += parseInt(parts[0], 10) || 0;
      deletions += parseInt(parts[1], 10) || 0;
    }
  }
  return {
    fileCount: files.length,
    additions,
    deletions,
    totalLines: additions + deletions,
    files
  };
}
export {
  getWorktreeDiffStats
};
//# sourceMappingURL=diff-check.js.map
