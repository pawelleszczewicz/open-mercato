import { existsSync } from 'node:fs'
import { exec } from '../lib/shell'
import type { HackonConfig } from '../config/schema'
import type { WorkspacePaths } from '../lib/paths'

export interface DiagnosticCheck {
  name: string
  passed: boolean
  message: string
}

export function runDiagnostics(config: HackonConfig, paths: WorkspacePaths): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []

  // Config loaded
  checks.push({
    name: 'config',
    passed: true,
    message: `Loaded from ${paths.configFile}`,
  })

  // Git available
  const gitCheck = exec('git --version')
  checks.push({
    name: 'git',
    passed: gitCheck.success,
    message: gitCheck.success ? gitCheck.stdout : 'git not found',
  })

  // Target directory
  checks.push({
    name: 'target_dir',
    passed: existsSync(paths.targetDir),
    message: existsSync(paths.targetDir) ? `Exists: ${paths.targetDir}` : `Missing: ${paths.targetDir}`,
  })

  // Worktree directory
  checks.push({
    name: 'worktree_dir',
    passed: existsSync(paths.worktreeDir),
    message: existsSync(paths.worktreeDir) ? `Exists: ${paths.worktreeDir}` : `Missing: ${paths.worktreeDir}`,
  })

  // Registry file
  checks.push({
    name: 'registry',
    passed: existsSync(paths.registryFile),
    message: existsSync(paths.registryFile) ? `Exists: ${paths.registryFile}` : `No registry yet (will be created on first task)`,
  })

  // Git remote
  const remoteCheck = exec('git remote -v')
  const hasOrigin = remoteCheck.stdout.includes('origin')
  checks.push({
    name: 'git_remote',
    passed: hasOrigin,
    message: hasOrigin ? 'origin remote configured' : 'No origin remote found',
  })

  // GitHub identity
  checks.push({
    name: 'github_operator',
    passed: Boolean(config.github.operatorUsername),
    message: `Operator: ${config.github.operatorUsername}`,
  })

  checks.push({
    name: 'github_fork',
    passed: Boolean(config.github.forkOwner),
    message: `Fork: ${config.github.forkOwner}/${config.github.upstreamRepo}`,
  })

  // Yarn available
  const yarnCheck = exec('yarn --version')
  checks.push({
    name: 'yarn',
    passed: yarnCheck.success,
    message: yarnCheck.success ? `yarn ${yarnCheck.stdout}` : 'yarn not found',
  })

  // Node available
  const nodeCheck = exec('node --version')
  checks.push({
    name: 'node',
    passed: nodeCheck.success,
    message: nodeCheck.success ? `node ${nodeCheck.stdout}` : 'node not found',
  })

  return checks
}

export function formatDiagnostics(checks: DiagnosticCheck[]): string {
  const lines = checks.map(c => {
    const icon = c.passed ? 'OK' : 'FAIL'
    return `  [${icon}] ${c.name}: ${c.message}`
  })

  const passed = checks.filter(c => c.passed).length
  const total = checks.length

  return [
    'hackonctl doctor',
    '---',
    ...lines,
    '---',
    `${passed}/${total} checks passed`,
  ].join('\n')
}
