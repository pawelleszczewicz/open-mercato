import { isIntegrationScenarioGapTask } from "./task-focus.js";
import { globToRegExp, normalizePath } from "./strings.js";
function matchAreaRules(target, candidatePaths, sourceTitle, explicitClasses) {
  const normalizedPaths = candidatePaths.map(normalizePath);
  const matchedRules = target.areaRules.filter((rule) => rule.patterns.some((pattern) => {
    const regex = globToRegExp(pattern);
    return normalizedPaths.some((candidatePath) => regex.test(candidatePath));
  }));
  const explicitLane = pickExplicitGreenLane(normalizedPaths, sourceTitle, explicitClasses);
  if (matchedRules.length > 0) {
    const lane = explicitLane ?? pickLane(matchedRules.map((rule) => rule.lane));
    const riskZone = pickRisk(matchedRules.map((rule) => rule.riskZone));
    const selection = {
      matchedRules,
      lane,
      riskZone,
      primaryAreaOwners: unique(matchedRules.flatMap((rule) => rule.primaryAreaOwners)),
      validationProfileIds: unique(matchedRules.flatMap((rule) => rule.validationProfileIds)),
      expectedContributionClasses: unique([...explicitClasses, ...matchedRules.flatMap((rule) => rule.expectedContributionClasses)])
    };
    return augmentIntegrationScenarioSelection(selection, normalizedPaths, sourceTitle, explicitClasses);
  }
  if (explicitLane === "docs" || /(docs?|readme|contributing|guide)/i.test(sourceTitle)) {
    return {
      matchedRules: [],
      lane: "docs",
      riskZone: "low",
      primaryAreaOwners: ["docs"],
      validationProfileIds: ["docs-basic"],
      expectedContributionClasses: unique([...explicitClasses, "docs"])
    };
  }
  if (explicitLane === "tests" || /(test|spec|assert|coverage)/i.test(sourceTitle)) {
    return augmentIntegrationScenarioSelection({
      matchedRules: [],
      lane: "tests",
      riskZone: "low",
      primaryAreaOwners: ["qa"],
      validationProfileIds: ["integration-tests"],
      expectedContributionClasses: unique([...explicitClasses, "tests"])
    }, normalizedPaths, sourceTitle, explicitClasses);
  }
  if (/(bug|fix|regression|broken|error)/i.test(sourceTitle)) {
    return {
      matchedRules: [],
      lane: "simple_bugs",
      riskZone: "medium",
      primaryAreaOwners: ["unassigned"],
      validationProfileIds: [],
      expectedContributionClasses: unique([...explicitClasses, "bugfix"])
    };
  }
  return {
    matchedRules: [],
    lane: "experimental",
    riskZone: "high",
    primaryAreaOwners: ["unassigned"],
    validationProfileIds: [],
    expectedContributionClasses: explicitClasses
  };
}
function augmentIntegrationScenarioSelection(selection, candidatePaths, sourceTitle, explicitClasses) {
  if (!isIntegrationScenarioGapTask({
    sourceTitle,
    candidatePaths,
    expectedContributionClasses: explicitClasses
  })) {
    return selection;
  }
  return {
    ...selection,
    lane: "tests",
    riskZone: "low",
    primaryAreaOwners: unique([...selection.primaryAreaOwners, "qa"]),
    validationProfileIds: unique([...selection.validationProfileIds, "integration-test-gap-coverage", "integration-tests"]),
    expectedContributionClasses: unique([...selection.expectedContributionClasses, "tests"])
  };
}
function getTargetById(config, targetId) {
  const target = config.targets.find((item) => item.id === targetId);
  if (!target) {
    throw new Error(`Unknown target: ${targetId}`);
  }
  return target;
}
function unique(values) {
  return [...new Set(values)];
}
function pickLane(lanes) {
  if (lanes.includes("experimental")) return "experimental";
  if (lanes.includes("simple_bugs")) return "simple_bugs";
  if (lanes.includes("tests")) return "tests";
  return "docs";
}
function pickRisk(zones) {
  if (zones.includes("high")) return "high";
  if (zones.includes("medium")) return "medium";
  return "low";
}
function pickExplicitGreenLane(candidatePaths, sourceTitle, explicitClasses) {
  if (candidatePaths.length > 0 && candidatePaths.every((candidatePath) => isDocsPath(candidatePath)) && (explicitClasses.includes("docs") || /(docs?|readme|contributing|guide)/i.test(sourceTitle))) {
    return "docs";
  }
  if (candidatePaths.length > 0 && candidatePaths.every((candidatePath) => isTestPath(candidatePath)) && (explicitClasses.includes("tests") || /(test|spec|assert|coverage)/i.test(sourceTitle))) {
    return "tests";
  }
  return null;
}
function isDocsPath(candidatePath) {
  return /\.mdx?$/i.test(candidatePath) || candidatePath.startsWith("docs/") || candidatePath.startsWith("apps/docs/");
}
function isTestPath(candidatePath) {
  return /(?:^|\/)(?:__tests__|tests?)\/|(?:test|spec)\.[jt]sx?$/i.test(candidatePath);
}
export {
  getTargetById,
  matchAreaRules
};
//# sourceMappingURL=area-rules.js.map
