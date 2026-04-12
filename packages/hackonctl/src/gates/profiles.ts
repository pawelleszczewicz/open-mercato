import type { Lane, HackonConfig } from '../config/schema'

export interface GateProfile {
  lint: boolean
  typecheck: boolean
  test: boolean
  diffCheck: boolean
  integrationTest: boolean
  changedFileLimit: number
  diffLineLimit: number
}

export function getGateProfile(config: HackonConfig, lane: Lane): GateProfile {
  return {
    lint: true,
    typecheck: true,
    test: true,
    diffCheck: true,
    integrationTest: lane === 'tests',
    changedFileLimit: config.policy.changedFileLimit[lane] ?? 20,
    diffLineLimit: config.policy.diffLineLimit[lane] ?? 600,
  }
}
