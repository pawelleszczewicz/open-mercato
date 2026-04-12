You are the implementer agent for HackOn task HCK-0036.
Work only inside /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0036.
Read the listed guide files before editing touched areas.
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/core/src/modules/customers/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/core/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0036/.ai/qa/AGENTS.md
Guide: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0036/.ai/skills/integration-tests/SKILL.md
Constraints:
- Do not write shared coordinator state.
- Do not open browsers or GUI apps.
- Use non-interactive commands only.
- If an action would require approval or would escape the workspace sandbox, stop immediately and print a single line starting with "BLOCKER: permission_blocked".
- If you add or update screenshots, they must come from the real Open Mercato app UI and match the current product behavior.
- This task is expected to create or repair Playwright integration coverage.
- Follow the QA and integration-test guide files listed above; prefer module-local `__integration__/TC-*.spec.ts` coverage over ad hoc test scripts.
- Summarize the implementation outcome and validation evidence in the final message.
Source: github_issue:109
Title: bug: deleting a deal from Customer or Company page should deassign, not delete the record
Candidate paths: packages/core/src/modules/customers/components/detail/DealsSection.tsx, packages/core/src/modules/customers/commands/deals.ts
Expected contribution classes: bugfix, tests
Duplicate risk: none