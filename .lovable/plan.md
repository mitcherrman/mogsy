# Admin-Only "About Mogsy" Reference Page

A single, exhaustive internal documentation page that catalogs every feature, page, mechanic, admin tool, and aesthetic decision in Mogsy. Gated behind admin/master_admin role, accessed from the main Admin panel.

## Goal

Give admins one canonical source-of-truth they can scroll through to understand the entire app — useful for onboarding new admins, briefing moderators, writing marketing copy, and auditing scope.

## Access

- **Route:** `/admin/about`, wrapped in `<AdminRoute>` (admin + master_admin; moderators excluded by default since this exposes the full admin surface)
- **Entry point:** New "About" tab/button in `src/pages/Admin.tsx` tab list, plus a small "About" link in `/admin/play`, `/admin/data`, `/admin/gaming` headers so it's reachable from any admin context
- **No public link** — not in main navbar, sitemap, or `llms.txt`

## Page Structure

Single long-scroll page with a sticky table-of-contents sidebar on desktop (collapses to a top dropdown on mobile). All content is static React/JSX — no DB calls, no edits. Search field at the top filters sections by keyword (client-side string match).

### Sections (in order)

1. **Overview & Core Concept** — what Mogsy is, the head-to-head voting loop
2. **Terminology** — Aura, Leaderboard, Collections, Compete, Preset vs User leagues, Elo
3. **User-Facing Pages** — every route (`/`, `/home`, `/auth`, `/play`, `/profile`, `/swipe`, `/swipe-hub`, `/swipe-preset/:id`, `/leagues`, `/leaderboard`, `/shop`, `/elo-check`, `/swipe-leagues`, `/u/:id`, `/referral`, `/settings`, `/multiplayer`, `/multiplayer/game/:id`, `/feedback`, `/blog`, `/blog/:slug`, `/combat-lab`, `/lol`, `/:slug`, `/secret-room`, `/reset-password`)
4. **Multiplayer Game Modes** — Tag Team, Draft & Duel, Prediction Wars, Siege, Hot Streak, Gauntlet
5. **Swipe Mechanics** — gesture engine, preloading, ready overlay, direction overlay, timer, card stats footer, comments, ad injection cadence, animations list, tutorial tips, inventory button
6. **Aura / Elo System** — K=32 formula, dual local+global Elo, snapshots, tier system, EloCheck
7. **Leaderboards** — global, league, personal, Compete eligibility filters, tier badges
8. **Shop & Monetization** — Pro ($9.99/mo), Diamond currency, power-ups (Boost / ELO Shield / Reveal / Rewind), gifting, cinematic Pro ad
9. **Profiles** — own vs public, favorites (auto/manual), photo circles, top comments, Pro cosmetics, public_profiles view, friend actions
10. **Social** — friends, notifications, comments, reports, moderation
11. **Onboarding Flow** — Welcome → Profile → Categories → Theme
12. **Themes** — Light, Dark, Pro; sitewide theme; profile theming; floating theme switcher
13. **Navigation** — navbar, NavBanner, bottom nav, Bubble Hub, play hub layouts, hub mode toggle, auto-hide
14. **Admin Pages — Complete Inventory**
    - `/admin` and every tab (Users, Collections, Bots, Promoted, Comments, Invites, Push, Banners, Reports, Tutorials, Feedback, Mod Config, Directory, Themes*, Ranks*, Onboarding*, Settings*)
    - `/admin/play` (Play Item Editor, Play League Items, Card Stats Preview, Multiplayer)
    - `/admin/data` (Stats, Ad Analytics, Preset Items)
    - `/admin/demo` (Card Preview Editor, Animation Router)
    - `/admin/gaming` (Swipe Game Config, Swipe Tab Config, First Game Triggers, Aura Check, Multiplayer, League Display, Ads, Animations, Sounds)
    - `/admin/blog` and `/admin/blog/:id` (BlocksEditor, RichEditor, data blocks)
    - Each tool gets a 1-3 sentence description
15. **Moderator Panel** — `/moderator` scope, role comparison table (moderator vs admin vs master_admin)
16. **Advertising System** — 6 placements (swipe, navbar_banner, home_banner, leaderboard, profile, shop), Custom/AdSense/Hybrid sources, popup/in_swipe modes, AdSense config
17. **Backend / Edge Functions** — full list (admin-get-emails, admin-user-actions, check-subscription, create-checkout, customer-portal, populate-preset-images, purge-anonymous-users, redeem-gift, snapshot-global-elo, verify-gift)
18. **Authentication** — email/password, Google OAuth, anonymous accounts, account linking, 2FA, password reset, ProtectedRoute / AdminRoute
19. **Custom Links / Slug System** — resolution priority, `resolve_custom_link` RPC, visit tracking
20. **Blog System** — blocks vs rich modes, data blocks (Chart, Leaderboard, ProfileCard, ItemCard), themes, share buttons, HomeBlogStrip
21. **Aesthetic & Design System** — `#0a0a1a` base, max-w-7xl, fonts, dual-layer blurred backgrounds, framer-motion usage, sound system, Apple-like language, SEO
22. **Tech Stack** — React 18, Vite, Tailwind v3, shadcn/ui, framer-motion, TanStack Query, Supabase, Stripe, React Router v6, TipTap
23. **Internal Naming Map** — quick reference between user-facing terms (Aura, Leaderboard, Collections, Compete) and internal code terms (Elo, Rankings, Preset Leagues, User Leagues)

## Technical Implementation

- **New file:** `src/pages/AdminAbout.tsx` — single component, all content inline as semantic JSX (sections with `id` anchors for TOC links). Use existing design tokens; semantic Tailwind classes only.
- **New route:** add `/admin/about` to `src/App.tsx` wrapped in `<AdminRoute>` and `<Suspense>`, plus `AdminAbout` entry in `src/lib/route-prefetch.ts`
- **Admin entry point:** add an "About" tab to the `Admin.tsx` tab list (or a header link) routing to `/admin/about`
- **Components reused:** `Collapsible` for collapsible sections, existing typography/card classes, `lucide-react` icons for section headers
- **No backend changes**, no migrations, no new dependencies, no edits to existing admin tools

## Out of Scope

- Editing existing features or admin tools
- Auto-generating documentation from code (this is a hand-maintained static reference)
- Public-facing About page (separate request if needed later)
- Versioning / changelog (could be added later as a second tab)
