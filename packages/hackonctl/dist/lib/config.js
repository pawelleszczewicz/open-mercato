import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  autonomyClassSchema,
  cwdModeSchema,
  laneSchema,
  riskZoneSchema,
  runtimeStatusSchema,
  validationParserSchema
} from "./types.js";
import { ensureDir, pathExists, readJsonFile, writeJsonFileAtomic } from "./fs.js";
const CONFIG_FILE_NAME = "hackonctl.config.json";
const validationProfileSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  commands: z.array(z.array(z.string().min(1))).min(1),
  cwdMode: cwdModeSchema,
  required: z.boolean(),
  parser: validationParserSchema,
  baselineProfile: z.enum(["none", "target_head"]),
  autonomyClass: autonomyClassSchema
});
const changeGuardrailSchema = z.object({
  maxChangedFiles: z.number().int().positive(),
  maxDiffLines: z.number().int().positive(),
  forbiddenPathPatterns: z.array(z.string().min(1)).default([])
});
const areaRuleSchema = z.object({
  id: z.string().min(1),
  patterns: z.array(z.string().min(1)).min(1),
  lane: laneSchema,
  riskZone: riskZoneSchema,
  primaryAreaOwners: z.array(z.string().min(1)).min(1),
  validationProfileIds: z.array(z.string().min(1)),
  expectedContributionClasses: z.array(z.string().min(1))
});
const targetConfigSchema = z.object({
  id: z.string().min(1),
  repoUrl: z.string().min(1),
  defaultBaseBranch: z.string().min(1),
  clonePath: z.string().min(1),
  worktreeRoot: z.string().min(1),
  artifactRoot: z.string().min(1),
  upstreamOwner: z.string().min(1),
  upstreamRepo: z.string().min(1),
  forkOwner: z.string().optional().default(""),
  forkRepoUrl: z.string().optional().default(""),
  forkRemoteName: z.string().min(1).default("fork"),
  seedPath: z.string().optional(),
  areaRules: z.array(areaRuleSchema).min(1)
});
const githubConfigSchema = z.object({
  provider: z.enum(["gh_cli", "github_api", "github_mcp", "github_mcp_then_pat_api", "github_mcp_then_gh_cli"]).default("github_mcp_then_pat_api"),
  mcpUrl: z.string().min(1).default("https://api.githubcopilot.com/mcp/"),
  mcpTokenEnvVar: z.string().min(1).default("GITHUB_PERSONAL_ACCESS_TOKEN")
});
const codexRoleConfigSchema = z.object({
  model: z.string().min(1),
  sandboxMode: z.enum(["read-only", "workspace-write", "danger-full-access"]),
  timeoutMs: z.number().int().positive(),
  maxAutomaticRetries: z.number().int().min(0).max(1),
  failFastOnApprovalSensitive: z.boolean()
});
const doctorCheckSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  status: runtimeStatusSchema,
  detail: z.string().min(1)
});
const hackonConfigSchema = z.object({
  version: z.literal(1),
  runtime: z.object({
    stateDir: z.string().min(1),
    workspaceDir: z.string().min(1)
  }),
  policy: z.object({
    maxActiveExperimental: z.number().int().positive(),
    requireDifferentiationNoteOnOverride: z.boolean(),
    laneGuardrails: z.object({
      docs: changeGuardrailSchema,
      tests: changeGuardrailSchema,
      simple_bugs: changeGuardrailSchema,
      experimental: changeGuardrailSchema
    })
  }),
  github: githubConfigSchema,
  codex: z.object({
    binary: z.string().min(1),
    implementer: codexRoleConfigSchema,
    testImplementer: codexRoleConfigSchema.default(makeDefaultTestImplementerRoleConfig()),
    reviewer: codexRoleConfigSchema
  }),
  validationProfiles: z.array(validationProfileSchema).min(1),
  targets: z.array(targetConfigSchema).min(1),
  doctorExpectations: z.array(doctorCheckSchema).default([])
});
function makeDefaultImplementerRoleConfig() {
  return {
    model: "gpt-5.4",
    sandboxMode: "workspace-write",
    timeoutMs: 45 * 60 * 1e3,
    maxAutomaticRetries: 1,
    failFastOnApprovalSensitive: true
  };
}
function makeDefaultTestImplementerRoleConfig() {
  return {
    ...makeDefaultImplementerRoleConfig(),
    timeoutMs: 60 * 60 * 1e3
  };
}
function makeDefaultReviewerRoleConfig() {
  return {
    model: "gpt-5.4",
    sandboxMode: "workspace-write",
    timeoutMs: 20 * 60 * 1e3,
    maxAutomaticRetries: 1,
    failFastOnApprovalSensitive: true
  };
}
function makeWorkspaceValidationProfile(options) {
  const commands = [];
  if (options.includeTypecheck ?? true) {
    commands.push(["yarn", "workspace", options.workspaceName, "typecheck"]);
  }
  if (options.includeTest ?? true) {
    commands.push(
      options.runInBand === false ? ["yarn", "workspace", options.workspaceName, "test"] : ["yarn", "workspace", options.workspaceName, "test", "--", "--runInBand"]
    );
  }
  return {
    id: options.id,
    description: options.description,
    commands,
    cwdMode: options.cwdMode ?? "target_root",
    required: options.required ?? true,
    parser: options.parser ?? "line_set",
    baselineProfile: options.baselineProfile ?? "target_head",
    autonomyClass: options.autonomyClass ?? "fully_autonomous"
  };
}
function makeAreaRule(options) {
  return {
    id: options.id,
    patterns: options.patterns,
    lane: options.lane ?? "simple_bugs",
    riskZone: options.riskZone ?? "medium",
    primaryAreaOwners: options.primaryAreaOwners,
    validationProfileIds: options.validationProfileIds,
    expectedContributionClasses: options.expectedContributionClasses ?? ["bugfix", "tests"]
  };
}
function createDefaultConfig() {
  return {
    version: 1,
    runtime: {
      stateDir: ".state",
      workspaceDir: ".workspace"
    },
    policy: {
      maxActiveExperimental: 1,
      requireDifferentiationNoteOnOverride: true,
      laneGuardrails: {
        docs: {
          maxChangedFiles: 20,
          maxDiffLines: 800,
          forbiddenPathPatterns: []
        },
        tests: {
          maxChangedFiles: 30,
          maxDiffLines: 1500,
          forbiddenPathPatterns: []
        },
        simple_bugs: {
          maxChangedFiles: 35,
          maxDiffLines: 1800,
          forbiddenPathPatterns: []
        },
        experimental: {
          maxChangedFiles: 80,
          maxDiffLines: 5e3,
          forbiddenPathPatterns: []
        }
      }
    },
    github: {
      provider: "github_mcp_then_pat_api",
      mcpUrl: "https://api.githubcopilot.com/mcp/",
      mcpTokenEnvVar: "GITHUB_PERSONAL_ACCESS_TOKEN"
    },
    codex: {
      binary: "codex",
      implementer: makeDefaultImplementerRoleConfig(),
      testImplementer: makeDefaultTestImplementerRoleConfig(),
      reviewer: makeDefaultReviewerRoleConfig()
    },
    validationProfiles: [
      {
        id: "docs-basic",
        description: "Diff hygiene checks for documentation-only changes.",
        commands: [["git", "diff", "--check"]],
        cwdMode: "worktree",
        required: true,
        parser: "exit_code",
        baselineProfile: "none",
        autonomyClass: "fully_autonomous"
      },
      {
        id: "docs-app-build",
        description: "Build the docs app when docs application sources are touched.",
        commands: [["yarn", "workspace", "open-mercato-docs", "build"]],
        cwdMode: "target_root",
        required: false,
        parser: "line_set",
        baselineProfile: "target_head",
        autonomyClass: "fully_autonomous"
      },
      makeWorkspaceValidationProfile({
        id: "app-package-checks",
        workspaceName: "@open-mercato/app",
        description: "Typecheck and unit tests for the main app workspace."
      }),
      makeWorkspaceValidationProfile({
        id: "ai-assistant-package-checks",
        workspaceName: "@open-mercato/ai-assistant",
        description: "Typecheck and unit tests for the AI assistant package."
      }),
      makeWorkspaceValidationProfile({
        id: "cache-package-checks",
        workspaceName: "@open-mercato/cache",
        description: "Typecheck and unit tests for the cache package."
      }),
      makeWorkspaceValidationProfile({
        id: "checkout-package-checks",
        workspaceName: "@open-mercato/checkout",
        description: "Typecheck and unit tests for the checkout package."
      }),
      makeWorkspaceValidationProfile({
        id: "cli-package-checks",
        workspaceName: "@open-mercato/cli",
        description: "Typecheck and unit tests for the CLI workspace package."
      }),
      makeWorkspaceValidationProfile({
        id: "content-package-checks",
        workspaceName: "@open-mercato/content",
        description: "Typecheck and unit tests for the content package."
      }),
      makeWorkspaceValidationProfile({
        id: "core-package-checks",
        workspaceName: "@open-mercato/core",
        description: "Typecheck and unit tests for the core package."
      }),
      makeWorkspaceValidationProfile({
        id: "create-app-package-checks",
        workspaceName: "create-mercato-app",
        description: "Typecheck and tests for create-mercato-app.",
        runInBand: false
      }),
      makeWorkspaceValidationProfile({
        id: "enterprise-package-checks",
        workspaceName: "@open-mercato/enterprise",
        description: "Typecheck and unit tests for the enterprise package."
      }),
      makeWorkspaceValidationProfile({
        id: "events-package-checks",
        workspaceName: "@open-mercato/events",
        description: "Typecheck and unit tests for the events package."
      }),
      makeWorkspaceValidationProfile({
        id: "gateway-stripe-package-checks",
        workspaceName: "@open-mercato/gateway-stripe",
        description: "Typecheck and unit tests for the Stripe gateway package."
      }),
      {
        id: "integration-test-gap-coverage",
        description: "Targeted spec-coverage check for dedicated integration-gap tasks.",
        commands: [["yarn", "mercato", "test:integration:spec-coverage", "--json"]],
        cwdMode: "worktree",
        required: true,
        parser: "integration_spec_coverage",
        baselineProfile: "none",
        autonomyClass: "fully_autonomous"
      },
      {
        id: "integration-tests",
        description: "Playwright integration suite for dedicated test tasks.",
        commands: [["yarn", "mercato", "test:integration"]],
        cwdMode: "worktree",
        required: false,
        parser: "line_set",
        baselineProfile: "target_head",
        autonomyClass: "approval_sensitive"
      },
      makeWorkspaceValidationProfile({
        id: "onboarding-package-checks",
        workspaceName: "@open-mercato/onboarding",
        description: "Typecheck and unit tests for the onboarding package."
      }),
      makeWorkspaceValidationProfile({
        id: "queue-package-checks",
        workspaceName: "@open-mercato/queue",
        description: "Typecheck and unit tests for the queue package."
      }),
      makeWorkspaceValidationProfile({
        id: "scheduler-package-checks",
        workspaceName: "@open-mercato/scheduler",
        description: "Typecheck and unit tests for the scheduler package."
      }),
      makeWorkspaceValidationProfile({
        id: "search-package-checks",
        workspaceName: "@open-mercato/search",
        description: "Typecheck and unit tests for the search package."
      }),
      makeWorkspaceValidationProfile({
        id: "shared-package-checks",
        workspaceName: "@open-mercato/shared",
        description: "Typecheck and unit tests for the shared workspace package."
      }),
      makeWorkspaceValidationProfile({
        id: "sync-akeneo-package-checks",
        workspaceName: "@open-mercato/sync-akeneo",
        description: "Typecheck and unit tests for the Akeneo sync package."
      }),
      makeWorkspaceValidationProfile({
        id: "ui-package-checks",
        workspaceName: "@open-mercato/ui",
        description: "Typecheck and unit tests for the UI package."
      }),
      makeWorkspaceValidationProfile({
        id: "webhooks-package-checks",
        workspaceName: "@open-mercato/webhooks",
        description: "Typecheck and unit tests for the webhooks package."
      })
    ],
    targets: [
      {
        id: "open-mercato",
        repoUrl: "https://github.com/open-mercato/open-mercato.git",
        defaultBaseBranch: "develop",
        clonePath: ".workspace/targets/open-mercato",
        worktreeRoot: ".workspace/worktrees/open-mercato",
        artifactRoot: ".workspace/artifacts",
        upstreamOwner: "open-mercato",
        upstreamRepo: "open-mercato",
        forkOwner: "",
        forkRepoUrl: "",
        forkRemoteName: "fork",
        areaRules: [
          makeAreaRule({
            id: "docs-root",
            patterns: ["README.md", "CONTRIBUTING.md", ".ai/specs/**", "docs/**"],
            lane: "docs",
            riskZone: "low",
            primaryAreaOwners: ["docs"],
            validationProfileIds: ["docs-basic"],
            expectedContributionClasses: ["docs"]
          }),
          makeAreaRule({
            id: "docs-app",
            patterns: ["apps/docs/**"],
            lane: "docs",
            riskZone: "low",
            primaryAreaOwners: ["docs"],
            validationProfileIds: ["docs-basic", "docs-app-build"],
            expectedContributionClasses: ["docs"]
          }),
          makeAreaRule({
            id: "tests",
            patterns: ["tests/**", ".ai/qa/**"],
            lane: "tests",
            riskZone: "low",
            primaryAreaOwners: ["qa"],
            validationProfileIds: ["integration-tests"],
            expectedContributionClasses: ["tests"]
          }),
          makeAreaRule({
            id: "app",
            patterns: ["apps/mercato/**"],
            lane: "experimental",
            riskZone: "high",
            primaryAreaOwners: ["app"],
            validationProfileIds: ["app-package-checks"]
          }),
          makeAreaRule({
            id: "ai-assistant",
            patterns: ["packages/ai-assistant/**"],
            riskZone: "high",
            primaryAreaOwners: ["ai-assistant"],
            validationProfileIds: ["ai-assistant-package-checks"]
          }),
          makeAreaRule({
            id: "cache",
            patterns: ["packages/cache/**"],
            riskZone: "high",
            primaryAreaOwners: ["cache"],
            validationProfileIds: ["cache-package-checks"]
          }),
          makeAreaRule({
            id: "checkout",
            patterns: ["packages/checkout/**"],
            primaryAreaOwners: ["checkout"],
            validationProfileIds: ["checkout-package-checks"]
          }),
          makeAreaRule({
            id: "cli",
            patterns: ["packages/cli/**"],
            primaryAreaOwners: ["cli"],
            validationProfileIds: ["cli-package-checks"]
          }),
          makeAreaRule({
            id: "content",
            patterns: ["packages/content/**"],
            primaryAreaOwners: ["content"],
            validationProfileIds: ["content-package-checks"]
          }),
          makeAreaRule({
            id: "core",
            patterns: ["packages/core/**"],
            lane: "experimental",
            riskZone: "high",
            primaryAreaOwners: ["core"],
            validationProfileIds: ["core-package-checks"]
          }),
          makeAreaRule({
            id: "create-app",
            patterns: ["packages/create-app/**"],
            primaryAreaOwners: ["create-app"],
            validationProfileIds: ["create-app-package-checks"]
          }),
          makeAreaRule({
            id: "enterprise",
            patterns: ["packages/enterprise/**"],
            lane: "experimental",
            riskZone: "high",
            primaryAreaOwners: ["enterprise"],
            validationProfileIds: ["enterprise-package-checks"]
          }),
          makeAreaRule({
            id: "events",
            patterns: ["packages/events/**"],
            riskZone: "high",
            primaryAreaOwners: ["events"],
            validationProfileIds: ["events-package-checks"]
          }),
          makeAreaRule({
            id: "gateway-stripe",
            patterns: ["packages/gateway-stripe/**"],
            primaryAreaOwners: ["gateway-stripe"],
            validationProfileIds: ["gateway-stripe-package-checks"]
          }),
          makeAreaRule({
            id: "onboarding",
            patterns: ["packages/onboarding/**"],
            primaryAreaOwners: ["onboarding"],
            validationProfileIds: ["onboarding-package-checks"]
          }),
          makeAreaRule({
            id: "queue",
            patterns: ["packages/queue/**"],
            riskZone: "high",
            primaryAreaOwners: ["queue"],
            validationProfileIds: ["queue-package-checks"]
          }),
          makeAreaRule({
            id: "scheduler",
            patterns: ["packages/scheduler/**"],
            riskZone: "high",
            primaryAreaOwners: ["scheduler"],
            validationProfileIds: ["scheduler-package-checks"]
          }),
          makeAreaRule({
            id: "search",
            patterns: ["packages/search/**"],
            riskZone: "high",
            primaryAreaOwners: ["search"],
            validationProfileIds: ["search-package-checks"]
          }),
          makeAreaRule({
            id: "shared",
            patterns: ["packages/shared/**"],
            primaryAreaOwners: ["shared"],
            validationProfileIds: ["shared-package-checks"]
          }),
          makeAreaRule({
            id: "sync-akeneo",
            patterns: ["packages/sync-akeneo/**"],
            primaryAreaOwners: ["sync-akeneo"],
            validationProfileIds: ["sync-akeneo-package-checks"]
          }),
          makeAreaRule({
            id: "ui",
            patterns: ["packages/ui/**"],
            lane: "experimental",
            riskZone: "medium",
            primaryAreaOwners: ["ui"],
            validationProfileIds: ["ui-package-checks"]
          }),
          makeAreaRule({
            id: "webhooks",
            patterns: ["packages/webhooks/**"],
            riskZone: "high",
            primaryAreaOwners: ["webhooks"],
            validationProfileIds: ["webhooks-package-checks"]
          })
        ]
      }
    ],
    doctorExpectations: []
  };
}
async function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const gitPath = path.join(current, ".git");
    if (await pathExists(packageJsonPath) && await pathExists(gitPath)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not find repository root from ${startDir}`);
    }
    current = parent;
  }
}
async function loadConfig(repoRoot, configFilePath = path.join(repoRoot, CONFIG_FILE_NAME)) {
  const config = await readJsonFile(configFilePath);
  if (!config) {
    throw new Error(`Missing ${CONFIG_FILE_NAME}. Run "hackonctl init" first.`);
  }
  return {
    config: hackonConfigSchema.parse(config),
    configFilePath
  };
}
async function writeDefaultConfig(repoRoot, configFilePath = path.join(repoRoot, CONFIG_FILE_NAME)) {
  if (await pathExists(configFilePath)) {
    return false;
  }
  await ensureDir(path.dirname(configFilePath));
  await writeJsonFileAtomic(configFilePath, createDefaultConfig());
  return true;
}
async function bootstrapRuntimeLayout(repoRoot, config) {
  await ensureDir(path.join(repoRoot, config.runtime.stateDir));
  await ensureDir(path.join(repoRoot, config.runtime.stateDir, "tasks"));
  await ensureDir(path.join(repoRoot, config.runtime.stateDir, "locks"));
  await ensureDir(path.join(repoRoot, config.runtime.workspaceDir));
  await ensureDir(path.join(repoRoot, config.runtime.workspaceDir, "targets"));
  await ensureDir(path.join(repoRoot, config.runtime.workspaceDir, "worktrees"));
  await ensureDir(path.join(repoRoot, config.runtime.workspaceDir, "artifacts"));
}
async function updateConfigValue(repoRoot, mutate, configFilePath = path.join(repoRoot, CONFIG_FILE_NAME)) {
  const current = await loadConfig(repoRoot, configFilePath);
  const next = mutate(current.config);
  await writeJsonFileAtomic(configFilePath, hackonConfigSchema.parse(next));
}
async function readFileTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
export {
  CONFIG_FILE_NAME,
  bootstrapRuntimeLayout,
  createDefaultConfig,
  findRepoRoot,
  loadConfig,
  readFileTextIfExists,
  updateConfigValue,
  writeDefaultConfig
};
//# sourceMappingURL=config.js.map
