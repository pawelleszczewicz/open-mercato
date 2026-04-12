import { writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { HackonConfig } from '../config/schema'

export function generateDefaultConfig(operatorUsername: string, forkOwner: string): HackonConfig {
  return {
    version: 1,
    github: {
      operatorUsername,
      upstreamOwner: 'open-mercato',
      upstreamRepo: 'open-mercato',
      forkOwner,
      baseBranch: 'develop',
      commentPrefixes: {
        coordinator: '[coordinator-agent]',
        implementer: '[implementer-agent]',
        reviewer: '[reviewer-agent]',
      },
    },
    workspace: {
      targetDir: '.workspace/targets/open-mercato',
      worktreeDir: '.workspace/worktrees/open-mercato',
      registryFile: '.state/registry.json',
    },
    lanes: {
      docs: { maxActive: 2 },
      tests: { maxActive: 2 },
      simple_bugs: { maxActive: 1 },
      experimental: { maxActive: 1 },
    },
    policy: {
      autoReadyMode: 'off',
      forbiddenPaths: [],
      changedFileLimit: { docs: 20, tests: 25, simple_bugs: 15, experimental: 40 },
      diffLineLimit: { docs: 600, tests: 800, simple_bugs: 500, experimental: 1200 },
      gates: {
        lint: 'yarn lint',
        typecheck: 'yarn typecheck',
        test: 'yarn test',
      },
    },
    discovery: {
      enableGithubIssues: true,
      enableRepoSignals: true,
      enableIntegrationGaps: true,
      issueLabels: [],
      maxCandidates: 50,
    },
  }
}

export function writeConfig(rootDir: string, config: HackonConfig): string {
  const configPath = resolve(rootDir, 'hackonctl.config.json')

  if (existsSync(configPath)) {
    throw new Error(`Config already exists: ${configPath}`)
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  return configPath
}
