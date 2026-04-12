# HackOn Task Context

- Task ID: HCK-0078
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-bootstrap-appresolver-ts
- Title: tests: add low-level coverage for appResolver.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0078
- Branch: fix/hackon/hck-0078-tests-add-low-level-coverage-for-appresolver-ts

## Source Evidence
- packages/shared/src/lib/bootstrap/appResolver.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/bootstrap/appResolver.ts.
- Checked: packages/shared/src/lib/bootstrap/appResolver.test.ts
- packages/shared/src/lib/bootstrap/__tests__/appResolver.test.ts
- packages/shared/src/lib/bootstrap/appResolver.spec.ts
- packages/shared/src/lib/bootstrap/__tests__/appResolver.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/bootstrap/appResolver.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0078/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0078/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

