import { shell } from "../lib/shell.js";
function findSkippedTests(targetDir) {
  const result = shell(
    `grep -rn "\\(test\\.todo\\|it\\.todo\\|describe\\.skip\\|it\\.skip\\|test\\.skip\\|xit\\|xdescribe\\)" --include="*.ts" --include="*.tsx" -l`,
    { cwd: targetDir }
  );
  if (!result.success || !result.stdout) return [];
  return result.stdout.split("\n").filter(Boolean).map((filePath) => {
    const shortPath = filePath.replace(targetDir + "/", "");
    return {
      id: `TESTSIG-skipped-${shortPath.replace(/[^a-zA-Z0-9]/g, "-")}`,
      title: `tests: re-enable skipped tests in ${shortPath}`,
      description: `File ${shortPath} contains skipped or todo tests that should be re-enabled.`,
      lane: "tests",
      classes: ["tests"],
      points: 3,
      filePath: shortPath
    };
  });
}
function findModulesWithoutTests(targetDir) {
  const result = shell(
    `find packages/*/src/lib packages/*/src/modules -name "*.ts" -not -name "*.test.ts" -not -name "*.d.ts" -not -path "*/__tests__/*" -not -path "*/node_modules/*" 2>/dev/null`,
    { cwd: targetDir }
  );
  if (!result.success || !result.stdout) return [];
  const files = result.stdout.split("\n").filter(Boolean);
  const signals = [];
  for (const filePath of files) {
    const testPath = filePath.replace(/\.ts$/, ".test.ts");
    const dirTestPath = filePath.replace(/\/([^/]+)\.ts$/, "/__tests__/$1.test.ts");
    const hasTest = shell(`test -f "${testPath}" -o -f "${dirTestPath}"`, { cwd: targetDir });
    if (!hasTest.success) {
      const shortId = filePath.replace(/[^a-zA-Z0-9]/g, "-");
      signals.push({
        id: `TESTSIG-lowlevel-untested-${shortId}`,
        title: `tests: add low-level coverage for ${filePath.split("/").pop()}`,
        description: `File ${filePath} has no nearby test file.`,
        lane: "tests",
        classes: ["tests"],
        points: 3,
        filePath
      });
    }
  }
  return signals.slice(0, 50);
}
async function discoverRepoSignals(targetDir) {
  const skippedTests = findSkippedTests(targetDir);
  const untestedModules = findModulesWithoutTests(targetDir);
  const allSignals = [...skippedTests, ...untestedModules];
  const candidates = allSignals.map((signal) => ({
    id: signal.id,
    source: "repo_signal",
    title: signal.title,
    description: signal.description,
    suggestedLane: signal.lane,
    suggestedRisk: "green",
    expectedClasses: signal.classes,
    expectedPoints: signal.points,
    confidence: "high",
    metadata: { filePath: signal.filePath }
  }));
  return {
    candidates,
    source: "repo_signal",
    discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
export {
  discoverRepoSignals
};
//# sourceMappingURL=repo-signals.js.map
