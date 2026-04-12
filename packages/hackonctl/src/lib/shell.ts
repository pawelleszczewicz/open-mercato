import { execSync, type ExecSyncOptions } from 'node:child_process'

export interface ShellResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number
}

export function exec(command: string, options?: ExecSyncOptions): ShellResult {
  try {
    const stdout = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 300_000,
      ...options,
    }) as string
    return { success: true, stdout: stdout.trim(), stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; status?: number }
    return {
      success: false,
      stdout: (error.stdout ?? '').toString().trim(),
      stderr: (error.stderr ?? '').toString().trim(),
      exitCode: error.status ?? 1,
    }
  }
}

export function execOrThrow(command: string, options?: ExecSyncOptions): string {
  const result = exec(command, options)
  if (!result.success) {
    throw new Error(`Command failed (exit ${result.exitCode}): ${command}\n${result.stderr}`)
  }
  return result.stdout
}
