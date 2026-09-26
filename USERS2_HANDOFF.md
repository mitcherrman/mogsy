# USERS2 — Audience Intelligence

## Current task

**USERS2.1 — top-level Users IA consolidation**

## Objective

Replace the eight-section Users navigation with exactly three top-level destinations:

1. Audience
2. Accounts
3. Moderation

Audience must combine the existing Overview, Visitors, Activity, Acquisition,
Retention and Traffic Health functionality into one vertically structured
operational page without changing analytics calculations or schemas. Accounts
must remain the canonical consolidated account surface from main, and
Moderation must retain its existing queues and roster controls.

## Base and branch

- Base: `origin/main` at `6a1e52827732db25327279726004bc042c033997`
- Branch: `codex/users2-audience-ia`

The branch was created from a freshly fetched `origin/main` in an isolated
managed worktree. The unrelated dirty checkout at
`C:\Users\mlmit\OneDrive\Desktop\mogsy` was not modified.

## Decisions

- Users top-level navigation is exactly Audience, Accounts and Moderation.
- Audience is one continuous page, not six inner tabs. Its order is headline
  metrics, Visitors, Engagement / Activity, Acquisition, Retention, then
  Traffic Health.
- The existing range, traffic-population and refresh controls apply once to the
  entire Audience page.
- Existing analytics components and calculations are composed unchanged.
- Headline metric drilldowns continue to set `?population=<key>`, clear an open
  visitor record, and target the embedded Visitors population. The page scrolls
  to Visitors when a population drilldown is active.
- Canonical Accounts continues to render the existing `AdminUsers` component.
  Its search, filters, detail, roles, entitlement, invites and Account Actions
  were not redesigned.
- Moderation continues to expose Comments, User reports, Moderator roster and
  Feedback through its existing in-section views.
- Registry destinations that used the retired `section=visitors` and
  `section=traffic-health` concepts now point to `section=audience`.
- Removed the analytics read-count/status line and duplicate traffic-filter
  explanation from the main Audience UI; actionable empty, error and truncation
  states remain.

## Relevant files

- `src/pages/admin/areas/AdminUsersPage.tsx` — consolidated Audience composition
  and preserved drilldown behavior.
- `src/lib/admin/admin-registry.ts` — three-section Users IA and canonical
  Audience tool destinations.
- `src/pages/admin/areas/AdminShell.areas.test.tsx` — vertical composition and
  drilldown integration coverage.
- `src/lib/admin/admin-registry.test.ts` — updated registry assertions and
  legacy redirect target.
- `src/test/guards/users2AudienceIa.test.ts` — exact top-level navigation guard.

## State

Code complete. Not published.

No analytics calculation, analytics schema, account implementation, or
moderation implementation changed. No files were deleted.

## Verification

Focused tests:

```text
5 files passed
113 tests passed
```

Command:

```text
npx vitest run src/test/guards/users2AudienceIa.test.ts \
  src/pages/admin/areas/AdminShell.areas.test.tsx \
  src/lib/admin/admin-registry.test.ts \
  src/lib/admin/admin-registry.routes.test.ts \
  src/test/guards/usersAccountsIa.test.ts
```

Typecheck:

```text
npx tsc -p tsconfig.app.json --noEmit
```

The command ran and reports two existing errors in untouched files:

- `src/components/onboarding/OnboardingProfile.tsx:180`
- `src/lib/identity/connections.ts:263`

Both are Supabase generated-type/excess-property mismatches present on the
base; USERS2.1 changes introduce no typecheck diagnostic.

Production build:

```text
npm run build
```

Passed, including Vite production compilation and all item/champion prerender
verification. Existing Tailwind ambiguity and mixed dynamic/static import
warnings remain non-fatal.

## Next task

USERS2.2 should build on this consolidated Audience page and be scoped from
real operator needs. Keep analytics definitions and schema changes separate
from this completed IA-only task.
