import type { TaskRecord } from '../registry/types'
import type { GitHubAdapter } from '../github/adapter'
import { readPRState, type PRState } from '../github/state-reader'
import { exec } from '../lib/shell'

export type DerivedState =
  | 'registered'
  | 'implementing'
  | 'draft'
  | 'changes_requested'
  | 'approved'
  | 'submitted'
  | 'judge_pending'
  | 'judge_approved'
  | 'judge_rejected'
  | 'merged'
  | 'closed'
  | 'abandoned'

export type PortalStatus = 'not_submitted' | 'submitted'
export type JudgeStatus = 'not_started' | 'pending' | 'approved' | 'adjusted' | 'rejected'

export interface DerivedTaskState {
  state: DerivedState
  portalStatus: PortalStatus
  judgeStatus: JudgeStatus
  prState: PRState | null
}

export function branchExists(branchName: string, cwd?: string): boolean {
  const result = exec(`git rev-parse --verify ${branchName}`, { cwd: cwd ?? process.cwd() })
  return result.success
}

export function derivePortalStatus(draft: boolean): PortalStatus {
  return draft ? 'not_submitted' : 'submitted'
}

export function deriveJudgeStatus(draft: boolean, labels: string[], hasMaintainerApproval: boolean): JudgeStatus {
  if (draft) return 'not_started'
  if (labels.includes('judge-rejected')) return 'rejected'
  if (labels.includes('score-adjusted')) return 'adjusted'
  if (hasMaintainerApproval) return 'approved'
  return 'pending'
}

export function deriveStateFromPRState(task: TaskRecord, prState: PRState): DerivedState {
  const { pr, labels, latestReview, hasMaintainerApproval } = prState

  if (pr.merged_at !== null) return 'merged'
  if (pr.state === 'closed') return 'closed'

  if (!pr.draft) {
    if (labels.includes('judge-rejected')) return 'judge_rejected'
    if (labels.includes('judge-approved') || hasMaintainerApproval) return 'judge_approved'
    return 'judge_pending'
  }

  if (latestReview?.state === 'CHANGES_REQUESTED') return 'changes_requested'
  if (latestReview?.state === 'APPROVED') return 'approved'
  return 'draft'
}

export async function deriveTaskState(
  task: TaskRecord,
  github: GitHubAdapter,
  owner: string,
  repo: string,
  cwd?: string,
): Promise<DerivedTaskState> {
  if (task.abandoned) {
    return { state: 'abandoned', portalStatus: 'not_submitted', judgeStatus: 'not_started', prState: null }
  }

  if (task.prNumber === null) {
    const state = branchExists(task.branchName, cwd) ? 'implementing' : 'registered'
    return { state, portalStatus: 'not_submitted', judgeStatus: 'not_started', prState: null }
  }

  const prState = await readPRState(github, owner, repo, task.prNumber)
  const state = deriveStateFromPRState(task, prState)
  const portalStatus = derivePortalStatus(prState.pr.draft)
  const judgeStatus = deriveJudgeStatus(prState.pr.draft, prState.labels, prState.hasMaintainerApproval)

  return { state, portalStatus, judgeStatus, prState }
}
