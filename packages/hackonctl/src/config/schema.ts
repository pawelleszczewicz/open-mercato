import { z } from 'zod'

const commentPrefixesSchema = z.object({
  coordinator: z.string().default('[coordinator-agent]'),
  implementer: z.string().default('[implementer-agent]'),
  reviewer: z.string().default('[reviewer-agent]'),
}).default({
  coordinator: '[coordinator-agent]',
  implementer: '[implementer-agent]',
  reviewer: '[reviewer-agent]',
})

const githubSchema = z.object({
  operatorUsername: z.string(),
  upstreamOwner: z.string().default('open-mercato'),
  upstreamRepo: z.string().default('open-mercato'),
  forkOwner: z.string(),
  baseBranch: z.string().default('develop'),
  commentPrefixes: commentPrefixesSchema,
})

const workspaceSchema = z.object({
  targetDir: z.string().default('.workspace/targets/open-mercato'),
  worktreeDir: z.string().default('.workspace/worktrees/open-mercato'),
  registryFile: z.string().default('.state/registry.json'),
}).default({
  targetDir: '.workspace/targets/open-mercato',
  worktreeDir: '.workspace/worktrees/open-mercato',
  registryFile: '.state/registry.json',
})

const laneConfigSchema = z.object({
  maxActive: z.number().int().min(0).default(1),
})

const lanesSchema = z.object({
  docs: laneConfigSchema.default({ maxActive: 1 }),
  tests: laneConfigSchema.default({ maxActive: 1 }),
  simple_bugs: laneConfigSchema.default({ maxActive: 1 }),
  experimental: laneConfigSchema.default({ maxActive: 1 }),
}).default({
  docs: { maxActive: 1 },
  tests: { maxActive: 1 },
  simple_bugs: { maxActive: 1 },
  experimental: { maxActive: 1 },
})

const gatesSchema = z.object({
  lint: z.string().default('yarn lint'),
  typecheck: z.string().default('yarn typecheck'),
  test: z.string().default('yarn test'),
}).default({
  lint: 'yarn lint',
  typecheck: 'yarn typecheck',
  test: 'yarn test',
})

const policySchema = z.object({
  autoReadyMode: z.enum(['off', 'safe_only', 'expanded']).default('off'),
  forbiddenPaths: z.array(z.string()).default([]),
  changedFileLimit: z.record(z.string(), z.number()).default({
    docs: 20,
    tests: 25,
    simple_bugs: 15,
    experimental: 40,
  }),
  diffLineLimit: z.record(z.string(), z.number()).default({
    docs: 600,
    tests: 800,
    simple_bugs: 500,
    experimental: 1200,
  }),
  gates: gatesSchema,
}).default({
  autoReadyMode: 'off',
  forbiddenPaths: [],
  changedFileLimit: { docs: 20, tests: 25, simple_bugs: 15, experimental: 40 },
  diffLineLimit: { docs: 600, tests: 800, simple_bugs: 500, experimental: 1200 },
  gates: { lint: 'yarn lint', typecheck: 'yarn typecheck', test: 'yarn test' },
})

const discoverySchema = z.object({
  enableGithubIssues: z.boolean().default(true),
  enableRepoSignals: z.boolean().default(true),
  enableIntegrationGaps: z.boolean().default(true),
  issueLabels: z.array(z.string()).default([]),
  maxCandidates: z.number().int().min(1).default(50),
}).default({
  enableGithubIssues: true,
  enableRepoSignals: true,
  enableIntegrationGaps: true,
  issueLabels: [],
  maxCandidates: 50,
})

export const configSchema = z.object({
  version: z.literal(1),
  github: githubSchema,
  workspace: workspaceSchema,
  lanes: lanesSchema,
  policy: policySchema,
  discovery: discoverySchema,
})

export type HackonConfig = z.infer<typeof configSchema>
export type Lane = keyof HackonConfig['lanes']
export type AutoReadyMode = HackonConfig['policy']['autoReadyMode']

export const LANES: readonly Lane[] = ['docs', 'tests', 'simple_bugs', 'experimental'] as const
export const GREEN_LANES: readonly Lane[] = ['docs', 'tests', 'simple_bugs'] as const
