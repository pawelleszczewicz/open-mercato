import type { HackonConfig } from '../config/schema'

export type AgentRole = 'coordinator' | 'implementer' | 'reviewer'

export function formatComment(config: HackonConfig, role: AgentRole, body: string): string {
  const prefix = config.github.commentPrefixes[role]
  return `${prefix} ${body}`
}

export function parseCommentRole(config: HackonConfig, comment: string): AgentRole | null {
  for (const [role, prefix] of Object.entries(config.github.commentPrefixes)) {
    if (comment.startsWith(prefix)) {
      return role as AgentRole
    }
  }
  return null
}
