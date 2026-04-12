import {
  deriveStateFromPRState,
  derivePortalStatus,
  deriveJudgeStatus,
  type DerivedState,
} from '../state/derive'
import type { TaskRecord } from '../registry/types'
import type { PRState } from '../github/state-reader'
import type { GitHubPR, GitHubReview } from '../github/adapter'

function makePR(overrides: Partial<GitHubPR> = {}): GitHubPR {
  return {
    number: 100,
    title: 'Test PR',
    body: '',
    state: 'open',
    draft: true,
    merged_at: null,
    created_at: '2026-04-11T00:00:00Z',
    updated_at: '2026-04-11T00:00:00Z',
    head: { ref: 'test-branch', sha: 'abc123' },
    base: { ref: 'develop' },
    labels: [],
    user: { login: 'testuser' },
    ...overrides,
  }
}

function makeReview(overrides: Partial<GitHubReview> = {}): GitHubReview {
  return {
    id: 1,
    user: { login: 'reviewer' },
    state: 'COMMENTED',
    submitted_at: '2026-04-11T01:00:00Z',
    body: '',
    author_association: 'COLLABORATOR',
    ...overrides,
  }
}

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    taskId: 'HCK-0001',
    source: { type: 'github_issue', id: '1', title: 'Test' },
    lane: 'simple_bugs',
    riskZone: 'green',
    branchName: 'fix/hackon/hck-0001-test',
    prNumber: 100,
    expectedClasses: ['bugfix'],
    duplicateRisk: 'none',
    abandoned: false,
    createdAt: '2026-04-11T00:00:00Z',
    notes: [],
    ...overrides,
  }
}

function makePRState(overrides: Partial<PRState> = {}): PRState {
  const pr = overrides.pr ?? makePR()
  return {
    pr,
    reviews: overrides.reviews ?? [],
    labels: overrides.labels ?? pr.labels.map(l => l.name),
    latestReview: overrides.latestReview ?? null,
    hasMaintainerApproval: overrides.hasMaintainerApproval ?? false,
  }
}

describe('derivePortalStatus', () => {
  it('returns not_submitted for draft PRs', () => {
    expect(derivePortalStatus(true)).toBe('not_submitted')
  })

  it('returns submitted for non-draft PRs', () => {
    expect(derivePortalStatus(false)).toBe('submitted')
  })
})

describe('deriveJudgeStatus', () => {
  it('returns not_started for draft PRs', () => {
    expect(deriveJudgeStatus(true, [], false)).toBe('not_started')
  })

  it('returns rejected when judge-rejected label exists', () => {
    expect(deriveJudgeStatus(false, ['judge-rejected'], false)).toBe('rejected')
  })

  it('returns adjusted when score-adjusted label exists', () => {
    expect(deriveJudgeStatus(false, ['score-adjusted'], false)).toBe('adjusted')
  })

  it('returns approved with maintainer approval', () => {
    expect(deriveJudgeStatus(false, [], true)).toBe('approved')
  })

  it('returns pending for non-draft without signals', () => {
    expect(deriveJudgeStatus(false, [], false)).toBe('pending')
  })

  it('prioritizes rejected over approval', () => {
    expect(deriveJudgeStatus(false, ['judge-rejected'], true)).toBe('rejected')
  })
})

describe('deriveStateFromPRState', () => {
  const task = makeTask()

  it('returns merged when PR has merged_at', () => {
    const prState = makePRState({ pr: makePR({ merged_at: '2026-04-11T05:00:00Z' }) })
    expect(deriveStateFromPRState(task, prState)).toBe('merged')
  })

  it('returns closed when PR is closed without merge', () => {
    const prState = makePRState({ pr: makePR({ state: 'closed', merged_at: null }) })
    expect(deriveStateFromPRState(task, prState)).toBe('closed')
  })

  it('returns judge_approved for non-draft with maintainer approval', () => {
    const prState = makePRState({
      pr: makePR({ draft: false }),
      hasMaintainerApproval: true,
    })
    expect(deriveStateFromPRState(task, prState)).toBe('judge_approved')
  })

  it('returns judge_rejected for non-draft with judge-rejected label', () => {
    const prState = makePRState({
      pr: makePR({ draft: false, labels: [{ name: 'judge-rejected' }] }),
      labels: ['judge-rejected'],
    })
    expect(deriveStateFromPRState(task, prState)).toBe('judge_rejected')
  })

  it('returns judge_pending for non-draft without judge signals', () => {
    const prState = makePRState({
      pr: makePR({ draft: false }),
    })
    expect(deriveStateFromPRState(task, prState)).toBe('judge_pending')
  })

  it('returns changes_requested for draft with CHANGES_REQUESTED review', () => {
    const review = makeReview({ state: 'CHANGES_REQUESTED' })
    const prState = makePRState({
      pr: makePR({ draft: true }),
      latestReview: review,
    })
    expect(deriveStateFromPRState(task, prState)).toBe('changes_requested')
  })

  it('returns approved for draft with APPROVED review', () => {
    const review = makeReview({ state: 'APPROVED' })
    const prState = makePRState({
      pr: makePR({ draft: true }),
      latestReview: review,
    })
    expect(deriveStateFromPRState(task, prState)).toBe('approved')
  })

  it('returns draft for draft PR with no reviews', () => {
    const prState = makePRState({ pr: makePR({ draft: true }) })
    expect(deriveStateFromPRState(task, prState)).toBe('draft')
  })

  it('returns draft for draft PR with only COMMENTED reviews', () => {
    const review = makeReview({ state: 'COMMENTED' })
    const prState = makePRState({
      pr: makePR({ draft: true }),
      reviews: [review],
      latestReview: null,
    })
    expect(deriveStateFromPRState(task, prState)).toBe('draft')
  })

  it('merged takes priority over everything', () => {
    const prState = makePRState({
      pr: makePR({ merged_at: '2026-04-11T05:00:00Z', draft: false, labels: [{ name: 'judge-rejected' }] }),
      labels: ['judge-rejected'],
      hasMaintainerApproval: true,
    })
    expect(deriveStateFromPRState(task, prState)).toBe('merged')
  })
})
