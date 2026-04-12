You are the implementer agent for HackOn task HCK-0090.
Work only inside /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0090.
Read the listed guide files before editing touched areas.
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/cli/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0090/.ai/qa/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0090/.ai/skills/integration-tests/SKILL.md
Constraints:
- Do not write shared coordinator state.
- Do not open browsers or GUI apps.
- Use non-interactive commands only.
- If an action would require approval or would escape the workspace sandbox, stop immediately and print a single line starting with "BLOCKER: permission_blocked".
- If you add or update screenshots, they must come from the real Open Mercato app UI and match the current product behavior.
- This task is expected to create or repair Playwright integration coverage.
- Follow the QA and integration-test guide files listed above; prefer module-local `__integration__/TC-*.spec.ts` coverage over ad hoc test scripts.
- Summarize the implementation outcome and validation evidence in the final message.
Source: repo_signal:TESTSIG-lowlevel-untested-packages-cli-src-lib-generators-entity-ids-ts
Title: tests: add low-level coverage for entity-ids.ts
Candidate paths: packages/cli/src/lib/generators/entity-ids.ts
Expected contribution classes: tests, bugfix
Duplicate risk: none