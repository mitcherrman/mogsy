

## Updated Plan: Custom URL Slugs + Domain Configuration

### 1. Centralize Domain Config

Create `src/lib/site-config.ts` as the single source of truth:

```ts
export const SITE_DOMAIN = "mogsy.com";
export const SITE_URL = `https://${SITE_DOMAIN}`;
export const SITE_NAME = "Mogsy";
```

- Update `MatchupCapture.tsx` and `SEOHead.tsx` to import from `site-config.ts`
- Add clear `<!-- DOMAIN: update mogsy.com here -->` comments in `index.html`, `sitemap.xml`, `robots.txt`

When you buy a domain: change one line in `site-config.ts` + find-replace in 3 static files.

---

### 2. Custom URL Slugs (Smart Links)

**New table `custom_links`:**

| Column | Type | Purpose |
|--------|------|---------|
| slug | text UNIQUE | URL path e.g. "LOL" |
| destination_type | text | `league` or `curated` |
| league_id | uuid (nullable) | Direct league link |
| recommended_league_ids | uuid[] | Featured on home page |
| recommended_categories | text[] | Category preferences |
| default_theme | text | Theme preset |
| default_swipe_animation | text | Animation preset |
| grant_diamonds | int | Reward on first visit |
| grant_pro | boolean | Pro reward |
| label | text | Admin label |
| is_active | boolean | Toggle |
| visits | int | Counter |
| created_by_user_id | uuid | Creator |

RLS: admins full CRUD, public SELECT on active links.

**Routing:** Add `/:slug` catch-all route just before `*` in `App.tsx`.

**New `CustomLink.tsx` page:**
- Looks up slug in `custom_links`, increments `visits`
- `league` type → redirect to `/swipe/preset/:leagueId`
- `curated` type → store config in localStorage, redirect to `/home` (logged in) or `/auth` (not logged in)
- Slug not found → render NotFound

**Home page:** `Home.tsx` checks localStorage for curated config, shows "Recommended for you" section with the specified leagues.

**Admin UI:** Add "Custom Links" CRUD section in `AdminInviteLinks.tsx` — slug input, destination type, league picker, category/league multi-select, theme + animation dropdowns, reward fields, visit counter, copy-link button (uses `SITE_URL` from site-config).

---

### Files

| File | Change |
|------|--------|
| `src/lib/site-config.ts` | **New** — domain constants |
| `src/pages/CustomLink.tsx` | **New** — slug resolver |
| `src/App.tsx` | Add `/:slug` route |
| `src/pages/Home.tsx` | Curated "Recommended" section |
| `src/components/admin/AdminInviteLinks.tsx` | Custom Links CRUD |
| `src/components/MatchupCapture.tsx` | Use `SITE_DOMAIN` |
| `src/components/SEOHead.tsx` | Use `SITE_URL` |
| `index.html`, `sitemap.xml`, `robots.txt` | Domain comments |
| Migration SQL | Create `custom_links` table + RLS |

