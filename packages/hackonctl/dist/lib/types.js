import { z } from "zod";
const runtimeStatusValues = [
  "available_and_ready",
  "available_but_may_require_approval",
  "unavailable",
  "optional_but_missing"
];
const sourceTypeValues = ["github_issue", "repo_signal"];
const laneValues = ["docs", "tests", "simple_bugs", "experimental"];
const riskZoneValues = ["low", "medium", "high"];
const taskStateValues = [
  "discovered",
  "qualified",
  "workspace_prepared",
  "implementing",
  "validating",
  "draft_pr_open",
  "review_in_progress",
  "changes_requested",
  "review_complete",
  "ready_pr",
  "human_required",
  "awaiting_portal_submission",
  "portal_submitted",
  "judge_pending",
  "judge_approved",
  "judge_adjusted",
  "judge_rejected",
  "blocked",
  "duplicate_closed",
  "abandoned"
];
const terminalTaskStates = /* @__PURE__ */ new Set([
  "judge_approved",
  "judge_adjusted",
  "judge_rejected",
  "duplicate_closed",
  "abandoned"
]);
const activeTaskStates = new Set(taskStateValues.filter((state) => !terminalTaskStates.has(state)));
const duplicateRiskValues = ["none", "hard_duplicate", "likely_duplicate", "split_risk"];
const portalStatusValues = ["not_started", "awaiting_submission", "submitted"];
const judgeStatusValues = ["not_started", "pending", "approved", "adjusted", "rejected"];
const autonomyClassValues = ["fully_autonomous", "approval_sensitive", "optional"];
const validationParserValues = ["exit_code", "line_set", "integration_spec_coverage"];
const cwdModeValues = ["repo_root", "target_root", "worktree"];
const blockerReasonValues = [
  "permission_blocked",
  "github_provider_unavailable",
  "validation_failed",
  "duplicate_risk_high",
  "review_unresolved",
  "policy_exception_required",
  "tool_missing",
  "target_repo_unavailable",
  "timeout_exceeded"
];
const runRoleValues = ["implementer", "reviewer"];
const runtimeStatusSchema = z.enum(runtimeStatusValues);
const sourceTypeSchema = z.enum(sourceTypeValues);
const laneSchema = z.enum(laneValues);
const riskZoneSchema = z.enum(riskZoneValues);
const taskStateSchema = z.enum(taskStateValues);
const duplicateRiskSchema = z.enum(duplicateRiskValues);
const portalStatusSchema = z.enum(portalStatusValues);
const judgeStatusSchema = z.enum(judgeStatusValues);
const autonomyClassSchema = z.enum(autonomyClassValues);
const validationParserSchema = z.enum(validationParserValues);
const cwdModeSchema = z.enum(cwdModeValues);
const blockerReasonSchema = z.enum(blockerReasonValues);
const runRoleSchema = z.enum(runRoleValues);
export {
  activeTaskStates,
  autonomyClassSchema,
  autonomyClassValues,
  blockerReasonSchema,
  blockerReasonValues,
  cwdModeSchema,
  cwdModeValues,
  duplicateRiskSchema,
  duplicateRiskValues,
  judgeStatusSchema,
  judgeStatusValues,
  laneSchema,
  laneValues,
  portalStatusSchema,
  portalStatusValues,
  riskZoneSchema,
  riskZoneValues,
  runRoleSchema,
  runRoleValues,
  runtimeStatusSchema,
  runtimeStatusValues,
  sourceTypeSchema,
  sourceTypeValues,
  taskStateSchema,
  taskStateValues,
  terminalTaskStates,
  validationParserSchema,
  validationParserValues
};
//# sourceMappingURL=types.js.map
