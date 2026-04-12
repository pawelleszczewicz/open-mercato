import type { HackonConfig, Lane } from '../config/schema'
import type { DiscoveryCandidate } from '../discovery/types'
import type { TaskSource, RiskZone, DuplicateRisk } from '../registry/types'
import type { RegistryStore } from '../registry/store'
import { generateBranchName, slugify } from '../worktree/branch'

export interface QualificationResult {
  qualified: boolean
  reason?: string
  source: TaskSource
  lane: Lane
  riskZone: RiskZone
  branchName: string
  expectedClasses: string[]
  duplicateRisk: DuplicateRisk
}

export function qualifyCandidate(
  candidate: DiscoveryCandidate,
  config: HackonConfig,
  registry: RegistryStore,
  duplicateRisk: DuplicateRisk,
): QualificationResult {
  const lane = candidate.suggestedLane
  const riskZone = candidate.suggestedRiskZone

  // Check lane capacity
  const activeTasks = registry.getByLane(lane)
  const laneConfig = config.lanes[lane]
  if (activeTasks.length >= laneConfig.maxActive) {
    return {
      qualified: false,
      reason: `Lane '${lane}' is at capacity (${activeTasks.length}/${laneConfig.maxActive})`,
      source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
      lane,
      riskZone,
      branchName: '',
      expectedClasses: candidate.expectedClasses,
      duplicateRisk,
    }
  }

  // Block likely duplicates
  if (duplicateRisk === 'likely_duplicate') {
    return {
      qualified: false,
      reason: 'Likely duplicate — blocked',
      source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
      lane,
      riskZone,
      branchName: '',
      expectedClasses: candidate.expectedClasses,
      duplicateRisk,
    }
  }

  // Red-zone items must go to experimental lane
  if (riskZone === 'red' && lane !== 'experimental') {
    return {
      qualified: false,
      reason: 'Red-zone items must use experimental lane',
      source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
      lane: 'experimental',
      riskZone,
      branchName: '',
      expectedClasses: candidate.expectedClasses,
      duplicateRisk,
    }
  }

  const slug = slugify(candidate.title)
  const taskId = `HCK-${String(registry.nextTaskNumber).padStart(4, '0')}`
  const branchName = generateBranchName(lane, taskId, slug)

  return {
    qualified: true,
    source: { type: candidate.sourceType, id: candidate.sourceId, title: candidate.title },
    lane,
    riskZone,
    branchName,
    expectedClasses: candidate.expectedClasses,
    duplicateRisk,
  }
}
