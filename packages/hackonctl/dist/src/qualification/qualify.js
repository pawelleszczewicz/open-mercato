import { checkDuplicate } from "./duplicates.js";
import { generateBranchName } from "../worktree/branch.js";
function qualify(candidate, config, registry, openPRs, recentClosedPRs) {
  const sourceType = candidate.source === "github_issue" ? "github_issue" : candidate.source === "integration_gap" ? "integration_gap" : "repo_signal";
  const sourceId = candidate.source === "github_issue" ? String(candidate.metadata.issueNumber) : candidate.id;
  if (registry.hasTaskForSource(sourceType, sourceId)) {
    return { qualified: false, reason: `Already tracked: source ${sourceType}:${sourceId}` };
  }
  const lane = candidate.suggestedLane;
  const laneConfig = config.lanes[lane];
  const activeInLane = registry.getActiveTasksByLane(lane);
  if (activeInLane.length >= laneConfig.maxActive) {
    return { qualified: false, reason: `Lane '${lane}' at capacity (${laneConfig.maxActive})` };
  }
  const duplicateCheck = checkDuplicate(candidate, openPRs, recentClosedPRs);
  if (duplicateCheck.risk === "likely_duplicate") {
    return { qualified: false, reason: `Duplicate: ${duplicateCheck.reason}` };
  }
  if (candidate.suggestedRisk === "red" && lane !== "experimental") {
    return { qualified: false, reason: "Red-zone items must use experimental lane" };
  }
  const source = { type: sourceType, id: sourceId, title: candidate.title };
  const branchName = generateBranchName(
    lane,
    registry.getNextTaskNumber(),
    candidate.title
  );
  const task = registry.createTask({
    source,
    lane,
    riskZone: candidate.suggestedRisk,
    branchName,
    expectedClasses: candidate.expectedClasses,
    duplicateRisk: duplicateCheck.risk
  });
  if (duplicateCheck.risk === "medium") {
    registry.addNote(task.taskId, `Duplicate risk: ${duplicateCheck.reason}`);
  }
  return { qualified: true, reason: "Qualified", task };
}
export {
  qualify
};
//# sourceMappingURL=qualify.js.map
