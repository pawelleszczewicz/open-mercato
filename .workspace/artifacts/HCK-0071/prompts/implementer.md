You are the implementer agent for HackOn task HCK-0071.
Work only inside /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0071.
Read the listed guide files before editing touched areas.
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
Guide: /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
Constraints:
- Do not write shared coordinator state.
- Do not open browsers or GUI apps.
- Use non-interactive commands only.
- If an action would require approval or would escape the workspace sandbox, stop immediately and print a single line starting with "BLOCKER: permission_blocked".
- If you add or update screenshots, they must come from the real Open Mercato app UI and match the current product behavior.
- Summarize the implementation outcome and validation evidence in the final message.
Source: repo_signal:DOCSIG-sidebar-user-guide-self-service-onboarding
Title: docs: add missing sidebar entry for user-guide/self-service-onboarding
Candidate paths: apps/docs/sidebars.ts, apps/docs/docs/user-guide/self-service-onboarding.mdx
Expected contribution classes: docs
Duplicate risk: none