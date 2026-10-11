# Remaining SEO integration handoff

## Candidate and ownership

- Prepared: 2026-10-11 (America/Los_Angeles)
- Integration branch: `codex/seo-remaining-integration`
- Verified base: `origin/main` at `a59526b2a6af7c81c6e0efa3e886fa4aae891c75`
- Verified implementation tip before this handoff: `9160404cf38910cd60201dcea3c55f81ddf239d6`
- Mainline drift at preparation start: none (`a59526b2...origin/main` = `0 0`)
- Source heads matched the requested remote refs exactly:
  - `origin/seo/robots-private-routes` — `4ab23f8c6ed938f4fb036ce81ec263c3108b437f`
  - `origin/seo/head-metadata-cleanup` — `1c56a6bba86962fb5a04a5abc0ee4ccae274d537`
  - `origin/seo/public-product-route-metadata` — `5495a28a54edbe25eb4a3dbc9026dfffdaef5c0f`

All eight source commits are authored by `mitcherrman <67564466+mitcherrman@users.noreply.github.com>`, descend from the shared base `849e6198024d0207dfa8cf12f045aa7fdd503ebb`, and were not patch-equivalent to commits already on current main (`git cherry` reported `+` for each). The integration worktree was created from fetched `origin/main`; no file from the dirty primary checkout was copied into it.

## Requirements and integration decisions

The source histories establish these product requirements:

1. Keep protected utility routes out of crawl discovery.
2. Mark the Quiz Admin surface `noindex, nofollow` in rendered metadata.
3. Clear optional image, keyword, and singleton article metadata when an SPA route omits it.
4. Replace stale baseline references to tier-list/champion-cooldown positioning with current combat, mechanics, reference-data, and pro-play positioning.
5. Give the public Journey Library a self-canonical title and description.
6. Keep the live Ranked match host out of the search index for both signed-out and signed-in render paths.

All six requirements still apply on current main and survive in this candidate. One stale source detail was deliberately not retained: `seo/robots-private-routes` added `Disallow: /admin` a second time. The candidate keeps exactly one `/admin` directive and adds only the still-routed protected surfaces `/feedback`, `/quiz/playtest`, `/playtest/`, and `/quiz/admin`.

Current main already contains the separate Archives/SEO sitemap integration. Therefore this candidate does **not** replay or edit sitemap ownership. It preserves:

- `/quiz/journeys`, `/lol/glossary`, and `/lol/docs/items` as single static sitemap entries;
- `/lol/tier-list` as absent from the sitemap;
- the dynamic item/champion/pro-year sitemap and prerender pipeline;
- zero duplicate generated `<loc>` values.

Current main also already contains Mastery retirement Phase 1. This candidate leaves its routes and files untouched. The legacy `/quiz/mastery` catalog and player retain their existing `noindex, nofollow` behavior and tests. Journey Library remains the public indexable discovery surface. Ranked remains a non-indexable transactional match host.

## Exact changed files versus current main

- `SEO_REMAINING_INTEGRATION_HANDOFF.md`
- `index.html`
- `public/robots.txt`
- `src/components/SEOHead.test.tsx`
- `src/components/SEOHead.tsx`
- `src/lib/seo/privateRoutes.test.ts`
- `src/pages/QuizAdmin.tsx`
- `src/pages/quiz-journeys/JourneyLibraryPage.test.tsx`
- `src/pages/quiz-journeys/JourneyLibraryPage.tsx`
- `src/pages/quiz-ranked/QuizRankedPage.authReturn.test.tsx`
- `src/pages/quiz-ranked/QuizRankedPage.tsx`

No sitemap source, route registry, backend, database, deployment, production data, or unrelated workstream file is changed.

## Verification matrix

| Check | Candidate result | Current-main comparison / notes |
| --- | --- | --- |
| Focused SEO, sitemap, routing, Journey, Ranked, and Mastery Vitest | **PASS — 8 files, 72/72 tests** | Covers `SEOHead` cleanup, private-route policy, current Archives sitemap truth, Journey route/metadata, Ranked host/noindex, and both retired Mastery noindex surfaces. Existing React Router warnings and one existing Ranked `act(...)` warning only. |
| TypeScript: `tsc --noEmit -p tsconfig.app.json` | **BASELINE FAIL — 2 diagnostics** | Identical on pristine current main: `OnboardingProfile.tsx:180:48` and `connections.ts:263:13`. Neither file is changed. |
| Changed-file ESLint | **BASELINE FAIL — 5 errors** | All five are unchanged `no-explicit-any` findings in `QuizAdmin.tsx` at lines 82, 111, 130, 165, and 188; pristine current main reproduces all five. Every other changed TypeScript file passes ESLint. |
| Production `npm run build` | **PASS** | Vite transformed 4,790 modules. Existing Tailwind ambiguity, mixed-import, and chunk-size warnings only. |
| Sitemap generation | **PASS — 423 URLs** | 21 static + 173 champions + 16 pro years + 213 items + 0 blog. Blog omission is the existing no-Supabase-key local behavior. Journey, Glossary, and Items each occur once; Tier List is absent; duplicate `<loc>` count is zero. |
| Item prerender verification | **PASS — 213/213** | Existing Archives invariant preserved. |
| Champion prerender verification | **PASS — 173/173** | Existing Archives invariant preserved. |
| Browser: `/quiz/journeys` | **PASS** | Rendered title, description, and canonical are route-specific; robots is absent; optional keywords and OG image are absent. |
| Browser: `/quiz/ranked` | **PASS** | Rendered canonical is `https://mogzy.lol/quiz/ranked`; robots is `noindex, nofollow`; Journey metadata does not leak. |
| `git diff --check origin/main...HEAD` | **PASS** | No whitespace errors. |

## Risks and next action

- Route metadata is still installed client-side by the existing `SEOHead` architecture. Non-JavaScript crawlers see the baseline `index.html` metadata until rendering; this candidate does not introduce SSR or route prerendering.
- `robots.txt` exclusions reduce crawl discovery but do not remove an already indexed URL by themselves. Quiz Admin and Ranked additionally emit `noindex`; the other protected routes remain protected/utility surfaces under their existing runtime policies.
- The two TypeScript diagnostics and five Quiz Admin lint findings are verified baseline debt and should not be mixed into this SEO integration.
- A release-environment build should regenerate the sitemap with production Supabase credentials so published blog entries are included by the existing generator.

Recommendation: review this isolated candidate, fetch/recheck `origin/main`, and if no drift overlaps these files, integrate with a normal non-rewriting merge so the three source histories remain auditable. Do not deploy from this worktree, and do not extend this candidate into later Mastery retirement phases.
