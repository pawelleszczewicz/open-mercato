import type { HackonConfig, Lane } from '../config/schema'
import type { RegistryStore } from '../registry/store'

export interface PolicyCheckResult {
  allowed: boolean
  reason?: string
}

export function checkLaneCapacity(config: HackonConfig, registry: RegistryStore, lane: Lane): PolicyCheckResult {
  const active = registry.getByLane(lane)
  const limit = config.lanes[lane].maxActive

  if (active.length >= limit) {
    return {
      allowed: false,
      reason: `Lane '${lane}' at capacity: ${active.length}/${limit} active tasks`,
    }
  }

  return { allowed: true }
}

export function checkAutoReady(
  config: HackonConfig,
  lane: Lane,
  riskZone: string,
  hasUnresolvedComments: boolean,
): PolicyCheckResult {
  const mode = config.policy.autoReadyMode

  if (mode === 'off') {
    return { allowed: false, reason: 'auto_ready_mode is off' }
  }

  if (riskZone === 'red' || riskZone === 'yellow') {
    return { allowed: false, reason: `Auto-ready not allowed for ${riskZone} risk zone` }
  }

  if (lane === 'experimental') {
    return { allowed: false, reason: 'Auto-ready not allowed for experimental lane' }
  }

  if (hasUnresolvedComments) {
    return { allowed: false, reason: 'PR has unresolved comments' }
  }

  if (mode === 'safe_only') {
    if (lane === 'docs' || lane === 'tests') {
      return { allowed: true }
    }
    return { allowed: false, reason: `Lane '${lane}' not eligible for safe_only auto-ready` }
  }

  if (mode === 'expanded') {
    if (lane === 'docs' || lane === 'tests' || lane === 'simple_bugs') {
      return { allowed: true }
    }
    return { allowed: false, reason: `Lane '${lane}' not eligible for expanded auto-ready` }
  }

  return { allowed: false, reason: 'Unknown auto_ready_mode' }
}
