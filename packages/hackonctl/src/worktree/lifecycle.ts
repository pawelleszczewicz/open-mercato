import { existsSync } from 'node:fs'
import { exec, execOrThrow } from '../lib/shell'
import { worktreePath } from '../lib/paths'

export function createWorktree(
  worktreeDir: string,
  taskId: string,
  branchName: string,
  baseBranch: string,
): string {
  const path = worktreePath(worktreeDir, taskId)

  if (existsSync(path)) {
    return path
  }

  execOrThrow(`git worktree add "${path}" -b "${branchName}" "${baseBranch}"`)
  return path
}

export function removeWorktree(worktreeDir: string, taskId: string): void {
  const path = worktreePath(worktreeDir, taskId)

  if (!existsSync(path)) return

  exec(`git worktree remove "${path}" --force`)
}

export function listWorktrees(): string[] {
  const result = exec('git worktree list --porcelain')
  if (!result.success) return []

  return result.stdout
    .split('\n')
    .filter(line => line.startsWith('worktree '))
    .map(line => line.replace('worktree ', ''))
}

export function worktreeExists(worktreeDir: string, taskId: string): boolean {
  const path = worktreePath(worktreeDir, taskId)
  return existsSync(path)
}
