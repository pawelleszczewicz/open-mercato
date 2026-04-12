import type { TaskRecord } from '../registry/types'
import type { HackonConfig } from '../config/schema'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export function generateImplementerPrompt(
  task: TaskRecord,
  config: HackonConfig,
  worktreePath: string,
): string {
  const sections: string[] = []

  sections.push(`# Task: ${task.taskId} — ${task.source.title}`)
  sections.push(``)
  sections.push(`## Context`)
  sections.push(`- Lane: ${task.lane}`)
  sections.push(`- Risk zone: ${task.riskZone}`)
  sections.push(`- Expected contribution classes: ${task.expectedClasses.join(', ')}`)
  sections.push(`- Source: ${task.source.type} — ${task.source.id}`)
  sections.push(`- Working directory: ${worktreePath}`)
  sections.push(`- Target branch: ${config.github.baseBranch}`)
  sections.push(``)

  if (task.source.type === 'github_issue') {
    sections.push(`## GitHub Issue`)
    sections.push(`Read issue #${task.source.id} for full context.`)
    sections.push(``)
  }

  if (task.source.type === 'integration_gap') {
    sections.push(`## Integration Test Gap`)
    sections.push(`This task covers an uncovered integration test scenario: ${task.source.id}`)
    sections.push(`Use the integration-tests skill pattern to generate a Playwright test.`)
    sections.push(`Check .ai/qa/scenarios/${task.source.id}*.md for the scenario description.`)
    sections.push(``)
  }

  sections.push(`## Rules`)
  sections.push(`- Read AGENTS.md and relevant module AGENTS.md files before making changes`)
  sections.push(`- Follow existing code patterns — do not introduce new abstractions`)
  sections.push(`- Keep changes minimal and focused on the task`)
  sections.push(`- Run tests after making changes to verify correctness`)
  sections.push(`- Do not modify files outside the scope of this task`)
  sections.push(``)

  sections.push(`## Constraints`)
  sections.push(`- Max changed files: ${config.policy.changedFileLimit[task.lane] ?? 20}`)
  sections.push(`- Max diff lines: ${config.policy.diffLineLimit[task.lane] ?? 600}`)
  if (config.policy.forbiddenPaths.length > 0) {
    sections.push(`- Forbidden paths: ${config.policy.forbiddenPaths.join(', ')}`)
  }

  // Include template if available
  const templateMap: Record<string, string> = {
    bugfix: 'implementer-bugfix.md',
    critical_bugfix: 'implementer-bugfix.md',
    tests: 'implementer-test.md',
    docs: 'implementer-docs.md',
  }

  const templateFile = templateMap[task.expectedClasses[0]]
  if (templateFile) {
    const templatePath = resolve(__dirname, 'templates', templateFile)
    if (existsSync(templatePath)) {
      sections.push(``)
      sections.push(readFileSync(templatePath, 'utf-8'))
    }
  }

  return sections.join('\n')
}
