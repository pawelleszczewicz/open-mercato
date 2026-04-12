# HackOn Task Context

- Task ID: HCK-0059
- Target: open-mercato
- Source: repo_signal:TESTSIG-integration-scenario-tc-docker-003
- Title: tests: implement missing integration scenario TC-DOCKER-003
- Lane: tests
- Risk zone: low
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0059
- Branch: test/hackon/hck-0059-tests-implement-missing-integration-scenario-tc-docker-003

## Source Evidence
- Integration spec coverage reports TC-DOCKER-003 as uncovered.
- Scenario file: .ai/qa/scenarios/TC-DOCKER-003-exec-initialize-reinstall.md.
- Create a module-local Playwright integration spec that implements this scenario.

## Candidate Paths
- .ai/qa/scenarios/TC-DOCKER-003-exec-initialize-reinstall.md

## Validation Profiles
- integration-tests
- integration-test-gap-coverage

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0059/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0059/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: likely_duplicate
- Open upstream PR #1280 is strongly similar to this task title.
- Open upstream PR #1279 is strongly similar to this task title.

## Current Blockers
- None

## Last Coordinator Decision
- Blocked at duplicate checkpoint before_draft_pr_open. Open upstream PR #1280 is strongly similar to this task title. Open upstream PR #1279 is strongly similar to this task title.

