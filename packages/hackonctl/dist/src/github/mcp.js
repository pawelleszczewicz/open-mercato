class McpGitHubAdapter {
  constructor(mcpCaller) {
    this.callMcp = mcpCaller;
  }
  async listPullRequests(params) {
    return this.callMcp("mcp__github__list_pull_requests", {
      owner: params.owner,
      repo: params.repo,
      state: params.state,
      base: params.base,
      page: params.page,
      per_page: params.perPage
    });
  }
  async getPullRequest(params) {
    return this.callMcp("mcp__github__get_pull_request", {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.number
    });
  }
  async getPullRequestReviews(params) {
    return this.callMcp("mcp__github__get_pull_request_reviews", {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.number
    });
  }
  async getPullRequestStatus(params) {
    return this.callMcp("mcp__github__get_pull_request_status", {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.number
    });
  }
  async getPullRequestFiles(params) {
    return this.callMcp("mcp__github__get_pull_request_files", {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.number
    });
  }
  async createPullRequest(params) {
    return this.callMcp("mcp__github__create_pull_request", {
      owner: params.owner,
      repo: params.repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
      draft: params.draft ?? true
    });
  }
  async updatePullRequest(params) {
    return this.callMcp("mcp__github__update_pull_request", {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.number,
      title: params.title,
      body: params.body,
      state: params.state
    });
  }
  async addComment(params) {
    await this.callMcp("mcp__github__add_issue_comment", {
      owner: params.owner,
      repo: params.repo,
      issue_number: params.issueNumber,
      body: params.body
    });
  }
  async listIssues(params) {
    return this.callMcp("mcp__github__list_issues", {
      owner: params.owner,
      repo: params.repo,
      state: params.state,
      labels: params.labels,
      page: params.page,
      per_page: params.perPage
    });
  }
  async searchIssues(params) {
    const result = await this.callMcp("mcp__github__search_issues", {
      q: params.query,
      page: params.page,
      per_page: params.perPage
    });
    return result.items ?? result;
  }
}
export {
  McpGitHubAdapter
};
//# sourceMappingURL=mcp.js.map
