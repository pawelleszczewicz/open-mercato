import { shell } from "../lib/shell.js";
function checkForbiddenPaths(changedFiles, config) {
  const violations = [];
  for (const file of changedFiles) {
    for (const forbidden of config.policy.forbiddenPaths) {
      if (file.startsWith(forbidden) || file.includes(forbidden)) {
        violations.push(`File '${file}' matches forbidden path '${forbidden}'`);
      }
    }
  }
  return { passed: violations.length === 0, violations };
}
function checkDiffLimits(changedFileCount, diffLineCount, lane, config) {
  const violations = [];
  const fileLimit = config.policy.changedFileLimit[lane];
  if (fileLimit !== void 0 && changedFileCount > fileLimit) {
    violations.push(`Changed ${changedFileCount} files, limit for '${lane}' is ${fileLimit}`);
  }
  const lineLimit = config.policy.diffLineLimit[lane];
  if (lineLimit !== void 0 && diffLineCount > lineLimit) {
    violations.push(`Diff is ${diffLineCount} lines, limit for '${lane}' is ${lineLimit}`);
  }
  return { passed: violations.length === 0, violations };
}
function getDiffStats(worktreePath, baseBranch) {
  const statResult = shell(
    `git diff --stat --name-only ${baseBranch}...HEAD`,
    { cwd: worktreePath }
  );
  if (!statResult.success) {
    return { fileCount: 0, lineCount: 0, files: [] };
  }
  const files = statResult.stdout.split("\n").filter(Boolean);
  const numstatResult = shell(
    `git diff --numstat ${baseBranch}...HEAD`,
    { cwd: worktreePath }
  );
  let lineCount = 0;
  if (numstatResult.success && numstatResult.stdout) {
    for (const line of numstatResult.stdout.split("\n").filter(Boolean)) {
      const [added, removed] = line.split("	");
      lineCount += (parseInt(added, 10) || 0) + (parseInt(removed, 10) || 0);
    }
  }
  return { fileCount: files.length, lineCount, files };
}
export {
  checkDiffLimits,
  checkForbiddenPaths,
  getDiffStats
};
//# sourceMappingURL=policy.js.map
