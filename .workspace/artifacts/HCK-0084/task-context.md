# HackOn Task Context

- Task ID: HCK-0084
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-api-context-ts
- Title: tests: add low-level coverage for context.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0084
- Branch: fix/hackon/hck-0084-tests-add-low-level-coverage-for-context-ts

## Source Evidence
- packages/shared/src/lib/api/context.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/api/context.ts.
- Checked: packages/shared/src/lib/api/context.test.ts
- packages/shared/src/lib/api/__tests__/context.test.ts
- packages/shared/src/lib/api/context.spec.ts
- packages/shared/src/lib/api/__tests__/context.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/api/context.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0084/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0084/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Qualified for coordinator workflow. No duplicate risk signals found.

