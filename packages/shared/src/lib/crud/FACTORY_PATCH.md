# Factory.ts Patch

This file documents the additional change needed in `packages/shared/src/lib/crud/factory.ts`.

The factory.ts file is too large to push via the GitHub API. The following patch should be applied:

## POST handler (after line ~1855)

After `if (!createConfig) throw new Error('Create configuration missing')` and the following blank line, add:

```typescript
      // Early organization context check — validate before schema parsing to avoid
      // raw Zod errors when organizationId is required but no org is selected.
      if (ormCfg.orgField) {
        const earlyOrgId = (body as Record<string, unknown>)?.organizationId ?? ctx.selectedOrganizationId ?? ctx.auth.orgId ?? null
        if (!earlyOrgId) return json({ error: 'Organization context is required.' }, { status: 400 })
      }
```

## PUT handler (after line ~2164)

After `if (!updateConfig) throw new Error('Update configuration missing')` and the following blank line, add the same block.

This change adds defense-in-depth for routes using the non-command create/update path.
The primary fix in `scoped.ts` already covers all routes using the command path.
