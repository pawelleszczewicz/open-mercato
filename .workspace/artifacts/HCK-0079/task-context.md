# HackOn Task Context

- Task ID: HCK-0079
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-boolean-ts
- Title: tests: add low-level coverage for boolean.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0079
- Branch: fix/hackon/hck-0079-tests-add-low-level-coverage-for-boolean-ts

## Source Evidence
- packages/shared/src/lib/boolean.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/boolean.ts.
- Checked: packages/shared/src/lib/boolean.test.ts
- packages/shared/src/lib/__tests__/boolean.test.ts
- packages/shared/src/lib/boolean.spec.ts
- packages/shared/src/lib/__tests__/boolean.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/boolean.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0079/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0079/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Qualified for coordinator workflow. No duplicate risk signals found.

