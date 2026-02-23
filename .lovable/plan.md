

# SEO Improvements for Mogsy (targeting mogsy.com)

All URLs, meta tags, and references will use `https://mogsy.com` so everything is ready when you migrate.

---

## 1. Update `index.html` Meta Tags

- Remove the TODO comment
- Update `og:image` and `twitter:image` to `https://mogsy.com/mogsy-logo.png` (replace Lovable placeholders)
- Add `og:url` set to `https://mogsy.com`
- Add `og:site_name` set to `Mogsy`
- Remove `@Lovable` from `twitter:site` (set to your handle or remove)
- Add `meta keywords` with relevant terms (voting, ranking, leagues, head-to-head, compete, elo)
- Add `theme-color` meta tag
- Add canonical link: `<link rel="canonical" href="https://mogsy.com" />`
- Add `apple-touch-icon` pointing to `/mogsy-logo.png`
- Add JSON-LD structured data block (WebApplication schema) with `url: "https://mogsy.com"`
- Write a richer, keyword-dense description

## 2. Create `public/sitemap.xml`

List all public-facing routes with `https://mogsy.com` as the base:

| URL | Priority |
|-----|----------|
| `/` | 1.0 |
| `/auth` | 0.5 |
| `/home` | 0.8 |
| `/play` | 0.9 |
| `/presets` | 0.8 |
| `/shop` | 0.7 |
| `/swipe-leagues` | 0.8 |
| `/elo-check` | 0.7 |

## 3. Update `public/robots.txt`

Add a sitemap reference:
```
Sitemap: https://mogsy.com/sitemap.xml
```

## 4. Create `src/components/SEOHead.tsx`

A lightweight component that sets `document.title` and updates the meta description tag dynamically per route. Each page will get a unique, keyword-rich title and description.

## 5. Add `<SEOHead>` to Key Pages

| Page File | Title |
|-----------|-------|
| `Index.tsx` | Mogsy -- Vote, Rank, Compete |
| `Play.tsx` | Play -- Mogsy |
| `Presets.tsx` | Browse Leagues -- Mogsy |
| `Shop.tsx` | Shop -- Mogsy |
| `SwipeLeagues.tsx` | Swipe Leagues -- Mogsy |
| `EloCheck.tsx` | Elo Check -- Mogsy |
| `Leaderboard.tsx` | Leaderboard -- Mogsy |
| `Profile.tsx` | My Profile -- Mogsy |
| `Auth.tsx` | Sign In -- Mogsy |
| `Settings.tsx` | Settings -- Mogsy |

---

## After Migration Notes

Once you deploy on Vercel with mogsy.com, everything will just work -- all the URLs in meta tags, sitemap, and canonical links already point to `mogsy.com`. You will just need to:
- Replace the AdSense placeholder `ca-pub-XXXXXXXXXXXXXXXX` with your real publisher ID
- Submit `https://mogsy.com/sitemap.xml` in Google Search Console
- Set your Twitter/X handle in the `twitter:site` tag if you create one

## Files to Create/Edit

| File | Action |
|------|--------|
| `index.html` | Edit -- meta tags, JSON-LD, canonical, apple-touch-icon |
| `public/robots.txt` | Edit -- add sitemap reference |
| `public/sitemap.xml` | Create |
| `src/components/SEOHead.tsx` | Create |
| `src/pages/Index.tsx` | Edit -- add SEOHead |
| `src/pages/Play.tsx` | Edit -- add SEOHead |
| `src/pages/Presets.tsx` | Edit -- add SEOHead |
| `src/pages/Shop.tsx` | Edit -- add SEOHead |
| `src/pages/SwipeLeagues.tsx` | Edit -- add SEOHead |
| `src/pages/EloCheck.tsx` | Edit -- add SEOHead |
| `src/pages/Leaderboard.tsx` | Edit -- add SEOHead |
| `src/pages/Profile.tsx` | Edit -- add SEOHead |
| `src/pages/Auth.tsx` | Edit -- add SEOHead |
| `src/pages/Settings.tsx` | Edit -- add SEOHead |

