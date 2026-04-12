function getGateProfile(config, lane) {
  return {
    lint: true,
    typecheck: true,
    test: true,
    diffCheck: true,
    integrationTest: lane === "tests",
    changedFileLimit: config.policy.changedFileLimit[lane] ?? 20,
    diffLineLimit: config.policy.diffLineLimit[lane] ?? 600
  };
}
export {
  getGateProfile
};
//# sourceMappingURL=profiles.js.map
