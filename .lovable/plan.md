## Where things stand

**SEO**: All scanner findings currently pass — no failing items. Recent work (canonical/OG/sitemap/robots all on `mogsy.app`, GSC verified, sitemap submitted, LCP preload + async fonts, JSON-LD) is solid.

**Security**: Fresh scan returned **81 findings** (1 error, ~71 warn, rest info). Largest clusters:

- 1× **Security Definer View** (error) — likely `public_profiles`. Needs review.
- 2× **Public Bucket Allows Listing** (warn) — public storage buckets expose file listings.
- ~60× **Signed-in users can execute SECURITY DEFINER function** (warn) — broad EXECUTE grants on internal helpers.
- A few **info** items (function search_path, etc).

**Usability**: No scanner for this; recommendations below come from reading the app shell, landing page, layout, and routing.

---

## Proposed focus areas (pick any subset)

### A. Security — high-value cleanup (recommended first)

1. **Audit the `SECURITY DEFINER` view** flagged as error. Either:
  - Convert to a plain view + RLS, or
  - Convert to `security_invoker = true` (PG 15+), or
  - Confirm intentional and ignore with a memory note.
2. **Lock down public buckets**: keep public READ on individual objects but remove broad `SELECT` on `storage.objects` so bucket contents can't be enumerated.
3. **Triage `SECURITY DEFINER` function EXECUTE grants** in bulk: revoke EXECUTE from `authenticated`/`anon` for any helper that should only run from triggers/cron/edge functions; keep grants only on the small set of RPCs the client actually calls (e.g. `has_role`, profile resolvers).
4. **Re-run scan** and update `@security-memory` with what's intentional vs fixed.

### B. SEO — beyond the scanner (incremental wins)

1. **Per-route metadata**: `SEOHead` exists but only a few pages use it. Add per-page title/description/canonical for `Home`, `Play`, `SwipeLeagues`, `Leaderboard`, `Shop`, `Auth`, `Profile`, `UserProfile`, `EloCheck`, public `CustomLink` slugs.
2. **Dynamic sitemap**: replace the hand-edited `public/sitemap.xml` with `scripts/generate-sitemap.ts` that pulls public league slugs, public profiles, and custom links from the DB. Wire into `predev`/`prebuild`.
3. **Social preview image**: design a real 1200×630 OG image (current OG points at the logo PNG). Improves CTR from shared links.
4. **Structured data per content type**: add `BreadcrumbList` + `Game`/`Article`-style JSON-LD on league and profile pages so they qualify for richer SERP treatment.
5. **Domain canonicalization at the host level**: ensure `mogsy.net`, `www.mogsy.app`, `www.mogsy.net`, and the `lovable.app` previews 301 to `mogsy.app` (host config, not code) so link equity consolidates.

### C. Usability — observed friction

1. **Landing page entry** (`/`): the entire `<main>` is a click target that navigates away. Easy to trigger by accident on touch devices when scrolling. Suggest: only the logo button + “tap to enter” are interactive; remove the page-wide click handler, or require a deliberate tap.
2. **Loading states**: `Layout`, `ProtectedRoute`, and Suspense fallbacks all render a bare `min-h-screen bg-background` (blank). The `index.html` shell is great for FCP but in-app route transitions feel like a hang. Add a lightweight skeleton or the spinning Mogsy logo here too.
3. **Mobile bottom-nav + floating buttons stack** (Theme, Friends, Scroll-top): on small screens these can overlap the bottom navbar / action bar. Audit z-index and bottom offsets per route.
4. **Anonymous → signed-in upgrade prompt**: currently only surfaces in Settings. Add a contextual nudge after meaningful actions (first leaderboard entry, first comment) so users keep their progress.
5. **Empty/edge states** on `Leaderboard`, `Profile`, `Compete`: confirm each shows a useful empty state (CTA to play / invite / follow) rather than just nothing.
6. **Keyboard shortcut on Landing**: any keypress navigates away. Restrict to `Enter` / `Space` so users hitting Cmd-L / refresh don't get bounced.

---

## How I'd suggest sequencing

1. **Security pass** (A1–A3) — biggest risk reduction, then re-scan + memory update.
2. **Per-route SEO + dynamic sitemap** (B1–B2) — meaningful organic traffic lift.
3. **Usability quick wins** (C1, C2, C6) — small code changes, immediate UX feel.
4. Optional polish: OG image (B3), JSON-LD expansion (B4), nudges (C4).

Tell me which bucket(s) to tackle and I'll scope the implementation plan in detail.