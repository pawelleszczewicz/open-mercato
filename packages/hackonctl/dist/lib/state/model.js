import { z } from "zod";
import {
  blockerReasonSchema,
  duplicateRiskSchema,
  judgeStatusSchema,
  laneSchema,
  portalStatusSchema,
  riskZoneSchema,
  sourceTypeSchema,
  taskStateSchema
} from "../types.js";
const duplicateSignalSchema = z.object({
  kind: z.string().min(1),
  duplicateRiskClass: duplicateRiskSchema.exclude(["none"]),
  summary: z.string().min(1),
  source: z.enum(["github", "local"]),
  relatedTaskId: z.string().nullable().default(null),
  prNumber: z.number().int().positive().nullable().default(null),
  prUrl: z.string().nullable().default(null),
  overlapPaths: z.array(z.string()).default([])
});
const blockerReferenceSchema = z.object({
  reason: blockerReasonSchema,
  summary: z.string().min(1),
  artifactPath: z.string().min(1),
  createdAt: z.string().min(1)
});
const coordinatorDecisionSchema = z.object({
  at: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().min(1),
  overrideApplied: z.boolean().default(false),
  artifactRefs: z.array(z.string()).default([])
});
const taskEventSchema = z.object({
  at: z.string().min(1),
  type: z.string().min(1),
  message: z.string().min(1),
  artifactRefs: z.array(z.string()).default([])
});
const taskRecordSchema = z.object({
  taskId: z.string().min(1),
  targetId: z.string().min(1),
  sourceType: sourceTypeSchema,
  sourceId: z.string().min(1),
  sourceTitle: z.string().min(1),
  sourceEvidence: z.array(z.string()),
  candidatePaths: z.array(z.string()),
  expectedContributionClasses: z.array(z.string()),
  lane: laneSchema,
  riskZone: riskZoneSchema,
  state: taskStateSchema,
  duplicateRiskClass: duplicateRiskSchema,
  duplicateSignals: z.array(duplicateSignalSchema),
  primaryAreaOwners: z.array(z.string()),
  validationProfileIds: z.array(z.string()),
  worktreePath: z.string().nullable(),
  branchName: z.string().nullable(),
  prNumber: z.number().int().positive().nullable(),
  prUrl: z.string().nullable(),
  contributionGroupId: z.string().nullable(),
  portalStatus: portalStatusSchema,
  judgeStatus: judgeStatusSchema,
  blockers: z.array(blockerReferenceSchema),
  lastCoordinatorDecision: coordinatorDecisionSchema.nullable(),
  differentiationNote: z.string().nullable().default(null),
  eventLog: z.array(taskEventSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});
const stateMetaSchema = z.object({
  nextTaskNumber: z.number().int().positive()
});
export {
  blockerReferenceSchema,
  coordinatorDecisionSchema,
  duplicateSignalSchema,
  stateMetaSchema,
  taskEventSchema,
  taskRecordSchema
};
//# sourceMappingURL=model.js.map
