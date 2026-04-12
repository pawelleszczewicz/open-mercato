import { shell } from "../lib/shell.js";
import { checkForbiddenPaths, checkDiffLimits, getDiffStats } from "../qualification/policy.js";
import { log } from "../lib/logger.js";
function runGate(name, command, cwd) {
  const start = Date.now();
  const result = shell(command, { cwd, timeout: 3e5 });
  return {
    gate: name,
    passed: result.success,
    output: result.stdout.slice(0, 2e3),
    durationMs: Date.now() - start
  };
}
function runGates(worktreePath, lane, config) {
  const results = [];
  log("info", `Running gates for lane '${lane}' in ${worktreePath}`);
  const diffStats = getDiffStats(worktreePath, config.github.baseBranch);
  const forbiddenCheck = checkForbiddenPaths(diffStats.files, config);
  results.push({
    gate: "forbidden_paths",
    passed: forbiddenCheck.passed,
    output: forbiddenCheck.violations.join("\n"),
    durationMs: 0
  });
  if (!forbiddenCheck.passed) {
    return { allPassed: false, results };
  }
  const diffLimits = checkDiffLimits(diffStats.fileCount, diffStats.lineCount, lane, config);
  results.push({
    gate: "diff_limits",
    passed: diffLimits.passed,
    output: diffLimits.violations.join("\n"),
    durationMs: 0
  });
  if (!diffLimits.passed) {
    return { allPassed: false, results };
  }
  const lintResult = runGate("lint", config.policy.gates.lint, worktreePath);
  results.push(lintResult);
  log("info", `Lint: ${lintResult.passed ? "PASS" : "FAIL"} (${lintResult.durationMs}ms)`);
  if (!lintResult.passed) {
    return { allPassed: false, results };
  }
  const typecheckResult = runGate("typecheck", config.policy.gates.typecheck, worktreePath);
  results.push(typecheckResult);
  log("info", `Typecheck: ${typecheckResult.passed ? "PASS" : "FAIL"} (${typecheckResult.durationMs}ms)`);
  if (!typecheckResult.passed) {
    return { allPassed: false, results };
  }
  const testResult = runGate("test", config.policy.gates.test, worktreePath);
  results.push(testResult);
  log("info", `Test: ${testResult.passed ? "PASS" : "FAIL"} (${testResult.durationMs}ms)`);
  return {
    allPassed: results.every((r) => r.passed),
    results
  };
}
export {
  runGates
};
//# sourceMappingURL=runner.js.map
