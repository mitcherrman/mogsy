
# Blog feature

A sandbox-style blog system written by admins, readable by everyone, with deep visual customization and embeds that pull live data from the Mogsy app (items, profiles, leaderboards, charts).

## Reader surface

- **Home** — new "Latest from the blog" strip (featured + recent), 3 cards, "See all" → `/blog`.
- **`/blog`** — index page: hero of latest, grid of posts, tag/category filter, search.
- **`/blog/:slug`** — full post page with SEO head (title, meta, OG image), comments reusing the existing `comments` table (scoped via a new `blog_post_id`), share buttons, related posts.
- Posts render whatever editor mode the admin chose; reader experience is unified.

## Admin authoring surface

Lives under `/admin/blog` (visible in the Admin tabs).

- Post list: status (draft/scheduled/published), author, views, edit/delete.
- "New post" picks the **editor mode** per post:
  1. **Blocks** — Notion-style stacked blocks. Each block has a style panel (font, color, theme, animation preset).
  2. **Rich text + widgets** — Tiptap-style WYSIWYG with a slash menu to insert Mogsy widgets inline.
  3. **Freeform canvas** — absolute-positioned drag-anywhere surface (fixed aspect, scales responsively on read).
- Shared post settings: slug, title, subtitle, cover image, tags, category, theme preset, accent color, body font, heading font, publish state, scheduled_at, SEO meta.
- Live preview pane (toggle desktop/mobile).
- Autosave to draft.

## Mogsy data blocks (available in all three editors)

- **Item card** — pick a `preset_item`, renders image + name + Aura + league badge.
- **Profile card** — pick a profile, renders avatar + display name + Aura + favorites strip.
- **Leaderboard** — pick league + top N, renders ranked list with tier badges.
- **Chart** — Recharts wrappers:
  - Aura history (line) — from `global_elo_snapshots` for an item or profile.
  - Matchup counts (bar) — from `matches`.
  - Win rate (donut) — from `matches`.
- **Plain blocks**: heading, paragraph, image, video/gif, quote, callout, divider, columns (2/3), button (link), embed (YouTube/X), spacer.

## Customization (v1, depth ~3/5)

- 8 curated theme presets (dark editorial, neon, paper, magazine, brutalist, vapor, noir-gold, sunset).
- Font pairing picker (8 pairs from the existing curated list).
- Accent color picker (HSL).
- Per-block animation preset: none, fade-in, slide-up, scale-in, parallax (on-scroll), shimmer.
- Cover treatment: full-bleed, boxed, split.

## Data model

```text
blog_posts (id, slug unique, title, subtitle, cover_url, author_user_id,
            editor_mode enum, content jsonb, theme jsonb, tags text[],
            category, status enum, published_at, scheduled_at, views int,
            seo_title, seo_description, og_image_url, created_at, updated_at)
blog_post_views (id, post_id, profile_id nullable, created_at)  -- light analytics
```

Comments reuse `comments` table with a new nullable `blog_post_id` column + index, scoped read.

### RLS
- `blog_posts` SELECT: anyone if `status='published'`, otherwise admin/master_admin only.
- `blog_posts` INSERT/UPDATE/DELETE: admin only.
- `blog_post_views` INSERT: anyone (rate-limited via trigger / dedupe by profile+post+day); SELECT: admin only.

## Routing & nav

- `/blog`, `/blog/:slug` added to `App.tsx`.
- Sitemap generator (`scripts/generate-sitemap.ts`) extended to enumerate published blog slugs.
- Home gets a new `<HomeBlogSection />` between existing sections.
- Admin gets a `AdminBlog` tab + `AdminBlogEditor` route.

## Technical notes

- Editor content stored as `jsonb`:
  - Blocks mode: `{ mode:"blocks", blocks:[{id,type,props,style}] }`
  - Rich text: `{ mode:"rich", doc: <tiptap JSON> }`
  - Canvas: `{ mode:"canvas", w, h, nodes:[{id,type,x,y,w,h,rotation,zIndex,props,style}] }`
- A single `<BlogRenderer />` dispatches by `mode` so reader code is unified.
- Tiptap dependency added (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-image`) for rich mode.
- Recharts is already in the project — reused for chart blocks.
- Mogsy data blocks fetch on render via small hooks (`useItem`, `useProfile`, `useLeaderboard`, `useAuraHistory`) using react-query with sane staleTime.
- Theme presets applied via CSS variables scoped to a `.blog-theme-<id>` wrapper so blog styling never leaks to the app shell.
- SEO: per-post `<SEOHead />` with JSON-LD `BlogPosting`.

## Build order

1. Migration: `blog_posts`, `blog_post_views`, add `blog_post_id` to `comments`, RLS, triggers, indexes.
2. Shared: types, theme presets, `BlogRenderer`, data-block components, data hooks.
3. Reader: `/blog` index, `/blog/:slug`, Home strip, sitemap update.
4. Admin: post list, settings panel, three editors (blocks → rich → canvas), live preview, autosave.
5. Polish: animations, share, related posts, comments wiring, analytics.

## Out of scope (v1)

- Multi-author permissions beyond admin role.
- Custom CSS field (deferred — depth slider was 3, not 5).
- Newsletter / email digest.
- Versioned post history.
