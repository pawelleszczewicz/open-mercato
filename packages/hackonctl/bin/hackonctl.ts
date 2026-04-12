#!/usr/bin/env node

import { parseArgs } from '../src/cli/commands'
import { loadConfig } from '../src/config/loader'
import { resolveWorkspacePaths } from '../src/lib/paths'
import { RegistryStore } from '../src/registry/store'
import { runDiagnostics, formatDiagnostics } from '../src/cli/doctor'
import { generateDefaultConfig, writeConfig } from '../src/cli/init'
import { formatStatusTable, getStatusRows } from '../src/cli/status'

const HELP = `
hackonctl — HackOn Contribution Coordinator v2

Usage: hackonctl <command> [options]

Commands:
  init                    Create hackonctl.config.json
  discover                Find work candidates
  queue                   Show ranked candidate queue
  qualify <candidateId>   Qualify candidate → create task
  status [taskId]         Show task dashboard with derived GitHub state
  start <taskId>          Create worktree + branch
  gate <taskId>           Run local gate checks
  pr <taskId>             Create or sync draft PR
  review <taskId>         Print reviewer context
  ready <taskId>          Remove draft flag (= portal submission)
  close <taskId>          Abandon task + cleanup
  doctor                  System diagnostics

Options:
  --help, -h              Show this help
  --version, -v           Show version
`

async function main() {
  const { command, args, flags } = parseArgs(process.argv)

  if (!command || flags['help'] || flags['h']) {
    console.log(HELP)
    process.exit(0)
  }

  if (flags['version'] || flags['v']) {
    console.log('0.4.10')
    process.exit(0)
  }

  const rootDir = process.cwd()

  if (command === 'init') {
    const username = args[0]
    const fork = args[1] ?? username
    if (!username) {
      console.error('Usage: hackonctl init <github-username> [fork-owner]')
      process.exit(1)
    }
    const config = generateDefaultConfig(username, fork)
    const path = writeConfig(rootDir, config)
    console.log(`Created ${path}`)
    return
  }

  if (command === 'doctor') {
    const config = loadConfig(rootDir)
    const paths = resolveWorkspacePaths(rootDir, config)
    const checks = runDiagnostics(config, paths)
    console.log(formatDiagnostics(checks))
    return
  }

  if (command === 'status') {
    const config = loadConfig(rootDir)
    const paths = resolveWorkspacePaths(rootDir, config)
    const registry = new RegistryStore(paths.registryFile)

    if (registry.getAll().length === 0) {
      console.log('No tasks in registry.')
      return
    }

    // Status without GitHub (offline mode) — show registry-only info
    const rows = registry.getAll().map(task => ({
      taskId: task.taskId,
      lane: task.lane,
      source: task.source.type === 'github_issue' ? `issue#${task.source.id}` : task.source.id.slice(0, 20),
      state: task.abandoned ? 'abandoned' : task.prNumber ? 'has_pr' : 'registered',
      portalStatus: '-',
      judgeStatus: '-',
      prNumber: task.prNumber ? `#${task.prNumber}` : '-',
      title: task.source.title.slice(0, 60),
    }))

    console.log(formatStatusTable(rows))
    console.log('\nNote: Run with GitHub MCP for full derived state.')
    return
  }

  console.error(`Command '${command}' is not yet wired up in the CLI.\nUse hackonctl library functions from the coordinator agent.`)
  process.exit(1)
}

main().catch(err => {
  console.error(err.message ?? err)
  process.exit(1)
})
