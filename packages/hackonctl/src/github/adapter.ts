export interface GitHubPR {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  draft: boolean
  merged_at: string | null
  created_at: string
  updated_at: string
  head: { ref: string; sha: string }
  base: { ref: string }
  labels: Array<{ name: string }>
  user: { login: string }
}

export interface GitHubReview {
  id: number
  user: { login: string }
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING' | 'DISMISSED'
  submitted_at: string | null
  body: string
  author_association: string
}

export interface GitHubCheckStatus {
  state: 'success' | 'pending' | 'failure' | 'error'
  statuses: Array<{
    context: string
    state: string
    description: string | null
  }>
}

export interface GitHubComment {
  id: number
  user: { login: string }
  body: string
  created_at: string
}

export interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: Array<{ name: string }>
  assignee: { login: string } | null
  created_at: string
  updated_at: string
}

export interface GitHubAdapter {
  getPullRequest(owner: string, repo: string, prNumber: number): Promise<GitHubPR>
  getPullRequestReviews(owner: string, repo: string, prNumber: number): Promise<GitHubReview[]>
  getPullRequestStatus(owner: string, repo: string, prNumber: number): Promise<GitHubCheckStatus>
  getPullRequestComments(owner: string, repo: string, prNumber: number): Promise<GitHubComment[]>
  listPullRequests(owner: string, repo: string, options?: { state?: 'open' | 'closed' | 'all'; per_page?: number; page?: number }): Promise<GitHubPR[]>
  listIssues(owner: string, repo: string, options?: { state?: 'open' | 'closed' | 'all'; labels?: string; per_page?: number; page?: number }): Promise<GitHubIssue[]>
  createPullRequest(owner: string, repo: string, params: { title: string; body: string; head: string; base: string; draft?: boolean }): Promise<GitHubPR>
  updatePullRequest(owner: string, repo: string, prNumber: number, params: { draft?: boolean; title?: string; body?: string }): Promise<GitHubPR>
  addComment(owner: string, repo: string, issueNumber: number, body: string): Promise<GitHubComment>
}
