import type { RegistryStore } from '../registry/store'
import type { GitHubAdapter } from '../github/adapter'
import type { HackonConfig } from '../config/schema'
import { deriveTaskState, type DerivedTaskState } from '../state/derive'
import type { TaskRecord } from '../registry/types'

export interface TaskStatusRow {
  taskId: string
  lane: string
  source: string
  state: string
  portalStatus: string
  judgeStatus: string
  prNumber: string
  title: string
}

export async function getStatusRows(
  registry: RegistryStore,
  github: GitHubAdapter,
  config: HackonConfig,
): Promise<TaskStatusRow[]> {
  const tasks = registry.getAll()
  const rows: TaskStatusRow[] = []

  for (const task of tasks) {
    let derived: DerivedTaskState
    try {
      derived = await deriveTaskState(
        task,
        github,
        config.github.upstreamOwner,
        config.github.upstreamRepo,
      )
    } catch {
      derived = {
        state: task.abandoned ? 'abandoned' : 'registered',
        portalStatus: 'not_submitted',
        judgeStatus: 'not_started',
        prState: null,
      }
    }

    rows.push({
      taskId: task.taskId,
      lane: task.lane,
      source: formatSource(task),
      state: derived.state,
      portalStatus: derived.portalStatus,
      judgeStatus: derived.judgeStatus,
      prNumber: task.prNumber ? `#${task.prNumber}` : '-',
      title: task.source.title.slice(0, 60),
    })
  }

  return rows
}

export function formatStatusTable(rows: TaskStatusRow[]): string {
  if (rows.length === 0) return 'No tasks in registry.'

  const headers = ['Task', 'Lane', 'State', 'Portal', 'Judge', 'PR', 'Title']
  const data = rows.map(r => [r.taskId, r.lane, r.state, r.portalStatus, r.judgeStatus, r.prNumber, r.title])

  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...data.map(row => row[i].length))
  )

  const separator = colWidths.map(w => '-'.repeat(w)).join(' | ')
  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ')
  const dataLines = data.map(row =>
    row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ')
  )

  return [headerLine, separator, ...dataLines].join('\n')
}

function formatSource(task: TaskRecord): string {
  if (task.source.type === 'github_issue') return `issue#${task.source.id}`
  if (task.source.type === 'integration_gap') return `gap:${task.source.id}`
  return `signal:${task.source.id.slice(0, 20)}`
}
