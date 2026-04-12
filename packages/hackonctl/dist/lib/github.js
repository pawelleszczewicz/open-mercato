import { z } from "zod";
import { isCommandAvailable } from "./shell.js";
const githubIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().min(1),
  body: z.string().default(""),
  state: z.string().default("OPEN"),
  labels: z.array(z.string().min(1)).default([]),
  comments: z.number().int().nonnegative().default(0),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  authorLogin: z.string().nullable().default(null),
  assigneeLogins: z.array(z.string().min(1)).default([])
});
const githubPullRequestSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  url: z.string().min(1),
  body: z.string().default(""),
  state: z.string().default("OPEN"),
  isDraft: z.boolean().default(false),
  headRefName: z.string().default(""),
  baseRefName: z.string().default(""),
  mergedAt: z.string().nullable().default(null),
  closedAt: z.string().nullable().default(null),
  labels: z.array(z.string().min(1)).default([]),
  files: z.array(z.object({ path: z.string().min(1) })).default([])
});
const githubPullRequestCommentSchema = z.object({
  body: z.string().default(""),
  authorLogin: z.string().nullable().default(null),
  createdAt: z.string().nullable().default(null)
});
const githubPullRequestReviewSchema = z.object({
  state: z.string().default(""),
  body: z.string().default(""),
  authorLogin: z.string().nullable().default(null),
  submittedAt: z.string().nullable().default(null)
});
const githubPullRequestReviewThreadSchema = z.object({
  id: z.string().min(1),
  isResolved: z.boolean().default(false),
  isOutdated: z.boolean().default(false),
  comments: z.array(githubPullRequestCommentSchema).default([])
});
const githubPullRequestReviewSnapshotSchema = z.object({
  reviewDecision: z.string().nullable().default(null),
  comments: z.array(githubPullRequestCommentSchema).default([]),
  reviews: z.array(githubPullRequestReviewSchema).default([]),
  reviewThreads: z.array(githubPullRequestReviewThreadSchema).default([])
});
const DEFAULT_GITHUB_MCP_TIMEOUT_MS = 3e4;
const DEFAULT_GITHUB_API_TIMEOUT_MS = 3e4;
const GITHUB_API_REST_BASE_URL = "https://api.github.com";
const GITHUB_API_GRAPHQL_URL = "https://api.github.com/graphql";
class GithubProviderError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "GithubProviderError";
    this.unavailable = options.unavailable ?? false;
    this.fallbackSafe = options.fallbackSafe ?? false;
    if (options.cause !== void 0) {
      this.cause = options.cause;
    }
  }
}
class GithubMcpProvider {
  constructor(config) {
    this.config = config;
    this.sessionId = null;
    this.sessionPromise = null;
    this.requestId = 1;
  }
  async isAvailable(_target) {
    if (!this.getToken()) {
      return false;
    }
    try {
      await this.ensureSession();
      return true;
    } catch {
      return false;
    }
  }
  async getIssue(target, issueNumber) {
    const payload = await this.callTool("issue_read", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      issue_number: issueNumber,
      method: "get"
    }, { readOnly: true });
    if (!payload) {
      return null;
    }
    return normalizeIssue(payload);
  }
  async getPullRequest(target, prNumber) {
    const [pullRequestPayload, issuePayload] = await Promise.all([
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: prNumber,
        method: "get"
      }, { readOnly: true }),
      this.callTool("issue_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        issue_number: prNumber,
        method: "get"
      }, { readOnly: true })
    ]);
    if (!pullRequestPayload) {
      return null;
    }
    return normalizePullRequestRecord(pullRequestPayload, {
      fallbackLabels: normalizeLabels(asObject(issuePayload))
    });
  }
  async searchIssues(target, query, limit, page = 1) {
    const payload = await this.callTool("search_issues", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      query,
      perPage: limit,
      page
    }, { readOnly: true });
    const object = asObject(payload);
    const items = Array.isArray(payload) ? payload : Array.isArray(object?.items) ? object.items : [];
    return items.map((item) => normalizeIssue(item)).filter((issue) => issue !== null);
  }
  async searchPotentialDuplicatePullRequests(target, issueNumber) {
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
    const queries = [
      issueNumber ? `is:open ${issueNumber}` : "is:open",
      `is:merged merged:>=${sinceDate}`,
      issueNumber ? `is:closed ${issueNumber} closed:>=${sinceDate}` : `is:closed closed:>=${sinceDate}`
    ];
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const query of queries) {
      const payload = await this.callTool("search_pull_requests", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        query,
        perPage: 50
      }, { readOnly: true });
      for (const item of normalizeSearchPullRequestItems(payload)) {
        if (seen.has(item.number)) {
          continue;
        }
        seen.add(item.number);
        results.push(await this.enrichPullRequest(target, item));
      }
    }
    return results;
  }
  async createDraftPullRequest(target, options) {
    const existing = await this.findPullRequestByHead(target, options.branchName);
    if (existing) {
      return existing;
    }
    const head = target.forkOwner ? `${target.forkOwner}:${options.branchName}` : options.branchName;
    const payload = await this.callTool("create_pull_request", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      base: options.baseBranch,
      head,
      title: options.title,
      body: options.body,
      draft: true,
      maintainer_can_modify: false
    }, { readOnly: false });
    const pullRequest = normalizePullRequestCreateResult(payload);
    if (pullRequest) {
      return pullRequest;
    }
    const recovered = await this.findPullRequestByHead(target, options.branchName);
    if (recovered) {
      return recovered;
    }
    throw new GithubProviderError("GitHub MCP created a pull request but returned an unexpected payload.");
  }
  async updatePullRequestBody(target, options) {
    await this.callTool("update_pull_request", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      pullNumber: options.prNumber,
      body: options.body
    }, { readOnly: false });
  }
  async commentOnPullRequest(target, prNumber, body) {
    await this.callTool("add_issue_comment", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      issue_number: prNumber,
      body
    }, { readOnly: false });
  }
  async getPullRequestReviewSnapshot(target, prNumber) {
    const [pullRequestPayload, commentsPayload, reviewsPayload, reviewThreadsPayload] = await Promise.all([
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: prNumber,
        method: "get"
      }, { readOnly: true }),
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: prNumber,
        method: "get_comments",
        perPage: 100
      }, { readOnly: true }),
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: prNumber,
        method: "get_reviews",
        perPage: 100
      }, { readOnly: true }),
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: prNumber,
        method: "get_review_comments",
        perPage: 100
      }, { readOnly: true })
    ]);
    if (!pullRequestPayload) {
      return null;
    }
    const reviews = normalizeReviews(reviewsPayload);
    return githubPullRequestReviewSnapshotSchema.parse({
      reviewDecision: readString(asObject(pullRequestPayload), "reviewDecision") ?? readString(asObject(pullRequestPayload), "review_decision") ?? inferReviewDecision(reviews),
      comments: normalizeComments(commentsPayload),
      reviews,
      reviewThreads: normalizeReviewThreads(reviewThreadsPayload)
    });
  }
  async listPullRequestComments(target, prNumber) {
    const payload = await this.callTool("pull_request_read", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      pullNumber: prNumber,
      method: "get_comments",
      perPage: 100
    }, { readOnly: true });
    return normalizeComments(payload).map((comment) => comment.body);
  }
  async enrichPullRequest(target, item) {
    const [detailsPayload, filesPayload] = await Promise.all([
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: item.number,
        method: "get"
      }, { readOnly: true }),
      this.callTool("pull_request_read", {
        owner: target.upstreamOwner,
        repo: target.upstreamRepo,
        pullNumber: item.number,
        method: "get_files",
        perPage: 100
      }, { readOnly: true })
    ]);
    const details = normalizePullRequestListItem(detailsPayload);
    const files = normalizePullRequestFiles(filesPayload);
    return githubPullRequestSchema.parse({
      ...item,
      body: details?.body ?? item.body ?? "",
      state: details?.state ?? item.state ?? "OPEN",
      isDraft: details?.isDraft ?? item.isDraft ?? false,
      headRefName: details?.headRefName ?? item.headRefName ?? "",
      baseRefName: details?.baseRefName ?? item.baseRefName ?? "",
      mergedAt: details?.mergedAt ?? item.mergedAt ?? null,
      closedAt: details?.closedAt ?? item.closedAt ?? null,
      files
    });
  }
  async findPullRequestByHead(target, branchName) {
    const head = target.forkOwner ? `${target.forkOwner}:${branchName}` : branchName;
    const payload = await this.callTool("list_pull_requests", {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      state: "open",
      head,
      perPage: 10
    }, { readOnly: true });
    const items = Array.isArray(payload) ? payload : [];
    for (const item of items) {
      const pullRequest = normalizePullRequestListItem(item);
      if (pullRequest) {
        return {
          number: pullRequest.number,
          url: pullRequest.url
        };
      }
    }
    return null;
  }
  getToken() {
    const token = process.env[this.config.mcpTokenEnvVar]?.trim() ?? "";
    return token.length > 0 ? token : null;
  }
  async ensureSession(forceRefresh = false) {
    if (forceRefresh) {
      this.sessionId = null;
      this.sessionPromise = null;
    }
    if (this.sessionId) {
      return this.sessionId;
    }
    if (!this.sessionPromise) {
      this.sessionPromise = this.initializeSession().then((sessionId) => {
        this.sessionId = sessionId;
        return sessionId;
      }).finally(() => {
        this.sessionPromise = null;
      });
    }
    return this.sessionPromise;
  }
  async initializeSession() {
    const token = this.getToken();
    if (!token) {
      throw new GithubProviderError(`Missing ${this.config.mcpTokenEnvVar} for GitHub MCP.`, {
        unavailable: true,
        fallbackSafe: true
      });
    }
    const initializeResponse = await this.fetchJsonRpc({
      headers: this.makeHeaders(token),
      payload: {
        jsonrpc: "2.0",
        id: this.nextRequestId(),
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: {
            name: "hackonctl",
            version: "0.1.0"
          }
        }
      },
      fallbackSafe: true,
      defaultErrorMessage: "Failed to initialize the GitHub MCP session."
    });
    const sessionId = initializeResponse.response.headers.get("mcp-session-id")?.trim() ?? "";
    if (!sessionId) {
      throw new GithubProviderError("GitHub MCP did not return an MCP session id.", {
        unavailable: true,
        fallbackSafe: true
      });
    }
    const notifyResponse = await this.fetchJsonRpc({
      headers: this.makeHeaders(token, sessionId),
      payload: {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      },
      fallbackSafe: true,
      defaultErrorMessage: "Failed to complete GitHub MCP initialization."
    });
    if (!notifyResponse.response.ok) {
      throw new GithubProviderError("GitHub MCP rejected the initialized notification.", {
        unavailable: true,
        fallbackSafe: true
      });
    }
    return sessionId;
  }
  makeHeaders(token, sessionId) {
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }
    return headers;
  }
  async callTool(toolName, args, options) {
    return this.callToolAttempt(toolName, args, options, false);
  }
  async callToolAttempt(toolName, args, options, retriedAfterSessionReset) {
    const token = this.getToken();
    if (!token) {
      throw new GithubProviderError(`Missing ${this.config.mcpTokenEnvVar} for GitHub MCP.`, {
        unavailable: true,
        fallbackSafe: true
      });
    }
    const sessionId = await this.ensureSession(retriedAfterSessionReset);
    try {
      const result = await this.fetchJsonRpc({
        headers: this.makeHeaders(token, sessionId),
        payload: {
          jsonrpc: "2.0",
          id: this.nextRequestId(),
          method: "tools/call",
          params: {
            name: toolName,
            arguments: args
          }
        },
        fallbackSafe: options.readOnly,
        defaultErrorMessage: `GitHub MCP tool ${toolName} failed.`
      });
      return extractToolResult(result.payload);
    } catch (error) {
      if (!retriedAfterSessionReset && isSessionRecoveryCandidate(error)) {
        return this.callToolAttempt(toolName, args, options, true);
      }
      throw error;
    }
  }
  async fetchJsonRpc(options) {
    let response;
    try {
      response = await fetch(this.config.mcpUrl, {
        method: "POST",
        headers: options.headers,
        body: JSON.stringify(options.payload),
        signal: AbortSignal.timeout(DEFAULT_GITHUB_MCP_TIMEOUT_MS)
      });
    } catch (error2) {
      throw new GithubProviderError(options.defaultErrorMessage, {
        unavailable: true,
        fallbackSafe: options.fallbackSafe,
        cause: error2
      });
    }
    const bodyText = await response.text();
    const payload = bodyText.length > 0 ? parseJsonRpcPayload(bodyText, response.headers.get("content-type") ?? "") : null;
    if (!response.ok) {
      throw new GithubProviderError(buildGithubProviderMessage(options.defaultErrorMessage, payload, bodyText), {
        unavailable: true,
        fallbackSafe: options.fallbackSafe
      });
    }
    const error = extractJsonRpcError(payload);
    if (error) {
      throw new GithubProviderError(error.message, {
        unavailable: false,
        fallbackSafe: options.fallbackSafe
      });
    }
    return { response, payload };
  }
  nextRequestId() {
    const next = this.requestId;
    this.requestId += 1;
    return next;
  }
}
class GithubApiProvider {
  constructor(config) {
    this.config = config;
  }
  async isAvailable(_target) {
    return Boolean(this.getToken());
  }
  async getIssue(target, issueNumber) {
    const payload = await this.requestRestJson(
      `/repos/${target.upstreamOwner}/${target.upstreamRepo}/issues/${issueNumber}`,
      {
        readOnly: true,
        allowNotFound: true,
        defaultErrorMessage: `Failed to load GitHub issue #${issueNumber}.`
      }
    );
    if (!payload) {
      return null;
    }
    return normalizeIssue(payload);
  }
  async getPullRequest(target, prNumber) {
    const [pullRequestPayload, issuePayload] = await Promise.all([
      this.requestRestJson(
        `/repos/${target.upstreamOwner}/${target.upstreamRepo}/pulls/${prNumber}`,
        {
          readOnly: true,
          allowNotFound: true,
          defaultErrorMessage: `Failed to load GitHub pull request #${prNumber}.`
        }
      ),
      this.requestRestJson(
        `/repos/${target.upstreamOwner}/${target.upstreamRepo}/issues/${prNumber}`,
        {
          readOnly: true,
          allowNotFound: true,
          defaultErrorMessage: `Failed to load GitHub pull request issue metadata #${prNumber}.`
        }
      )
    ]);
    if (!pullRequestPayload) {
      return null;
    }
    return normalizePullRequestRecord(pullRequestPayload, {
      fallbackLabels: normalizeLabels(asObject(issuePayload))
    });
  }
  async searchIssues(target, query, limit, page = 1) {
    const searchQuery = [`repo:${target.upstreamOwner}/${target.upstreamRepo}`, "is:issue", query].filter(Boolean).join(" ");
    const payload = await this.requestRestJson(`/search/issues?${new URLSearchParams({
      q: searchQuery,
      per_page: String(limit),
      page: String(page)
    }).toString()}`, {
      readOnly: true,
      defaultErrorMessage: "Failed to search GitHub issues."
    });
    const object = asObject(payload);
    const items = Array.isArray(payload) ? payload : Array.isArray(object?.items) ? object.items : [];
    return items.map((item) => normalizeIssue(item)).filter((issue) => issue !== null);
  }
  async searchPotentialDuplicatePullRequests(target, issueNumber) {
    const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
    const queries = [
      issueNumber ? `is:open ${issueNumber}` : "is:open",
      `is:merged merged:>=${sinceDate}`,
      issueNumber ? `is:closed ${issueNumber} closed:>=${sinceDate}` : `is:closed closed:>=${sinceDate}`
    ];
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const query of queries) {
      const searchQuery = [`repo:${target.upstreamOwner}/${target.upstreamRepo}`, "is:pr", query].filter(Boolean).join(" ");
      const payload = await this.requestRestJson(`/search/issues?${new URLSearchParams({
        q: searchQuery,
        per_page: "50"
      }).toString()}`, {
        readOnly: true,
        defaultErrorMessage: "Failed to search potential duplicate pull requests."
      });
      for (const item of normalizeSearchPullRequestItems(payload)) {
        if (seen.has(item.number)) {
          continue;
        }
        seen.add(item.number);
        results.push(await this.enrichPullRequest(target, item));
      }
    }
    return results;
  }
  async createDraftPullRequest(target, options) {
    const existing = await this.findPullRequestByHead(target, options.branchName);
    if (existing) {
      return existing;
    }
    const head = target.forkOwner ? `${target.forkOwner}:${options.branchName}` : options.branchName;
    const payload = await this.requestRestJson(`/repos/${target.upstreamOwner}/${target.upstreamRepo}/pulls`, {
      method: "POST",
      readOnly: false,
      body: {
        title: options.title,
        body: options.body,
        head,
        base: options.baseBranch,
        draft: true,
        maintainer_can_modify: false
      },
      defaultErrorMessage: "Failed to create the draft pull request via the GitHub API."
    });
    const pullRequest = normalizePullRequestCreateResult(payload);
    if (pullRequest) {
      return pullRequest;
    }
    const recovered = await this.findPullRequestByHead(target, options.branchName);
    if (recovered) {
      return recovered;
    }
    throw new GithubProviderError("GitHub API created a pull request but returned an unexpected payload.");
  }
  async updatePullRequestBody(target, options) {
    await this.requestRestJson(`/repos/${target.upstreamOwner}/${target.upstreamRepo}/pulls/${options.prNumber}`, {
      method: "PATCH",
      readOnly: false,
      body: {
        body: options.body
      },
      defaultErrorMessage: `Failed to update pull request #${options.prNumber}.`
    });
  }
  async commentOnPullRequest(target, prNumber, body) {
    await this.requestRestJson(`/repos/${target.upstreamOwner}/${target.upstreamRepo}/issues/${prNumber}/comments`, {
      method: "POST",
      readOnly: false,
      body: {
        body
      },
      defaultErrorMessage: `Failed to comment on pull request #${prNumber}.`
    });
  }
  async getPullRequestReviewSnapshot(target, prNumber) {
    const query = [
      "query($owner: String!, $repo: String!, $number: Int!) {",
      "  repository(owner: $owner, name: $repo) {",
      "    pullRequest(number: $number) {",
      "      reviewDecision",
      "      comments(first: 100) {",
      "        nodes {",
      "          body",
      "          createdAt",
      "          author { login }",
      "        }",
      "      }",
      "      reviews(first: 100) {",
      "        nodes {",
      "          state",
      "          body",
      "          submittedAt",
      "          author { login }",
      "        }",
      "      }",
      "      reviewThreads(first: 100) {",
      "        nodes {",
      "          id",
      "          isResolved",
      "          isOutdated",
      "          comments(first: 100) {",
      "            nodes {",
      "              body",
      "              createdAt",
      "              author { login }",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "}"
    ].join("\n");
    const payload = await this.requestGraphqlJson(query, {
      owner: target.upstreamOwner,
      repo: target.upstreamRepo,
      number: prNumber
    }, {
      readOnly: true,
      defaultErrorMessage: `Failed to read pull request review state for #${prNumber}.`
    });
    const parsed = z.object({
      data: z.object({
        repository: z.object({
          pullRequest: z.object({
            reviewDecision: z.string().nullable().optional(),
            comments: z.object({
              nodes: z.array(z.object({
                body: z.string().default(""),
                createdAt: z.string().nullable().optional(),
                author: z.object({
                  login: z.string().default("")
                }).nullable().optional()
              })).default([])
            }).default({ nodes: [] }),
            reviews: z.object({
              nodes: z.array(z.object({
                state: z.string().default(""),
                body: z.string().default(""),
                submittedAt: z.string().nullable().optional(),
                author: z.object({
                  login: z.string().default("")
                }).nullable().optional()
              })).default([])
            }).default({ nodes: [] }),
            reviewThreads: z.object({
              nodes: z.array(z.object({
                id: z.string().min(1),
                isResolved: z.boolean().default(false),
                isOutdated: z.boolean().default(false),
                comments: z.object({
                  nodes: z.array(z.object({
                    body: z.string().default(""),
                    createdAt: z.string().nullable().optional(),
                    author: z.object({
                      login: z.string().default("")
                    }).nullable().optional()
                  })).default([])
                }).default({ nodes: [] })
              })).default([])
            }).default({ nodes: [] })
          }).nullable()
        }).nullable()
      })
    }).parse(payload);
    const pullRequest = parsed.data.repository?.pullRequest;
    if (!pullRequest) {
      return null;
    }
    return githubPullRequestReviewSnapshotSchema.parse({
      reviewDecision: pullRequest.reviewDecision ?? null,
      comments: pullRequest.comments.nodes.map((comment) => ({
        body: comment.body,
        authorLogin: comment.author?.login ?? null,
        createdAt: comment.createdAt ?? null
      })),
      reviews: pullRequest.reviews.nodes.map((review) => ({
        state: review.state,
        body: review.body,
        authorLogin: review.author?.login ?? null,
        submittedAt: review.submittedAt ?? null
      })),
      reviewThreads: pullRequest.reviewThreads.nodes.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        comments: thread.comments.nodes.map((comment) => ({
          body: comment.body,
          authorLogin: comment.author?.login ?? null,
          createdAt: comment.createdAt ?? null
        }))
      }))
    });
  }
  async listPullRequestComments(target, prNumber) {
    const snapshot = await this.getPullRequestReviewSnapshot(target, prNumber);
    if (!snapshot) {
      return [];
    }
    return snapshot.comments.map((comment) => comment.body);
  }
  async enrichPullRequest(target, item) {
    const [detailsPayload, filesPayload] = await Promise.all([
      this.requestRestJson(`/repos/${target.upstreamOwner}/${target.upstreamRepo}/pulls/${item.number}`, {
        readOnly: true,
        defaultErrorMessage: `Failed to load pull request #${item.number}.`
      }),
      this.requestRestJson(`/repos/${target.upstreamOwner}/${target.upstreamRepo}/pulls/${item.number}/files?${new URLSearchParams({
        per_page: "100"
      }).toString()}`, {
        readOnly: true,
        defaultErrorMessage: `Failed to load changed files for pull request #${item.number}.`
      })
    ]);
    const details = normalizePullRequestListItem(detailsPayload);
    const files = normalizePullRequestFiles(filesPayload);
    return githubPullRequestSchema.parse({
      ...item,
      body: details?.body ?? item.body ?? "",
      state: details?.state ?? item.state ?? "OPEN",
      isDraft: details?.isDraft ?? item.isDraft ?? false,
      headRefName: details?.headRefName ?? item.headRefName ?? "",
      baseRefName: details?.baseRefName ?? item.baseRefName ?? "",
      mergedAt: details?.mergedAt ?? item.mergedAt ?? null,
      closedAt: details?.closedAt ?? item.closedAt ?? null,
      files
    });
  }
  async findPullRequestByHead(target, branchName) {
    const head = target.forkOwner ? `${target.forkOwner}:${branchName}` : branchName;
    const payload = await this.requestRestJson(`/repos/${target.upstreamOwner}/${target.upstreamRepo}/pulls?${new URLSearchParams({
      state: "open",
      head,
      per_page: "10"
    }).toString()}`, {
      readOnly: true,
      defaultErrorMessage: `Failed to resolve an existing pull request for ${head}.`
    });
    const items = Array.isArray(payload) ? payload : [];
    for (const item of items) {
      const pullRequest = normalizePullRequestListItem(item);
      if (pullRequest) {
        return {
          number: pullRequest.number,
          url: pullRequest.url
        };
      }
    }
    return null;
  }
  getToken() {
    const token = process.env[this.config.mcpTokenEnvVar]?.trim() ?? "";
    return token.length > 0 ? token : null;
  }
  makeRestHeaders(token, includeJsonBody = false) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    if (includeJsonBody) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }
  async requestRestJson(endpoint, options) {
    const token = this.getToken();
    if (!token) {
      throw new GithubProviderError(`Missing ${this.config.mcpTokenEnvVar} for the GitHub API provider.`, {
        unavailable: true,
        fallbackSafe: true
      });
    }
    let response;
    try {
      response = await fetch(`${GITHUB_API_REST_BASE_URL}${endpoint}`, {
        method: options.method ?? "GET",
        headers: this.makeRestHeaders(token, options.body !== void 0),
        body: options.body ? JSON.stringify(options.body) : void 0,
        signal: AbortSignal.timeout(DEFAULT_GITHUB_API_TIMEOUT_MS)
      });
    } catch (error) {
      throw new GithubProviderError(options.defaultErrorMessage, {
        unavailable: true,
        fallbackSafe: options.readOnly,
        cause: error
      });
    }
    if (options.allowNotFound && response.status === 404) {
      return null;
    }
    const bodyText = await response.text();
    const payload = bodyText.length > 0 ? parseJsonIfPossible(bodyText) : null;
    if (!response.ok) {
      throw new GithubProviderError(buildGithubProviderMessage(options.defaultErrorMessage, payload, bodyText), {
        unavailable: response.status >= 500 || response.status === 401 || response.status === 403,
        fallbackSafe: options.readOnly
      });
    }
    return payload;
  }
  async requestGraphqlJson(query, variables, options) {
    const token = this.getToken();
    if (!token) {
      throw new GithubProviderError(`Missing ${this.config.mcpTokenEnvVar} for the GitHub API provider.`, {
        unavailable: true,
        fallbackSafe: true
      });
    }
    let response;
    try {
      response = await fetch(GITHUB_API_GRAPHQL_URL, {
        method: "POST",
        headers: this.makeRestHeaders(token, true),
        body: JSON.stringify({
          query,
          variables
        }),
        signal: AbortSignal.timeout(DEFAULT_GITHUB_API_TIMEOUT_MS)
      });
    } catch (error) {
      throw new GithubProviderError(options.defaultErrorMessage, {
        unavailable: true,
        fallbackSafe: options.readOnly,
        cause: error
      });
    }
    const bodyText = await response.text();
    const payload = bodyText.length > 0 ? parseJsonIfPossible(bodyText) : null;
    if (!response.ok) {
      throw new GithubProviderError(buildGithubProviderMessage(options.defaultErrorMessage, payload, bodyText), {
        unavailable: response.status >= 500 || response.status === 401 || response.status === 403,
        fallbackSafe: options.readOnly
      });
    }
    const object = asObject(payload);
    const errors = Array.isArray(object?.errors) ? object.errors : [];
    if (errors.length > 0) {
      const message = errors.map((entry) => readString(asObject(entry), "message")).filter((entry) => Boolean(entry)).join(" ");
      throw new GithubProviderError(message.length > 0 ? message : options.defaultErrorMessage, {
        unavailable: false,
        fallbackSafe: options.readOnly
      });
    }
    return payload;
  }
}
class CompositeGithubProvider {
  constructor(primary, fallback) {
    this.primary = primary;
    this.fallback = fallback;
  }
  async isAvailable(target) {
    if (await this.primary.isAvailable(target)) {
      return true;
    }
    return this.fallback.isAvailable(target);
  }
  async getIssue(target, issueNumber) {
    return this.withReadFallback(target, (provider) => provider.getIssue(target, issueNumber));
  }
  async getPullRequest(target, prNumber) {
    return this.withReadFallback(target, (provider) => provider.getPullRequest(target, prNumber));
  }
  async searchIssues(target, query, limit, page = 1) {
    return this.withReadFallback(target, (provider) => provider.searchIssues(target, query, limit, page));
  }
  async searchPotentialDuplicatePullRequests(target, issueNumber) {
    return this.withReadFallback(target, (provider) => provider.searchPotentialDuplicatePullRequests(target, issueNumber));
  }
  async createDraftPullRequest(target, options) {
    const provider = await this.selectWriteProvider(target);
    return provider.createDraftPullRequest(target, options);
  }
  async updatePullRequestBody(target, options) {
    const provider = await this.selectWriteProvider(target);
    await provider.updatePullRequestBody(target, options);
  }
  async commentOnPullRequest(target, prNumber, body) {
    const provider = await this.selectWriteProvider(target);
    await provider.commentOnPullRequest(target, prNumber, body);
  }
  async getPullRequestReviewSnapshot(target, prNumber) {
    return this.withReadFallback(target, (provider) => provider.getPullRequestReviewSnapshot(target, prNumber));
  }
  async listPullRequestComments(target, prNumber) {
    return this.withReadFallback(target, (provider) => provider.listPullRequestComments(target, prNumber));
  }
  async withReadFallback(target, operation) {
    if (await this.primary.isAvailable(target)) {
      try {
        return await operation(this.primary);
      } catch {
        if (await this.fallback.isAvailable(target)) {
          return operation(this.fallback);
        }
        throw new Error("No configured GitHub provider is available.");
      }
    }
    if (await this.fallback.isAvailable(target)) {
      return operation(this.fallback);
    }
    throw new Error("No configured GitHub provider is available.");
  }
  async selectWriteProvider(target) {
    if (await this.primary.isAvailable(target)) {
      return this.primary;
    }
    if (await this.fallback.isAvailable(target)) {
      return this.fallback;
    }
    throw new Error("No configured GitHub provider is available.");
  }
}
class GhCliGithubProvider {
  constructor(executor) {
    this.executor = executor;
  }
  async isAvailable(_target) {
    return isCommandAvailable(this.executor, "gh");
  }
  async getIssue(target, issueNumber) {
    const result = await this.executor.run("gh", [
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      `${target.upstreamOwner}/${target.upstreamRepo}`,
      "--json",
      "number,title,url,body,state,labels,comments,createdAt,updatedAt,author,assignees"
    ], {
      timeoutMs: 3e4
    });
    if (result.exitCode !== 0) {
      return null;
    }
    return normalizeIssue(JSON.parse(result.stdout));
  }
  async getPullRequest(target, prNumber) {
    const result = await this.executor.run("gh", [
      "pr",
      "view",
      String(prNumber),
      "--repo",
      `${target.upstreamOwner}/${target.upstreamRepo}`,
      "--json",
      "number,title,url,body,state,isDraft,headRefName,baseRefName,mergedAt,closedAt,labels,files"
    ], {
      timeoutMs: 3e4
    });
    if (result.exitCode !== 0) {
      return null;
    }
    return normalizePullRequestRecord(JSON.parse(result.stdout));
  }
  async searchIssues(target, query, limit, page = 1) {
    const searchQuery = [`repo:${target.upstreamOwner}/${target.upstreamRepo}`, "is:issue", query].filter(Boolean).join(" ");
    const result = await this.executor.run("gh", [
      "api",
      "search/issues",
      "--method",
      "GET",
      "-f",
      `q=${searchQuery}`,
      "-F",
      `per_page=${limit}`,
      "-F",
      `page=${page}`
    ], {
      timeoutMs: 6e4
    });
    if (result.exitCode !== 0) {
      return [];
    }
    const parsed = z.object({
      items: z.array(z.object({
        number: z.number().int().positive(),
        title: z.string().min(1),
        url: z.string().min(1),
        body: z.string().optional(),
        state: z.string().optional(),
        labels: z.array(z.object({ name: z.string().min(1) })).optional(),
        comments: z.number().int().nonnegative().optional(),
        createdAt: z.string().nullable().optional(),
        updatedAt: z.string().nullable().optional(),
        author: z.object({ login: z.string().min(1) }).nullable().optional(),
        assignees: z.array(z.object({ login: z.string().min(1) })).optional()
      })).default([])
    }).parse(JSON.parse(result.stdout));
    return parsed.items.map((item) => normalizeIssue(item));
  }
  async searchPotentialDuplicatePullRequests(target, issueNumber) {
    const queries = [
      { state: "open", search: issueNumber ? String(issueNumber) : "" },
      { state: "merged", search: "merged:>=30d" },
      { state: "closed", search: issueNumber ? `${issueNumber} closed:>=30d` : "closed:>=30d" }
    ];
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    for (const query of queries) {
      const args = [
        "pr",
        "list",
        "--repo",
        `${target.upstreamOwner}/${target.upstreamRepo}`,
        "--state",
        query.state,
        "--limit",
        "50",
        "--json",
        "number,title,url,body,state,isDraft,headRefName,baseRefName,mergedAt,closedAt"
      ];
      if (query.search) {
        args.push("--search", query.search);
      }
      const result = await this.executor.run("gh", args, { timeoutMs: 6e4 });
      if (result.exitCode !== 0) {
        continue;
      }
      const parsed = z.array(z.object({
        number: z.number().int().positive(),
        title: z.string(),
        url: z.string(),
        body: z.string().optional(),
        state: z.string().optional(),
        isDraft: z.boolean().optional(),
        headRefName: z.string().optional(),
        baseRefName: z.string().optional(),
        mergedAt: z.string().nullable().optional(),
        closedAt: z.string().nullable().optional()
      })).parse(JSON.parse(result.stdout));
      for (const item of parsed) {
        if (seen.has(item.number)) continue;
        seen.add(item.number);
        results.push(await this.enrichPullRequest(target, item));
      }
    }
    return results;
  }
  async createDraftPullRequest(target, options) {
    const head = target.forkOwner ? `${target.forkOwner}:${options.branchName}` : options.branchName;
    const result = await this.executor.run("gh", [
      "pr",
      "create",
      "--repo",
      `${target.upstreamOwner}/${target.upstreamRepo}`,
      "--draft",
      "--base",
      options.baseBranch,
      "--head",
      head,
      "--title",
      options.title,
      "--body",
      options.body
    ], {
      timeoutMs: 9e4
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to create draft PR.");
    }
    const url = result.stdout.trim().split("\n").at(-1) ?? "";
    const numberMatch = url.match(/\/pull\/(\d+)/);
    if (!numberMatch) {
      throw new Error(`Unable to parse PR URL from gh output: ${url}`);
    }
    return {
      number: Number.parseInt(numberMatch[1] ?? "", 10),
      url
    };
  }
  async updatePullRequestBody(target, options) {
    const result = await this.executor.run("gh", [
      "pr",
      "edit",
      String(options.prNumber),
      "--repo",
      `${target.upstreamOwner}/${target.upstreamRepo}`,
      "--body",
      options.body
    ], {
      timeoutMs: 6e4
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to update PR body.");
    }
  }
  async commentOnPullRequest(target, prNumber, body) {
    const result = await this.executor.run("gh", [
      "pr",
      "comment",
      String(prNumber),
      "--repo",
      `${target.upstreamOwner}/${target.upstreamRepo}`,
      "--body",
      body
    ], {
      timeoutMs: 6e4
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "Failed to comment on PR.");
    }
  }
  async getPullRequestReviewSnapshot(target, prNumber) {
    const query = [
      "query($owner: String!, $repo: String!, $number: Int!) {",
      "  repository(owner: $owner, name: $repo) {",
      "    pullRequest(number: $number) {",
      "      reviewDecision",
      "      comments(first: 100) {",
      "        nodes {",
      "          body",
      "          createdAt",
      "          author { login }",
      "        }",
      "      }",
      "      reviews(first: 100) {",
      "        nodes {",
      "          state",
      "          body",
      "          submittedAt",
      "          author { login }",
      "        }",
      "      }",
      "      reviewThreads(first: 100) {",
      "        nodes {",
      "          id",
      "          isResolved",
      "          isOutdated",
      "          comments(first: 100) {",
      "            nodes {",
      "              body",
      "              createdAt",
      "              author { login }",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "}"
    ].join("\n");
    const result = await this.executor.run("gh", [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `owner=${target.upstreamOwner}`,
      "-F",
      `repo=${target.upstreamRepo}`,
      "-F",
      `number=${prNumber}`
    ], {
      timeoutMs: 6e4
    });
    if (result.exitCode !== 0) {
      return null;
    }
    const parsed = z.object({
      data: z.object({
        repository: z.object({
          pullRequest: z.object({
            reviewDecision: z.string().nullable().optional(),
            comments: z.object({
              nodes: z.array(z.object({
                body: z.string().default(""),
                createdAt: z.string().nullable().optional(),
                author: z.object({
                  login: z.string().default("")
                }).nullable().optional()
              })).default([])
            }).default({ nodes: [] }),
            reviews: z.object({
              nodes: z.array(z.object({
                state: z.string().default(""),
                body: z.string().default(""),
                submittedAt: z.string().nullable().optional(),
                author: z.object({
                  login: z.string().default("")
                }).nullable().optional()
              })).default([])
            }).default({ nodes: [] }),
            reviewThreads: z.object({
              nodes: z.array(z.object({
                id: z.string().min(1),
                isResolved: z.boolean().default(false),
                isOutdated: z.boolean().default(false),
                comments: z.object({
                  nodes: z.array(z.object({
                    body: z.string().default(""),
                    createdAt: z.string().nullable().optional(),
                    author: z.object({
                      login: z.string().default("")
                    }).nullable().optional()
                  })).default([])
                }).default({ nodes: [] })
              })).default([])
            }).default({ nodes: [] })
          }).nullable()
        }).nullable()
      })
    }).parse(JSON.parse(result.stdout));
    const pullRequest = parsed.data.repository?.pullRequest;
    if (!pullRequest) {
      return null;
    }
    return githubPullRequestReviewSnapshotSchema.parse({
      reviewDecision: pullRequest.reviewDecision ?? null,
      comments: pullRequest.comments.nodes.map((comment) => ({
        body: comment.body,
        authorLogin: comment.author?.login ?? null,
        createdAt: comment.createdAt ?? null
      })),
      reviews: pullRequest.reviews.nodes.map((review) => ({
        state: review.state,
        body: review.body,
        authorLogin: review.author?.login ?? null,
        submittedAt: review.submittedAt ?? null
      })),
      reviewThreads: pullRequest.reviewThreads.nodes.map((thread) => ({
        id: thread.id,
        isResolved: thread.isResolved,
        isOutdated: thread.isOutdated,
        comments: thread.comments.nodes.map((comment) => ({
          body: comment.body,
          authorLogin: comment.author?.login ?? null,
          createdAt: comment.createdAt ?? null
        }))
      }))
    });
  }
  async listPullRequestComments(target, prNumber) {
    const snapshot = await this.getPullRequestReviewSnapshot(target, prNumber);
    if (!snapshot) {
      return [];
    }
    return snapshot.comments.map((comment) => comment.body);
  }
  async enrichPullRequest(target, item) {
    const result = await this.executor.run("gh", [
      "pr",
      "view",
      String(item.number),
      "--repo",
      `${target.upstreamOwner}/${target.upstreamRepo}`,
      "--json",
      "files"
    ], {
      timeoutMs: 3e4
    });
    const files = result.exitCode === 0 ? z.object({ files: z.array(z.object({ path: z.string().min(1) })).default([]) }).parse(JSON.parse(result.stdout)).files : [];
    return githubPullRequestSchema.parse({
      ...item,
      files
    });
  }
}
function createGithubProvider(config, executor) {
  const ghProvider = new GhCliGithubProvider(executor);
  const apiProvider = new GithubApiProvider(config);
  const mcpProvider = new GithubMcpProvider(config);
  if (config.provider === "gh_cli") {
    return ghProvider;
  }
  if (config.provider === "github_api") {
    return apiProvider;
  }
  if (config.provider === "github_mcp") {
    return mcpProvider;
  }
  if (config.provider === "github_mcp_then_gh_cli") {
    return new CompositeGithubProvider(mcpProvider, ghProvider);
  }
  return new CompositeGithubProvider(mcpProvider, apiProvider);
}
function parseJsonRpcPayload(bodyText, contentType) {
  if (contentType.includes("text/event-stream")) {
    return parseJsonRpcEventStream(bodyText);
  }
  return parseJson(bodyText);
}
function parseJsonRpcEventStream(bodyText) {
  const chunks = bodyText.split(/\r?\n\r?\n/);
  let lastPayload = null;
  for (const chunk of chunks) {
    const dataLines = chunk.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
    if (dataLines.length === 0) {
      continue;
    }
    lastPayload = parseJson(dataLines.join("\n"));
  }
  return lastPayload;
}
function parseJson(text) {
  return JSON.parse(text);
}
function extractJsonRpcError(payload) {
  const object = asObject(payload);
  const error = asObject(object?.error);
  const message = readString(error, "message");
  return message ? { message } : null;
}
function extractToolResult(payload) {
  const object = asObject(payload);
  const result = asObject(object?.result);
  if (!result) {
    return payload;
  }
  if (result.structuredContent !== void 0) {
    return result.structuredContent;
  }
  const content = Array.isArray(result.content) ? result.content : null;
  if (!content || content.length === 0) {
    return result;
  }
  const texts = content.map((item) => asObject(item)).map((item) => readString(item, "text")).filter((value) => Boolean(value));
  if (texts.length === 1) {
    return parseJsonIfPossible(texts[0]) ?? texts[0];
  }
  return texts.map((value) => parseJsonIfPossible(value) ?? value);
}
function parseJsonIfPossible(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function normalizeIssue(payload) {
  const object = asObject(payload);
  if (!object) {
    throw new GithubProviderError("GitHub MCP issue payload was not an object.");
  }
  const labels = normalizeLabels(object);
  const assignees = Array.isArray(object.assignees) ? object.assignees.map((assignee) => readString(asObject(assignee), "login")).filter((login) => Boolean(login)) : [];
  return githubIssueSchema.parse({
    number: readNumber(object, "number"),
    title: readString(object, "title") ?? "",
    url: readString(object, "html_url") ?? readString(object, "url") ?? "",
    body: readString(object, "body") ?? "",
    state: readString(object, "state") ?? "OPEN",
    labels,
    comments: readNumber(object, "comments") ?? 0,
    createdAt: readString(object, "created_at") ?? readString(object, "createdAt") ?? null,
    updatedAt: readString(object, "updated_at") ?? readString(object, "updatedAt") ?? null,
    authorLogin: readNestedString(object, ["user", "login"]) ?? readNestedString(object, ["author", "login"]) ?? null,
    assigneeLogins: assignees
  });
}
function normalizeSearchPullRequestItems(payload) {
  const object = asObject(payload);
  const items = Array.isArray(payload) ? payload : Array.isArray(object?.items) ? object.items : [];
  return items.map((item) => normalizePullRequestListItem(item)).filter((item) => item !== null);
}
function normalizePullRequestListItem(payload) {
  const object = asObject(payload);
  if (!object) {
    return null;
  }
  const number = readNumber(object, "number");
  const title = readString(object, "title");
  const url = readString(object, "html_url") ?? readString(object, "url");
  if (!number || !title || !url) {
    return null;
  }
  return {
    number,
    title,
    url,
    body: readString(object, "body") ?? "",
    state: readString(object, "state") ?? "OPEN",
    isDraft: readBoolean(object, "draft") ?? readBoolean(object, "isDraft") ?? false,
    headRefName: readNestedString(object, ["head", "ref"]) ?? readString(object, "headRefName") ?? "",
    baseRefName: readNestedString(object, ["base", "ref"]) ?? readString(object, "baseRefName") ?? "",
    mergedAt: readString(object, "merged_at") ?? readString(object, "mergedAt") ?? null,
    closedAt: readString(object, "closed_at") ?? readString(object, "closedAt") ?? null
  };
}
function normalizePullRequestFiles(payload) {
  const items = Array.isArray(payload) ? payload : [];
  return items.map((item) => asObject(item)).map((item) => readString(item, "filename") ?? readString(item, "path")).filter((path) => Boolean(path)).map((path) => ({ path }));
}
function normalizePullRequestRecord(payload, options = {}) {
  const item = normalizePullRequestListItem(payload);
  if (!item) {
    return null;
  }
  const object = asObject(payload);
  const labels = normalizeLabels(object);
  const files = normalizePullRequestFiles(payload);
  return githubPullRequestSchema.parse({
    ...item,
    body: item.body ?? "",
    state: item.state ?? "OPEN",
    isDraft: item.isDraft ?? false,
    headRefName: item.headRefName ?? "",
    baseRefName: item.baseRefName ?? "",
    mergedAt: item.mergedAt ?? null,
    closedAt: item.closedAt ?? null,
    labels: labels.length > 0 ? labels : options.fallbackLabels ?? [],
    files: files.length > 0 ? files : options.fallbackFiles ?? []
  });
}
function normalizeLabels(object) {
  if (!object || !Array.isArray(object.labels)) {
    return [];
  }
  return object.labels.map((label) => {
    if (typeof label === "string") {
      return label;
    }
    return readString(asObject(label), "name");
  }).filter((label) => Boolean(label));
}
function normalizePullRequestCreateResult(payload) {
  const object = asObject(payload);
  const number = readNumber(object, "number");
  const url = readString(object, "html_url") ?? readString(object, "url");
  if (number && url) {
    return { number, url };
  }
  const text = typeof payload === "string" ? payload : null;
  const urlMatch = text?.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/);
  if (!urlMatch) {
    return null;
  }
  return {
    number: Number.parseInt(urlMatch[1] ?? "", 10),
    url: urlMatch[0]
  };
}
function normalizeComments(payload) {
  const items = Array.isArray(payload) ? payload : [];
  return items.map((item) => normalizeComment(item)).filter((item) => item !== null);
}
function normalizeReviews(payload) {
  const items = Array.isArray(payload) ? payload : [];
  return items.map((item) => normalizeReview(item)).filter((item) => item !== null);
}
function normalizeReviewThreads(payload) {
  const object = asObject(payload);
  const items = Array.isArray(payload) ? payload : Array.isArray(object?.review_threads) ? object.review_threads : [];
  return items.map((item) => {
    const thread = asObject(item);
    const id = readString(thread, "id");
    if (!thread || !id) {
      return null;
    }
    const commentContainer = asObject(thread.comments);
    const commentNodes = Array.isArray(commentContainer?.nodes) ? commentContainer.nodes : [];
    const comments = Array.isArray(thread.comments) ? thread.comments : Array.isArray(commentNodes) ? commentNodes : [];
    return githubPullRequestReviewThreadSchema.parse({
      id,
      isResolved: readBoolean(thread, "isResolved") ?? readBoolean(thread, "is_resolved") ?? false,
      isOutdated: readBoolean(thread, "isOutdated") ?? readBoolean(thread, "is_outdated") ?? false,
      comments: comments.map((comment) => normalizeComment(comment)).filter((comment) => comment !== null)
    });
  }).filter((item) => item !== null);
}
function normalizeComment(payload) {
  const object = asObject(payload);
  if (!object) {
    return null;
  }
  return githubPullRequestCommentSchema.parse({
    body: readString(object, "body") ?? "",
    authorLogin: readNestedString(object, ["user", "login"]) ?? readNestedString(object, ["author", "login"]) ?? readString(object, "authorLogin") ?? null,
    createdAt: readString(object, "created_at") ?? readString(object, "createdAt") ?? null
  });
}
function normalizeReview(payload) {
  const object = asObject(payload);
  if (!object) {
    return null;
  }
  return githubPullRequestReviewSchema.parse({
    state: readString(object, "state") ?? "",
    body: readString(object, "body") ?? "",
    authorLogin: readNestedString(object, ["user", "login"]) ?? readNestedString(object, ["author", "login"]) ?? readString(object, "authorLogin") ?? null,
    submittedAt: readString(object, "submitted_at") ?? readString(object, "submittedAt") ?? null
  });
}
function inferReviewDecision(reviews) {
  const latestByAuthor = /* @__PURE__ */ new Map();
  for (const [index, review] of reviews.entries()) {
    const author = review.authorLogin ?? `unknown:${index}`;
    const current = latestByAuthor.get(author);
    const reviewOrder = review.submittedAt ?? "";
    const currentOrder = current?.submittedAt ?? "";
    if (!current || reviewOrder >= currentOrder || !review.submittedAt && index >= current.index) {
      latestByAuthor.set(author, {
        state: review.state.toUpperCase(),
        submittedAt: review.submittedAt,
        index
      });
    }
  }
  const states = [...latestByAuthor.values()].map((item) => item.state);
  if (states.includes("CHANGES_REQUESTED")) {
    return "CHANGES_REQUESTED";
  }
  if (states.includes("APPROVED")) {
    return "APPROVED";
  }
  return null;
}
function buildGithubProviderMessage(defaultMessage, payload, bodyText) {
  const errorMessage = extractJsonRpcError(payload)?.message;
  if (errorMessage) {
    return `${defaultMessage} ${errorMessage}`.trim();
  }
  const trimmedBody = bodyText.trim();
  if (trimmedBody.length > 0) {
    return `${defaultMessage} ${trimmedBody}`.trim();
  }
  return defaultMessage;
}
function isSessionRecoveryCandidate(error) {
  if (!(error instanceof Error)) {
    return false;
  }
  return /session/i.test(error.message);
}
function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function readString(value, key) {
  if (!value) {
    return null;
  }
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}
function readNumber(value, key) {
  if (!value) {
    return null;
  }
  const candidate = value[key];
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    const parsed = Number.parseInt(candidate, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function readBoolean(value, key) {
  if (!value) {
    return null;
  }
  const candidate = value[key];
  return typeof candidate === "boolean" ? candidate : null;
}
function readNestedString(value, path) {
  let current = value;
  for (const segment of path) {
    const object = asObject(current);
    if (!object) {
      return null;
    }
    current = object[segment];
  }
  return typeof current === "string" ? current : null;
}
export {
  CompositeGithubProvider,
  GhCliGithubProvider,
  GithubApiProvider,
  GithubMcpProvider,
  createGithubProvider,
  githubIssueSchema,
  githubPullRequestCommentSchema,
  githubPullRequestReviewSchema,
  githubPullRequestReviewSnapshotSchema,
  githubPullRequestReviewThreadSchema,
  githubPullRequestSchema
};
//# sourceMappingURL=github.js.map
