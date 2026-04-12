import type { Lane } from '../config/schema'

const LANE_PREFIX: Record<Lane, string> = {
  docs: 'docs',
  tests: 'test',
  simple_bugs: 'fix',
  experimental: 'feat',
}

export function generateBranchName(lane: Lane, taskId: string, slug: string): string {
  const prefix = LANE_PREFIX[lane]
  const cleanSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return `${prefix}/hackon/${taskId.toLowerCase()}-${cleanSlug}`
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}
