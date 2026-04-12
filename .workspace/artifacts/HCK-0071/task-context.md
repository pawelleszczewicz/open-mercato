# HackOn Task Context

- Task ID: HCK-0071
- Target: open-mercato
- Source: repo_signal:DOCSIG-sidebar-user-guide-self-service-onboarding
- Title: docs: add missing sidebar entry for user-guide/self-service-onboarding
- Lane: docs
- Risk zone: low
- Base branch: develop
- Worktree: /home/hacker/repo/open-mercato/.workspace/worktrees/open-mercato/HCK-0071
- Branch: docs/hackon/hck-0071-docs-add-missing-sidebar-entry-for-user-guide-self-service-onboarding

## Source Evidence
- apps/docs/docs/user-guide/self-service-onboarding.mdx exists as a documentation page.
- apps/docs/sidebars.ts does not reference "user-guide/self-service-onboarding".

## Candidate Paths
- apps/docs/sidebars.ts
- apps/docs/docs/user-guide/self-service-onboarding.mdx

## Validation Profiles
- docs-basic
- docs-app-build

## Required Guides
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/CONTRIBUTING.md
- /home/hacker/repo/open-mercato/.workspace/targets/open-mercato/AGENTS.md

## Duplicate Risk
- Class: none

## Current Blockers
- None

## Last Coordinator Decision
- Duplicate checkpoint before_draft_pr_open passed. No duplicate-risk signals found.

