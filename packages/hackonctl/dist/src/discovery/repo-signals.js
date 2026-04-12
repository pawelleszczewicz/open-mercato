import { exec } from "../lib/shell.js";
function findSkippedTests(targetDir) {
  const patterns = ["test\\.todo", "it\\.todo", "describe\\.skip", "it\\.skip", "test\\.skip", "xit\\(", "xdescribe\\("];
  const signals = [];
  for (const pattern of patterns) {
    const result = exec(
      `grep -rn "${pattern}" --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" "${targetDir}/packages" "${targetDir}/apps" 2>/dev/null || true`
    );
    if (!result.stdout) continue;
    for (const line of result.stdout.split("\n")) {
      if (!line.trim()) continue;
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (!match) continue;
      const [, filePath, lineNum, content] = match;
      const cleanPath = filePath.replace(targetDir + "/", "");
      const slug = cleanPath.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
      signals.push({
        signalType: "skipped_test",
        id: `TESTSIG-skipped-${slug}-L${lineNum}`,
        title: `Skipped test in ${cleanPath}:${lineNum}`,
        filePath: cleanPath,
        line: parseInt(lineNum, 10)
      });
    }
  }
  return signals;
}
function findTodoTests(targetDir) {
  const result = exec(
    `grep -rn "test\\.todo\\|it\\.todo" --include="*.test.ts" --include="*.test.tsx" --include="*.spec.ts" "${targetDir}/packages" "${targetDir}/apps" 2>/dev/null || true`
  );
  const signals = [];
  if (!result.stdout) return signals;
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(/^(.+?):(\d+):(.+)$/);
    if (!match) continue;
    const [, filePath, lineNum, content] = match;
    const cleanPath = filePath.replace(targetDir + "/", "");
    const testNameMatch = content.match(/(?:test|it)\.todo\(['"](.+?)['"]\)/);
    const testName = testNameMatch?.[1] ?? `todo at ${cleanPath}:${lineNum}`;
    const slug = cleanPath.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
    signals.push({
      signalType: "todo_test",
      id: `TESTSIG-todo-${slug}-L${lineNum}`,
      title: `Todo test: ${testName}`,
      filePath: cleanPath,
      line: parseInt(lineNum, 10)
    });
  }
  return signals;
}
function findModulesWithoutTests(targetDir) {
  const result = exec(
    `find "${targetDir}/packages" -type d -name "src" -not -path "*/node_modules/*" 2>/dev/null || true`
  );
  const signals = [];
  if (!result.stdout) return signals;
  for (const srcDir of result.stdout.split("\n")) {
    if (!srcDir.trim()) continue;
    const hasTests = exec(`find "${srcDir}" -type d -name "__tests__" 2>/dev/null | head -1`);
    if (hasTests.stdout) continue;
    const hasModules = exec(`find "${srcDir}" -name "*.ts" -not -name "*.d.ts" 2>/dev/null | head -1`);
    if (!hasModules.stdout) continue;
    const cleanPath = srcDir.replace(targetDir + "/", "");
    signals.push({
      signalType: "untested_module",
      id: `TESTSIG-untested-${cleanPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
      title: `Module without tests: ${cleanPath}`,
      filePath: cleanPath
    });
  }
  return signals;
}
function repoSignalsToCandidates(signals) {
  return signals.map((signal) => ({
    id: signal.id,
    sourceType: "repo_signal",
    sourceId: signal.id,
    title: signal.title,
    description: `Detected by repo signal miner: ${signal.signalType} at ${signal.filePath}`,
    suggestedLane: "tests",
    suggestedRiskZone: "green",
    expectedClasses: ["tests"],
    expectedPoints: 3,
    confidence: signal.signalType === "skipped_test" || signal.signalType === "todo_test" ? "high" : "medium",
    candidatePaths: [signal.filePath]
  }));
}
export {
  findModulesWithoutTests,
  findSkippedTests,
  findTodoTests,
  repoSignalsToCandidates
};
//# sourceMappingURL=repo-signals.js.map
