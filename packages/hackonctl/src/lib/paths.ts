import { resolve } from 'node:path'
import type { HackonConfig } from '../config/schema'

export interface WorkspacePaths {
  root: string
  targetDir: string
  worktreeDir: string
  registryFile: string
  configFile: string
}

export function resolveWorkspacePaths(rootDir: string, config: HackonConfig): WorkspacePaths {
  return {
    root: rootDir,
    targetDir: resolve(rootDir, config.workspace.targetDir),
    worktreeDir: resolve(rootDir, config.workspace.worktreeDir),
    registryFile: resolve(rootDir, config.workspace.registryFile),
    configFile: resolve(rootDir, 'hackonctl.config.json'),
  }
}

export function worktreePath(worktreeDir: string, taskId: string): string {
  return resolve(worktreeDir, taskId)
}
