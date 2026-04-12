import { generateBranchName, slugify } from "../worktree/branch.js";
function qualifyCandidate(candidate, config, registry, duplicateRisk) {
  const lane = candidate.suggestedLane;
  const riskZone = candidate.suggestedRiskZone;
  const activeTasks = registry.getByLane(lane);
  const laneConfig = config.lanes[lane];
  if (activeTasks.length >= laneConfig.maxActive) {
    return {
      qualified: false,
      reason: `Lane '${lane}' is at capacity (${activeTasks.length}/${laneConfig.maxActive})`,
      source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
      lane,
      riskZone,
      branchName: "",
      expectedClasses: candidate.expectedClasses,
      duplicateRisk
    };
  }
  if (duplicateRisk === "likely_duplicate") {
    return {
      qualified: false,
      reason: "Likely duplicate \u2014 blocked",
      source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
      lane,
      riskZone,
      branchName: "",
      expectedClasses: candidate.expectedClasses,
      duplicateRisk
    };
  }
  if (riskZone === "red" && lane !== "experimental") {
    return {
      qualified: false,
      reason: "Red-zone items must use experimental lane",
      source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
      lane: "experimental",
      riskZone,
      branchName: "",
      expectedClasses: candidate.expectedClasses,
      duplicateRisk
    };
  }
  const slug = slugify(candidate.title);
  const taskId = `HCK-${String(registry.nextTaskNumber).padStart(4, "0")}`;
  const branchName = generateBranchName(lane, taskId, slug);
  return {
    qualified: true,
    source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
    lane,
    riskZone,
    branchName,
    expectedClasses: candidate.expectedClasses,
    duplicateRisk
  };
}
export {
  qualifyCandidate
};
//# sourceMappingURL=qualify.js.map
