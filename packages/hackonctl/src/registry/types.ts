import type { Lane } from '../config/schema'

export type RiskZone = 'green' | 'yellow' | 'red'

export type DuplicateRisk = 'none' | 'low' | 'medium' | 'likely_duplicate'

export type SourceType = 'github_issue' | 'repo_signal' | 'integration_gap'

export interface TaskSource {
  type: SourceType
  id: string
  title: string
}

export interface TaskRecord {
  taskId: string
  source: TaskSource
  lane: Lane
  riskZone: RiskZone
  branchName: string
  prNumber: number | null
  expectedClasses: string[]
  duplicateRisk: DuplicateRisk
  abandoned: boolean
  createdAt: string
  notes: string[]
}

export interface TaskRegistry {
  version: 1
  nextTaskNumber: number
  tasks: TaskRecord[]
}

export const EMPTY_REGISTRY: TaskRegistry = {
  version: 1,
  nextTaskNumber: 1,
  tasks: [],
}
