import { exec } from '../lib/shell'
import type { DiscoveryCandidate } from './types'

export interface SpecCoverageReport {
  scenarios: {
    total: number
    covered: number
    uncovered: number
    coveragePercent: number
  }
  uncoveredScenarioIds: string[]
}

export function runSpecCoverage(rootDir: string): SpecCoverageReport | null {
  const result = exec('yarn mercato test:integration:spec-coverage --json', { cwd: rootDir })
  if (!result.success) return null

  try {
    return JSON.parse(result.stdout) as SpecCoverageReport
  } catch {
    return null
  }
}

export function integrationGapsToCandidates(report: SpecCoverageReport): DiscoveryCandidate[] {
  return report.uncoveredScenarioIds.map(scenarioId => {
    const categoryMatch = scenarioId.match(/^TC-([A-Z-]+)-\d+/)
    const category = categoryMatch?.[1] ?? 'UNKNOWN'

    return {
      id: `TESTSIG-integration-scenario-${scenarioId.toLowerCase()}`,
      sourceType: 'integration_gap' as const,
      sourceId: scenarioId,
      title: `Uncovered integration test scenario: ${scenarioId}`,
      description: `Integration test gap for scenario ${scenarioId} (category: ${category}). Use the integration-tests skill to generate a Playwright test.`,
      suggestedLane: 'tests' as const,
      suggestedRiskZone: 'green' as const,
      expectedClasses: ['tests'],
      expectedPoints: 3,
      confidence: 'high' as const,
      candidatePaths: [`.ai/qa/scenarios/${scenarioId}*.md`],
    }
  })
}
