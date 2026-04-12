# HackOn Task Context

- Task ID: HCK-0085
- Target: open-mercato
- Source: repo_signal:TESTSIG-lowlevel-untested-packages-create-app-template-src-lib-metadata-ts
- Title: tests: add low-level coverage for metadata.ts
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0085
- Branch: fix/hackon/hck-0085-tests-add-low-level-coverage-for-metadata-ts

## Source Evidence
- packages/create-app/template/src/lib/metadata.ts exports runtime logic in a low-level package path.
- No nearby test file was found for packages/create-app/template/src/lib/metadata.ts.
- Checked: packages/create-app/template/src/lib/metadata.test.ts
- packages/create-app/template/src/lib/__tests__/metadata.test.ts
- packages/create-app/template/src/lib/metadata.spec.ts
- packages/create-app/template/src/lib/__tests__/metadata.spec.ts ...

## Candidate Paths
- packages/create-app/template/src/lib/metadata.ts

## Validation Profiles
- create-app-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/create-app/template/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/create-app/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0085/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0085/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

