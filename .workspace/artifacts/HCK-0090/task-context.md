# HackOn Task Context

- Task ID: HCK-0090
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-cli-src-lib-generators-entity-ids-ts
- Title: tests: add low-level coverage for entity-ids.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0090
- Branch: fix/hackon/hck-0090-tests-add-low-level-coverage-for-entity-ids-ts

## Source Evidence
- packages/cli/src/lib/generators/entity-ids.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/cli/src/lib/generators/entity-ids.ts.
- Checked: packages/cli/src/lib/generators/entity-ids.test.ts
- packages/cli/src/lib/generators/__tests__/entity-ids.test.ts
- packages/cli/src/lib/generators/entity-ids.spec.ts
- packages/cli/src/lib/generators/__tests__/entity-ids.spec.ts ...

## Candidate Paths
- packages/cli/src/lib/generators/entity-ids.ts

## Validation Profiles
- cli-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/cli/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0090/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0090/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Qualified for coordinator workflow. No duplicate risk signals found.

