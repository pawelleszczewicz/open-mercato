# HackOn Task Context

- Task ID: HCK-0087
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-cli-src-lib-umes-list-ts
- Title: tests: add low-level coverage for list.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0087
- Branch: fix/hackon/hck-0087-tests-add-low-level-coverage-for-list-ts

## Source Evidence
- packages/cli/src/lib/umes/list.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/cli/src/lib/umes/list.ts.
- Checked: packages/cli/src/lib/umes/list.test.ts
- packages/cli/src/lib/umes/__tests__/list.test.ts
- packages/cli/src/lib/umes/list.spec.ts
- packages/cli/src/lib/umes/__tests__/list.spec.ts ...

## Candidate Paths
- packages/cli/src/lib/umes/list.ts

## Validation Profiles
- cli-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/cli/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0087/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0087/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

