import { configSchema } from '../config/schema'

describe('configSchema', () => {
  const minimalConfig = {
    version: 1,
    github: {
      operatorUsername: 'testuser',
      forkOwner: 'testuser',
    },
  }

  it('parses minimal config with defaults', () => {
    const result = configSchema.safeParse(minimalConfig)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.github.operatorUsername).toBe('testuser')
    expect(result.data.github.upstreamOwner).toBe('open-mercato')
    expect(result.data.github.upstreamRepo).toBe('open-mercato')
    expect(result.data.github.baseBranch).toBe('develop')
    expect(result.data.workspace.registryFile).toBe('.state/registry.json')
    expect(result.data.lanes.docs.maxActive).toBe(1)
    expect(result.data.lanes.tests.maxActive).toBe(1)
    expect(result.data.policy.autoReadyMode).toBe('off')
    expect(result.data.policy.gates.lint).toBe('yarn lint')
    expect(result.data.discovery.enableGithubIssues).toBe(true)
  })

  it('parses full config', () => {
    const fullConfig = {
      version: 1,
      github: {
        operatorUsername: 'myuser',
        upstreamOwner: 'open-mercato',
        upstreamRepo: 'open-mercato',
        forkOwner: 'myuser',
        baseBranch: 'main',
        commentPrefixes: {
          coordinator: '[coord]',
          implementer: '[impl]',
          reviewer: '[rev]',
        },
      },
      workspace: {
        targetDir: '/tmp/target',
        worktreeDir: '/tmp/worktrees',
        registryFile: '/tmp/registry.json',
      },
      lanes: {
        docs: { maxActive: 3 },
        tests: { maxActive: 2 },
        simple_bugs: { maxActive: 1 },
        experimental: { maxActive: 0 },
      },
      policy: {
        autoReadyMode: 'safe_only' as const,
        forbiddenPaths: ['packages/core/src/modules/auth/'],
        changedFileLimit: { docs: 10 },
        diffLineLimit: { docs: 300 },
        gates: {
          lint: 'npm run lint',
          typecheck: 'npm run typecheck',
          test: 'npm run test',
        },
      },
      discovery: {
        enableGithubIssues: false,
        enableRepoSignals: true,
        enableIntegrationGaps: true,
        issueLabels: ['bug', 'good-first-issue'],
        maxCandidates: 100,
      },
    }

    const result = configSchema.safeParse(fullConfig)
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.github.baseBranch).toBe('main')
    expect(result.data.lanes.docs.maxActive).toBe(3)
    expect(result.data.policy.autoReadyMode).toBe('safe_only')
    expect(result.data.policy.forbiddenPaths).toContain('packages/core/src/modules/auth/')
    expect(result.data.discovery.enableGithubIssues).toBe(false)
  })

  it('rejects missing version', () => {
    const result = configSchema.safeParse({ github: { operatorUsername: 'x', forkOwner: 'x' } })
    expect(result.success).toBe(false)
  })

  it('rejects wrong version', () => {
    const result = configSchema.safeParse({ ...minimalConfig, version: 2 })
    expect(result.success).toBe(false)
  })

  it('rejects missing github.operatorUsername', () => {
    const result = configSchema.safeParse({ version: 1, github: { forkOwner: 'x' } })
    expect(result.success).toBe(false)
  })

  it('rejects invalid autoReadyMode', () => {
    const result = configSchema.safeParse({
      ...minimalConfig,
      policy: { autoReadyMode: 'invalid' },
    })
    expect(result.success).toBe(false)
  })
})
