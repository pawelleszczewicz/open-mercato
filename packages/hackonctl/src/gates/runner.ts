import type { HackonConfig, Lane } from '../config/schema'
import { exec, type ShellResult } from '../lib/shell'
import { getGateProfile, type GateProfile } from './profiles'
import { getDiffStats, getChangedFiles, checkForbiddenPaths, type DiffStats } from './diff-check'

export interface GateResult {
  gate: string
  passed: boolean
  message: string
  duration: number
}

export interface GateRunResult {
  passed: boolean
  results: GateResult[]
  diffStats: DiffStats
  forbiddenPathViolations: string[]
}

function runGateCommand(name: string, command: string, cwd: string): GateResult {
  const start = Date.now()
  const result = exec(command, { cwd })
  const duration = Date.now() - start

  return {
    gate: name,
    passed: result.success,
    message: result.success ? 'Passed' : result.stderr || result.stdout || 'Failed',
    duration,
  }
}

export function runGates(
  config: HackonConfig,
  lane: Lane,
  worktreePath: string,
  baseBranch: string,
): GateRunResult {
  const profile = getGateProfile(config, lane)
  const results: GateResult[] = []
  let allPassed = true

  // 1. Forbidden path check
  const changedFiles = getChangedFiles(worktreePath, baseBranch)
  const forbiddenPathViolations = checkForbiddenPaths(changedFiles, config.policy.forbiddenPaths)
  if (forbiddenPathViolations.length > 0) {
    results.push({
      gate: 'forbidden_paths',
      passed: false,
      message: `Forbidden paths touched: ${forbiddenPathViolations.join(', ')}`,
      duration: 0,
    })
    allPassed = false
  } else {
    results.push({ gate: 'forbidden_paths', passed: true, message: 'No forbidden paths touched', duration: 0 })
  }

  // 2. Diff size check
  const diffStats = getDiffStats(worktreePath, baseBranch)

  if (profile.diffCheck) {
    if (diffStats.filesChanged > profile.changedFileLimit) {
      results.push({
        gate: 'file_count',
        passed: false,
        message: `${diffStats.filesChanged} files changed (limit: ${profile.changedFileLimit})`,
        duration: 0,
      })
      allPassed = false
    } else {
      results.push({
        gate: 'file_count',
        passed: true,
        message: `${diffStats.filesChanged} files changed (limit: ${profile.changedFileLimit})`,
        duration: 0,
      })
    }

    if (diffStats.totalLines > profile.diffLineLimit) {
      results.push({
        gate: 'diff_size',
        passed: false,
        message: `${diffStats.totalLines} lines changed (limit: ${profile.diffLineLimit})`,
        duration: 0,
      })
      allPassed = false
    } else {
      results.push({
        gate: 'diff_size',
        passed: true,
        message: `${diffStats.totalLines} lines changed (limit: ${profile.diffLineLimit})`,
        duration: 0,
      })
    }
  }

  // Fail-fast: skip expensive gates if cheap checks failed
  if (!allPassed) {
    return { passed: false, results, diffStats, forbiddenPathViolations }
  }

  // 3. Lint
  if (profile.lint) {
    const lintResult = runGateCommand('lint', config.policy.gates.lint, worktreePath)
    results.push(lintResult)
    if (!lintResult.passed) allPassed = false
  }

  if (!allPassed) {
    return { passed: false, results, diffStats, forbiddenPathViolations }
  }

  // 4. Typecheck
  if (profile.typecheck) {
    const typecheckResult = runGateCommand('typecheck', config.policy.gates.typecheck, worktreePath)
    results.push(typecheckResult)
    if (!typecheckResult.passed) allPassed = false
  }

  if (!allPassed) {
    return { passed: false, results, diffStats, forbiddenPathViolations }
  }

  // 5. Test
  if (profile.test) {
    const testResult = runGateCommand('test', config.policy.gates.test, worktreePath)
    results.push(testResult)
    if (!testResult.passed) allPassed = false
  }

  return { passed: allPassed, results, diffStats, forbiddenPathViolations }
}
