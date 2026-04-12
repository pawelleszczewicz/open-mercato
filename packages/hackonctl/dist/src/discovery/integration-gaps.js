import { shell } from "../lib/shell.js";
async function discoverIntegrationGaps(targetDir) {
  const result = shell(
    "yarn mercato test:integration:spec-coverage --json 2>/dev/null",
    { cwd: targetDir, timeout: 6e4 }
  );
  if (!result.success || !result.stdout) {
    return {
      candidates: [],
      source: "integration_gap",
      discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    return {
      candidates: [],
      source: "integration_gap",
      discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const candidates = report.uncoveredScenarioIds.map((scenarioId) => ({
    id: `TESTSIG-integration-scenario-${scenarioId.toLowerCase()}`,
    source: "integration_gap",
    title: `tests: add integration test for ${scenarioId}`,
    description: `Scenario ${scenarioId} has a .md definition but no matching .spec.ts test file.`,
    suggestedLane: "tests",
    suggestedRisk: "green",
    expectedClasses: ["tests"],
    expectedPoints: 3,
    confidence: "high",
    metadata: { scenarioId }
  }));
  return {
    candidates,
    source: "integration_gap",
    discoveredAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
export {
  discoverIntegrationGaps
};
//# sourceMappingURL=integration-gaps.js.map
