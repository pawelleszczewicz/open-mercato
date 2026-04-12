import { checkAutoReady } from '../qualification/policy'
import { qualifyCandidate } from '../qualification/qualify'
import { RegistryStore } from '../registry/store'
import type { HackonConfig } from '../config/schema'
import type { DiscoveryCandidate } from '../discovery/types'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { configSchema } from '../config/schema'

function makeConfig(overrides: Record<string, unknown> = {}): HackonConfig {
  return configSchema.parse({
    version: 1,
    github: { operatorUsername: 'test', forkOwner: 'test' },
    ...overrides,
  })
}

function makeCandidate(overrides: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate {
  return {
    id: 'test-candidate',
    sourceType: 'github_issue',
    sourceId: '42',
    title: 'Fix a bug',
    description: 'Description',
    suggestedLane: 'simple_bugs',
    suggestedRiskZone: 'green',
    expectedClasses: ['bugfix'],
    expectedPoints: 5,
    confidence: 'medium',
    candidatePaths: [],
    ...overrides,
  }
}

describe('qualifyCandidate', () => {
  let tmpDirs: string[] = []

  function freshStore(): RegistryStore {
    const dir = mkdtempSync(join(tmpdir(), 'hackonctl-qual-'))
    tmpDirs.push(dir)
    return new RegistryStore(join(dir, 'registry.json'))
  }

  afterAll(() => {
    for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true })
  })

  it('qualifies a green-lane candidate', () => {
    const config = makeConfig()
    const store = freshStore()
    const result = qualifyCandidate(makeCandidate(), config, store, 'none')

    expect(result.qualified).toBe(true)
    expect(result.lane).toBe('simple_bugs')
    expect(result.branchName).toContain('fix/hackon/hck-0001')
  })

  it('blocks when lane is at capacity', () => {
    const config = makeConfig({ lanes: { simple_bugs: { maxActive: 1 } } })
    const store = freshStore()
    store.createTask({
      source: { type: 'github_issue', id: '1', title: 'T' },
      lane: 'simple_bugs',
      riskZone: 'green',
      branchName: 'fix/existing',
      expectedClasses: ['bugfix'],
      duplicateRisk: 'none',
    })

    const result = qualifyCandidate(makeCandidate(), config, store, 'none')
    expect(result.qualified).toBe(false)
    expect(result.reason).toContain('capacity')
  })

  it('blocks likely duplicates', () => {
    const config = makeConfig()
    const store = freshStore()
    const result = qualifyCandidate(makeCandidate(), config, store, 'likely_duplicate')

    expect(result.qualified).toBe(false)
    expect(result.reason).toContain('duplicate')
  })

  it('blocks red-zone items in non-experimental lanes', () => {
    const config = makeConfig()
    const store = freshStore()
    const result = qualifyCandidate(
      makeCandidate({ suggestedRiskZone: 'red' }),
      config,
      store,
      'none',
    )

    expect(result.qualified).toBe(false)
    expect(result.reason).toContain('experimental')
  })
})

describe('checkAutoReady', () => {
  it('denies when mode is off', () => {
    const config = makeConfig()
    expect(checkAutoReady(config, 'docs', 'green', false).allowed).toBe(false)
  })

  it('allows docs in safe_only mode', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'safe_only' } })
    expect(checkAutoReady(config, 'docs', 'green', false).allowed).toBe(true)
  })

  it('allows tests in safe_only mode', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'safe_only' } })
    expect(checkAutoReady(config, 'tests', 'green', false).allowed).toBe(true)
  })

  it('denies simple_bugs in safe_only mode', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'safe_only' } })
    expect(checkAutoReady(config, 'simple_bugs', 'green', false).allowed).toBe(false)
  })

  it('allows simple_bugs in expanded mode', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'expanded' } })
    expect(checkAutoReady(config, 'simple_bugs', 'green', false).allowed).toBe(true)
  })

  it('denies experimental in any mode', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'expanded' } })
    expect(checkAutoReady(config, 'experimental', 'green', false).allowed).toBe(false)
  })

  it('denies when risk zone is red', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'expanded' } })
    expect(checkAutoReady(config, 'docs', 'red', false).allowed).toBe(false)
  })

  it('denies when there are unresolved comments', () => {
    const config = makeConfig({ policy: { autoReadyMode: 'safe_only' } })
    expect(checkAutoReady(config, 'docs', 'green', true).allowed).toBe(false)
  })
})
