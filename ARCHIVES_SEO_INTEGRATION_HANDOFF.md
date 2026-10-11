# Archives + SEO integration handoff

## Candidate

- Integration branch: `codex/archives-seo-integration`
- Candidate implementation SHA: `343bc02e78acb6b61ef5734a3b323f4ec324b4f4`
- Base `origin/main`: `0e37e62125b63806fa8a5f88051930c333b915a7`
- Shared feature merge base: `849e6198024d0207dfa8cf12f045aa7fdd503ebb`
- Source heads:
  - `archives/items-directory`: `44c3743533ec4000798a7e048a605398ea9258ed`
  - `seo/public-route-truth`: `77bc617f37387473f4e4e0cf1cba78598c559016`
  - `seo/journey-library-discovery`: `49a6c39605e73cc4f80d96e51d00ab6dafa846f4`

The Journey Library branch already contained the two public-route-truth commits, so that lineage was applied once. All three feature heads were unmerged at integration start. Current main already had the public Journey Library and Glossary routes; this candidate reuses those routes and only adds their missing sitemap discovery.

## Merged requirements

- Adds the canonical Archives item directory at `/lol/docs/items`, sourced directly from `/api/items` without a second eligibility rule.
- Opens the Archives Items shelf, registers the route once, and prefetches both directory and item-detail chunks.
- Preserves existing dynamic item and champion sitemap/prerender architecture.
- Removes stale `/lol/tier-list` sitemap promotion and adds `/lol/glossary`.
- Adds `/quiz/journeys` and `/lol/docs/items` to the static sitemap.
- Regenerates `public/sitemap.xml` from the canonical builder.
- Adds integration assertions for Journey Library sitemap discovery and item-directory prefetch behavior.

## Changed files versus base main

- `ARCHIVES_SEO_INTEGRATION_HANDOFF.md`
- `public/sitemap.xml`
- `src/App.tsx`
- `src/lib/route-prefetch.ts`
- `src/lib/route-prefetch.test.ts`
- `src/lib/seo/sitemap.ts`
- `src/lib/seo/sitemap.test.ts`
- `src/pages/lol-docs/LeagueDocsItemIndex.tsx`
- `src/pages/lol-docs/LeagueDocsItemIndex.test.tsx`
- `src/pages/lol-docs/LeagueDocsLanding.tsx`
- `src/pages/lol-docs/LeagueDocsLanding.mechanics-tile.test.tsx`

## Verification

| Check | Candidate | Main comparison |
|---|---|---|
| Focused Archives/routing/sitemap/SEO Vitest | PASS — 7 files, 28 tests | No candidate failures |
| Modified-file ESLint | PASS — 0 errors, 1 `App.tsx` Fast Refresh warning | Same warning on main |
| TypeScript `tsc --noEmit -p tsconfig.app.json` | BASELINE FAIL — 2 unrelated errors | Identical errors on main in `OnboardingProfile.tsx:180` and `connections.ts:263` |
| Production `npm run build` | PASS | 423 sitemap entries; Vite completed |
| Item prerender invariant | PASS | 213 sitemap item URLs / 213 pages |
| Champion prerender invariant | PASS | 173 sitemap champion URLs / 173 pages |
| Generated sitemap route truth | PASS | Journey, Glossary, and Items each once; tier list absent |
| Clean install (`npm ci`) | BASELINE FAIL | Main `package.json` and `package-lock.json` are already out of sync (Drizzle/Postgres/tsx entries) |

Build warnings were limited to existing Tailwind ambiguity, chunk-size, and mixed static/dynamic import warnings. The local build had no Supabase anon key, so blog entries were deliberately omitted by the existing generator; champion, pro-year, and item API groups loaded successfully.

## Risks and next action

- Baseline TypeScript and lockfile failures remain outside this integration's scope.
- Re-run `npm run build` in the normal release environment so sitemap blog entries are generated with production credentials.
- Recommended next action: review this branch, then merge it into an up-to-date main without adding the other SEO branches. Do not deploy from this worktree.

## Mainline integration status — 2026-10-10

- Mainline base: `0e37e62125b63806fa8a5f88051930c333b915a7`
- Approved candidate: `0d7a91b26f91621b78b72e5d19ae024ee219227c`
- Verified merge commit: `896e55f2b1448e07e8c9ad7a45b03142757620cb`
- Merge method: normal non-fast-forward merge with parents `0e37e62125b63806fa8a5f88051930c333b915a7` and `0d7a91b26f91621b78b72e5d19ae024ee219227c`; reviewed history is preserved.
- Drift/ownership result: no remote-main drift, merge conflict, unexpected file, or other-workstream change was present.

Exact merge-result verification:

| Check | Result |
|---|---|
| Focused Archives/routing/sitemap/SEO Vitest | PASS — 7 files, 28 tests |
| Modified-file ESLint | PASS — 0 errors; the existing `App.tsx` Fast Refresh warning remains |
| TypeScript `tsc --noEmit -p tsconfig.app.json` | BASELINE FAIL — the same two current-main errors in `OnboardingProfile.tsx:180` and `connections.ts:263` |
| Production `npm run build` | PASS — 423 URLs: 21 static, 173 champions, 16 pro years, 213 items, 0 blog |
| Item prerender invariant | PASS — 213 sitemap URLs / 213 pages |
| Champion prerender invariant | PASS — 173 sitemap URLs / 173 pages |
| Sitemap uniqueness and route truth | PASS — 0 duplicate URLs; Journey, Glossary, and Items occur once; tier list is absent |

Deployment was not performed. The remaining release action is the repository's normal deployment from main, including a production-environment build so blog sitemap entries can be generated with the existing Supabase credentials. No backend, Supabase, or production data changes are required by this integration.
