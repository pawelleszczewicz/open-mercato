# HackOn Task Context

- Task ID: HCK-0091
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-cli-src-lib-generators-module-di-ts
- Title: tests: add low-level coverage for module-di.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0091
- Branch: fix/hackon/hck-0091-tests-add-low-level-coverage-for-module-di-ts

## Source Evidence
- packages/cli/src/lib/generators/module-di.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/cli/src/lib/generators/module-di.ts.
- Checked: packages/cli/src/lib/generators/module-di.test.ts
- packages/cli/src/lib/generators/__tests__/module-di.test.ts
- packages/cli/src/lib/generators/module-di.spec.ts
- packages/cli/src/lib/generators/__tests__/module-di.spec.ts ...

## Candidate Paths
- packages/cli/src/lib/generators/module-di.ts

## Validation Profiles
- cli-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/cli/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0091/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0091/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

