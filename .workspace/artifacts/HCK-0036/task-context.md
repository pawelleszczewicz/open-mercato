# HackOn Task Context

- Task ID: HCK-0036
- Target: open-mercato
- Source: github_issue:109
- Title: bug: deleting a deal from Customer or Company page should deassign, not delete the record
- Lane: simple_bugs
- Risk zone: medium
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0036
- Branch: fix/hackon/hck-0036-bug-deleting-a-deal-from-customer-or-company-page-should-deassign-not-d

## Source Evidence

## Candidate Paths
- packages/core/src/modules/customers/components/detail/DealsSection.tsx
- packages/core/src/modules/customers/commands/deals.ts

## Validation Profiles
- core-package-checks

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/core/src/modules/customers/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/packages/core/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0036/.ai/qa/AGENTS.md
- /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0036/.ai/skills/integration-tests/SKILL.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Rehydrated from open draft PR #1228 during runtime reset. Preserved the open draft PR so reviewer flow can resume from a clean fresh runtime.

