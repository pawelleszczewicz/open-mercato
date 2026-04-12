import type { GitHubAdapter, GitHubIssue } from '../github/adapter'
import type { HackonConfig } from '../config/schema'
import type { DiscoveryCandidate } from './types'
import type { Lane } from '../config/schema'
import type { RiskZone } from '../registry/types'

export async function fetchOpenIssues(
  github: GitHubAdapter,
  config: HackonConfig,
): Promise<GitHubIssue[]> {
  const allIssues: GitHubIssue[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const issues = await github.listIssues(
      config.github.upstreamOwner,
      config.github.upstreamRepo,
      {
        state: 'open',
        labels: config.discovery.issueLabels.length > 0
          ? config.discovery.issueLabels.join(',')
          : undefined,
        per_page: perPage,
        page,
      },
    )

    allIssues.push(...issues)
    if (issues.length < perPage) break
    page++
  }

  return allIssues
}

function classifyIssue(issue: GitHubIssue): { lane: Lane; riskZone: RiskZone; classes: string[]; points: number } {
  const labels = issue.labels.map(l => l.name.toLowerCase())
  const title = issue.title.toLowerCase()

  if (labels.includes('documentation') || labels.includes('docs') || title.startsWith('docs:')) {
    return { lane: 'docs', riskZone: 'green', classes: ['docs'], points: 2 }
  }

  if (labels.includes('test') || labels.includes('testing') || title.startsWith('test:') || title.startsWith('tests:')) {
    return { lane: 'tests', riskZone: 'green', classes: ['tests'], points: 3 }
  }

  const isCritical = labels.includes('critical') || labels.includes('security') || labels.includes('crash') || labels.includes('data-loss')
  if (isCritical) {
    return { lane: 'experimental', riskZone: 'red', classes: ['critical_bugfix'], points: 10 }
  }

  if (labels.includes('bug') || title.startsWith('bug:') || title.startsWith('fix:')) {
    return { lane: 'simple_bugs', riskZone: 'green', classes: ['bugfix'], points: 5 }
  }

  if (labels.includes('good first issue') || labels.includes('good-first-issue')) {
    return { lane: 'simple_bugs', riskZone: 'green', classes: ['bugfix'], points: 5 }
  }

  return { lane: 'experimental', riskZone: 'yellow', classes: ['bugfix'], points: 5 }
}

export function issuesToCandidates(issues: GitHubIssue[]): DiscoveryCandidate[] {
  return issues
    .filter(issue => !issue.assignee)
    .map(issue => {
      const { lane, riskZone, classes, points } = classifyIssue(issue)

      return {
        id: `github-issue-${issue.number}`,
        sourceType: 'github_issue' as const,
        sourceId: String(issue.number),
        title: issue.title,
        description: issue.body?.slice(0, 500) ?? '',
        suggestedLane: lane,
        suggestedRiskZone: riskZone,
        expectedClasses: classes,
        expectedPoints: points,
        confidence: 'medium' as const,
        candidatePaths: [],
      }
    })
}
