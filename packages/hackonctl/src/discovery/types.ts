import type { Lane } from '../config/schema'
import type { SourceType, RiskZone } from '../registry/types'

export interface DiscoveryCandidate {
  id: string
  sourceType: SourceType
  sourceId: string
  title: string
  description: string
  suggestedLane: Lane
  suggestedRiskZone: RiskZone
  expectedClasses: string[]
  expectedPoints: number
  confidence: 'high' | 'medium' | 'low'
  candidatePaths: string[]
}

export interface DiscoveryResult {
  candidates: DiscoveryCandidate[]
  source: 'github_issues' | 'repo_signals' | 'integration_gaps'
  timestamp: string
}
