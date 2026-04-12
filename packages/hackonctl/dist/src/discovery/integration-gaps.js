import { exec } from "../lib/shell.js";
function runSpecCoverage(rootDir) {
  const result = exec("yarn mercato test:integration:spec-coverage --json", { cwd: rootDir });
  if (!result.success) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}
function integrationGapsToCandidates(report) {
  return report.uncoveredScenarioIds.map((scenarioId) => {
    const categoryMatch = scenarioId.match(/^TC-([A-Z-]+)-\d+/);
    const category = categoryMatch?.[1] ?? "UNKNOWN";
    return {
      id: `TESTSIG-integration-scenario-${scenarioId.toLowerCase()}`,
      sourceType: "integration_gap",
      sourceId: scenarioId,
      title: `Uncovered integration test scenario: ${scenarioId}`,
      description: `Integration test gap for scenario ${scenarioId} (category: ${category}). Use the integration-tests skill to generate a Playwright test.`,
      suggestedLane: "tests",
      suggestedRiskZone: "green",
      expectedClasses: ["tests"],
      expectedPoints: 3,
      confidence: "high",
      candidatePaths: [`.ai/qa/scenarios/${scenarioId}*.md`]
    };
  });
}
export {
  integrationGapsToCandidates,
  runSpecCoverage
};
//# sourceMappingURL=integration-gaps.js.map
