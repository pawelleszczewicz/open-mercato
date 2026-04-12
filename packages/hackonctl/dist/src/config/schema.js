import { z } from "zod";
const laneSchema = z.object({
  maxActive: z.number().int().min(0).default(1)
});
const commentPrefixesSchema = z.object({
  coordinator: z.string().default("[coordinator-agent]"),
  implementer: z.string().default("[implementer-agent]"),
  reviewer: z.string().default("[reviewer-agent]")
});
const githubSchema = z.object({
  operatorUsername: z.string(),
  upstreamOwner: z.string().default("open-mercato"),
  upstreamRepo: z.string().default("open-mercato"),
  forkOwner: z.string(),
  baseBranch: z.string().default("develop"),
  commentPrefixes: z.preprocess(
    (v) => v ?? {},
    commentPrefixesSchema
  )
});
const workspaceSchema = z.object({
  targetDir: z.string().default(".workspace/targets/open-mercato"),
  worktreeDir: z.string().default(".workspace/worktrees/open-mercato"),
  registryFile: z.string().default(".state/registry.json")
});
const lanesSchema = z.object({
  docs: laneSchema.default({ maxActive: 2 }),
  tests: laneSchema.default({ maxActive: 2 }),
  simple_bugs: laneSchema.default({ maxActive: 1 }),
  experimental: laneSchema.default({ maxActive: 1 })
});
const gatesSchema = z.object({
  lint: z.string().default("yarn lint"),
  typecheck: z.string().default("yarn typecheck"),
  test: z.string().default("yarn test")
});
const policySchema = z.object({
  autoReadyMode: z.enum(["off", "safe_only", "expanded"]).default("off"),
  forbiddenPaths: z.array(z.string()).default([]),
  changedFileLimit: z.record(z.string(), z.number()).default({
    docs: 20,
    tests: 25,
    simple_bugs: 15,
    experimental: 40
  }),
  diffLineLimit: z.record(z.string(), z.number()).default({
    docs: 600,
    tests: 800,
    simple_bugs: 500,
    experimental: 1200
  }),
  gates: z.preprocess((v) => v ?? {}, gatesSchema)
});
const discoverySchema = z.object({
  enableGithubIssues: z.boolean().default(true),
  enableRepoSignals: z.boolean().default(true),
  enableIntegrationGaps: z.boolean().default(true),
  issueLabels: z.array(z.string()).default([]),
  maxCandidates: z.number().int().min(1).default(50)
});
const configSchema = z.object({
  version: z.literal(1),
  github: githubSchema,
  workspace: z.preprocess((v) => v ?? {}, workspaceSchema),
  lanes: z.preprocess((v) => v ?? {}, lanesSchema),
  policy: z.preprocess((v) => v ?? {}, policySchema),
  discovery: z.preprocess((v) => v ?? {}, discoverySchema)
});
export {
  commentPrefixesSchema,
  configSchema,
  discoverySchema,
  gatesSchema,
  githubSchema,
  laneSchema,
  lanesSchema,
  policySchema,
  workspaceSchema
};
//# sourceMappingURL=schema.js.map
