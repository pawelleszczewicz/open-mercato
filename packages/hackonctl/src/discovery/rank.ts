import type { DiscoveryCandidate } from './types'

export function rankCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  return [...candidates].sort((a, b) => {
    // Higher points first
    if (b.expectedPoints !== a.expectedPoints) return b.expectedPoints - a.expectedPoints

    // Higher confidence first
    const confidenceOrder = { high: 3, medium: 2, low: 1 }
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence]
    if (confDiff !== 0) return confDiff

    // Lower risk first
    const riskOrder = { green: 0, yellow: 1, red: 2 }
    const riskDiff = riskOrder[a.suggestedRiskZone] - riskOrder[b.suggestedRiskZone]
    if (riskDiff !== 0) return riskDiff

    // Alphabetical by title as tiebreaker
    return a.title.localeCompare(b.title)
  })
}

export function deduplicateCandidates(candidates: DiscoveryCandidate[]): DiscoveryCandidate[] {
  const seen = new Set<string>()
  return candidates.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}
