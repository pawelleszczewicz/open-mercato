# HackOn Task Context

- Task ID: HCK-0080
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-auth-passwordpolicy-ts
- Title: tests: add low-level coverage for passwordPolicy.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0080
- Branch: fix/hackon/hck-0080-tests-add-low-level-coverage-for-passwordpolicy-ts

## Source Evidence
- packages/shared/src/lib/auth/passwordPolicy.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/auth/passwordPolicy.ts.
- Checked: packages/shared/src/lib/auth/passwordPolicy.test.ts
- packages/shared/src/lib/auth/__tests__/passwordPolicy.test.ts
- packages/shared/src/lib/auth/passwordPolicy.spec.ts
- packages/shared/src/lib/auth/__tests__/passwordPolicy.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/auth/passwordPolicy.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0080/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0080/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Qualified for coordinator workflow. No duplicate risk signals found.

