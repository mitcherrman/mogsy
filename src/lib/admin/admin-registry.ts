// ---------------------------------------------------------------------------
// Canonical Admin registry — the single descriptive source of truth for the
// unified Admin application: its areas, its navigation, its All Tools index,
// and the capability-preservation ledger.
//
// This file REPLACES hand-maintained navigation lists as the authority for
// where a capability lives. It stays descriptive: it never registers routes.
// Route registration remains in App.tsx, and `admin-registry.routes.test.ts`
// asserts the two agree, which is what stops the drift the Admin Atlas
// documented across the hand-maintained inventories LEGACY1 finished deleting
// (`admin-directory.ts`, `/admin/about`) and `/admin/diagnostics`.
//
// AUTHORIZATION NOTE — read before editing.
// Nothing in this file grants, checks or changes authorization. `requiredRole`
// is a DESCRIPTION of the gate a destination already enforces (AdminRoute /
// AdminAuthGate / RLS / require_admin), recorded so navigation can avoid
// advertising a destination the viewer cannot use. Adding, removing or editing
// a `requiredRole` here changes a label, never a permission.
// ---------------------------------------------------------------------------

/** Canonical Admin home. The HUD entry point. */
export const ADMIN_HOME_PATH = "/admin";
/** The tool index, and the only Admin inventory. */
export const ADMIN_ALL_TOOLS_PATH = "/admin/all-tools";

// --- Areas -----------------------------------------------------------------

export const ADMIN_AREA_IDS = [
  "overview",
  "users",
  "leaguecraft",
  "simulation",
  "game-data",
  "studio",
  "operations",
  "developer",
] as const;
export type AdminAreaId = (typeof ADMIN_AREA_IDS)[number];

/**
 * How an area is presented. `live` areas are the working application and
 * `developer` is engineering-only tooling. There is no third kind: LEGACY1
 * deleted the retired voting product rather than keeping it as an archive, so
 * every area in this registry is part of the current Mogzy product.
 */
export type AdminAreaKind = "live" | "developer";

/**
 * USERS1 — a section may hold VIEWS.
 *
 * Added so Ranked could move inside Leaguecraft without being flattened. A
 * section with views renders a second, in-page switch (?view=<id>), and a tool
 * names the view it belongs to with `subsection`. Without this the six Ranked
 * operator views would have collapsed into one tab and eleven tools would have
 * been listed together — a merge that loses navigation is not a merge, it is a
 * demotion.
 */
export interface AdminAreaView {
  id: string;
  label: string;
  summary: string;
}

export interface AdminAreaSection {
  /** Stable tab id — appears in the URL as ?section=<id>. */
  id: string;
  label: string;
  /** One line describing what the section holds. */
  summary: string;
  /**
   * When a section is its own route rather than a tab of the area page, its
   * path. The tab strip renders a link instead of switching ?section=.
   */
  path?: string;
  /** Descriptive only: the gate the section's contents already enforce. */
  requiredRole?: AdminRequiredRole;
  /** In-page views of this one section, switched with ?view=<id>. */
  views?: AdminAreaView[];
}

export interface AdminArea {
  id: AdminAreaId;
  label: string;
  /** Short label used in the sidebar when the full label is long. */
  path: string;
  kind: AdminAreaKind;
  /** Rendered next to the label for non-live areas ("Engineering"). */
  badge?: string;
  description: string;
  sections: AdminAreaSection[];
}

export const ADMIN_AREAS: AdminArea[] = [
  {
    id: "overview",
    label: "Overview",
    path: "/admin",
    kind: "live",
    description:
      "Control room: platform counts, the cross-domain attention queue, and a few high-value shortcuts.",
    sections: [
      {
        id: "dashboard",
        label: "Dashboard",
        summary: "Site counts, attention queue and shortcuts.",
        path: "/admin",
      },
      {
        id: "all-tools",
        label: "All Tools",
        summary: "Every registered Admin destination, searchable.",
        path: ADMIN_ALL_TOOLS_PATH,
      },
    ],
  },
  {
    // USERS1. ONE audience domain. FUNNEL1C's Analytics and ADMIN2's People
    // were two halves of the same question — who is out there, and what did
    // they do — split down the middle by an implementation detail: one read
    // analytics_*, the other read profiles. An operator asking "who are these
    // twelve visitors and is one of them a real account?" had to hold two
    // pages in their head and join them by eye.
    //
    // They are one area now. Aggregate → population → individual → action is a
    // single path, and it is the reason the aggregate numbers are clickable at
    // all (lib/admin/analytics/population.ts).
    id: "users",
    label: "Users",
    path: "/admin/users",
    kind: "live",
    description:
      "Everyone who reaches Mogzy: visitors, accounts, what they did, where they came from, whether they came back — and the moderation and access controls that act on them.",
    sections: [
      { id: "overview", label: "Overview", summary: "Headline audience numbers for the range, and the traffic mix behind them." },
      { id: "visitors", label: "Visitors", summary: "Every browser visitor, classified, filterable, and the target of every metric drill-down." },
      { id: "accounts", label: "Accounts", summary: "Registered and guest accounts: inspection, roles, entitlement, invites and Account Actions." },
      { id: "activity", label: "Activity", summary: "What the population did: mode opens versus Railway-confirmed starts and completions, by day." },
      { id: "acquisition", label: "Acquisition", summary: "The funnel from landing to account, and the first-touch and session-touch sources behind it." },
      { id: "retention", label: "Retention", summary: "New versus returning, repeat sessions, D1 and D7 from session history." },
      { id: "moderation", label: "Moderation", summary: "Comments, user reports, the moderator roster and the feedback queue." },
      { id: "traffic-health", label: "Traffic Health", summary: "How much of the store is human, automation, internal or unknown — and whether analytics is arriving at all." },
    ],
  },
  {
    id: "leaguecraft",
    label: "Leaguecraft",
    path: "/admin/leaguecraft",
    kind: "live",
    description: "Quiz content authoring, review, corrections, mastery and player progress.",
    sections: [
      { id: "questions", label: "Questions", summary: "The unified Builder / Review / Ranked Duel workspace." },
      { id: "reports", label: "Reports & Overrides", summary: "User-reported questions and authoritative answer overrides." },
      { id: "mastery", label: "Mastery", summary: "Mastery artifacts and coverage." },
      {
        id: "premium-preview",
        label: "Premium Preview",
        summary: "Free-vs-Premium Performance Trends, rendered on a synthetic demo account.",
      },
      {
        // USERS1 — Ranked is a Leaguecraft MODE, and it was a top-level Admin
        // area only because it arrived late and needed somewhere to live. Its
        // six operator views and all eleven of its tools are preserved
        // verbatim as views of this section; nothing about Ranked gameplay,
        // its backend, its flags or its gates is touched. /admin/ranked
        // redirects here.
        id: "ranked",
        label: "Ranked",
        summary: "The Ranked operator surface: readiness, format, question bank, matches, playtests and rating policy.",
        views: [
          { id: "overview", label: "Overview", summary: "Launch readiness, rating status and live flag state." },
          { id: "format-builder", label: "Format Builder", summary: "The ordered module cycle for Admin Bot Ranked and Public Ranked." },
          { id: "question-bank", label: "Question Bank", summary: "Ranked Duel candidate review, validation and export." },
          { id: "matches", label: "Matches & Testing", summary: "Staff duels, test matches and bot-match administration." },
          { id: "playtests", label: "Playtests", summary: "Playtest operations home, built on existing primitives." },
          { id: "settings", label: "Ratings & Settings", summary: "Rating policy and the read-only Railway flag mirror." },
        ],
      },
    ],
  },
  {
    id: "simulation",
    label: "Simulation",
    path: "/admin/simulation",
    kind: "live",
    description: "Combat Sim Battles, the team simulator, and Combat Lab operations and diagnostics.",
    sections: [
      { id: "battles", label: "Combat Battles", summary: "Event lifecycle: create, validate, publish, void, settle." },
      { id: "team-sim", label: "Team Sim", summary: "The SIM2 team simulator and its configuration health." },
      { id: "combat-lab", label: "Combat Lab", summary: "Champion assets and engine diagnostics." },
      { id: "stat-check", label: "Stat Check", summary: "The shipped Stat Check surfaces." },
    ],
  },
  {
    id: "game-data",
    label: "Game Data",
    path: "/admin/game-data",
    kind: "live",
    description: "The canonical League data underneath the products: knowledge, pro data, esports, mechanics.",
    sections: [
      { id: "knowledge", label: "Champion Knowledge", summary: "Fact queue, review, health, rundown, history.", requiredRole: "master_admin" },
      { id: "pro-data", label: "Pro Data", summary: "Pro roster candidate review and the published roster wiki." },
      { id: "esports", label: "Esports", summary: "The LIVE1 feed, its daily job and link health." },
      { id: "mechanics", label: "Mechanics & Items", summary: "Canonical mechanics and item authority surfaces." },
      { id: "content-atlas", label: "Content Atlas", summary: "Read-only family, capability, supply and question inspection.", path: "/admin/content-atlas", requiredRole: "master_admin" },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    path: "/admin/studio",
    kind: "live",
    description: "What Mogzy publishes: blog, broadcast, video, social captures and graphics.",
    sections: [
      { id: "blog", label: "Blog", summary: "Public blog authoring and publication." },
      {
        id: "academy-updates",
        label: "Academy Updates",
        summary: "The /lol Hall's announcements: write, publish, and the master switch.",
      },
      { id: "broadcast", label: "Broadcast", summary: "The live broadcast control room and its capture surfaces." },
      { id: "video-social", label: "Video & Social", summary: "Video export commands, render harness, content studio." },
      { id: "graphics", label: "Graphics", summary: "Stat-graphic and race-video explorers." },
      { id: "audio", label: "Audio", summary: "Cue policy and uploaded sound replacements." },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    path: "/admin/operations",
    kind: "live",
    description:
      "Operational tooling: configuration, health and jobs, patch operations, data maintenance, notifications and the Danger Zone. Audience and account work lives in Users.",
    sections: [
      { id: "configuration", label: "Configuration", summary: "All three configuration stores, labelled by authority." },
      { id: "health", label: "Health & Jobs", summary: "Route probes, database status and scheduled job state." },
      { id: "patch-ops", label: "Patch Operations", summary: "Patch intake, staging and production apply state." },
      {
        id: "data-ops",
        label: "Data Maintenance",
        summary: "Admin CSV export. Audience analytics live in Users.",
      },
      {
        id: "notifications",
        label: "Notifications",
        summary: "The admin inbox (inbound) and push campaigns (outbound).",
      },
      { id: "danger-zone", label: "Danger Zone", summary: "Destructive and high-impact operations, documented not armed." },
    ],
  },
  {
    id: "developer",
    label: "Developer",
    path: "/admin/developer",
    kind: "developer",
    badge: "Engineering",
    description:
      "Engineering-only tooling: prototypes, inspectors and harnesses that write no production state.",
    sections: [
      { id: "prototypes", label: "Prototypes", summary: "Design prototypes and entry-screen concepts." },
      { id: "inspectors", label: "Inspectors", summary: "Read-only, fixture-driven inspection surfaces." },
      { id: "harnesses", label: "Harnesses", summary: "Render and capture harnesses." },
    ],
  },
];

export const ADMIN_AREAS_BY_ID: Record<AdminAreaId, AdminArea> = Object.fromEntries(
  ADMIN_AREAS.map((a) => [a.id, a]),
) as Record<AdminAreaId, AdminArea>;

/** Live areas, then Developer — the nav order. */
export const ADMIN_NAV_AREAS = ADMIN_AREAS;

// --- Tools -----------------------------------------------------------------

/**
 * The disposition every inventoried capability carries. This is the
 * capability-preservation ledger's verdict column.
 *
 *  KEEP            — stays exactly where it was; the area cross-links to it.
 *  MOVE            — same capability, new canonical home.
 *  MERGE           — folded into a destination that already covered it.
 *  REDIRECT        — its old path now redirects to the new canonical home.
 *  DEVELOPER-ONLY  — classified as engineering tooling and homed in Developer.
 *  DEFERRED        — not migrated in this pass; still reachable exactly as before.
 */
export type AdminDisposition =
  | "KEEP"
  | "MOVE"
  | "MERGE"
  | "REDIRECT"
  | "DEVELOPER-ONLY"
  | "DEFERRED";

export type AdminDangerLevel = "none" | "caution" | "mutates-production" | "destructive";

export type AdminRequiredRole = "master_admin" | "moderator+";

export type AdminToolStatus =
  | "Production"
  | "Internal"
  | "Legacy"
  | "Prototype"
  | "Development"
  | "Public"
  | "Backend only"
  | "Future gap";

/**
 * How the tool is reached.
 *  route     — its own registered route.
 *  panel     — mounted inside an Admin area page (no route of its own).
 *  embedded  — an admin control inside a user-facing page.
 *  backend   — a backend capability with no UI; documented, not armed.
 *  gap       — named future work; deliberately not faked.
 */
export type AdminToolKind = "route" | "panel" | "embedded" | "backend" | "gap";

export interface AdminTool {
  id: string;
  title: string;
  description: string;
  area: AdminAreaId;
  /** Section id within the area (must exist in that area's `sections`). */
  section: string;
  /** View id within that section, when the section declares views. */
  subsection?: string;
  kind: AdminToolKind;
  /** Navigable path. Absent for `backend` and `gap` tools. */
  path?: string;
  /** Open in a new tab — capture/OBS//external output surfaces only. */
  newTab?: boolean;
  /** Where the capability lived before this reorganization. */
  oldLocation: string;
  disposition: AdminDisposition;
  /** Old routes that still resolve (unchanged, or via redirect). */
  legacyRoutes?: string[];
  dangerLevel: AdminDangerLevel;
  /** Required whenever dangerLevel !== "none" (asserted by test). */
  warning?: string;
  /** Descriptive only — the gate the destination already enforces. */
  requiredRole?: AdminRequiredRole;
  status: AdminToolStatus;
  /** Engineering-only: labelled as such wherever it is listed. */
  developerOnly?: boolean;
  /** Verbatim description of the authorization that already applies. */
  authorization: string;
  /** Ledger note — why this disposition, or what is deferred. */
  notes?: string;
}

export const ADMIN_TOOLS: AdminTool[] = [
  // =========================================================================
  // OVERVIEW
  // =========================================================================
  {
    id: "overview-dashboard",
    title: "Admin Overview",
    description:
      "Control room: platform counts, the cross-domain attention queue, and shortcuts into common tasks.",
    area: "overview",
    section: "dashboard",
    kind: "route",
    path: "/admin",
    oldLocation: "/admin (legacy 17-tab dashboard shell)",
    disposition: "MERGE",
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes:
      "FUNNEL1C deleted the legacy 17-tab dashboard; LEGACY1 deleted the /admin/legacy-dashboard redirect that outlived it. This is the only Admin home.",
  },
  {
    id: "all-tools",
    title: "All Tools",
    description:
      "The complete searchable index of every registered Admin destination, including Developer and backend-only entries.",
    area: "overview",
    section: "all-tools",
    kind: "route",
    path: ADMIN_ALL_TOOLS_PATH,
    oldLocation: "/admin/directory",
    disposition: "REDIRECT",
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute + AdminAuthGate — unchanged.",
    notes:
      "Sourced from this registry — the only Admin inventory. FUNNEL1C deleted the second hand-written one (admin-directory.ts) and its page; LEGACY1 deleted the redirects that survived it.",
  },
  // =========================================================================
  // ANALYTICS
  // =========================================================================
  {
    id: "product-analytics",
    title: "Audience Overview",
    description:
      "Visitors, sessions, engagement, signups and retention for the range, under one traffic filter — and every tile opens the records behind it.",
    area: "users",
    section: "overview",
    kind: "route",
    path: "/admin/users",
    oldLocation: "/admin/analytics — a separate top-level Analytics area (FUNNEL1C)",
    legacyRoutes: ["/admin/analytics"],
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "Inherits the /admin layout gate (AdminRoute admin, master_admin); SELECT on analytics_* is granted to admin / master_admin only by RLS.",
    notes:
      "Reads Supabase only. Gameplay starts/completions are counted from source_system = 'railway' rows only; browser rows are intent.",
  },
  {
    id: "analytics-system-health",
    title: "Traffic Health",
    description:
      "Latest event received, browser vs Railway counts, authoritative freshness per event, integrity anomalies, and the Railway outbox probe.",
    area: "users",
    section: "traffic-health",
    kind: "panel",
    path: "/admin/users?section=traffic-health",
    oldLocation: "Analytics › System Health (FUNNEL1C); before that, GET /api/admin/analytics/health with no UI (handoff §20.7)",
    legacyRoutes: ["/admin/analytics?section=health"],
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "Supabase reads as above; the outbox probe is backend require_admin and never returns a credential.",
  },

  {
    id: "users-visitors",
    title: "Visitors",
    description:
      "Every browser visitor in the range: traffic class, first and last seen, sessions, what they opened, whether they signed up — and the row that opens the canonical detail.",
    area: "users",
    section: "visitors",
    kind: "panel",
    path: "/admin/users?section=visitors",
    oldLocation: "none — no visitor-level view existed. Analytics reported counts only (USERS1).",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "Inherits the /admin layout gate; SELECT on analytics_* is admin / master_admin only by RLS. No new read path is opened.",
    notes:
      "The single drill-down target: every clickable metric on Overview, Activity and Acquisition lands here with ?population=<metric> pre-applied.",
  },
  {
    id: "users-detail",
    title: "Visitor / Account Detail",
    description:
      "One record for one person: identity, traffic classification, acquisition, sessions, activity, server-confirmed gameplay, the account if they have one, and the admin actions that apply.",
    area: "users",
    section: "visitors",
    kind: "panel",
    path: "/admin/users?section=visitors",
    oldLocation: "none — Analytics had no record view and People had no visitor view (USERS1).",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    authorization: "Inherits the /admin layout gate. Account actions keep their own existing gates inside Accounts.",
    notes:
      "There is exactly ONE detail experience. An anonymous visitor and a registered account are the same record with more or less of it filled in.",
  },
  {
    id: "users-traffic-overrides",
    title: "Traffic Classification Override",
    description:
      "Reclassify a visitor when detection got it wrong. Written to analytics_traffic_overrides and applied at read time; the observed session classes are never edited.",
    area: "users",
    section: "visitors",
    kind: "panel",
    path: "/admin/users?section=visitors",
    oldLocation: "none — USERS1.",
    disposition: "KEEP",
    dangerLevel: "caution",
    warning: "Changes which population a visitor counts in. It is analytics metadata and grants nothing.",
    status: "Production",
    authorization:
      "analytics_traffic_overrides RLS admits admin / master_admin only, for every verb. Nothing in the product authorizes on traffic_class.",
  },

  // =========================================================================
  // ACCOUNTS, MODERATION AND ACCESS (formerly the People area)
  // =========================================================================
  {
    id: "people-users",
    title: "User Accounts",
    description:
      "The one canonical account surface (bots included): one search, one filter row, one list, one detail with email, verified Discord/Riot identities and contact consent, roles, Premium / Entitlement, bot state, Add to My Friends, View Profile, notes, feedback and Account Actions. Invite links open from a page-level action.",
    area: "users",
    section: "accounts",
    kind: "panel",
    path: "/admin/users?section=accounts",
    oldLocation: "People › Users (ADMIN2); before that, /admin → Users tab (page 1)",
    legacyRoutes: ["/admin/people"],
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Account Actions perform real auth operations, and profile deletion is irreversible.",
    status: "Production",
    authorization:
      "AdminRoute (admin, master_admin); role editing and anonymous purge stay master-gated exactly as before; edge functions and RLS unchanged.",
    notes: "Same AdminUsers component and same isMasterAdmin prop. No second Users interface exists.",
  },
  {
    id: "people-invites",
    title: "Invite Links",
    description:
      "Invite link creation and management, including the grant_admin / grant_moderator switches.",
    area: "users",
    section: "accounts",
    kind: "panel",
    path: "/admin/users?section=accounts",
    oldLocation: "/admin → Invites tab (page 2)",
    disposition: "MOVE",
    dangerLevel: "mutates-production",
    warning:
      "Role-granting invites promote whoever redeems them. redeem_invite_link writes to user_roles.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin); invite_links RLS is admin-only — unchanged.",
  },
  {
    id: "people-comments",
    title: "Comment Moderation",
    description: "Comment moderation with comment_reports counts and auto-hide visibility.",
    area: "users",
    section: "moderation",
    kind: "panel",
    path: "/admin/users?section=moderation",
    oldLocation: "/admin → Comments tab (page 2)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Hiding or deleting a comment changes public content immediately.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin); comment RLS unchanged.",
  },
  {
    id: "people-user-reports",
    title: "User Reports",
    description: "The user_reports triage queue.",
    area: "users",
    section: "moderation",
    kind: "panel",
    path: "/admin/users?section=moderation",
    oldLocation: "/admin → Reports tab (page 3)",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes: "Surfaced from Overview's attention queue; this remains its canonical home.",
  },
  {
    id: "people-mod-config",
    title: "Moderator Roster & Delete Requests",
    description: "The moderator roster and the mod_delete_request approval queue.",
    area: "users",
    section: "moderation",
    kind: "panel",
    path: "/admin/users?section=moderation",
    oldLocation: "/admin → Mod Config tab (page 3)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Approving a delete request performs the deletion a moderator requested.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
  },
  {
    id: "people-feedback",
    title: "Feedback",
    description: "The feedback queue, archive, and feedback configuration.",
    area: "users",
    section: "moderation",
    kind: "panel",
    path: "/admin/users?section=moderation&view=feedback",
    oldLocation: "/admin → Feedback tab (page 3)",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "AdminRoute (admin, master_admin); reads through the admin_list_feedback RPC — unchanged.",
    notes: "Per-user feedback also remains inside Users, which is where Admin Users Phase 1 put it.",
  },
  {
    id: "people-admin-notifications",
    title: "Admin Inbox",
    description: "Inbound admin notifications — the queue behind the bell.",
    area: "operations",
    section: "notifications",
    kind: "panel",
    path: "/admin/operations?section=notifications",
    oldLocation: "/admin → hidden 'notifications' tab, reachable only through the bell icon",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin); admin_notifications RLS unchanged.",
    notes: "Was reachable only via the bell — it now has a normal navigation entry.",
  },
  {
    id: "people-push",
    title: "Push Campaigns",
    description: "Outbound push notifications to users.",
    area: "operations",
    section: "notifications",
    kind: "panel",
    path: "/admin/operations?section=notifications",
    oldLocation: "/admin → Push tab (page 2)",
    disposition: "MOVE",
    dangerLevel: "mutates-production",
    warning: "Sends notifications to real users. There is no recall.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes: 'Placed beside the admin inbox and explicitly labelled outbound, ending the "Notifications" name collision.',
  },

  // =========================================================================
  // LEAGUECRAFT
  // =========================================================================
  {
    id: "quiz-content-workspace",
    title: "Admin Quiz Review",
    description:
      "The quiz-quality control centre: Quiz Review and Diagnostics, with URL-driven tabs and deep links.",
    area: "leaguecraft",
    section: "questions",
    kind: "route",
    path: "/admin/quiz-content",
    oldLocation: "/admin/quiz-content",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-builder", "/admin/quiz-review", "/admin/workspace"],
    dangerLevel: "caution",
    warning: "Review decisions publish question content to the live quiz.",
    status: "Production",
    authorization: "AdminRoute + AdminAuthGate; backend require_admin — unchanged.",
    notes:
      "Consolidated to two tabs. Quiz Builder and Ranked Duel Review are DELETED, not hidden: both frontend subsystems, the builder's API client, and the backend builder routes/services are gone. The one capability worth keeping was extracted to components/question-preview/QuestionPreviewPanel (GET-only client), which Quiz Review hosts inline on Ranked candidate rows.",
  },
  {
    id: "premium-trends-preview",
    title: "Premium Trends Preview",
    description:
      "One synthetic study record, rendered by the shipped Performance Trends pane as a Free account sees it and as a Premium account sees it, side by side. A product-tier preview — not acquisition analytics.",
    area: "leaguecraft",
    section: "premium-preview",
    kind: "route",
    path: "/admin/premium-preview",
    oldLocation: "/admin/demo-analytics (\"Demo Analytics\", PT1.9)",
    disposition: "MOVE",
    legacyRoutes: ["/admin/demo-analytics"],
    dangerLevel: "none",
    status: "Production",
    requiredRole: "master_admin",
    authorization:
      "AdminRoute roles={[\"master_admin\"]} + backend require_admin on /api/admin/demo-analytics/*. The route accepts ONLY the demo subjects in services/demo_identity.py, whose ids are in a namespace a Supabase auth uuid cannot occupy, so no real account is nameable.",
    notes:
      "FUNNEL1C renamed it: \"Analytics\" in its name was ambiguous next to the real Analytics area. The backend API keeps its /api/admin/demo-analytics/* path. Read-only. Switching Free/Premium selects between FREE_CAPABILITY and PREMIUM_CAPABILITY and changes nothing that is stored — no entitlement is resolved, written or implied. The record is seeded out of band by scripts/seed_demo_analytics.py and is excluded from every cross-user aggregate.",
  },
  {
    id: "quiz-diagnostics-tab",
    title: "Quiz Diagnostics",
    description:
      "Quiz-system health from the read-only backend audit harness: roster, bank, realism, refresh, generator and regression checks, each clickable into Quiz Review.",
    area: "leaguecraft",
    section: "questions",
    kind: "route",
    path: "/admin/quiz-content?tab=diagnostics",
    oldLocation: "./scripts/quiz_audit.sh — a CLI the owner had to remember",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    authorization: "Inherits the workspace gate; backend require_admin on /api/quiz/admin/audit.",
    notes:
      "Read-only by construction: the harness opens SQLite mode=ro handles only and the endpoint exposes no mutating method. Replaces the Quiz Builder tab in this position.",
  },
  {
    id: "quiz-review-tab",
    title: "Quiz Review",
    description:
      "Question review, curation and pack management for every source — stored, mastery, Ranked candidates and fallbacks — with diagnostic deep links.",
    area: "leaguecraft",
    section: "questions",
    kind: "route",
    path: "/admin/quiz-content?tab=review",
    oldLocation: "/admin/quiz-content?tab=review (aliases /admin/quiz-review, /admin/quiz-builder)",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-review", "/admin/quiz-builder"],
    dangerLevel: "caution",
    warning: "Approvals publish questions to the live quiz.",
    status: "Production",
    authorization: "Inherits the workspace gate — unchanged.",
    notes:
      "Also the Ranked question bank: Ranked candidates and fallbacks are reviewed here by source/family filter. FUNNEL1C removed the separate \"Ranked Question Bank\" card, a second registry entry for this same destination; Ranked › Question Bank cross-links here.",
  },
  {
    id: "quiz-admin-hub",
    title: "Quiz Reports & Overrides",
    description:
      "User-submitted question reports, authoritative answer overrides, and the quiz onboarding gate settings.",
    area: "leaguecraft",
    section: "reports",
    kind: "route",
    path: "/quiz/admin",
    oldLocation: "/quiz/admin",
    disposition: "KEEP",
    legacyRoutes: ["/quiz/admin"],
    dangerLevel: "mutates-production",
    warning: "An answer override changes the authoritative answer for a live question.",
    status: "Production",
    authorization: "AdminRoute; backend require_admin for reports — unchanged.",
    notes:
      "Path kept rather than renamed: it is linked from /quiz/diagnostics and bookmarked. Its onboarding-gate config is additionally cross-linked from Operations › Configuration, which is the only place all three onboarding stores are visible together.",
  },
  {
    id: "mastery-generator-lab",
    title: "Mastery Generator Lab",
    description:
      "Run the production Mastery generators — Champion, Matchup and applied combat chain — and inspect what they produce, rendered exactly as a player would see it.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "question-bank",
    kind: "route",
    path: "/admin/ranked/generator-lab",
    oldLocation: "none — generated Mastery content had no admin surface at all",
    // KEEP, not MOVE: nothing moved here. Generated Mastery content had no
    // admin surface of any kind before this, so this is a capability gained
    // rather than a capability relocated, and the ledger should not imply a
    // predecessor that never existed.
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "Inherits the /admin layout gate; backend require_admin on /api/ranked/admin/mastery-slice/*.",
    notes:
      "GENERATED questions, not stored ones. A mastery_slice question is synthesized when a match opens the segment and frozen onto that one round — it is never a row. This is deliberately NOT a Quiz Review tab: Quiz Review is a table of stored, approvable questions, and generated samples do not belong in it. Read-only — previewing creates no attempt, no history, no match, no round and no stored question, which the backend enforces with a sqlite authorizer rather than by convention. It calls the SAME generator a live match calls and draws the result with the SAME component the Ranked arena draws a challenge with.",
  },
  {
    id: "mastery-reviewer",
    title: "Mastery Artifact Reviewer",
    description: "Read-only inspection of a mastery artifact by digest.",
    area: "leaguecraft",
    section: "mastery",
    kind: "route",
    path: "/admin/mastery",
    oldLocation: "/admin/mastery/:artifactDigest — direct URL only, no navigation source anywhere",
    disposition: "MOVE",
    legacyRoutes: ["/admin/mastery/:artifactDigest"],
    dangerLevel: "none",
    status: "Internal",
    authorization: "AdminRoute; backend require_admin — unchanged.",
    notes:
      "Gains a navigation entry for the first time: a digest lookup form at /admin/mastery that navigates to the existing parameterized route.",
  },
  {
    id: "mastery-coverage",
    title: "Mastery Coverage Report",
    description: "GET /api/admin/mastery/coverage — mastery coverage across the catalog.",
    area: "leaguecraft",
    section: "mastery",
    kind: "backend",
    oldLocation: "Backend endpoint with no frontend consumer",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Backend only",
    authorization: "require_admin (Railway allowlist bearer or KNOWLEDGE_ADMIN_KEY) — unchanged.",
    notes: "DEFERRED — STILL ACCESSIBLE via the API. Documented here so it stops being invisible.",
  },
  {
    id: "quiz-api-inspector",
    title: "Quiz API Inspector",
    description:
      "The original engineering inspector for the quiz API: connectivity, sets, questions, stats and achievements JSON. Not the Quiz Diagnostics tab, which is the operator surface.",
    area: "developer",
    section: "inspectors",
    kind: "route",
    path: "/quiz/diagnostics",
    oldLocation: "/quiz/diagnostics — listed as a second \"Quiz Diagnostics\" under Leaguecraft",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/quiz/diagnostics"],
    dangerLevel: "none",
    status: "Development",
    developerOnly: true,
    authorization:
      "UNCHANGED — the route keeps its current gate. Adding one is an access change and an owner decision (Atlas §N).",
    notes:
      "FUNNEL1C moved it to Developer and renamed it: two destinations both titled Quiz Diagnostics was a duplicate path to an ambiguous job. The operator job is /admin/quiz-content?tab=diagnostics. Its authorization is untouched.",
  },

  // =========================================================================
  // RANKED
  // =========================================================================
  {
    id: "ranked-overview",
    title: "Ranked Overview",
    description:
      "Launch-readiness verdict per gate, rating status, and the live Railway flag state — read from the running process.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "overview",
    kind: "panel",
    path: "/admin/leaguecraft?section=ranked&view=overview",
    oldLocation: "GET /api/ranked/launch-readiness — reachable only with curl",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute + AdminAuthGate; backend require_admin — unchanged.",
    notes: "First operator surface Ranked has ever had. Read-only.",
  },
  {
    id: "ranked-rating-status",
    title: "Rating Status",
    description:
      "Result counts by status, active rating policy version, and the rating / forfeit flags.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "settings",
    kind: "panel",
    path: "/admin/leaguecraft?section=ranked&view=settings",
    oldLocation: "GET /api/ranked/rating-status — no UI",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "backend require_admin — unchanged.",
  },
  {
    id: "ranked-flags",
    title: "Ranked Feature Flags",
    description:
      "Read-only mirror of the Ranked Railway environment flags, sourced from launch-readiness rather than re-implemented.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "settings",
    kind: "panel",
    path: "/admin/leaguecraft?section=ranked&view=settings",
    oldLocation: "Railway environment variables — visible nowhere in the product",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "Read-only projection of require_admin data. Railway values are never written from Admin.",
    notes:
      "Deliberately read-only: making these editable would create a fourth configuration authority.",
  },
  {
    id: "ranked-staff-duel",
    title: "Staff Duel Creator",
    description:
      "Creates real backend ranked matches for two staff testers via POST /api/admin/ranked-duels.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "matches",
    kind: "route",
    path: "/dev/ranked-duel",
    oldLocation: "/dev/ranked-duel → 'Live staff duel' — an ungated public URL",
    disposition: "KEEP",
    legacyRoutes: ["/dev/ranked-duel"],
    dangerLevel: "mutates-production",
    warning:
      "Creates real matches against the live Ranked lifecycle. The page's X-Admin-Key field is the only gate on that route.",
    status: "Production",
    authorization:
      "UNCHANGED — the route carries no gate today and this reorganization adds none. Gating it is an access change and an owner decision (Atlas §N).",
    notes:
      "Given a discoverable home under Ranked › Matches with its danger stated. The same page also has a local fixture (mock-state) mode; FUNNEL1C removed its separate Developer entry so the route has one canonical home. Relocating the route itself would change who can reach it, which is explicitly out of scope.",
  },
  {
    id: "ranked-test-matches",
    title: "Test Match Creation",
    description:
      "POST /api/ranked/test-matches — binds two verified accounts into a match and accepts an experiment_arm.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "matches",
    kind: "backend",
    oldLocation: "Backend endpoint with no frontend consumer",
    disposition: "DEFERRED",
    dangerLevel: "mutates-production",
    warning: "Creates a real Ranked match between two real accounts.",
    status: "Backend only",
    authorization: "require_admin — unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE. Documented with its exact contract rather than given a one-click button; a new production-write form is beyond a navigation reorganization.",
  },
  {
    id: "ranked-bot-matches",
    title: "Ranked Bot Matches",
    description:
      "Bot-match configuration and status. The endpoint itself is player-authenticated and stays that way — this administers it, it does not call it.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "matches",
    kind: "panel",
    path: "/admin/leaguecraft?section=ranked&view=matches",
    oldLocation: "No admin surface — RANKED_BOT_ENABLED visible only via launch-readiness",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "Read-only. POST /api/ranked/bot-matches remains player-authenticated; Ranked Bot user access is untouched.",
  },
  {
    id: "ranked-match-inspector",
    title: "Match Inspector",
    description:
      "Per-match administrative read of a Ranked match. No such endpoint exists — player-scoped reads only.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "matches",
    kind: "gap",
    oldLocation: "Does not exist",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Future gap",
    authorization: "n/a — no endpoint exists.",
    notes: "FUTURE GAP, stated honestly rather than faked. Shared with Playtests session inspection.",
  },
  {
    id: "ranked-queue-inspection",
    title: "Queue Inspection",
    description:
      "Operator view of the live Ranked queue. GET/POST/DELETE /api/ranked/queue is player-scoped; no admin queue read exists.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "overview",
    kind: "gap",
    oldLocation: "Does not exist",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Future gap",
    authorization: "n/a — no endpoint exists.",
    notes: "FUTURE GAP. Launch-readiness reports queue ENABLEMENT, never queue CONTENTS.",
  },
  {
    id: "ranked-playtests",
    title: "Playtests",
    description:
      "The Playtests operations home: the existing primitives a playtest is assembled from, and the named gaps that remain.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "playtests",
    kind: "panel",
    path: "/admin/leaguecraft?section=ranked&view=playtests",
    oldLocation: "Does not exist — the primitives are scattered across five places",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Future gap",
    authorization: "AdminRoute + AdminAuthGate — no new capability, no new restriction.",
    notes:
      "Navigation home only. No allowlist, no cohort mechanism and no restriction on normal Ranked PvP or Ranked Bot is introduced.",
  },
  {
    id: "ranked-lifecycle-worker",
    title: "Lifecycle Worker State",
    description:
      "Quiescence worker enablement, sweep counts, and maintenance pause state, read from launch-readiness.",
    area: "leaguecraft",
    section: "ranked",
    subsection: "settings",
    kind: "panel",
    path: "/admin/leaguecraft?section=ranked&view=settings",
    oldLocation: "Railway env + the pause file — visible nowhere",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "Read-only projection of require_admin data — unchanged.",
  },
  {
    id: "ranked-arena-inspector-xlink",
    title: "Ranked Arena Inspector",
    description: "Fixture-driven visual QA of the Ranked arena. Dev builds only.",
    area: "developer",
    section: "inspectors",
    kind: "route",
    path: "/dev/ranked-arena-inspector",
    oldLocation: "/dev/ranked-arena-inspector",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/ranked-arena-inspector"],
    dangerLevel: "none",
    status: "Development",
    developerOnly: true,
    authorization: "Refuses outside DEV builds — unchanged.",
    notes: "Cross-linked from Ranked; a test asserts it imports no engine or service module.",
  },
  {
    id: "leaguecraft-lobby-preview",
    title: "Leaguecraft Lobby Preview",
    description:
      "The /quiz lobby rendered from frozen demo state, for reviewing the three-parchment layout as an established account reads it.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/lobby-preview",
    newTab: true,
    oldLocation: "/dev/lobby-preview — new, unlisted everywhere",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/lobby-preview"],
    dangerLevel: "none",
    status: "Internal",
    authorization: "UNCHANGED — no route gate; renders frozen constants and performs no fetch or write.",
    notes: "Demo-only. Its fixtures are imported by this page alone, so no production surface can reach them.",
  },

  // =========================================================================
  // SIMULATION
  // =========================================================================
  {
    id: "combat-battles",
    title: "Combat Sim Battles",
    description:
      "Event lifecycle: create, validate, publish, void, reproduce and settle. All results are server-derived.",
    area: "simulation",
    section: "battles",
    kind: "route",
    path: "/admin/combat-battles",
    oldLocation: "/admin/combat-battles",
    disposition: "KEEP",
    legacyRoutes: ["/admin/combat-battles"],
    dangerLevel: "mutates-production",
    warning: "Publishing and settling write immutable live event state.",
    status: "Production",
    authorization: "AdminRoute; backend require_admin — unchanged.",
  },
  {
    id: "team-sim",
    title: "Team Simulator",
    description:
      "The SIM2 team-combat editor. Development-only internal alias; the public route is flag-gated.",
    area: "simulation",
    section: "team-sim",
    kind: "route",
    path: "/dev/combat-lab/team-sim",
    oldLocation: "/dev/combat-lab/team-sim — always registered, never linked",
    disposition: "MOVE",
    legacyRoutes: ["/dev/combat-lab/team-sim"],
    dangerLevel: "caution",
    warning: "Runs real simulations; the backend requires a verified Premium account and may spend credits.",
    status: "Internal",
    authorization:
      "COMBAT1 — the /dev alias is registered only in development builds and 404s in production; the public route stays flag-gated. The BACKEND is authoritative: verified account, then operational readiness, then Mogzy Premium.",
    notes: "Same lazy module as the flag-gated public route. In production the public route is the only path.",
  },
  {
    id: "team-sim-health",
    title: "Team Sim Configuration Health",
    description: "GET /api/admin/combat-lab/… — team-simulation configuration health.",
    area: "simulation",
    section: "team-sim",
    kind: "backend",
    oldLocation: "Backend endpoint with no frontend consumer",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Backend only",
    authorization: "require_admin — unchanged.",
    notes: "DEFERRED — STILL ACCESSIBLE via the API.",
  },
  {
    id: "combat-lab-diagnostics",
    title: "Combat Lab Diagnostics",
    description: "Combat engine QA inspection over production combat and engine state.",
    area: "simulation",
    section: "combat-lab",
    kind: "route",
    path: "/combat-lab/diagnostics",
    oldLocation: "/combat-lab/diagnostics — ungated public URL, listed only in dev builds",
    disposition: "KEEP",
    legacyRoutes: ["/combat-lab/diagnostics"],
    dangerLevel: "none",
    status: "Internal",
    authorization:
      "UNCHANGED — the route keeps its current gate. Adding one is an access change and an owner decision (Atlas §N).",
    notes: "Now listed in production builds instead of vanishing.",
  },
  {
    id: "combat-lab-champion-assets",
    title: "Champion Image Upload",
    description:
      "Champion image upload and delete, embedded in the Combat Lab champion profile.",
    area: "simulation",
    section: "combat-lab",
    kind: "embedded",
    path: "/combat-lab",
    oldLocation: "/combat-lab → ChampionProfile (inline user_roles read)",
    disposition: "KEEP",
    dangerLevel: "caution",
    warning: "Writes to and deletes from the champion-image storage buckets.",
    status: "Production",
    authorization: "Inline user_roles read plus storage RLS — unchanged.",
    notes:
      "Kept in place as a contextual affordance. Moving it out of the champion profile would make it harder to use, not easier; it is recorded here so it is no longer invisible to an inventory.",
  },
  {
    id: "stat-check",
    title: "Stat Check",
    description: "The shipped Stat Check mode-select, bot shell and private rooms.",
    area: "simulation",
    section: "stat-check",
    kind: "route",
    path: "/quiz/stat-check",
    oldLocation: "/quiz/stat-check",
    disposition: "KEEP",
    legacyRoutes: ["/quiz/stat-check"],
    dangerLevel: "none",
    status: "Public",
    authorization: "Unchanged — a product surface, listed here for operator reach.",
  },

  // =========================================================================
  // GAME DATA
  // =========================================================================
  {
    id: "content-atlas",
    title: "Content Atlas",
    description: "Browse every question family, capability, layered supply count, reachability path and safe real-question preview.",
    area: "game-data",
    section: "content-atlas",
    kind: "route",
    path: "/admin/content-atlas",
    oldLocation: "ATLAS1 human architecture document",
    disposition: "KEEP",
    dangerLevel: "none",
    requiredRole: "master_admin",
    status: "Internal",
    authorization: "AdminRoute master_admin plus backend require_admin. Read-only endpoints only.",
  },
  {
    id: "knowledge-admin",
    title: "Champion Knowledge Base",
    description:
      "Champion fact queue, structural review, health, rundown, apply history and undo, and automation runs.",
    area: "game-data",
    section: "knowledge",
    kind: "route",
    path: "/admin/knowledge",
    oldLocation: "/admin/knowledge",
    disposition: "KEEP",
    legacyRoutes: ["/admin/knowledge"],
    dangerLevel: "mutates-production",
    warning: "Approvals and undos change published champion knowledge.",
    requiredRole: "master_admin",
    status: "Production",
    authorization:
      "AdminRoute roles=['master_admin'] + AdminAuthGate; backend require_admin — unchanged. The React route is master-only and the Python endpoints are admin-flat, exactly as before.",
  },
  {
    id: "knowledge-queue",
    title: "Knowledge Queue",
    description: "Pending champion knowledge updates awaiting review.",
    area: "game-data",
    section: "knowledge",
    kind: "route",
    path: "/admin/knowledge/queue",
    oldLocation: "/admin/knowledge/queue",
    disposition: "KEEP",
    dangerLevel: "none",
    requiredRole: "master_admin",
    status: "Production",
    authorization: "Inherits the Knowledge shell gate — unchanged.",
  },
  {
    id: "knowledge-health",
    title: "Knowledge Health",
    description: "Per-champion knowledge coverage health.",
    area: "game-data",
    section: "knowledge",
    kind: "route",
    path: "/admin/knowledge/health",
    oldLocation: "/admin/knowledge/health",
    disposition: "KEEP",
    dangerLevel: "none",
    requiredRole: "master_admin",
    status: "Production",
    authorization: "Inherits the Knowledge shell gate — unchanged.",
  },
  {
    id: "knowledge-rundown",
    title: "Patch Rundown & Intelligence",
    description: "Patch rundown, patch analytics, intelligence and gameplay-impact reporting.",
    area: "game-data",
    section: "knowledge",
    kind: "route",
    path: "/admin/knowledge/rundown",
    oldLocation: "/admin/knowledge/rundown",
    disposition: "KEEP",
    dangerLevel: "none",
    requiredRole: "master_admin",
    status: "Production",
    authorization: "Inherits the Knowledge shell gate — unchanged.",
  },
  {
    id: "knowledge-history",
    title: "Apply History & Undo",
    description: "Applied-change history with undo of applied knowledge changes.",
    area: "game-data",
    section: "knowledge",
    kind: "route",
    path: "/admin/knowledge/history",
    oldLocation: "/admin/knowledge/history — reachable only from inside the Knowledge shell",
    disposition: "KEEP",
    dangerLevel: "mutates-production",
    warning: "Undo reverses a change that has already been applied to published data.",
    requiredRole: "master_admin",
    status: "Production",
    authorization: "Inherits the Knowledge shell gate — unchanged.",
    notes: "Now listed in All Tools; it was absent from the old directory.",
  },
  {
    id: "knowledge-combat-integrity",
    title: "Combat Integrity Report",
    description: "GET /api/admin/knowledge/combat-integrity — the one knowledge endpoint no UI calls.",
    area: "game-data",
    section: "knowledge",
    kind: "backend",
    oldLocation: "Backend endpoint with no frontend consumer",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Backend only",
    authorization: "require_admin — unchanged.",
    notes: "DEFERRED — STILL ACCESSIBLE via the API.",
  },
  {
    id: "roster-candidates",
    title: "Pro Roster Candidate Review",
    description:
      "The seven-endpoint approve / reject / defer / promote workflow for pro roster candidates.",
    area: "game-data",
    section: "pro-data",
    kind: "backend",
    oldLocation: "/api/admin/roster-candidates/* — seven endpoints, zero frontend consumers",
    disposition: "DEFERRED",
    dangerLevel: "mutates-production",
    warning: "Promotion writes to the canonical pro roster identity data.",
    status: "Backend only",
    authorization: "require_admin — unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE. Documented with its endpoint list; the workflow is real and may be script-driven. Building its UI is its own task.",
  },
  {
    id: "pro-roster-wiki",
    title: "Pro Roster (published)",
    description: "The public roster wiki produced by the pro data pipeline.",
    area: "game-data",
    section: "pro-data",
    kind: "route",
    path: "/lol/docs/pro/rosters",
    oldLocation: "/lol/docs/pro/rosters",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Public",
    authorization: "Public — unchanged. Listed so an operator can verify what the pipeline published.",
  },
  {
    id: "pro-data-coverage",
    title: "Pro Play Data Coverage",
    description:
      "The exact reconciliation of the historical pro corpus: how many canonical games carry Oracle's Elixir statistics, and the mutually exclusive reason every remaining game does not.",
    area: "game-data",
    section: "pro-data",
    kind: "route",
    path: "/admin/pro-play-coverage",
    oldLocation: "OE_STATS_HANDOFF.md and hand-run SQL",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    requiredRole: "master_admin",
    authorization:
      "AdminRoute roles={[\"master_admin\"]} + backend require_admin on /api/admin/pro-coverage/*. Read-only; the endpoints perform no writes.",
    notes:
      "The league table reads /by-league?limit=500, not summary.by_league, which the server caps at the 60 leagues with the most missing games. Leaguepedia stays canonical for game and result identity; Oracle's Elixir is statistical enrichment and its result disagreements are reported as diagnostics only.",
  },
  {
    id: "esports-live",
    title: "Live & Recent Matches",
    description:
      "The LIVE1 production match centre — now the live/recent destination of Pro Play, at /lol/pro-play/live.",
    area: "game-data",
    section: "esports",
    kind: "route",
    path: "/lol/pro-play/live",
    oldLocation: "/esports/live — a product page, absent from the admin directory",
    disposition: "KEEP",
    // /esports/live is where the match centre shipped and is still linked from
    // the outside; it redirects to the Pro Play route rather than 404ing.
    legacyRoutes: ["/esports/live"],
    dangerLevel: "none",
    status: "Public",
    authorization: "UNCHANGED — a public product page. Listing it changes no access.",
  },
  {
    id: "esports-link-health",
    title: "Esports Link Health",
    description: "GET /api/admin/db/esports-link-health — the canonical-link health monitor status.",
    area: "game-data",
    section: "esports",
    kind: "backend",
    oldLocation: "Backend endpoint with no frontend consumer",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Backend only",
    authorization: "require_admin — unchanged.",
    notes: "DEFERRED — STILL ACCESSIBLE via the API; surfaced from Operations › Health & Jobs.",
  },
  {
    id: "esports-daily-job",
    title: "Esports Daily Job",
    description:
      "POST /api/internal/live-esports/daily-run and its status endpoint — the bounded LIVE1 daily slot.",
    area: "game-data",
    section: "esports",
    kind: "backend",
    oldLocation: "Scheduler-only internal triggers, hidden from OpenAPI",
    disposition: "DEFERRED",
    dangerLevel: "caution",
    warning: "Starts a real ingestion slot against live esports data.",
    status: "Backend only",
    authorization:
      "Bearer LIVE_ESPORTS_DAILY_TOKEN — a separate scheduler authority. Unreachable from the browser; unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE to the scheduler. Documented, deliberately not given a browser trigger.",
  },
  {
    id: "mechanics-explorer",
    title: "Mechanics Explorer",
    description: "Public tools over the canonical mechanics engine.",
    area: "game-data",
    section: "mechanics",
    kind: "route",
    path: "/lol/mechanics",
    oldLocation: "/lol/mechanics",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Public",
    authorization: "Public — unchanged.",
  },
  {
    id: "patch-reports-public",
    title: "Patch Reports (published)",
    description: "Public per-patch change reports produced by the Patch Ops pipeline.",
    area: "game-data",
    section: "mechanics",
    kind: "route",
    path: "/lol/patch-reports",
    oldLocation: "/lol/patch-reports",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Public",
    authorization: "Public — unchanged.",
  },

  // =========================================================================
  // STUDIO
  // =========================================================================
  {
    id: "blog-cms",
    title: "Blog CMS",
    description:
      "Blog post list — create, duplicate, publish, draft and delete — and the block / rich-text post editor it opens.",
    area: "studio",
    section: "blog",
    kind: "route",
    path: "/admin/blog",
    oldLocation: "/admin/blog; editor at /admin/blog/:id",
    disposition: "KEEP",
    legacyRoutes: ["/admin/blog", "/admin/blog/:id"],
    dangerLevel: "mutates-production",
    warning: "Publishes and unpublishes public blog content.",
    status: "Production",
    authorization: "AdminRoute — unchanged.",
  },
  {
    id: "academy-updates",
    title: "Academy Updates",
    description:
      "Write, publish and withdraw the announcements shown on the Academy Hall, and turn the whole surface on or off. Database-backed — no deploy.",
    area: "studio",
    section: "academy-updates",
    kind: "route",
    path: "/admin/academy-updates",
    // Genuinely new in WHATSNEW2, not a relocation: before this the updates and
    // the switch lived in src/lib/lol/academy-updates.ts and had no admin
    // surface at all.
    oldLocation: "src/lib/lol/academy-updates.ts (source constants, no UI)",
    disposition: "KEEP",
    dangerLevel: "mutates-production",
    warning:
      "Publishes and unpublishes announcements shown to every visitor on /lol, and controls whether the surface appears at all.",
    status: "Production",
    authorization:
      "AdminRoute (layout) + AdminAuthGate; enforced by RLS — has_role(auth.uid(),'admin') on public.academy_updates and public.app_settings.",
    notes:
      "The master switch is one app_settings row (academy_updates_enabled), read by the Hall through the shared platform-policy contract. Its control lives here rather than on /admin/platform-policies so the switch sits beside the updates it governs.",
  },
  {
    id: "broadcast-studio",
    title: "Quiz Broadcast Studio",
    description:
      "Broadcast control room: browse, playlists, timing, visuals, SFX, stats and shorts.",
    area: "studio",
    section: "broadcast",
    kind: "route",
    path: "/admin/quiz-broadcast",
    oldLocation: "/admin/quiz-broadcast",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-broadcast"],
    dangerLevel: "mutates-production",
    warning: "Publishes changes to the live public broadcast state.",
    status: "Production",
    authorization: "AdminRoute — unchanged.",
  },
  {
    id: "broadcast-capture-view",
    title: "Broadcast Capture View",
    description: "The chrome-free OBS window-capture surface driven by BroadcastChannel.",
    area: "studio",
    section: "broadcast",
    kind: "route",
    path: "/admin/quiz-broadcast/view",
    newTab: true,
    oldLocation: "/admin/quiz-broadcast/view",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-broadcast/view"],
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute — unchanged.",
    notes:
      "Deliberately mounted OUTSIDE the Admin shell: adding navigation chrome would break window capture.",
  },
  {
    id: "broadcast-live-view",
    title: "Broadcast Live View",
    description: "The public OBS viewer of live broadcast state.",
    area: "studio",
    section: "broadcast",
    kind: "route",
    path: "/broadcast/live-view",
    newTab: true,
    oldLocation: "/broadcast/live-view",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Public",
    authorization: "Intentionally public broadcast output — unchanged.",
  },
  {
    id: "broadcast-developer-tools",
    title: "Broadcast Developer Tools",
    description:
      "The tabbed developer console (event log, presets, docs, changelog, share, capture, ZIP export) mounted inside the Broadcast Studio.",
    area: "developer",
    section: "harnesses",
    kind: "panel",
    path: "/admin/quiz-broadcast",
    oldLocation: "Nested inside /admin/quiz-broadcast with no separate route or label",
    disposition: "DEVELOPER-ONLY",
    dangerLevel: "none",
    status: "Development",
    developerOnly: true,
    authorization: "Inherits the Broadcast Studio gate — unchanged.",
    notes:
      "Classified as developer tooling and labelled as such. Left mounted where it is: extracting it would be a refactor of the studio, not a navigation change.",
  },
  {
    id: "video-export",
    title: "Quiz Video Export",
    description: "Generates Remotion CLI commands for MP4 renders of quiz content.",
    area: "studio",
    section: "video-social",
    kind: "route",
    path: "/admin/quiz-video-export",
    oldLocation: "/admin/quiz-video-export",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-video-export"],
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute — unchanged.",
  },
  {
    id: "quiz-render-harness",
    title: "Quiz Render Harness",
    description: "Screenshot render harness for published social-format captures.",
    area: "studio",
    section: "video-social",
    kind: "route",
    path: "/dev/quiz-render",
    newTab: true,
    oldLocation: "/dev/quiz-render — listed only in dev builds",
    disposition: "MOVE",
    legacyRoutes: ["/dev/quiz-render"],
    dangerLevel: "none",
    status: "Internal",
    authorization: "UNCHANGED — no route gate; inert without injected data.",
    notes: "Produces published assets, so it is administration rather than a prototype. Now listed in production.",
  },
  {
    id: "content-post-studio",
    title: "Content Post Studio",
    description:
      "Generates social content packages from real quiz questions, driving the loopback studio server.",
    area: "studio",
    section: "video-social",
    kind: "route",
    path: "/dev/content-studio",
    newTab: true,
    oldLocation: "/dev/content-studio — listed only in dev builds",
    disposition: "MOVE",
    legacyRoutes: ["/dev/content-studio"],
    dangerLevel: "none",
    status: "Internal",
    authorization: "UNCHANGED — no route gate; inert without the local server.",
  },
  {
    id: "graph1-explorer",
    title: "Stat Graphic Explorer",
    description: "Champion stat race graphics feeding the published video export.",
    area: "studio",
    section: "graphics",
    kind: "route",
    path: "/dev/graph1",
    oldLocation: "/dev/graph1 — unlisted everywhere",
    disposition: "MOVE",
    legacyRoutes: ["/dev/graph1"],
    dangerLevel: "none",
    status: "Internal",
    authorization: "UNCHANGED — no route gate; reads the public /api/graph1/* endpoints.",
    notes: "Produces published assets. Gains its first navigation entry.",
  },

  {
    // LEGACY1. This is a CURRENT capability (SFX1's canonical audio_assets /
    // audio_event_bindings stores) that had no home of its own: it was the
    // ninth tab of /admin/gaming, the retired voting product's config shell.
    // Deleting that shell without moving this first would have deleted a live
    // operator surface, so it was rehomed before the shell was removed.
    id: "audio-studio",
    title: "Audio Studio",
    description:
      "Sound-effect cue policy and uploaded replacements: which cues play, and which asset each one uses.",
    area: "studio",
    section: "audio",
    kind: "route",
    path: "/admin/audio-studio",
    oldLocation: "/admin/gaming → Sounds tab (the retired Gaming Config shell)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Writes live cue policy and asset bindings for every player.",
    status: "Production",
    authorization:
      "AdminRoute (admin, master_admin) via the /admin layout route, plus RLS on audio_assets, audio_event_bindings and app_settings — byte-for-byte the gate it had under /admin/gaming.",
    notes:
      "Saving publishes the new snapshot to mounted players without a reload (SFX1.6). Visitor mute stays independent.",
  },

  // =========================================================================
  // OPERATIONS
  // =========================================================================
  {
    id: "platform-policies",
    title: "Platform Policies",
    description:
      "The global platform switches: Combat Sim token requirement, global navbar, bot labels, PLAY modes, Academy updates, global Premium access.",
    area: "operations",
    section: "configuration",
    kind: "route",
    path: "/admin/platform-policies",
    oldLocation: "/admin/platform-policies",
    disposition: "KEEP",
    legacyRoutes: ["/admin/platform-policies"],
    dangerLevel: "mutates-production",
    warning: "Each switch changes platform access or onboarding for every user immediately.",
    status: "Production",
    authorization: "AdminRoute + AdminAuthGate; app_settings RLS enforces the writes — unchanged.",
    notes:
      "combat_sim_tokens_required_for_non_pro is the one app_settings key the Python backend also reads — the single bridge between the two configuration authorities.",
  },
  {
    id: "app-settings",
    title: "App Settings",
    description: "The require_auth platform switch. LEGACY1 deleted the rest — every other row this panel wrote belonged to the retired voting product.",
    area: "operations",
    section: "configuration",
    kind: "panel",
    path: "/admin/operations?section=configuration",
    oldLocation: "/admin → Settings tab (page 5, master-only)",
    disposition: "MOVE",
    dangerLevel: "mutates-production",
    warning: "maintenance_mode takes the site down for everyone.",
    requiredRole: "master_admin",
    status: "Production",
    authorization:
      "Master-only in the UI exactly as before. app_settings RLS admits any admin — that pre-existing mismatch is preserved, not fixed here.",
  },
  {
    id: "onboarding-config",
    title: "Onboarding Config",
    description: "The legacy Mogsy onboarding_config store.",
    area: "operations",
    section: "configuration",
    kind: "panel",
    path: "/admin/operations?section=configuration",
    oldLocation: "/admin → Onboard tab (page 4, master-only)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Changes what a new user sees on first run.",
    requiredRole: "master_admin",
    status: "Legacy",
    authorization: "Master-only in the UI exactly as before.",
    notes:
      "One of three onboarding stores. Configuration lists all three side by side with their authority labelled; none is migrated and none is declared authoritative — that is an owner decision.",
  },
  {
    id: "tutorial-tips",
    title: "Tutorial Tips",
    description: "In-product tutorial tip content.",
    area: "operations",
    section: "configuration",
    kind: "panel",
    path: "/admin/operations?section=configuration",
    oldLocation: "/admin → Tutorials tab (page 3)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Tutorial tip copy is shown to real users immediately.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes:
      "Tutorial TIP CONTENT only — the contextual coach-marks. Unrelated to the retired scripted Ranked tutorial (removed in TUT1).",
  },
  {
    id: "banners",
    title: "Banners",
    description: "Home and navbar banner configuration.",
    area: "operations",
    section: "configuration",
    kind: "panel",
    path: "/admin/operations?section=configuration",
    oldLocation: "/admin → Banners tab (page 2)",
    disposition: "MOVE",
    dangerLevel: "mutates-production",
    warning: "Banners appear site-wide to every visitor immediately.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes:
      "Banners configure the live site.",
  },
  {
    id: "railway-flags-view",
    title: "Backend Flags (Railway)",
    description:
      "Read-only view of the backend flag state the running process reports, with its authority labelled.",
    area: "operations",
    section: "configuration",
    kind: "panel",
    path: "/admin/operations?section=configuration",
    oldLocation: "Railway environment variables — visible nowhere in the product",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization:
      "Read-only. Railway values are never written from Admin — doing so would create a fourth configuration authority.",
  },
  {
    id: "site-diagnostics",
    title: "Site Diagnostics",
    description: "Route health probe, RLS linter and slow-query signals.",
    area: "operations",
    section: "health",
    kind: "route",
    path: "/admin/diagnostics",
    oldLocation: "/admin/diagnostics",
    disposition: "KEEP",
    legacyRoutes: ["/admin/diagnostics"],
    dangerLevel: "none",
    status: "Internal",
    authorization: "AdminRoute — unchanged.",
    notes:
      "Its hardcoded 33-route probe list is stale and predates ten current admin routes. Left as-is: rewriting it is its own task, and All Tools now covers route discovery.",
  },
  {
    id: "db-status",
    title: "Database Status",
    description:
      "GET /api/admin/db/status — live database summary, core table row counts, identity DB wiring and the restore limits.",
    area: "operations",
    section: "health",
    kind: "panel",
    path: "/admin/operations?section=health",
    oldLocation: "Backend endpoint with no frontend consumer",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "backend require_admin — unchanged. Read-only.",
    notes: "Surfaced read-only. The restore endpoint on the same router is NOT armed here.",
  },
  {
    id: "scheduled-jobs",
    title: "Scheduled Jobs",
    description:
      "The scheduler-driven internal triggers: the Patch Ops watcher and the LIVE1 daily run, plus the Supabase cron functions.",
    area: "operations",
    section: "health",
    kind: "backend",
    oldLocation: "Three /api/internal triggers plus Supabase edge cron — nothing reported whether either ran",
    disposition: "DEFERRED",
    dangerLevel: "caution",
    warning: "These triggers start real ingestion and apply work.",
    status: "Backend only",
    authorization:
      "Separate bearer tokens (PATCH_OPS_WATCHER_TOKEN, LIVE_ESPORTS_DAILY_TOKEN). They 503 when unset and 401 otherwise — unreachable from the browser. Unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE to the scheduler. Documented rather than given a browser trigger.",
  },
  {
    id: "patch-operations",
    title: "Patch Operations",
    description:
      "Patch intake, waivers, staging and production apply. Operated from the backend CLI and the watcher.",
    area: "operations",
    section: "patch-ops",
    kind: "backend",
    oldLocation: "Backend-only; no frontend has ever existed",
    disposition: "DEFERRED",
    dangerLevel: "mutates-production",
    warning: "A production apply writes canonical game data.",
    status: "Backend only",
    authorization:
      "Backend CLI plus the watcher token. The two-directional production gate refuses before the database opens. Unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE. Documented so the capability is visible; its published output is linked from Game Data › Mechanics.",
  },
  {
    id: "data-ops-csv",
    title: "Admin CSV Export",
    description: "Exports the admin data set as CSV.",
    area: "operations",
    section: "data-ops",
    kind: "panel",
    path: "/admin/operations?section=data-ops",
    oldLocation: "/admin header strip (master-only button)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Downloads production user data to your machine.",
    requiredRole: "master_admin",
    status: "Production",
    authorization: "Master-only exactly as before — the same isMasterAdmin gate on the same action.",
  },
  {
    id: "db-restore",
    title: "Database Restore",
    description:
      "POST /api/admin/db/restore — streams an uploaded SQLite file over the production database.",
    area: "operations",
    section: "danger-zone",
    kind: "backend",
    oldLocation: "Backend endpoint with no UI, no directory entry and no documentation anywhere",
    disposition: "DEFERRED",
    dangerLevel: "destructive",
    warning:
      "Replaces the live game database. Documented here; deliberately NOT given a browser trigger.",
    status: "Backend only",
    authorization:
      "require_admin. Existing interlocks preserved and unchanged: refuses to clobber a database holding quiz_questions unless ?force=true; optional X-Content-SHA256 aborts before writing on digest mismatch; destination confined to RESTORE_ALLOWED_DEST_DIRS; RESTORE_MAX_UPLOAD_BYTES size ceiling; uploaded file validated before replacement; existing DB backed up first; replacement is atomic.",
    notes:
      "DEFERRED — STILL ACCESSIBLE via the API. Given a documented home rather than a button: a one-click restore is a different risk profile than a curl command, and no safe UI exists for it.",
  },
  {
    id: "purge-anonymous",
    title: "Purge Anonymous Users",
    description: "Permanently deletes all anonymous accounts.",
    area: "operations",
    section: "danger-zone",
    kind: "embedded",
    path: "/admin/users?section=accounts",
    oldLocation: "/admin → Users → master-only button",
    disposition: "KEEP",
    dangerLevel: "destructive",
    warning: "Irreversible. Permanently deletes every anonymous account.",
    requiredRole: "master_admin",
    status: "Production",
    authorization:
      "Master-only button exactly as before; the purge-anonymous-users edge function performs its own role check. Unchanged.",
    notes:
      "Left inside the Users panel where it lives today rather than duplicated as a second trigger. Danger Zone documents and links it.",
  },

  // =========================================================================
  // DEVELOPER
  // =========================================================================
  {
    id: "dev-stat-check",
    title: "Stat Check Prototype",
    description: "The Stat Check design prototype. The shipped surfaces live under /quiz/stat-check.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/stat-check",
    oldLocation: "/dev/stat-check — unlisted",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/stat-check"],
    dangerLevel: "none",
    status: "Prototype",
    developerOnly: true,
    authorization: "UNCHANGED — no route gate.",
    notes: "Ambiguous case (Atlas §M): its online rooms touch real state. Classified dev; flagged for owner review.",
  },
  {
    id: "dev-mastery-prototypes",
    title: "Mastery Progression Prototypes",
    description: "Ten per-champion mastery progression prototypes.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/mastery/ahri-vs-syndra",
    oldLocation: "/dev/mastery/… ×10 — unlisted",
    disposition: "DEVELOPER-ONLY",
    dangerLevel: "none",
    status: "Prototype",
    developerOnly: true,
    authorization: "ProtectedRoute — any signed-in user. UNCHANGED.",
    notes: "All ten remain registered and reachable; the index links each one.",
  },
  {
    id: "dev-entry-v2",
    title: "Entry Screen Concept",
    description: "The entry-screen concept; the same component serves the root route in League-only mode.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/mogzy-entry-v2",
    oldLocation: "/dev/mogzy-entry-v2 — unlisted",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/mogzy-entry-v2"],
    dangerLevel: "none",
    status: "Prototype",
    developerOnly: true,
    authorization: "UNCHANGED — no route gate.",
  },
  {
    id: "dev-mechanics-xp",
    title: "Mechanics XP Inspector",
    description: "Read-only XP and wave-breakpoint inspector over the backend mechanics engine.",
    area: "developer",
    section: "inspectors",
    kind: "route",
    path: "/dev/mechanics/xp",
    oldLocation: "/dev/mechanics/xp — unlisted",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/mechanics/xp"],
    dangerLevel: "none",
    status: "Development",
    developerOnly: true,
    authorization: "Refuses outside DEV builds — unchanged.",
  },

  {
    id: "blog-edit-fab",
    title: "Blog Post Edit Link",
    description: "The in-context edit link on a published blog post.",
    area: "studio",
    section: "blog",
    kind: "embedded",
    path: "/blog",
    oldLocation: "/blog/:slug — inline user_roles read",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    authorization: "Inline user_roles read — unchanged.",
    notes: "A legitimate contextual deep link into the CMS. Kept.",
  },
  {
    id: "lol-popout-style-toggle",
    title: "Popout Style Toggle",
    description: "Admin-only popout style switcher on the League pages.",
    area: "studio",
    section: "graphics",
    kind: "embedded",
    path: "/lol",
    oldLocation: "/lol/* — has_role RPC",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Production",
    authorization: "has_role RPC — unchanged.",
    notes: "A display preference rather than an administrative capability. Kept in place, recorded here.",
  },
];

// --- Derived helpers -------------------------------------------------------

export const ADMIN_TOOLS_BY_ID: Record<string, AdminTool> = Object.fromEntries(
  ADMIN_TOOLS.map((t) => [t.id, t]),
);

/** Tools belonging to an area, in declaration order. */
export function toolsForArea(area: AdminAreaId): AdminTool[] {
  return ADMIN_TOOLS.filter((t) => t.area === area);
}

/** Tools belonging to one section of an area, in declaration order. */
export function toolsForSection(area: AdminAreaId, section: string): AdminTool[] {
  return ADMIN_TOOLS.filter((t) => t.area === area && t.section === section);
}

/**
 * Every old admin path this reorganization is responsible for, mapped to where
 * it resolves now. Used by the route-agreement test and the migration table.
 */
export function legacyRouteMap(): Array<{ from: string; toolId: string; to: string }> {
  const rows: Array<{ from: string; toolId: string; to: string }> = [];
  for (const tool of ADMIN_TOOLS) {
    for (const from of tool.legacyRoutes ?? []) {
      rows.push({ from, toolId: tool.id, to: tool.path ?? "(documented, no UI)" });
    }
  }
  return rows;
}

/** Case-insensitive search across the fields an operator would type. */
export function searchAdminTools(query: string, tools: AdminTool[] = ADMIN_TOOLS): AdminTool[] {
  const q = query.trim().toLowerCase();
  if (!q) return tools;
  return tools.filter((t) =>
    [
      t.title,
      t.description,
      t.path ?? "",
      t.oldLocation,
      t.status,
      t.disposition,
      ADMIN_AREAS_BY_ID[t.area].label,
      ...(t.legacyRoutes ?? []),
      t.notes ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

/** Ledger totals — the capability-preservation count. */
export function dispositionCounts(): Record<AdminDisposition, number> {
  const counts = {
    KEEP: 0,
    MOVE: 0,
    MERGE: 0,
    REDIRECT: 0,
    "DEVELOPER-ONLY": 0,
    DEFERRED: 0,
  } as Record<AdminDisposition, number>;
  for (const tool of ADMIN_TOOLS) counts[tool.disposition] += 1;
  return counts;
}
