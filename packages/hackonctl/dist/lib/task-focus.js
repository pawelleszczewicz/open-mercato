const integrationScenarioIdPattern = /(TC-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*)/i;
const integrationScenarioSignalPrefix = "TESTSIG-integration-scenario-";
function extractIntegrationScenarioIds(subject) {
  const discoveredIds = /* @__PURE__ */ new Set();
  const values = [
    subject.sourceTitle ?? "",
    subject.sourceId ?? "",
    ...subject.sourceEvidence ?? [],
    ...subject.candidatePaths
  ];
  for (const value of values) {
    const match = value.match(integrationScenarioIdPattern);
    if (!match?.[1]) {
      continue;
    }
    discoveredIds.add(match[1].toUpperCase());
  }
  return [...discoveredIds].sort((left, right) => left.localeCompare(right));
}
function isQaScenarioPath(candidatePath) {
  return candidatePath.startsWith(".ai/qa/scenarios/") && candidatePath.endsWith(".md");
}
function isIntegrationScenarioGapTask(subject) {
  return Boolean(
    subject.sourceType === "repo_signal" && subject.sourceId?.startsWith(integrationScenarioSignalPrefix) || extractIntegrationScenarioIds(subject).length > 0 && subject.candidatePaths.some((candidatePath) => isQaScenarioPath(candidatePath))
  );
}
function isIntegrationTestTask(subject) {
  return isIntegrationScenarioGapTask(subject) || Boolean(subject.expectedContributionClasses?.includes("tests")) || Boolean(subject.validationProfileIds?.includes("integration-tests")) || Boolean(subject.validationProfileIds?.includes("integration-test-gap-coverage"));
}
export {
  extractIntegrationScenarioIds,
  isIntegrationScenarioGapTask,
  isIntegrationTestTask,
  isQaScenarioPath
};
//# sourceMappingURL=task-focus.js.map
