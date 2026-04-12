# HackOn Task Context

- Task ID: HCK-0083
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-api-crud-ts
- Title: tests: add low-level coverage for crud.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0083
- Branch: fix/hackon/hck-0083-tests-add-low-level-coverage-for-crud-ts

## Source Evidence
- packages/shared/src/lib/api/crud.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/api/crud.ts.
- Checked: packages/shared/src/lib/api/crud.test.ts
- packages/shared/src/lib/api/__tests__/crud.test.ts
- packages/shared/src/lib/api/crud.spec.ts
- packages/shared/src/lib/api/__tests__/crud.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/api/crud.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0083/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0083/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

