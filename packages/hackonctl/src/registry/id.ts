export function formatTaskId(num: number): string {
  return `HCK-${String(num).padStart(4, '0')}`
}

export function parseTaskId(id: string): number | null {
  const match = id.match(/^HCK-(\d{4,})$/)
  if (!match) return null
  return parseInt(match[1], 10)
}
