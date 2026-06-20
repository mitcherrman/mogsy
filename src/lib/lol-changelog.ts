/**
 * League of Legends section changelog.
 *
 * Each entry documents a notable change shipped through Lovable for any LoL-related
 * surface (the /lol hub, /lol/tier-list, /combat-lab, /quiz). The data here is
 * intentionally human-curated — append a new entry at the TOP whenever a LoL
 * feature, page, or layout changes so the docs page stays accurate and copy/paste
 * to ChatGPT stays useful.
 *
 * AUTO-UPDATE CONVENTION (for the Lovable AI assistant):
 * Whenever you (the AI) ship ANY change that touches a LoL surface — the /lol hub,
 * /lol/tier-list, /lol/docs, /combat-lab*, /quiz*, the Hextech theme, the LoL
 * navbar/back button, or any /lol-only component — you MUST prepend a new
 * LolChangeEntry to LOL_CHANGELOG below in the SAME turn as the change.
 * Use the current UTC timestamp, pick an accurate `type` and `scopes`, write a
 * one-paragraph `summary`, list concrete UI/behavior bullets in `details`, and
 * list every file you edited in `files` plus every route affected in `routes`.
 * This file IS the source of truth that powers /lol/docs and the ChatGPT copy
 * buttons — skipping the entry silently breaks the docs.
 */

export type LolChangeType =
  | "feature"
  | "fix"
  | "ui"
  | "theme"
  | "security"
  | "refactor"
  | "docs";

export type LolChangeScope =
  | "hub"
  | "tier-list"
  | "combat-lab"
  | "quiz"
  | "theme"
  | "navigation"
  | "docs";

export interface LolChangeEntry {
  /** ISO timestamp (UTC) when the change shipped. */
  timestamp: string;
  title: string;
  type: LolChangeType;
  scopes: LolChangeScope[];
  /** One-paragraph plain-English summary. */
  summary: string;
  /** Optional bullet points with extra detail (UI layout, buttons, behavior). */
  details?: string[];
  /** Files touched (relative paths). */
  files?: string[];
  /** Routes affected, e.g. "/lol", "/combat-lab". */
  routes?: string[];
}

export const LOL_CHANGELOG: LolChangeEntry[] = [
  {
    timestamp: "2026-06-20T04:00:00Z",
    title: "Admin toggle: switch LoL Hub champion popout style (Splash ↔ Cutout)",
    type: "feature",
    scopes: ["hub"],
    summary:
      "Added an admin-only floating pill on /lol that toggles the HexZipperCard champion artwork between the original rectangular splash treatment (now the default) and the transparent cutout popout. The choice is persisted globally in app_settings under the `lol_hub_popout_style` key so every visitor sees the selected style. Default resolves to `splash` when no row exists or the stored value is invalid. The toggle optimistically updates the UI and reverts with an error toast if the write fails. Non-admins never see the control.",
    details: [
      "New component: src/components/lol/LolPopoutStyleToggle.tsx — segmented pill fixed bottom-right, gated by has_role(admin|master_admin) RPC.",
      "HexZipperCard gained a popoutStyle prop ('splash' | 'cutout'). Splash branch renders the manifest's splash (or loading fallback) as an absolutely-positioned object-cover image behind the card content, clipped by the existing hex Link, with a directional mask, low opacity at rest, and a subtle hover zoom + opacity ramp.",
      "useChampionAssets exports a new getChampionSplash(manifest, name) helper returning splash ?? loading from the Railway manifest.",
      "LolHub reads app_settings.lol_hub_popout_style on mount (default 'splash'), resolves the correct image per style, and passes popoutStyle into every card.",
      "Card icon, text, and arrow promoted to z-10 so splash art sits cleanly behind them inside the hex clip.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/components/lol/LolPopoutStyleToggle.tsx",
      "src/hooks/useChampionAssets.ts",
      "src/pages/LolHub.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T03:00:00Z",
    title: "LoL Hub champion popouts emerge from the inner card edge",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Repositioned the HexZipperCard champion cutouts so they emerge from the INNER side of each zipper card (toward page center) instead of the far page edges. Right-aligned cards now anchor the popout to their left edge and slide it further left on hover; left-aligned cards mirror that toward the right. Cutouts are taller (h-[460px] normal, h-[580px] flagship) and 55–75% of the champion is visible on hover so the effect reads clearly into the central zig-zag lane. Cyan radial glow, drop-shadow, pointer-events-none, opacity 0→1 hover fade, and the upward lift are preserved. Railway /api/assets/champions manifest, useChampionAssets, cutout-only behavior, shield fallback, zipper stagger, hover translation, border pulse, and mobile fallback are unchanged.",
    details: [
      "HexZipperCard: popout anchor flipped to inner edge (left-0 for right cards, right-0 for left cards); translateX now moves toward page center.",
      "Rest translate ~10% (plus per-card cutoutOffsetPct), hover translate ~55% so 55–75% of the cutout is visible past the card edge.",
      "Champion is mirrored when sitting on the right side of a left-aligned card so it faces toward the card body.",
      "Heights bumped: normal h-[460px], flagship h-[580px] (was 400/520). object-contain preserved — no PNG cropping.",
      "Card body stays at z-20 above the cutout (z-0). Cyan/blue radial glow behind champion retained.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T02:00:00Z",
    title: "LoL Hub champion popouts restored to hover-only",
    type: "fix",
    scopes: ["hub"],
    summary:
      "Fixed the HexZipperCard champion cutouts so they are hidden at rest and only appear on hover. Rest opacity is now 0 (was 0.7) so the character stays tucked behind the card edge until the user hovers, at which point it slides outward to ~50-70% visible, lifts slightly, and fades to full opacity. All other behavior is preserved: Railway cutout manifest, per-champion offsets, object-contain, z-index layering, shield fallback, zipper layout, card sizes, hover translation, and animated Hextech border pulse.",
    details: [
      "HexZipperCard popout rest opacity changed from opacity-70 to opacity-0; group-hover:opacity-100 unchanged.",
      "Rest and hover transforms (18% / 32% outward plus per-card cutoutOffsetPct) and translateY(-12px) lift on hover remain the same.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T01:00:00Z",
    title: "LoL Hub champion cutout positioning polish",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Tuned the HexZipperCard champion popouts so cutouts feel attached to their card instead of floating off the page edge. At rest the cutout overlaps the card by ~60-65% (35-50% visible) at 70% opacity; on hover it slides outward to ~50-70% visible and fades to full opacity. Popouts are taller (h-400px / h-520px flagship) and per-champion horizontal offsets balance Akali, Ryze, Jinx, Draven and Viktor individually. Card body stays at z-20 above the cutout (z-0); zipper stagger, hover translation and animated Hextech border pulse unchanged. object-contain preserved — no PNG cropping.",
    details: [
      "HexZipperCard: new cutoutOffsetPct prop; rest transform translates 18% outward (plus per-card offset) and hover transform translates 32% outward via a CSS var consumed by .group:hover > .hex-popout in index.css.",
      "Heights: normal h-[400px], flagship h-[520px] (was 300/420).",
      "Rest opacity raised from 0 to 0.7 so the character is visible before hover; hover restores full opacity and adds -translateY(12px) lift.",
      "Per-champion offsets in LolHub ZIPPER_FEATURES: Akali -4, Ryze -2, Jinx 0, Draven +2, Viktor -2.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/pages/LolHub.tsx",
      "src/index.css",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-20T00:00:00Z",
    title: "LoL Hub champion popouts use Railway champion asset manifest",
    type: "fix",
    scopes: ["hub"],
    summary:
      "HexZipperCard hover popouts now render the transparent champion cutout PNGs from the Combat/Railway backend's GET /api/assets/champions manifest instead of rectangular splash/loading art or the old champion-images Supabase bucket. Relative manifest paths (e.g. assets/champions/Akali/cutouts/Akali_Cutout.png) are resolved against VITE_COMBAT_API_URL. Only the `cutout` field is used for the hub — icon/splash/loading are ignored here. Shield silhouette fallback is preserved when a cutout is missing or the image fails to load. Mapping unchanged: Combat Lab → Akali, League Quiz → Ryze, LoL Tier List → Jinx, Swipe Champions → Draven, League Docs → Viktor.",
    details: [
      "useChampionAssets now fetches `${VITE_COMBAT_API_URL}/api/assets/champions` directly (default https://web-production-83e53.up.railway.app) instead of invoking the assets-champions edge function.",
      "Added resolveAssetUrl() helper; getChampionCutout() returns an absolute URL to the transparent cutout PNG.",
      "HexZipperCard popout keeps object-contain, transparent PNG alpha, and stays layered behind the card (z-0) with the card body above (z-20). Zipper stagger, hover translation, and traveling Hextech border pulse unchanged.",
    ],
    files: [
      "src/hooks/useChampionAssets.ts",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-18T01:00:00Z",
    title: "LoL Hub zipper polish — champion popout, stagger, border pulse",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Second pass on the /lol Hextech Zipper. Champion popout always renders (with a glowing shield silhouette fallback when no champion image is configured), is larger (300px / 420px flagship) and slides further outside the card edge on hover. Cards translate ~24px outward on hover. The animated Hextech border is now a discrete cyan light pulse traveling around the clipped edge instead of a uniform glow. Cards are laid out as a true zipper: single column, alternating self-end / self-start at 72–78% width with a slight negative top margin for zig-zag overlap. Mobile untouched.",
    details: [
      "HexZipperCard: champion popout container is always mounted; renders <img> when useChampionImage resolves a URL, otherwise a radial-glow + Shield icon fallback. onError hides only the image, the popout container remains.",
      "Popout sizes bumped to h-[300px] (h-[420px] flagship) and slides to 45% outside the card edge on hover.",
      "Card hover translate increased from 8px to 24px; scale from 1.015 to 1.02.",
      "Border pulse: replaced the soft conic sweep with a narrow bright cyan-to-white spike inside .hex-border-pulse, rotating every 2.4s — reads as a single moving light bead around the hex border instead of a uniform brighten.",
      "Layout switched from 2-col grid to flex column with alternating self-end/self-start and -mt-4 stagger so the eye follows a zig-zag.",
    ],
    files: [
      "src/components/lol/HexZipperCard.tsx",
      "src/pages/LolHub.tsx",
      "src/index.css",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-18T00:00:00Z",
    title: "LoL Hub Hextech Zipper layout (desktop-first)",
    type: "ui",
    scopes: ["hub"],
    summary:
      "Reworked the /lol homepage on desktop into a 'Hextech Zipper' — alternating left/right clipped hex-shape feature cards under the hero banner. Combat Lab is the flagship top-right card, followed by League Quiz (left), LoL Tier List (right), Swipe Champions (left), and League Docs (right). On hover, each card slides toward its edge, a cyan Hextech border light travels around the clipped border, and a champion cutout slides out from behind the card's outer edge. Mobile still falls back to the existing stacked tile list. Routes, icons, and downstream sections (News & Blog) are unchanged.",
    details: [
      "New component src/components/lol/HexZipperCard.tsx — clipped-corner card with dark navy body, gold accents, cyan Hextech border layer, inner glow, animated traveling border light, hover slide + scale, and a champion popout image layered behind the card.",
      "Champion popout uses a new src/hooks/useChampionImage.ts helper that reads the existing champion-images Supabase storage bucket (keyed by champion name) — same asset system Combat Lab already uses. No new image system, no hardcoded external URLs. Image errors hide the popout gracefully.",
      "Champion mapping (easy to adjust in ZIPPER_FEATURES): Combat Lab → Jinx, League Quiz → Ryze, LoL Tier List → Azir, Swipe Champions → Draven, League Docs → Viktor.",
      "Hex clip-path applied to both the outer cyan border layer and the inner card body; flagship variant doubles up icon and title sizing for Combat Lab.",
      "Added .hex-border-light keyframes + conic-gradient animation to src/index.css.",
      "Desktop (md+) uses the new 2-column zipper grid; mobile keeps the original HubTile stack so this turn does not regress mobile.",
    ],
    files: [
      "src/pages/LolHub.tsx",
      "src/components/lol/HexZipperCard.tsx",
      "src/hooks/useChampionImage.ts",
      "src/index.css",
      "src/lib/lol-changelog.ts",
    ],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-17T00:00:00Z",
    title: "Quiz champion choice visuals (image-bearing answer choices)",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Quiz answer choices now support object form { label, image_path, champion_name } and render the image inside each choice button. For champion-comparison prompts like 'Which champion is ranged?' / 'Which is melee?', the single main champion icon is suppressed when choices carry images and the question itself has no image_path, so the answer is no longer revealed by the top icon. Plain string choices and existing item/rune/summoner/single-champion visuals are unchanged.",
    details: [
      "Added getChoiceImage() helper and QuizChoiceObject type alongside getChoiceLabel().",
      "Choices with image_path resolve via resolveQuizAssetUrl and render as a Hextech-gold framed thumbnail above the label inside the answer Button.",
      "Answer grid switches to a 2-column layout when any choice has an image, otherwise stays single-column.",
      "When choicesHaveImages && !question.image_path, the main visual block (champion icon / splash framing) is hidden to avoid revealing the correct answer.",
      "Item / rune / summoner / direct champion question visuals preserved.",
    ],
    files: ["src/pages/Quiz.tsx", "src/lib/lol-changelog.ts"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T15:30:00Z",
    title: "League Quiz Achievements panel (Quiz + Diagnostics)",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Added a Hextech-styled Achievements panel to /quiz (rendered below the Knowledge Breakdown) and a compact variant with a collapsible raw JSON viewer to /quiz/diagnostics. Both surfaces hit the new GET /api/quiz/achievements/{user_id} endpoint using the same user id already used for quiz progress (auth user or 'anonymous').",
    details: [
      "New API helper quizApi.getAchievements(userId) and types QuizAchievement / QuizAchievementsResponse in src/lib/quiz/api.ts. Response is normalized so backends that return either { achievements: [] } or split { unlocked: [], locked: [] } both work.",
      "New component src/components/quiz/QuizAchievementsCard.tsx: unlocked tiles first then locked, each tile shows icon (resolveQuizAssetUrl), title, description, unlocked badge / lock badge, unlocked_at date when present, and optional progress/goal for locked items.",
      "Unlocked tiles use a gold (#c9a84c) border, inner glow and subtle gold top-edge highlight with a Trophy icon; locked tiles render dimmed and grayscale with a Lock icon.",
      "Layout: compact grid on desktop (sm:2 cols, lg:3 cols) and stacked on mobile. A `compact` prop renders the tighter diagnostics layout (sm:2 cols, no card chrome).",
      "Quiz page wiring: loadAchievements() runs on mount and re-runs whenever a submitted answer returns unlocked_achievements, so the panel refreshes immediately after an unlock.",
      "Diagnostics: new 'Achievements (anonymous)' panel above the Debug Summary with the QuizAchievementsCard in compact mode plus a collapsible Raw JSON viewer.",
      "Existing quiz, reports, progress, visuals, diagnostics, and admin behavior left untouched.",
    ],
    files: [
      "src/components/quiz/QuizAchievementsCard.tsx",
      "src/lib/quiz/api.ts",
      "src/pages/Quiz.tsx",
      "src/pages/QuizDiagnostics.tsx",
    ],
    routes: ["/quiz", "/quiz/diagnostics"],
  },
  {
    timestamp: "2026-06-16T15:10:00Z",
    title: "League Docs auto-update convention + recent LoL changes logged",
    type: "docs",
    scopes: ["docs", "quiz", "theme", "hub", "tier-list", "combat-lab"],
    summary:
      "Documented the rule that every future LoL-surface change must prepend a LolChangeEntry to src/lib/lol-changelog.ts in the same turn, and backfilled entries for the Hextech ambience overlay, the transparent-backing pass across LoL pages, and the multiple League Quiz visual upgrades (themed category frames, animated champion splashes, XP/streak/achievement rewards).",
    files: ["src/lib/lol-changelog.ts"],
    routes: ["/lol/docs"],
  },
  {
    timestamp: "2026-06-16T15:00:00Z",
    title: "League Quiz visual upgrade — themed category frames & richer rewards",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Upgraded /quiz visuals now that the backend ships clean asset paths for items, runes, summoner spells, champion icons, champion splashes and rank icons. Every image is resolved through resolveQuizAssetUrl, and each question category gets a distinct themed frame.",
    details: [
      "Champion questions: splash opacity raised to ~0.5, deeper navy-to-black gradient overlay, intensified Ken Burns pan/zoom with saturate(1.15)/contrast(1.08), champion name beneath the icon with a gold-light text shadow.",
      "Items: gold-bordered square frame with inset shadows, item name shown beneath.",
      "Runes: circular frame with a purple/blue conic-gradient ring and rune name.",
      "Summoner spells: cyan-to-blue gradient border with a spell-like glow.",
      "Answer reveal block: handles `rank` as an object (uses small_icon_path), shows XP gained, current streak (e.g. '🔥 3 streak'), and fires toasts for any `unlocked_achievements` returned by the answer API.",
      "QuizProfileCard prioritizes the rank `large_icon_path`, enlarges the crest to h-24 w-24, and adds a scaling entrance animation.",
    ],
    files: [
      "src/components/quiz/QuizProfileCard.tsx",
      "src/lib/quiz/api.ts",
      "src/pages/Quiz.tsx",
    ],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T14:30:00Z",
    title: "Transparent backing on all LoL pages so Hextech theme shows through",
    type: "theme",
    scopes: ["theme", "hub", "tier-list", "quiz", "docs"],
    summary:
      "Removed opaque `min-h-dvh bg-background` wrappers from LolHub, LolTierList, Quiz and LolDocumentation, and switched headers / hub tiles / methodology & FAQ panels / role tabs / champion question cards to semi-transparent surfaces (bg-card/70, gradient/90 with backdrop-blur-sm) so the HextechAmbience layer is visible behind every LoL page. Combat Lab was intentionally NOT modified.",
    files: [
      "src/pages/LolDocumentation.tsx",
      "src/pages/LolHub.tsx",
      "src/pages/LolTierList.tsx",
      "src/pages/Quiz.tsx",
    ],
    routes: ["/lol", "/lol/tier-list", "/quiz", "/lol/docs"],
  },
  {
    timestamp: "2026-06-16T14:00:00Z",
    title: "Hextech ambience overlay across all LoL pages",
    type: "theme",
    scopes: ["theme", "hub", "tier-list", "quiz", "combat-lab"],
    summary:
      "Added a full-viewport decorative HextechAmbience overlay rendered inside Layout whenever the current route is a LoL section. Provides floating runes, an arctic mist band, and ornate gold corner brackets to make every LoL page feel like a League client surface.",
    details: [
      "New component src/components/HextechAmbience.tsx with Rune sub-component supporting hex, gem, cross, bolt and diamond SVG symbols, each drifting via hextech-float keyframes with unique size/delay/duration.",
      "Arctic mist band uses radial gradients + blur via hextech-mist keyframes.",
      "Corner brackets are gold-stroked SVGs with gold-light circles.",
      "All layers use pointer-events-none and z-[5] so they never intercept UI input.",
      "Honors prefers-reduced-motion: animations disabled via media query in index.css.",
      "Rendered from Layout.tsx alongside Navbar/ThemeOverlay inside the isLolSection block.",
    ],
    files: [
      "src/components/HextechAmbience.tsx",
      "src/components/Layout.tsx",
      "src/index.css",
    ],
    routes: ["/lol", "/lol/tier-list", "/lol/docs", "/combat-lab", "/quiz"],
  },
  {
    timestamp: "2026-06-16T13:40:00Z",
    title: "Champion-question polish: Ken Burns splash, Hextech icon frame, staggered answers",
    type: "ui",
    scopes: ["quiz"],
    summary:
      "Champion questions in /quiz now feel closer to a premium League experience: slow Ken Burns pan/zoom on the splash background, dark gradient overlay layered above the splash instead of pure opacity, champion name beneath the icon when metadata.champion_name is present, entrance animations (splash fade-in, icon scale/fade-in, staggered upward answer reveal), and a stronger Hextech gold border + inner glow + drop shadow on the icon frame. Item/rune/summoner/rank visuals preserved.",
    files: ["src/index.css", "src/pages/Quiz.tsx"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T13:20:00Z",
    title: "League Quiz champion-question visuals wired to backend metadata",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Quiz champion questions now consume metadata.champion_icon_path, champion_splash_path, champion_loading_path and asset_path from the backend (all routed through resolveQuizAssetUrl). champion_splash_path becomes a low-opacity card background with a dark gradient overlay for readability; champion_icon_path is the primary visual, falling back to image_path then asset_path. Card adopts deep-navy + subtle gold Hextech border styling. Item / rune / summoner / rank flows untouched. Combat Lab not modified.",
    files: ["src/pages/Quiz.tsx"],
    routes: ["/quiz"],
  },
  {
    timestamp: "2026-06-16T13:00:00Z",
    title: "League documentation page added to LoL hub",
    type: "docs",
    scopes: ["docs", "hub"],
    summary:
      "Added a new League Docs page at /lol/docs that records every Lovable change made to LoL surfaces with timestamps, types, scopes, files and routes. Includes search, filter, sort and per-entry / full-log copy-to-clipboard buttons designed to paste into ChatGPT.",
    details: [
      "New tile 'League Docs' added to the LoL hub action grid (between Tier List and the news strip).",
      "Toolbar: search input (left), Type dropdown, Scope dropdown, Sort dropdown (Newest / Oldest / Title A-Z).",
      "Each entry card shows timestamp (local + relative), type pill, scope pills, summary, details list, files list, routes list, and a 'Copy entry' button that copies a Markdown block.",
      "Sticky top action row has 'Copy all (filtered)' and 'Copy full log' buttons that emit a single Markdown document optimized for pasting into ChatGPT.",
      "Page reuses the LoL theme (gold #c9a84c accents on the dark blue gradient hub background) and the floating back-to-hub button from Layout.",
    ],
    files: [
      "src/pages/LolDocumentation.tsx",
      "src/lib/lol-changelog.ts",
      "src/lib/route-prefetch.ts",
      "src/App.tsx",
      "src/pages/LolHub.tsx",
    ],
    routes: ["/lol/docs", "/lol"],
  },
  {
    timestamp: "2026-06-16T12:40:00Z",
    title: "League Hub back button on all LoL sub-pages",
    type: "ui",
    scopes: ["navigation", "hub", "combat-lab", "quiz", "tier-list"],
    summary:
      "Added a fixed-position 'League Hub' back button that appears on every LoL sub-route (everything under /lol/*, /combat-lab/*, /quiz/*) but is hidden on the /lol hub itself.",
    details: [
      "Rendered from src/components/Layout.tsx, positioned fixed top-16 left-3 (md:left-4) at z-[55].",
      "Styling: gold border/text (#c9a84c), black/40 background with backdrop-blur, ArrowLeft icon from lucide-react, hover state lightens the border.",
      "Implemented as a react-router <Link to='/lol'> so navigation stays SPA-fast.",
    ],
    files: ["src/components/Layout.tsx"],
    routes: ["/lol/tier-list", "/combat-lab", "/quiz", "/quiz/admin", "/quiz/diagnostics", "/combat-lab/diagnostics"],
  },
  {
    timestamp: "2026-06-16T12:20:00Z",
    title: "Quiz Admin route protected behind AdminRoute",
    type: "security",
    scopes: ["quiz"],
    summary:
      "Wrapped /quiz/admin in <AdminRoute> so only users with the admin or master_admin role (validated server-side via the has_role RPC) can reach the quiz admin tools.",
    files: ["src/App.tsx"],
    routes: ["/quiz/admin"],
  },
  {
    timestamp: "2026-06-16T11:50:00Z",
    title: "LoL theme persists across refresh & theme switcher hidden",
    type: "theme",
    scopes: ["theme", "hub", "combat-lab", "quiz", "tier-list"],
    summary:
      "Fixed the LoL-inspired theme being stripped by the sitewide theme provider after a refresh, and hid the floating theme switcher entirely while inside any LoL section.",
    details: [
      "useSitewideTheme now early-returns when window.location.pathname matches /lol, /combat-lab or /quiz, so its className-cycle effect cannot remove theme-lol.",
      "Layout.tsx switched from useLayoutEffect to useEffect (with themeId in deps) so the LoL class is re-applied on every render after the provider runs.",
      "When leaving a LoL section the layout strips any leftover theme classes and re-applies theme-${visualThemeId}.",
      "FloatingThemeSwitcher is conditionally rendered only when !isLolSection.",
    ],
    files: [
      "src/components/Layout.tsx",
      "src/hooks/useSitewideTheme.tsx",
    ],
    routes: ["/lol", "/lol/tier-list", "/combat-lab", "/quiz"],
  },
  {
    timestamp: "2026-06-16T11:20:00Z",
    title: "LoLdle-inspired theme for all League pages",
    type: "theme",
    scopes: ["theme", "hub", "combat-lab", "quiz", "tier-list"],
    summary:
      "Disabled Mogsy sitewide themes on League pages and introduced a dedicated 'theme-lol' look inspired by LoLdle: deep navy/black background with gold (#c9a84c) accents and Hextech-style borders.",
    details: [
      "Hero gradient: from-[#0a1428] via-[#091428] to-[#0a0a1a] with blurred lol-icon backdrop.",
      "Accent color (#c9a84c) used on labels, hub tile icons, back button border, and tier-list badges.",
      "Theme class applied via Layout.tsx; CSS variables defined in src/index.css under .theme-lol.",
    ],
    files: [
      "index.html",
      "src/components/Layout.tsx",
      "src/index.css",
    ],
    routes: ["/lol", "/lol/tier-list", "/combat-lab", "/quiz"],
  },
  {
    timestamp: "2026-06-16T10:30:00Z",
    title: "Admin Diagnostics page for site-wide health checks",
    type: "feature",
    scopes: ["hub"],
    summary:
      "New /admin/diagnostics page that probes every route in Mogsy and reports load speed, status, console errors and other health metrics. Linked from the main Admin dashboard.",
    files: [
      "src/pages/AdminDiagnostics.tsx",
      "src/App.tsx",
      "src/lib/route-prefetch.ts",
      "src/pages/Admin.tsx",
      "src/pages/Leagues.tsx",
    ],
    routes: ["/admin/diagnostics"],
  },
  {
    timestamp: "2026-06-16T09:00:00Z",
    title: "LoL Hub launched with action tiles and news strip",
    type: "feature",
    scopes: ["hub"],
    summary:
      "Initial League of Legends hub at /lol. Tiles route to Combat Lab, League Quiz, Swipe LoL Champions and LoL Tier List. Below the tiles, the latest blog posts tagged 'League of Legends' render in a responsive grid.",
    details: [
      "Hero: gold 'Mogsy x LoL' eyebrow, page title 'League of Legends Hub', short tagline, lol-icon badge.",
      "Tile grid: 1 column on mobile, 2 columns md+, each tile has an icon chip on the left and ArrowRight that nudges on hover.",
      "News strip: 2-column on mobile up to 5-column on lg, sourced from useBlogList({ tag: 'League of Legends' }).",
    ],
    files: ["src/pages/LolHub.tsx", "src/App.tsx"],
    routes: ["/lol"],
  },
  {
    timestamp: "2026-06-15T18:00:00Z",
    title: "LoL Tier List page",
    type: "feature",
    scopes: ["tier-list"],
    summary:
      "Standalone tier list page for the current patch at /lol/tier-list covering Top, Jungle, Mid, ADC and Support roles with S/A/B/C/D tier rows.",
    files: ["src/pages/LolTierList.tsx", "src/App.tsx"],
    routes: ["/lol/tier-list"],
  },
  {
    timestamp: "2026-06-15T15:00:00Z",
    title: "Combat Lab matchup simulator",
    type: "feature",
    scopes: ["combat-lab"],
    summary:
      "Combat Lab at /combat-lab lets users simulate champion matchups, theorycraft builds, and run damage tests. Data fetched from external Railway-hosted Combat API.",
    files: ["src/pages/CombatLab.tsx", "src/lib/combat-lab/api.ts"],
    routes: ["/combat-lab", "/combat-lab/diagnostics"],
  },
  {
    timestamp: "2026-06-15T15:00:00Z",
    title: "League Quiz game",
    type: "feature",
    scopes: ["quiz"],
    summary:
      "Quiz at /quiz tests champion knowledge, mechanics and trivia. Admin tools at /quiz/admin (admin-gated) and diagnostics at /quiz/diagnostics.",
    files: ["src/pages/Quiz.tsx", "src/pages/QuizAdmin.tsx", "src/pages/QuizDiagnostics.tsx", "src/lib/quiz/api.ts"],
    routes: ["/quiz", "/quiz/admin", "/quiz/diagnostics"],
  },
];

export const LOL_CHANGE_TYPES: LolChangeType[] = [
  "feature",
  "fix",
  "ui",
  "theme",
  "security",
  "refactor",
  "docs",
];

export const LOL_CHANGE_SCOPES: LolChangeScope[] = [
  "hub",
  "tier-list",
  "combat-lab",
  "quiz",
  "theme",
  "navigation",
  "docs",
];

/** Build a Markdown block for a single entry — optimized for pasting into ChatGPT. */
export function entryToMarkdown(e: LolChangeEntry): string {
  const lines: string[] = [];
  lines.push(`### ${e.title}`);
  lines.push(`- **When:** ${e.timestamp}`);
  lines.push(`- **Type:** ${e.type}`);
  lines.push(`- **Scopes:** ${e.scopes.join(", ")}`);
  if (e.routes?.length) lines.push(`- **Routes:** ${e.routes.join(", ")}`);
  if (e.files?.length) lines.push(`- **Files:** ${e.files.join(", ")}`);
  lines.push("");
  lines.push(e.summary);
  if (e.details?.length) {
    lines.push("");
    for (const d of e.details) lines.push(`- ${d}`);
  }
  return lines.join("\n");
}

/** Build a full Markdown document from a list of entries. */
export function entriesToMarkdown(entries: LolChangeEntry[]): string {
  const header = [
    "# Mogsy — League of Legends Section Changelog",
    "",
    `_Generated ${new Date().toISOString()} — ${entries.length} entr${entries.length === 1 ? "y" : "ies"}._`,
    "",
    "This document describes the current state of every League-related page on Mogsy (the /lol hub, /lol/tier-list, /combat-lab and /quiz). Paste into ChatGPT for context.",
    "",
    "---",
    "",
  ].join("\n");
  return header + entries.map(entryToMarkdown).join("\n\n---\n\n");
}