/**
 * League of Legends section changelog.
 *
 * Each entry documents a notable change shipped through Lovable for any LoL-related
 * surface (the /lol hub, /lol/tier-list, /combat-lab, /quiz). The data here is
 * intentionally human-curated — append a new entry at the TOP whenever a LoL
 * feature, page, or layout changes so the docs page stays accurate and copy/paste
 * to ChatGPT stays useful.
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