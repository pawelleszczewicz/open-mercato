import type { TaskRecord } from '../registry/types'
import type { HackonConfig } from '../config/schema'

export function generateReviewerPrompt(
  task: TaskRecord,
  config: HackonConfig,
  prNumber: number,
): string {
  const sections: string[] = []

  sections.push(`# Review: PR #${prNumber} — ${task.source.title}`)
  sections.push(``)
  sections.push(`## Task Context`)
  sections.push(`- Task: ${task.taskId}`)
  sections.push(`- Lane: ${task.lane}`)
  sections.push(`- Risk zone: ${task.riskZone}`)
  sections.push(`- Expected classes: ${task.expectedClasses.join(', ')}`)
  sections.push(``)

  sections.push(`## Review Checklist`)
  sections.push(`1. Does the PR address the stated problem?`)
  sections.push(`2. Are changes minimal and focused?`)
  sections.push(`3. Does the code follow existing patterns in the codebase?`)
  sections.push(`4. Are there any obvious bugs or regressions?`)
  sections.push(`5. Are tests included where appropriate?`)
  sections.push(`6. Is the diff size within limits (${config.policy.changedFileLimit[task.lane] ?? 20} files, ${config.policy.diffLineLimit[task.lane] ?? 600} lines)?`)
  sections.push(`7. Are forbidden paths untouched?`)
  sections.push(``)

  sections.push(`## Instructions`)
  sections.push(`- Read the PR diff via GitHub MCP tools`)
  sections.push(`- Post review comments with the ${config.github.commentPrefixes.reviewer} prefix`)
  sections.push(`- If changes are needed, request changes with specific feedback`)
  sections.push(`- If the PR is good, approve it`)
  sections.push(`- Focus on correctness and safety, not style preferences`)

  return sections.join('\n')
}
