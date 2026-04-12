import { buildPRBody, formatPRTitle, type PRBodyParams, type ReviewSummary } from '../github/pr'
import type { TaskRecord } from '../registry/types'
import type { GateRunResult } from '../gates/runner'

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'HCK-0001',
    source: { type: 'github_issue', id: '42', title: 'Fix login redirect bug' },
    lane: 'simple_bugs',
    riskZone: 'green',
    branchName: 'fix/hackon/hck-0001-login-redirect',
    prNumber: null,
    expectedClasses: ['bugfix'],
    duplicateRisk: 'none',
    abandoned: false,
    createdAt: '2026-04-11T00:00:00Z',
    notes: [],
    ...overrides,
  }
}

function makeGateResults(overrides: Partial<GateRunResult> = {}): GateRunResult {
  return {
    passed: true,
    results: [
      { gate: 'forbidden_paths', passed: true, message: 'No forbidden paths touched', duration: 0 },
      { gate: 'file_count', passed: true, message: '3 files changed (limit: 15)', duration: 0 },
      { gate: 'lint', passed: true, message: 'Passed', duration: 1200 },
      { gate: 'typecheck', passed: true, message: 'Passed', duration: 3400 },
      { gate: 'test', passed: true, message: 'Passed', duration: 5600 },
    ],
    diffStats: { filesChanged: 3, linesAdded: 45, linesRemoved: 12, totalLines: 57 },
    forbiddenPathViolations: [],
    ...overrides,
  }
}

describe('buildPRBody', () => {
  it('builds body without review summary', () => {
    const body = buildPRBody({
      task: makeTask(),
      summary: 'Fixed the login redirect issue',
      changedFiles: ['packages/core/src/auth/login.ts', 'packages/core/src/auth/__tests__/login.test.ts'],
      gateResults: makeGateResults(),
    })

    expect(body).toContain('GitHub issue #42')
    expect(body).toContain('## Summary')
    expect(body).toContain('Fixed the login redirect issue')
    expect(body).toContain('## Changes')
    expect(body).toContain('`packages/core/src/auth/login.ts`')
    expect(body).toContain('+45 / -12')
    expect(body).toContain('## Validation')
    expect(body).toContain('PASS lint')
    expect(body).toContain('## Expected Contribution Classes')
    expect(body).toContain('- bugfix')
    expect(body).not.toContain('## Review Summary')
  })

  it('builds body with clean review (no concerns)', () => {
    const review: ReviewSummary = {
      rounds: 1,
      concerns: [],
      verdict: 'approved',
      confidence: 'high',
    }

    const body = buildPRBody({
      task: makeTask(),
      summary: 'Fixed the bug',
      changedFiles: ['file.ts'],
      gateResults: makeGateResults(),
      review,
    })

    expect(body).toContain('## Review Summary')
    expect(body).toContain('Rounds: 1')
    expect(body).toContain('Concerns raised: None')
    expect(body).toContain('Reviewer verdict: Approved')
    expect(body).toContain('Confidence: High')
  })

  it('builds body with multi-round review', () => {
    const review: ReviewSummary = {
      rounds: 2,
      concerns: ['Missing null check in handler', 'Test did not cover edge case'],
      verdict: 'approved',
      confidence: 'medium',
      notes: 'Edge case coverage could be stronger but is acceptable',
    }

    const body = buildPRBody({
      task: makeTask(),
      summary: 'Fixed the bug',
      changedFiles: ['file.ts'],
      gateResults: makeGateResults(),
      review,
    })

    expect(body).toContain('Rounds: 2 — fixed 2 issues')
    expect(body).toContain('Missing null check in handler; Test did not cover edge case')
    expect(body).toContain('Confidence: Medium')
    expect(body).toContain('Notes: Edge case coverage could be stronger')
  })

  it('builds body with single concern fixed', () => {
    const review: ReviewSummary = {
      rounds: 2,
      concerns: ['Unused import left behind'],
      verdict: 'approved',
      confidence: 'high',
    }

    const body = buildPRBody({
      task: makeTask(),
      summary: 'Fixed the bug',
      changedFiles: ['file.ts'],
      gateResults: makeGateResults(),
      review,
    })

    expect(body).toContain('Rounds: 2 — fixed: Unused import left behind')
  })

  it('includes integration gap source label', () => {
    const body = buildPRBody({
      task: makeTask({
        source: { type: 'integration_gap', id: 'TC-AUTH-015', title: 'Auth login flow test' },
        expectedClasses: ['tests'],
      }),
      summary: 'Added integration test',
      changedFiles: ['test.spec.ts'],
      gateResults: makeGateResults(),
    })

    expect(body).toContain('Integration test gap: TC-AUTH-015')
  })

  it('includes repo signal source label', () => {
    const body = buildPRBody({
      task: makeTask({
        source: { type: 'repo_signal', id: 'TESTSIG-skipped-jwt', title: 'Skipped jwt test' },
        expectedClasses: ['tests'],
      }),
      summary: 'Re-enabled test',
      changedFiles: ['test.ts'],
      gateResults: makeGateResults(),
    })

    expect(body).toContain('Repository signal: TESTSIG-skipped-jwt')
  })

  it('truncates long file lists', () => {
    const files = Array.from({ length: 25 }, (_, i) => `file-${i}.ts`)
    const body = buildPRBody({
      task: makeTask(),
      summary: 'Big change',
      changedFiles: files,
      gateResults: makeGateResults(),
    })

    expect(body).toContain('`file-19.ts`')
    expect(body).not.toContain('`file-20.ts`')
    expect(body).toContain('... and 5 more files')
  })
})

describe('formatPRTitle', () => {
  it('uses fix prefix for bugfix', () => {
    expect(formatPRTitle(makeTask())).toBe('fix: Fix login redirect bug')
  })

  it('uses tests prefix for test tasks', () => {
    expect(formatPRTitle(makeTask({ expectedClasses: ['tests'] }))).toBe('tests: Fix login redirect bug')
  })

  it('uses docs prefix for doc tasks', () => {
    expect(formatPRTitle(makeTask({ expectedClasses: ['docs'] }))).toBe('docs: Fix login redirect bug')
  })

  it('uses chore prefix for unknown classes', () => {
    expect(formatPRTitle(makeTask({ expectedClasses: ['refactor'] }))).toBe('chore: Fix login redirect bug')
  })
})
