import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { configSchema, type HackonConfig } from './schema'

export class ConfigError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message)
    this.name = 'ConfigError'
  }
}

export function loadConfig(rootDir: string, filename = 'hackonctl.config.json'): HackonConfig {
  const configPath = resolve(rootDir, filename)

  if (!existsSync(configPath)) {
    throw new ConfigError(
      `Config file not found: ${configPath}\nRun 'hackonctl init' to create one.`
    )
  }

  let raw: unknown
  try {
    const content = readFileSync(configPath, 'utf-8')
    raw = JSON.parse(content)
  } catch (err) {
    throw new ConfigError(`Failed to parse config file: ${configPath}`, err)
  }

  const result = configSchema.safeParse(raw)
  if (!result.success) {
    throw new ConfigError(
      `Invalid config:\n${result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`,
      result.error
    )
  }

  return result.data
}

export function resolveConfigPaths(config: HackonConfig, rootDir: string) {
  return {
    targetDir: resolve(rootDir, config.workspace.targetDir),
    worktreeDir: resolve(rootDir, config.workspace.worktreeDir),
    registryFile: resolve(rootDir, config.workspace.registryFile),
  }
}
