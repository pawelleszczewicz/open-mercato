# HackOn Task Context

- Task ID: HCK-0081
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-shared-src-lib-auth-featurematch-ts
- Title: tests: add low-level coverage for featureMatch.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0081
- Branch: fix/hackon/hck-0081-tests-add-low-level-coverage-for-featurematch-ts

## Source Evidence
- packages/shared/src/lib/auth/featureMatch.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/shared/src/lib/auth/featureMatch.ts.
- Checked: packages/shared/src/lib/auth/featureMatch.test.ts
- packages/shared/src/lib/auth/__tests__/featureMatch.test.ts
- packages/shared/src/lib/auth/featureMatch.spec.ts
- packages/shared/src/lib/auth/__tests__/featureMatch.spec.ts ...

## Candidate Paths
- packages/shared/src/lib/auth/featureMatch.ts

## Validation Profiles
- shared-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/shared/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0081/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0081/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Qualified for coordinator workflow. No duplicate risk signals found.

