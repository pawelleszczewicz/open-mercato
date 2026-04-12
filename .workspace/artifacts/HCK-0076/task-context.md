# HackOn Task Context

- Task ID: HCK-0076
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-bootstrap-dynamicloader-ts
- Title: tests: add low-level coverage for dynamicLoader.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0076
- Branch: fix/hackon/hck-0076-tests-add-low-level-coverage-for-dynamicloader-ts

## Source Evidence
- packages/shared/src/lib/bootstrap/dynamicLoader.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/bootstrap/dynamicLoader.ts.
- Checked: packages/shared/src/lib/bootstrap/dynamicLoader.test.ts
- packages/shared/src/lib/bootstrap/__tests__/dynamicLoader.test.ts
- packages/shared/src/lib/bootstrap/dynamicLoader.spec.ts
- packages/shared/src/lib/bootstrap/__tests__/dynamicLoader.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/bootstrap/dynamicLoader.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0076/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0076/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Qualified for coordinator workflow. No duplicate risk signals found.

