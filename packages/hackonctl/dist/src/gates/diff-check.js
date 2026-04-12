import { exec } from "../lib/shell.js";
function getDiffStats(worktreePath, baseBranch) {
  const result = exec(`git diff --stat "${baseBranch}"...HEAD`, { cwd: worktreePath });
  if (!result.success) {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0, totalLines: 0 };
  }
  const lines = result.stdout.split("\n");
  const summaryLine = lines[lines.length - 1];
  const filesMatch = summaryLine?.match(/(\d+) files? changed/);
  const insertionsMatch = summaryLine?.match(/(\d+) insertions?/);
  const deletionsMatch = summaryLine?.match(/(\d+) deletions?/);
  const linesAdded = insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0;
  const linesRemoved = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0;
  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    linesAdded,
    linesRemoved,
    totalLines: linesAdded + linesRemoved
  };
}
function getChangedFiles(worktreePath, baseBranch) {
  const result = exec(`git diff --name-only "${baseBranch}"...HEAD`, { cwd: worktreePath });
  if (!result.success) return [];
  return result.stdout.split("\n").filter(Boolean);
}
function checkForbiddenPaths(changedFiles, forbiddenPaths) {
  if (forbiddenPaths.length === 0) return [];
  return changedFiles.filter(
    (file) => forbiddenPaths.some((forbidden) => file.startsWith(forbidden))
  );
}
export {
  checkForbiddenPaths,
  getChangedFiles,
  getDiffStats
};
//# sourceMappingURL=diff-check.js.map
