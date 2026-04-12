# HackOn Task Context

- Task ID: HCK-0064
- Target: open-mercato
- Source: repo_signal:TESTSIG-integration-scenario-tc-docker-008
- Title: tests: implement missing integration scenario TC-DOCKER-008
- Lane: tests
- Risk zone: low
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0064
- Branch: test/hackon/hck-0064-tests-implement-missing-integration-scenario-tc-docker-008

## Source Evidence
- Integration spec coverage reports TC-DOCKER-008 as uncovered.
- Scenario file: .ai/qa/scenarios/TC-DOCKER-008-ephemeral-stack.md.
- Create a module-local Playwright integration spec that implements this scenario.

## Candidate Paths
- .ai/qa/scenarios/TC-DOCKER-008-ephemeral-stack.md

## Validation Profiles
- integration-tests
- integration-test-gap-coverage

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0064/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0064/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: likely_duplicate
- Open upstream PR #1280 is strongly similar to this task title.

## Current Blockers
- review_unresolved: Reviewer has unresolved blocking findings. (artifact: /home/hacker/repo/open-mercato/.workspace/artifacts/HCK-0064/runs/2026-04-11T21-19-24-690Z-reviewer.stdout.log)

## Last Coordinator Decision
- Blocked at duplicate checkpoint before_draft_pr_open. Open upstream PR #1280 is strongly similar to this task title.

