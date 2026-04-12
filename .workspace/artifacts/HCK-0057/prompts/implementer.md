You are the implementer agent for HackOn task HCK-0057.
Work only inside /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0057.
Read the listed guide files before editing touched areas.
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/.ai/qa/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0057/.ai/qa/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0057/.ai/skills/integration-tests/SKILL.md
Constraints:
- Do not write shared coordinator state.
- Do not open browsers or GUI apps.
- Use non-interactive commands only.
- If an action would require approval or would escape the workspace sandbox, stop immediately and print a single line starting with "BLOCKER: permission_blocked".
- If you add or update screenshots, they must come from the real Open Mercato app UI and match the current product behavior.
- This task is expected to create or repair Playwright integration coverage.
- Follow the QA and integration-test guide files listed above; prefer module-local `__integration__/TC-*.spec.ts` coverage over ad hoc test scripts.
- This task belongs to the dedicated integration-test-gap pillar for scenario IDs: TC-DOCKER-001.
- Do not stop at editing the scenario markdown. Close the gap by adding or repairing the matching module-local Playwright spec file.
- Use `yarn mercato test:integration:spec-coverage --json` to confirm TC-DOCKER-001 is no longer reported as uncovered.
- When approval-sensitive validation is allowed, prefer targeted runs such as `yarn mercato test:integration --filter TC-DOCKER-001` over full-suite Playwright runs.
- Summarize the implementation outcome and validation evidence in the final message.
Source: repo_signal:TESTSIG-integration-scenario-tc-docker-001
Title: tests: implement missing integration scenario TC-DOCKER-001
Candidate paths: .ai/qa/scenarios/TC-DOCKER-001-dev-stack-startup-shutdown.md
Expected contribution classes: tests
Duplicate risk: none