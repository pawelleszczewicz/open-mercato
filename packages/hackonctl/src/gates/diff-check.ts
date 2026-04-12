import { exec } from '../lib/shell'

export interface DiffStats {
  filesChanged: number
  linesAdded: number
  linesRemoved: number
  totalLines: number
}

export function getDiffStats(worktreePath: string, baseBranch: string): DiffStats {
  const result = exec(`git diff --stat "${baseBranch}"...HEAD`, { cwd: worktreePath })
  if (!result.success) {
    return { filesChanged: 0, linesAdded: 0, linesRemoved: 0, totalLines: 0 }
  }

  const lines = result.stdout.split('\n')
  const summaryLine = lines[lines.length - 1]

  const filesMatch = summaryLine?.match(/(\d+) files? changed/)
  const insertionsMatch = summaryLine?.match(/(\d+) insertions?/)
  const deletionsMatch = summaryLine?.match(/(\d+) deletions?/)

  const linesAdded = insertionsMatch ? parseInt(insertionsMatch[1], 10) : 0
  const linesRemoved = deletionsMatch ? parseInt(deletionsMatch[1], 10) : 0

  return {
    filesChanged: filesMatch ? parseInt(filesMatch[1], 10) : 0,
    linesAdded,
    linesRemoved,
    totalLines: linesAdded + linesRemoved,
  }
}

export function getChangedFiles(worktreePath: string, baseBranch: string): string[] {
  const result = exec(`git diff --name-only "${baseBranch}"...HEAD`, { cwd: worktreePath })
  if (!result.success) return []
  return result.stdout.split('\n').filter(Boolean)
}

export function checkForbiddenPaths(changedFiles: string[], forbiddenPaths: string[]): string[] {
  if (forbiddenPaths.length === 0) return []

  return changedFiles.filter(file =>
    forbiddenPaths.some(forbidden => file.startsWith(forbidden))
  )
}
