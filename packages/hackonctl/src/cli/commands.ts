export type CommandName =
  | 'init'
  | 'discover'
  | 'queue'
  | 'qualify'
  | 'status'
  | 'start'
  | 'gate'
  | 'pr'
  | 'review'
  | 'ready'
  | 'close'
  | 'doctor'

export interface CommandContext {
  rootDir: string
  args: string[]
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>

export function parseArgs(argv: string[]): { command: CommandName | null; args: string[]; flags: Record<string, string | boolean> } {
  const raw = argv.slice(2)
  const command = raw[0] as CommandName | undefined
  const args: string[] = []
  const flags: Record<string, string | boolean> = {}

  for (let i = 1; i < raw.length; i++) {
    const arg = raw[i]
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=')
      if (eqIdx !== -1) {
        flags[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1)
      } else {
        flags[arg.slice(2)] = true
      }
    } else {
      args.push(arg)
    }
  }

  return { command: command ?? null, args, flags }
}
