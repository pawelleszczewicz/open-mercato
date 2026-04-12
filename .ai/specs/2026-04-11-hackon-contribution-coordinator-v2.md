# HackOn Contribution Coordinator v2 — Implementation Plan

## Context

We're competing in a bounty hunting hackathon on the Open Mercato monorepo. The v1 coordinator (`hackonctl`) already produced 21 PRs with 9 judge-approved, but has structural problems:

1. **Stale local state** — `.state/tasks/*.json` diverges from GitHub reality. Tasks stuck in "waiting for review" when review is already done.
2. **File-mediated coordination** — Coordinator writes prompt file → Codex reads → Codex writes code → Coordinator reads state. Slow, lossy, error-prone.
3. **Over-engineered state machine** — 20+ states when most are derivable from GitHub (draft, review status, merge status).
4. **Single-writer poll loop** — Everything funnels through a 5-minute fresh-process scheduler cycle. Latency kills throughput.
5. **Provider lock-in** — Hardcoded around `codex exec` with GPT-5.4.

The v2 reimplements `packages/hackonctl/` with a fundamentally different approach: **derive state from GitHub, use direct agent communication, and keep the package focused on domain logic rather than orchestration infrastructure**.

---

## Architecture: v1 vs v2

### What changes

| Concern | v1 | v2 |
|---------|----|----|
| State storage | 20+ states in `.state/tasks/*.json` | Minimal registry + derived from GitHub on demand |
| Agent coordination | File-based prompts → `codex exec` → file polling | Direct agent spawning with worktree isolation + message passing |
| State freshness | Stale until next 5-min poll cycle | Always current — queries GitHub MCP in real-time |
| Orchestration | Custom scheduler loop in package | Coordinator IS the Claude Code session; package provides domain logic |
| Provider | Hardcoded Codex/GPT-5.4 | Provider adapter interface (Claude Code, Codex, generic CLI) |
| Review loop | Coordinator reads files, dispatches reviewer, reads files again | Coordinator spawns reviewer agent, gets verdict directly |
| Worktrees | Custom management code | Git-native worktrees, leveraging Claude Code's `isolation: "worktree"` |

### What stays the same

- Lane-based dispatch (docs, tests, simple_bugs, experimental)
- GitHub PR comments with role prefixes as collaboration surface
- Draft PR as the standard artifact
- Discovery from GitHub issues + repo signals + integration test gaps
- Local gates before PR (lint, typecheck, test, diff checks)
- Single GitHub identity for all operations

### Design principle: deterministic scripts over heuristics

Every operation should be a concrete, repeatable shell command or function — not a fuzzy AI decision. Specifically:

- **Discovery**: deterministic `grep`/`find`/`ast` miners for repo signals, structured API queries for GitHub issues, JSON parsing of `spec-coverage` output. No LLM-based "find bugs."
- **Gates**: exact shell commands (`yarn lint`, `yarn typecheck`, `yarn test`), `git diff --stat` for size checks, path-match for forbidden paths. Binary pass/fail.
- **Duplicate detection**: exact match on issue number, file path overlap calculation, branch name pattern match. Not semantic similarity.
- **Qualification**: rule-based lane assignment from source type and file paths. Configurable rules, not inference.
- **State derivation**: deterministic mapping from GitHub API fields to lifecycle state. Same inputs always produce same output.

AI agents are used only for the creative work: writing code, writing tests, reviewing diffs. Everything else is scripts.

---

## Core Design: Derived State Model

### The problem with stored state

v1 stores task state in JSON and transitions it through a state machine. But GitHub already knows:
- Is the PR open, closed, or merged?
- Is it a draft or ready for review?
- Did reviewers approve or request changes?
- Are CI checks passing?

When the local JSON says "under_review" but GitHub shows the review is already approved, you have a bug. The coordinator must poll to discover this, and the 5-minute cycle means up to 5 minutes of wasted time per task.

### The v2 approach: compute state, don't store it

```
derivedState = f(taskRegistry, gitHubPR, gitHubReviews, gitHubChecks)
```

**Task registry** (local, minimal — ONLY what GitHub can't tell us):
```typescript
interface TaskRecord {
  taskId: string              // HCK-XXXX
  source: TaskSource          // { type: 'github_issue' | 'repo_signal', id: string, title: string }
  lane: Lane                  // 'docs' | 'tests' | 'simple_bugs' | 'experimental'
  riskZone: RiskZone          // 'green' | 'yellow' | 'red'
  branchName: string          // created branch name
  prNumber: number | null     // once PR is opened
  expectedClasses: string[]   // ['bugfix', 'tests'] — for scoring
  duplicateRisk: DuplicateRisk
  createdAt: string
  notes: string[]             // human/coordinator notes
}
// portalStatus and judgeStatus are DERIVED from GitHub (draft flag, reviews, labels)
// No local lifecycle state — everything comes from GitHub or git
```
```

**Derived lifecycle state** (computed on demand, fully deterministic):
```typescript
type DerivedState =
  | 'registered'              // in registry, no branch yet
  | 'implementing'            // branch exists, no PR
  | 'draft'                   // draft PR open
  | 'changes_requested'       // latest review requests changes
  | 'approved'                // latest review approved, still draft
  | 'submitted'               // PR is non-draft → considered submitted to HackOn
  | 'judge_pending'           // submitted, no judge review yet
  | 'judge_approved'          // judge approved (review or label)
  | 'judge_rejected'          // judge rejected (label)
  | 'merged'                  // PR merged on GitHub
  | 'closed'                  // PR closed without merge
  | 'abandoned'               // manually marked in registry
```

**State derivation function** (deterministic — same inputs always produce same output):
```
function deriveState(task: TaskRecord): DerivedState
  if task.abandoned → 'abandoned'
  if task.prNumber == null:
    if branchExists(task.branchName) → 'implementing'
    → 'registered'

  // Everything below queries GitHub via MCP
  pr = github.getPullRequest(task.prNumber)
  if pr.merged_at != null → 'merged'
  if pr.state == 'closed' → 'closed'

  reviews = github.getReviews(task.prNumber)
  labels = pr.labels.map(l => l.name)

  // Judge outcomes (from labels/reviews on non-draft PRs)
  if !pr.draft:
    if 'judge-rejected' in labels → 'judge_rejected'
    if 'judge-approved' in labels OR hasMaintainerApproval(reviews) → 'judge_approved'
    → 'judge_pending'  // submitted (non-draft) but no judge signal

  // Draft PR states
  latestReview = getLatestReview(reviews)
  if latestReview?.state == 'CHANGES_REQUESTED' → 'changes_requested'
  if latestReview?.state == 'APPROVED' → 'approved'
  → 'draft'
```

**Key insight**: draft→open transition = portal submission. No manual tracking needed.

**Why this is better**: State is never stale. No "stuck in review" bugs. The registry tracks only what GitHub can't tell us (portal/judge status, lane assignment, source mapping).

---

## Package Structure

```
packages/hackonctl/
├── package.json
├── tsconfig.json
├── jest.config.cjs
├── build.mjs                    # esbuild config
├── bin/
│   └── hackonctl.ts             # CLI entry point
├── src/
│   ├── index.ts                 # Public API exports
│   │
│   ├── config/
│   │   ├── schema.ts            # Zod config schema + types
│   │   └── loader.ts            # Load + validate config from hackonctl.config.json
│   │
│   ├── registry/
│   │   ├── store.ts             # TaskRecord CRUD (single JSON file)
│   │   ├── types.ts             # TaskRecord, TaskSource, Lane, etc.
│   │   └── id.ts                # HCK-XXXX ID generator
│   │
│   ├── state/
│   │   └── derive.ts            # deriveState(registry, github) → DerivedState
│   │
│   ├── discovery/
│   │   ├── github-issues.ts     # GitHub issue mining via MCP
│   │   ├── repo-signals.ts      # Local repo signal mining
│   │   ├── integration-gaps.ts  # spec-coverage → uncovered TC-* scenarios
│   │   ├── types.ts             # Candidate type definitions
│   │   └── rank.ts              # Score + rank candidates
│   │
│   ├── qualification/
│   │   ├── qualify.ts           # Lane assignment + risk assessment
│   │   ├── duplicates.ts        # Duplicate/split detection against open PRs
│   │   └── policy.ts            # Forbidden paths, diff limits, lane caps
│   │
│   ├── gates/
│   │   ├── runner.ts            # Orchestrate lint → typecheck → test → checks
│   │   ├── profiles.ts          # Gate profiles per lane
│   │   └── diff-check.ts        # File count + diff size validation
│   │
│   ├── github/
│   │   ├── adapter.ts           # GitHub operations interface
│   │   ├── mcp.ts               # MCP-based GitHub implementation
│   │   ├── pr.ts                # PR creation, update, comment helpers
│   │   ├── comments.ts          # Role-prefixed comment formatting
│   │   └── state-reader.ts      # Read PR/review/check state from GitHub
│   │
│   ├── worktree/
│   │   ├── lifecycle.ts         # Create/cleanup git worktrees
│   │   └── branch.ts            # Branch naming conventions
│   │
│   │
│   ├── prompts/
│   │   ├── implementer.ts       # Generate implementer prompt from task context
│   │   ├── reviewer.ts          # Generate reviewer prompt from PR context
│   │   └── templates/           # Markdown prompt templates
│   │       ├── implementer-bugfix.md
│   │       ├── implementer-test.md
│   │       ├── implementer-docs.md
│   │       └── reviewer.md
│   │
│   ├── cli/
│   │   ├── commands.ts          # Command router
│   │   ├── discover.ts          # `hackonctl discover`
│   │   ├── queue.ts             # `hackonctl queue`
│   │   ├── qualify.ts           # `hackonctl qualify <candidate>`
│   │   ├── status.ts            # `hackonctl status` (derived state dashboard)
│   │   ├── start.ts             # `hackonctl start <taskId>`
│   │   ├── gate.ts              # `hackonctl gate <taskId>`
│   │   ├── pr.ts                # `hackonctl pr <taskId>`
│   │   ├── review.ts            # `hackonctl review <taskId>`
│   │   ├── ready.ts             # `hackonctl ready <taskId>` (removes draft → submitted)
│   │   └── doctor.ts            # `hackonctl doctor`
│   │
│   └── lib/
│       ├── shell.ts             # Shell execution helpers
│       ├── paths.ts             # Workspace path conventions
│       └── logger.ts            # Structured logging
│
└── __tests__/
    ├── registry.test.ts
    ├── derive-state.test.ts
    ├── discovery.test.ts
    ├── qualification.test.ts
    ├── gates.test.ts
    └── duplicates.test.ts
```

---

## Config Schema

```typescript
// config/schema.ts
const configSchema = z.object({
  version: z.literal(1),

  github: z.object({
    operatorUsername: z.string(),
    upstreamOwner: z.string().default('open-mercato'),
    upstreamRepo: z.string().default('open-mercato'),
    forkOwner: z.string(),
    baseBranch: z.string().default('develop'),
    commentPrefixes: z.object({
      coordinator: z.string().default('[coordinator-agent]'),
      implementer: z.string().default('[implementer-agent]'),
      reviewer: z.string().default('[reviewer-agent]'),
    }).default({}),
  }),

  workspace: z.object({
    targetDir: z.string().default('.workspace/targets/open-mercato'),
    worktreeDir: z.string().default('.workspace/worktrees/open-mercato'),
    registryFile: z.string().default('.state/registry.json'),
  }).default({}),

  lanes: z.object({
    docs: z.object({ maxActive: z.number().default(2) }),
    tests: z.object({ maxActive: z.number().default(2) }),
    simple_bugs: z.object({ maxActive: z.number().default(1) }),
    experimental: z.object({ maxActive: z.number().default(1) }),
  }).default({}),

  policy: z.object({
    autoReadyMode: z.enum(['off', 'safe_only', 'expanded']).default('off'),
    forbiddenPaths: z.array(z.string()).default([]),
    changedFileLimit: z.record(z.number()).default({
      docs: 20, tests: 25, simple_bugs: 15, experimental: 40,
    }),
    diffLineLimit: z.record(z.number()).default({
      docs: 600, tests: 800, simple_bugs: 500, experimental: 1200,
    }),
    gates: z.object({
      lint: z.string().default('yarn lint'),
      typecheck: z.string().default('yarn typecheck'),
      test: z.string().default('yarn test'),
    }).default({}),
  }).default({}),

  discovery: z.object({
    enableGithubIssues: z.boolean().default(true),
    enableRepoSignals: z.boolean().default(true),
    enableIntegrationGaps: z.boolean().default(true),
    issueLabels: z.array(z.string()).default([]),  // filter by labels
    maxCandidates: z.number().default(50),
  }).default({}),
})
```

---

## Discovery System

### Three sources, unified ranking

**1. GitHub issues** (`discovery/github-issues.ts`)
- Use `mcp__github__list_issues` + `mcp__github__search_issues`
- Filter by labels, open state, unassigned
- Cross-check against existing open PRs to skip already-in-progress issues
- Extract: title, body, labels → candidate

**2. Repo signals** (`discovery/repo-signals.ts`)
- Mine the target clone for mechanical gaps:
  - Missing sidebar entries for existing docs pages
  - Broken/stale docs references
  - `test.todo` / `it.todo` / `describe.skip` in test files
  - Modules without nearby `__tests__/` directories
- Each signal type has a known lane (docs, tests) and risk zone (green)

**3. Integration test gaps** (`discovery/integration-gaps.ts`)
- Run `yarn mercato test:integration:spec-coverage --json`
- Parse `uncoveredScenarioIds` from the report
- Each uncovered `TC-{CATEGORY}-{XXX}` becomes a candidate
- Lane: `tests`, risk: `green`
- Leverage `.ai/skills/integration-tests/SKILL.md` patterns for prompt generation

### Ranking
Candidates scored by:
- Expected point value (critical bug 10 > regular bug 5 > test 3 > docs 2)
- Confidence (exact signal > heuristic)
- Risk zone (green > yellow > red)
- Freshness (newer issues first)

---

## Duplicate / Split Detection

### Approach: check GitHub, not local state

Before qualifying a candidate:
1. **List open PRs** via `mcp__github__list_pull_requests` (paginate all)
2. **List recently closed/merged PRs** (last 50)
3. **Match by**:
   - Same GitHub issue number in PR body/title
   - Same file paths touched (for repo signals)
   - Same test case ID (for integration gaps)
   - Fuzzy title similarity
4. **Score**: `none | low | medium | likely_duplicate`
5. **Policy**: `likely_duplicate` blocks qualification; `medium` adds note for human review

This is always fresh because it queries GitHub directly. No stale local duplicate state.

---

## Worktree Lifecycle

```
1. Create:
   git worktree add .workspace/worktrees/open-mercato/HCK-XXXX -b <branchName> develop

2. Agent works in worktree directory:
   - Implementer makes changes
   - Gates run inside worktree

3. Push:
   cd <worktree> && git push -u origin <branchName>

4. Cleanup (after merge/abandon):
   git worktree remove .workspace/worktrees/open-mercato/HCK-XXXX
   git branch -d <branchName>
```

**Branch naming**: `{type}/hackon/{taskId}-{slug}`
- `fix/hackon/hck-0042-custom-field-uuid-render`
- `test/hackon/hck-0043-jwt-coverage`
- `docs/hackon/hck-0044-checkout-sidebar`

---

## Gate Runner

Sequential gates, fail-fast:

```
1. Forbidden path check    — instant, local
2. Diff size check         — instant, local (git diff --stat)
3. Changed file count      — instant, local
4. yarn lint               — ~30s
5. yarn typecheck          — ~60s
6. yarn test               — ~60-120s (can scope to changed packages)
7. (Optional) Targeted integration test — for test-gap tasks only
```

Gate profiles per lane allow different limits. Results are transient — no need to persist them since gates re-run before every PR action.

---

## PR Workflow

### Creation
1. Implementer agent finishes + gates pass
2. Push branch to fork
3. Create draft PR via `mcp__github__create_pull_request`
4. PR body uses structured template:
   ```
   Source: {source type} — {source title}

   ## Summary
   {what changed and why}

   ## Changes
   - {file list}
   - Diff: +{added} / -{removed}

   ## Validation
   - {gate results}

   ## Expected Contribution Classes
   - {bugfix, tests, docs, etc.}
   ```

### Review cycle (agent-to-agent, pre-PR)
1. Implementer finishes → coordinator passes diff/summary to Reviewer Agent directly
2. Reviewer returns verdict: approve, or request_changes with specific concerns
3. If changes requested → Implementer fixes → re-gate → re-review
4. Once approved → ReviewSummary captured (rounds, concerns, verdict, confidence)
5. Draft PR opened with Review Summary section in the body
6. Human reads PR description to decide draft → open

### Ready → Portal handoff
1. `hackonctl ready <taskId>` — removes draft flag → PR is considered submitted to HackOn
2. CLI prints: PR URL, title, summary, Review Summary, expected contribution classes
3. (For Test Gap Agent: auto-ready policy may handle this automatically for green-lane tests)

---

## Agent Communication Model (v2 key change)

### Team structure

```
Coordinator (main Claude Code session)
│
├── Implementer Agent (short-lived, per task)
│   ├── receives: task context, AGENTS.md rules, prompt
│   ├── works in: isolated worktree directory
│   ├── does: code changes, runs targeted tests
│   └── returns: summary of changes, any blockers
│
├── Reviewer Agent (short-lived, per task)
│   ├── receives: diff, task context, review checklist
│   ├── reviews agent-to-agent (pre-PR, not on GitHub)
│   └── returns: verdict + concerns list → feeds into PR ReviewSummary
│
├── Test Gap Agent (long-running background agent)
│   ├── owns: ephemeral env lifecycle (yarn test:integration:ephemeral:start)
│   ├── loop: spec-coverage → pick gap → write test → run test → review → gates → PR → ready
│   ├── spawns: internal Reviewer Agent per test (agent-to-agent, pre-PR)
│   ├── writes: registry (createTask, updateTask with prNumber)
│   ├── writes: GitHub (draft PRs, marks ready)
│   └── does NOT: message coordinator directly
│
└── Human touchpoints:
    ├── draft → open decision (reads PR description with Review Summary)
    └── policy exceptions (on request)
```

### Review model: agent-to-agent, pre-PR

Review happens BEFORE the PR is created, not on GitHub:

```
Implementer finishes → Reviewer reviews agent-to-agent → fix loop if needed → PR opened clean
```

The review outcome is captured in the PR description's **Review Summary** section (rounds, concerns caught/fixed, verdict, confidence). This gives the human operator everything they need to decide on draft → open without digging through comment threads.

### Test Gap Agent: autonomous background teammate

The Test Gap Agent runs independently and communicates through shared artifacts only:

```
Test Gap Agent                          Coordinator
     │                                       │
     ├── writes task to registry.json ──────→ reads registry via hackonctl status
     ├── creates draft PR on GitHub ────────→ derives state from GitHub
     ├── marks PR ready (draft → open) ────→ derives submitted/judge state
     ├── adds note if blocked ──────────────→ sees in hackonctl status
     │                                       │
     └── (no direct messages)                └── human reads status dashboard
```

Full loop per gap:
1. `yarn mercato test:integration:spec-coverage --json` → pick uncovered TC-*
2. Check duplicates against open PRs
3. Create worktree + branch, write task to registry
4. Read scenario .md + explore app via Playwright MCP against ephemeral env
5. Write .spec.ts in `__integration__/`
6. Run test against ephemeral env
7. If fails → fix → retry (max 2)
8. Run gates (lint, typecheck, test)
9. Spawn Reviewer Agent (agent-to-agent) → fix loop if needed
10. Open draft PR with Review Summary
11. Mark ready (remove draft) if auto-ready policy allows, else leave for human
12. Next gap

Stops when: all gaps covered, ephemeral env crashes, or unrecoverable blocker (adds note to registry task).

**Key difference from v1**: No file handoff. No poll loop. Agents communicate directly or through shared artifacts (registry + GitHub). State is always derived, never stale.

---

## Portal / Judge Lifecycle

**Both portal and judge status are derived from GitHub — zero local state needed.**

**Portal status** — derived from PR draft flag:
- PR is draft → `not_submitted` (still in progress)
- PR moved from draft to open (ready for review) → `submitted` (considered submitted to HackOn)
- This convention means `hackonctl ready` (which removes draft status) IS the portal submission

**Judge status** — derived from GitHub reviews and labels:
- Judge approval → visible as a GitHub review approval from a maintainer/judge account
- Judge rejection → visible as `changes_requested` review or a specific label
- Judge adjustment → visible as label change (e.g., `score-adjusted`)

```
derivePortalStatus(pr):
  if pr.draft → 'not_submitted'
  if !pr.draft → 'submitted'

deriveJudgeStatus(pr, reviews):
  if pr.draft → 'not_started'
  labels = pr.labels
  if labels includes 'judge-rejected' → 'rejected'
  if labels includes 'score-adjusted' → 'adjusted'
  if any review from maintainer with APPROVED → 'approved'
  if !pr.draft → 'pending'  // submitted but no judge action yet
  → 'not_started'
```

**CLI flow** (simplified — no manual portal/judge commands needed):
```bash
hackonctl ready HCK-0042      # removes draft → PR is now "submitted" to HackOn
hackonctl status HCK-0042     # shows portal=submitted, judge=pending (or approved if judge reviewed)
```

---

## Auto-Ready Policy

```
autoReadyMode: off | safe_only | expanded
```

- **off** (default): All PRs require explicit `hackonctl ready` command
- **safe_only**: Docs-only and test-only PRs in green lanes auto-transition from draft to ready when: approved by reviewer, all gates green, no unresolved comments
- **expanded**: Adds simple_bugs in green lane to safe_only rules

**Never auto-ready**: experimental lane, red/yellow risk zone, PRs with unresolved comments

---

## CLI Commands

```bash
hackonctl init                    # Create hackonctl.config.json interactively
hackonctl discover                # Run all discovery sources, print ranked candidates
hackonctl discover --source=gaps  # Only integration test gaps
hackonctl discover --source=issues # Only GitHub issues
hackonctl discover --source=signals # Only repo signals
hackonctl queue                   # Show current candidate queue
hackonctl qualify <candidateId>   # Qualify candidate → create task record
hackonctl status                  # Dashboard: all tasks with derived GitHub state
hackonctl status <taskId>         # Single task detail with full GitHub-derived state
hackonctl start <taskId>          # Create worktree + branch
hackonctl gate <taskId>           # Run gate checks in worktree (deterministic: lint→typecheck→test→diff)
hackonctl pr <taskId>             # Create or sync draft PR
hackonctl review <taskId>         # Print context for reviewer agent (PR diff, task info)
hackonctl ready <taskId>          # Remove draft flag → PR is considered submitted to HackOn
hackonctl close <taskId>          # Abandon task, cleanup worktree
hackonctl doctor                  # System diagnostics (config, worktrees, git state, GitHub connectivity)
```

Note: `portal` and `judge` commands removed — both states are now derived from GitHub (draft flag → portal, reviews/labels → judge).

---

## Phased Implementation Order

### Phase 1: Package skeleton + config + registry (foundation)
**Files**: `package.json`, `tsconfig.json`, `build.mjs`, `config/`, `registry/`, `lib/`
**Delivers**: Loadable config, task CRUD, ID generation, build/test harness
**Tests**: Config validation, registry operations

### Phase 2: GitHub state derivation (the architectural core)
**Files**: `github/adapter.ts`, `github/mcp.ts`, `github/state-reader.ts`, `state/derive.ts`
**Delivers**: `deriveState()` function that queries GitHub MCP and computes lifecycle state
**Tests**: State derivation logic with mocked GitHub responses

### Phase 3: Discovery + qualification (find work)
**Files**: `discovery/`, `qualification/`, `cli/discover.ts`, `cli/queue.ts`, `cli/qualify.ts`
**Delivers**: Three discovery sources, ranking, duplicate detection, lane assignment
**Tests**: Signal parsing, ranking, duplicate scoring
**Note**: Integration test gap discovery uses `yarn mercato test:integration:spec-coverage --json`

### Phase 4: Worktree + gates (execute work)
**Files**: `worktree/`, `gates/`, `cli/start.ts`, `cli/gate.ts`
**Delivers**: Worktree lifecycle, gate runner with fail-fast, diff checks
**Tests**: Gate profiles, diff limit enforcement

### Phase 5: PR workflow + prompts (ship work)
**Files**: `github/pr.ts`, `github/comments.ts`, `prompts/`, `cli/pr.ts`, `cli/review.ts`
**Delivers**: Draft PR creation, structured body template, role-prefixed comments, prompt generation
**Tests**: PR body formatting, comment prefixing

### Phase 6: Ready + auto-ready policy (ship to HackOn)
**Files**: `cli/ready.ts`
**Delivers**: `hackonctl ready` removes draft flag (= portal submission), auto-ready policy enforcement
**Tests**: Auto-ready policy logic
**Note**: Portal and judge status are already derived in Phase 2 — no additional tracking code needed

### Phase 7: CLI polish + doctor + status dashboard
**Files**: `cli/status.ts`, `cli/doctor.ts`, `cli/commands.ts`, `bin/hackonctl.ts`
**Delivers**: Full CLI surface, diagnostics, pretty-printed status

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GitHub MCP rate limits | Discovery/state derivation slowed | Cache discovery results for configurable TTL; batch PR queries |
| GitHub MCP unavailable | Can't derive state or create PRs | Graceful degradation: show "GitHub unreachable" in status, allow local-only gates |
| Worktree build conflicts | Parallel tasks corrupt shared build caches | Conservative lane concurrency limits; serialize build-heavy gates |
| Duplicate detection misses | Wasted effort on already-fixed issues | Always check open+recent PRs before qualification; human review for medium-risk |
| Over-automation risks | Low-quality PRs hurt reputation | autoReadyMode=off default; human confirms every ready transition |

---

## Resolved Design Decisions

1. **Review model**: Agent-to-agent pre-PR (not GitHub comments). Review outcome captured in PR body's Review Summary section.
2. **Portal submission**: draft → open transition = submitted to HackOn. No manual `portal` command.
3. **Judge status**: Derived from GitHub reviews/labels. No manual `judge` command.
4. **Test Gap Agent**: Long-running background teammate with own ephemeral env. Communicates through shared registry + GitHub, not direct messages.

## Open Questions

1. Should `hackonctl status` also show non-task PRs from the fork (manually opened PRs)?
2. Should discovery cache live in `.state/discovery/` or be fully transient?
3. Max retry count for implementer/test-gap agent when gates fail? (Currently: 2 for test gap agent)
4. Should the Test Gap Agent auto-restart ephemeral env on crash, or stop and surface the blocker?

---

## Verification Plan

After each phase:
1. `yarn build` — package compiles
2. `yarn test` — unit tests pass within the package
3. Manual smoke test of new CLI commands
4. After Phase 2: verify `deriveState()` correctly maps real GitHub PR state
5. After Phase 3: verify discovery finds real candidates in open-mercato
6. After Phase 5: verify draft PR creation works end-to-end via MCP
7. Final: full workflow test — discover → qualify → start → gate → pr → review → ready
