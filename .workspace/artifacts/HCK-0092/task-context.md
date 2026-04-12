# HackOn Task Context

- Task ID: HCK-0092
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-cli-src-lib-generators-module-entities-ts
- Title: tests: add low-level coverage for module-entities.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0092
- Branch: fix/hackon/hck-0092-tests-add-low-level-coverage-for-module-entities-ts

## Source Evidence
- packages/cli/src/lib/generators/module-entities.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/cli/src/lib/generators/module-entities.ts.
- Checked: packages/cli/src/lib/generators/module-entities.test.ts
- packages/cli/src/lib/generators/__tests__/module-entities.test.ts
- packages/cli/src/lib/generators/module-entities.spec.ts
- packages/cli/src/lib/generators/__tests__/module-entities.spec.ts ...

## Candidate Paths
- packages/cli/src/lib/generators/module-entities.ts

## Validation Profiles
- cli-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/cli/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0092/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0092/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

