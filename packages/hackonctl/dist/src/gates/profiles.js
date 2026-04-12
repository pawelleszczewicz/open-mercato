const GATE_PROFILES = {
  docs: {
    runLint: true,
    runTypecheck: false,
    runTest: false,
    runIntegrationTest: false
  },
  tests: {
    runLint: true,
    runTypecheck: true,
    runTest: true,
    runIntegrationTest: false
  },
  simple_bugs: {
    runLint: true,
    runTypecheck: true,
    runTest: true,
    runIntegrationTest: false
  },
  experimental: {
    runLint: true,
    runTypecheck: true,
    runTest: true,
    runIntegrationTest: true
  }
};
function getGateProfile(lane) {
  return GATE_PROFILES[lane];
}
export {
  getGateProfile
};
//# sourceMappingURL=profiles.js.map
