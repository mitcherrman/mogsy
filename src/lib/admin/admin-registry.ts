// ---------------------------------------------------------------------------
// Canonical Admin registry — the single descriptive source of truth for the
// unified Admin application: its areas, its navigation, its All Tools index,
// and the capability-preservation ledger.
//
// This file REPLACES hand-maintained navigation lists as the authority for
// where a capability lives. It stays descriptive: it never registers routes.
// Route registration remains in App.tsx, and `admin-registry.routes.test.ts`
// asserts the two agree, which is what stops the drift the Admin Atlas
// documented across `admin-directory.ts`, `/admin/about` §14 and
// `/admin/diagnostics`.
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
/** The tool index — successor to `/admin/directory`, which redirects here. */
export const ADMIN_ALL_TOOLS_PATH = "/admin/all-tools";

// --- Areas -----------------------------------------------------------------

export const ADMIN_AREA_IDS = [
  "overview",
  "people",
  "leaguecraft",
  "ranked",
  "simulation",
  "game-data",
  "studio",
  "operations",
  "developer",
  "arena",
] as const;
export type AdminAreaId = (typeof ADMIN_AREA_IDS)[number];

/**
 * How an area is presented. `live` areas are the working application;
 * `developer` is engineering-only tooling; `archived` is the retired voting
 * product, preserved and labelled but never presented as an active product.
 */
export type AdminAreaKind = "live" | "developer" | "archived";

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
}

export interface AdminArea {
  id: AdminAreaId;
  label: string;
  /** Short label used in the sidebar when the full label is long. */
  path: string;
  kind: AdminAreaKind;
  /** Rendered next to the label for non-live areas ("Archived", "Engineering"). */
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
      "Control room: platform counts, the cross-domain attention queue, and the complete tool index.",
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
    id: "people",
    label: "People",
    path: "/admin/people",
    kind: "live",
    description:
      "Accounts, access, moderation, feedback and notifications — everything about a person.",
    sections: [
      { id: "users", label: "Users", summary: "Account inspection, notes, and Account Actions." },
      { id: "roles-access", label: "Roles & Access", summary: "Invite links, role-granting invites, custom links." },
      { id: "moderation", label: "Moderation", summary: "Comments, user reports, and the moderator roster." },
      { id: "feedback", label: "Feedback", summary: "Feedback queue, archive and feedback configuration." },
      { id: "notifications", label: "Notifications", summary: "Admin inbox (inbound) and push campaigns (outbound)." },
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
      { id: "diagnostics", label: "Diagnostics", summary: "Quiz engine QA inspection over production state." },
    ],
  },
  {
    id: "ranked",
    label: "Ranked",
    path: "/admin/ranked",
    kind: "live",
    description:
      "The Ranked operator surface: readiness, the question bank, match and bot testing, and flag state.",
    sections: [
      { id: "overview", label: "Overview", summary: "Launch readiness, rating status and live flag state." },
      { id: "question-bank", label: "Question Bank", summary: "Ranked Duel candidate review, validation and export." },
      { id: "matches", label: "Matches & Testing", summary: "Staff duels, test matches and bot-match administration." },
      { id: "playtests", label: "Playtests", summary: "Playtest operations home, built on existing primitives." },
      { id: "settings", label: "Ratings & Settings", summary: "Rating policy and the read-only Railway flag mirror." },
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
      { id: "broadcast", label: "Broadcast", summary: "The live broadcast control room and its capture surfaces." },
      { id: "video-social", label: "Video & Social", summary: "Video export commands, render harness, content studio." },
      { id: "graphics", label: "Graphics", summary: "Stat-graphic and race-video explorers." },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    path: "/admin/operations",
    kind: "live",
    description: "Configuration, health, scheduled jobs, data operations, internal docs and the Danger Zone.",
    sections: [
      { id: "configuration", label: "Configuration", summary: "All three configuration stores, labelled by authority." },
      { id: "health", label: "Health & Jobs", summary: "Route probes, database status and scheduled job state." },
      { id: "patch-ops", label: "Patch Operations", summary: "Patch intake, staging and production apply state." },
      { id: "data-ops", label: "Data Operations", summary: "Analytics graphs, CSV export and image-click analytics." },
      { id: "docs", label: "Internal Docs", summary: "The internal architecture reference." },
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
  {
    id: "arena",
    label: "Arena",
    path: "/admin/arena",
    kind: "archived",
    badge: "Archived",
    description:
      "The retired Mogsy voting product. Every tool is preserved and still works — it is labelled archived, not removed.",
    sections: [
      { id: "collections", label: "Collections & Leagues", summary: "Preset items, league bots and promoted leagues." },
      { id: "presentation", label: "Presentation", summary: "Themes and Arena rank settings." },
      { id: "operations", label: "Arena Operations", summary: "Play layout, gaming config and the demo studio." },
    ],
  },
];

export const ADMIN_AREAS_BY_ID: Record<AdminAreaId, AdminArea> = Object.fromEntries(
  ADMIN_AREAS.map((a) => [a.id, a]),
) as Record<AdminAreaId, AdminArea>;

/** Live areas, then Developer, then the archived Arena — the nav order. */
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
 *  ARCHIVE         — preserved and working, presented under Arena as archived.
 *  DEVELOPER-ONLY  — classified as engineering tooling and homed in Developer.
 *  DEFERRED        — not migrated in this pass; still reachable exactly as before.
 */
export type AdminDisposition =
  | "KEEP"
  | "MOVE"
  | "MERGE"
  | "REDIRECT"
  | "ARCHIVE"
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
    legacyRoutes: ["/admin"],
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes:
      "The legacy dashboard's tabs are redistributed to People, Operations and Arena. The dashboard itself stays reachable at /admin/legacy-dashboard.",
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
    legacyRoutes: ["/admin/directory"],
    dangerLevel: "none",
    status: "Production",
    authorization: "AdminRoute + AdminAuthGate — unchanged from /admin/directory.",
    notes:
      "Sourced from this registry rather than a second hand-written list. Unlike /admin/directory it no longer hides development entries in production builds — it labels them instead.",
  },
  {
    id: "legacy-admin-directory",
    title: "Legacy Admin Directory",
    description:
      "The pre-reorganization hand-maintained tool index, preserved unchanged. All Tools supersedes it.",
    area: "overview",
    section: "all-tools",
    kind: "route",
    path: "/admin/legacy-directory",
    oldLocation: "/admin/directory",
    disposition: "DEFERRED",
    dangerLevel: "none",
    status: "Legacy",
    authorization: "AdminRoute + AdminAuthGate — unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE. Kept so this migration deletes nothing. It still hides development entries in production builds, which is exactly the blind spot All Tools fixes.",
  },
  {
    id: "legacy-admin-dashboard",
    title: "Legacy Admin Dashboard",
    description:
      "The original 17-tab dashboard, preserved unchanged as a compatibility surface while the migration is reviewed.",
    area: "overview",
    section: "all-tools",
    kind: "route",
    path: "/admin/legacy-dashboard",
    oldLocation: "/admin",
    disposition: "DEFERRED",
    legacyRoutes: ["/admin"],
    dangerLevel: "none",
    status: "Legacy",
    authorization: "AdminRoute (admin, master_admin) plus its own user_roles read — unchanged.",
    notes:
      "DEFERRED — STILL ACCESSIBLE. Every tab it hosts now has a canonical home; this page remains so no capability can be lost to a mis-migration. Retire only with owner approval.",
  },

  // =========================================================================
  // PEOPLE
  // =========================================================================
  {
    id: "people-users",
    title: "Users",
    description:
      "Account inspection, profile detail, admin notes, per-user feedback, and the Account Actions menu. Admin Users Phase 1, unchanged.",
    area: "people",
    section: "users",
    kind: "panel",
    path: "/admin/people?section=users",
    oldLocation: "/admin → Users tab (page 1)",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Account Actions perform real auth operations, and profile deletion is irreversible.",
    status: "Production",
    authorization:
      "AdminRoute (admin, master_admin); role editing and anonymous purge stay master-gated exactly as before; edge functions and RLS unchanged.",
    notes: "Same AdminUsers component and same isMasterAdmin prop. No second Users interface exists.",
  },
  {
    id: "people-profile-browser",
    title: "Profile Browser",
    description: "The 500-row profile browser that navigates to /user/:profileId.",
    area: "people",
    section: "users",
    kind: "panel",
    path: "/admin/people?section=users",
    oldLocation: '/admin → "Directory" tab (AdminProfileDirectory)',
    disposition: "MERGE",
    dangerLevel: "none",
    status: "Legacy",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes:
      'Merged under Users as a secondary view rather than a peer tab. Ends the "Directory" naming collision with the tool index.',
  },
  {
    id: "people-invites",
    title: "Invite Links",
    description:
      "Invite link creation and management, including the grant_admin / grant_moderator switches and nested custom links.",
    area: "people",
    section: "roles-access",
    kind: "panel",
    path: "/admin/people?section=roles-access",
    oldLocation: "/admin → Invites tab (page 2); also /moderator → Invites",
    disposition: "MOVE",
    dangerLevel: "mutates-production",
    warning:
      "Role-granting invites promote whoever redeems them. redeem_invite_link writes to user_roles.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin); invite_links RLS is admin-only — unchanged.",
    notes: "Still also present in /moderator, which is preserved as-is (see the /moderator entry).",
  },
  {
    id: "people-custom-links",
    title: "Custom Links",
    description: "Short custom link management, previously nested inside the Invites panel.",
    area: "people",
    section: "roles-access",
    kind: "panel",
    path: "/admin/people?section=roles-access",
    oldLocation: "/admin → Invites → nested AdminCustomLinks",
    disposition: "MOVE",
    dangerLevel: "caution",
    warning: "Custom links resolve at the site root and are publicly reachable.",
    status: "Production",
    authorization: "Unchanged — the component keeps its own queries and RLS.",
  },
  {
    id: "people-comments",
    title: "Comment Moderation",
    description: "Comment moderation with comment_reports counts and auto-hide visibility.",
    area: "people",
    section: "moderation",
    kind: "panel",
    path: "/admin/people?section=moderation",
    oldLocation: "/admin → Comments tab (page 2); also /moderator → Comments",
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
    area: "people",
    section: "moderation",
    kind: "panel",
    path: "/admin/people?section=moderation",
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
    area: "people",
    section: "moderation",
    kind: "panel",
    path: "/admin/people?section=moderation",
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
    area: "people",
    section: "feedback",
    kind: "panel",
    path: "/admin/people?section=feedback",
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
    area: "people",
    section: "notifications",
    kind: "panel",
    path: "/admin/people?section=notifications",
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
    area: "people",
    section: "notifications",
    kind: "panel",
    path: "/admin/people?section=notifications",
    oldLocation: "/admin → Push tab (page 2)",
    disposition: "MOVE",
    dangerLevel: "mutates-production",
    warning: "Sends notifications to real users. There is no recall.",
    status: "Production",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes: 'Placed beside the admin inbox and explicitly labelled outbound, ending the "Notifications" name collision.',
  },
  {
    id: "moderator-panel",
    title: "Moderator Panel",
    description:
      "The moderator workspace: Collections, Bots, Comments, Invites and Aura Check. Preserved exactly as deployed.",
    area: "people",
    section: "moderation",
    kind: "route",
    path: "/moderator",
    oldLocation: "/moderator",
    disposition: "KEEP",
    legacyRoutes: ["/moderator"],
    dangerLevel: "none",
    requiredRole: "moderator+",
    status: "Production",
    authorization:
      "AdminRoute (moderator, admin, master_admin) plus its own user_roles read — unchanged. No RLS, role or capability change.",
    notes:
      "Kept, not dissolved. Narrowing it to the RLS-authorized subset is a visible behaviour change for real moderators and is an owner decision, not a navigation decision. It adopts the shared Admin shell chrome only.",
  },

  // =========================================================================
  // LEAGUECRAFT
  // =========================================================================
  {
    id: "quiz-content-workspace",
    title: "Quiz Content Workspace",
    description:
      "The unified Builder / Review / Ranked Duel workspace with URL-driven tabs and deep links.",
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
      "Deliberately NOT split. Builder and Review were consolidated on purpose and the consolidation works; the Ranked Duel tab is additionally cross-linked from Ranked › Question Bank.",
  },
  {
    id: "quiz-builder-tab",
    title: "Quiz Builder",
    description: "Draft authoring, generation and promotion into review.",
    area: "leaguecraft",
    section: "questions",
    kind: "route",
    path: "/admin/quiz-content?tab=builder",
    oldLocation: "/admin/quiz-content?tab=builder (alias /admin/quiz-builder)",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-builder"],
    dangerLevel: "none",
    status: "Production",
    authorization: "Inherits the workspace gate — unchanged.",
  },
  {
    id: "quiz-review-tab",
    title: "Quiz Review",
    description: "Question review, curation and pack management.",
    area: "leaguecraft",
    section: "questions",
    kind: "route",
    path: "/admin/quiz-content?tab=review",
    oldLocation: "/admin/quiz-content?tab=review (alias /admin/quiz-review)",
    disposition: "KEEP",
    legacyRoutes: ["/admin/quiz-review"],
    dangerLevel: "caution",
    warning: "Approvals publish questions to the live quiz.",
    status: "Production",
    authorization: "Inherits the workspace gate — unchanged.",
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
    id: "quiz-diagnostics",
    title: "Quiz Diagnostics",
    description: "Quiz QA inspection over production quiz state; links onward into Reports & Overrides.",
    area: "leaguecraft",
    section: "diagnostics",
    kind: "route",
    path: "/quiz/diagnostics",
    oldLocation: "/quiz/diagnostics — ungated public URL, listed only in dev builds",
    disposition: "KEEP",
    legacyRoutes: ["/quiz/diagnostics"],
    dangerLevel: "none",
    status: "Internal",
    authorization:
      "UNCHANGED — the route keeps its current gate. Adding one is an access change and an owner decision (Atlas §N).",
    notes:
      "Now listed in production builds instead of vanishing, so an operator can find it. Its authorization is untouched.",
  },

  // =========================================================================
  // RANKED
  // =========================================================================
  {
    id: "ranked-overview",
    title: "Ranked Overview",
    description:
      "Launch-readiness verdict per gate, rating status, and the live Railway flag state — read from the running process.",
    area: "ranked",
    section: "overview",
    kind: "route",
    path: "/admin/ranked?section=overview",
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
    area: "ranked",
    section: "settings",
    kind: "route",
    path: "/admin/ranked?section=settings",
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
    area: "ranked",
    section: "settings",
    kind: "route",
    path: "/admin/ranked?section=settings",
    oldLocation: "Railway environment variables — visible nowhere in the product",
    disposition: "MOVE",
    dangerLevel: "none",
    status: "Production",
    authorization: "Read-only projection of require_admin data. Railway values are never written from Admin.",
    notes:
      "Deliberately read-only: making these editable would create a fourth configuration authority.",
  },
  {
    id: "ranked-question-bank",
    title: "Ranked Question Bank",
    description:
      "Ranked Duel candidate review — accept, reject, revise, validate, public-view preview and export to the accepted bank.",
    area: "ranked",
    section: "question-bank",
    kind: "route",
    path: "/admin/quiz-content?tab=ranked-duel",
    oldLocation: "/admin/quiz-content?tab=ranked-duel — a tab inside the quiz workspace",
    disposition: "KEEP",
    dangerLevel: "mutates-production",
    warning: "Accepting and exporting writes the question bank the live Ranked game serves.",
    status: "Production",
    authorization: "AdminRoute + AdminAuthGate; backend require_admin — unchanged.",
    notes:
      "Cross-linked from Ranked rather than re-mounted: the workspace is its working home and splitting it would undo a deliberate consolidation.",
  },
  {
    id: "ranked-staff-duel",
    title: "Staff Duel Creator",
    description:
      "Creates real backend ranked matches for two staff testers via POST /api/admin/ranked-duels.",
    area: "ranked",
    section: "matches",
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
      "Given a discoverable home under Ranked › Matches with its danger stated. Relocating the route itself would change who can reach it, which is explicitly out of scope.",
  },
  {
    id: "ranked-test-matches",
    title: "Test Match Creation",
    description:
      "POST /api/ranked/test-matches — binds two verified accounts into a match and accepts an experiment_arm.",
    area: "ranked",
    section: "matches",
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
    area: "ranked",
    section: "matches",
    kind: "route",
    path: "/admin/ranked?section=matches",
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
    area: "ranked",
    section: "matches",
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
    area: "ranked",
    section: "overview",
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
    area: "ranked",
    section: "playtests",
    kind: "route",
    path: "/admin/ranked?section=playtests",
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
    area: "ranked",
    section: "settings",
    kind: "route",
    path: "/admin/ranked?section=settings",
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
      "The SIM2 team-combat editor. Always-registered internal alias; the public route is flag-gated.",
    area: "simulation",
    section: "team-sim",
    kind: "route",
    path: "/dev/combat-lab/team-sim",
    oldLocation: "/dev/combat-lab/team-sim — always registered, never linked",
    disposition: "MOVE",
    legacyRoutes: ["/dev/combat-lab/team-sim"],
    dangerLevel: "caution",
    warning: "Runs real simulations; the backend requires a verified account and may spend credits.",
    status: "Internal",
    authorization:
      "UNCHANGED — no route gate; the BACKEND requires a verified account. Feature-preview access is unchanged.",
    notes: "Gains its first navigation entry. Same lazy module as the flag-gated public route.",
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
    id: "esports-live",
    title: "Esports Live Feed",
    description: "The LIVE1 production live esports viewer — the only surface for LIVE1 operations.",
    area: "game-data",
    section: "esports",
    kind: "route",
    path: "/esports/live",
    oldLocation: "/esports/live — a product page, absent from the admin directory",
    disposition: "KEEP",
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
    description: "Blog post list: create, duplicate, publish, draft and delete.",
    area: "studio",
    section: "blog",
    kind: "route",
    path: "/admin/blog",
    oldLocation: "/admin/blog",
    disposition: "KEEP",
    legacyRoutes: ["/admin/blog"],
    dangerLevel: "mutates-production",
    warning: "Publishes and unpublishes public blog content.",
    status: "Production",
    authorization: "AdminRoute — unchanged.",
  },
  {
    id: "blog-editor",
    title: "Blog Post Editor",
    description: "The block and rich-text post editor.",
    area: "studio",
    section: "blog",
    kind: "route",
    path: "/admin/blog",
    oldLocation: "/admin/blog/:id",
    disposition: "KEEP",
    legacyRoutes: ["/admin/blog/:id"],
    dangerLevel: "caution",
    warning: "Edits public blog content.",
    status: "Production",
    authorization: "AdminRoute — unchanged.",
    notes: "Reached from the list and from the in-context edit link on a published post, which stays.",
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

  // =========================================================================
  // OPERATIONS
  // =========================================================================
  {
    id: "platform-policies",
    title: "Platform Policies",
    description:
      "The four global switches: Combat Sim token requirement, tutorial auto-popup, required new-user tutorial, global navbar.",
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
    description: "maintenance_mode, nav_tab_mode, favorites_mode and shop_ad_config.",
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
      "Tutorial TIP CONTENT only. The Ranked tutorial and onboarding flows are out of scope and untouched.",
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
      "Placed in Operations rather than Arena: banners configure the live site, not the retired voting product.",
  },
  {
    id: "railway-flags-view",
    title: "Backend Flags (Railway)",
    description:
      "Read-only view of the backend flag state the running process reports, with its authority labelled.",
    area: "operations",
    section: "configuration",
    kind: "route",
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
    kind: "route",
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
    id: "data-ops-graphs",
    title: "Analytics Graphs",
    description: "Configurable analytics graphs over profiles, matches and league memberships.",
    area: "operations",
    section: "data-ops",
    kind: "route",
    path: "/admin/data",
    oldLocation: "/admin/data — linked only from the master-only header strip on /admin",
    disposition: "KEEP",
    legacyRoutes: ["/admin/data"],
    dangerLevel: "caution",
    warning: "Reads production user data.",
    status: "Internal",
    authorization:
      "AdminRoute (admin, master_admin) — unchanged. The page always admitted any admin; only the LINK to it was master-only.",
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
    id: "internal-docs",
    title: "Internal Docs",
    description: "The hand-written internal architecture and route reference.",
    area: "operations",
    section: "docs",
    kind: "route",
    path: "/admin/about",
    oldLocation: "/admin/about",
    disposition: "KEEP",
    legacyRoutes: ["/admin/about"],
    dangerLevel: "none",
    status: "Legacy",
    authorization: "AdminRoute — unchanged.",
    notes:
      "Its §14 route inventory is stale and omits ten current admin pages. Left as-is; All Tools is now the derived inventory of record.",
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
    path: "/admin/people?section=users",
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
    id: "dev-ranked-duel-fixture",
    title: "Ranked Duel Prototype (fixture)",
    description: "Local mock-state Ranked Duel prototype. The same page also hosts the live staff duel creator.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/ranked-duel",
    oldLocation: "/dev/ranked-duel — fixture mode",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/ranked-duel"],
    dangerLevel: "none",
    status: "Prototype",
    developerOnly: true,
    authorization: "UNCHANGED — no route gate.",
    notes:
      "Fixture mode is a prototype; the same route's Live mode is production administration and is listed under Ranked › Matches.",
  },
  {
    id: "dev-ranked-tutorial",
    title: "Ranked Tutorial Prototype",
    description: "A design prototype of the ranked tutorial. The shipped tutorial is a different route.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/ranked-tutorial",
    oldLocation: "/dev/ranked-tutorial — unlisted",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/ranked-tutorial"],
    dangerLevel: "none",
    status: "Prototype",
    developerOnly: true,
    authorization: "UNCHANGED — no route gate, no auth, no API, no persistence.",
    notes:
      "Classification only. /quiz/tutorial and /onboarding/ranked-tutorial are out of scope and untouched.",
  },
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
    id: "dev-daily-score-attack",
    title: "Daily Score Attack Prototype",
    description: "Prototype played against the live daily API.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/daily-score-attack",
    oldLocation: "/dev/daily-score-attack — unlisted",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/daily-score-attack"],
    dangerLevel: "caution",
    warning: "Consumes production daily state.",
    status: "Prototype",
    developerOnly: true,
    authorization: "UNCHANGED — no route gate.",
    notes: "Ambiguous case (Atlas §M). Classified dev; flagged for owner review.",
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
    id: "dev-legacy-entry",
    title: "Legacy Entry Preview",
    description: "Preview of the retired pre-Mogzy landing page.",
    area: "developer",
    section: "prototypes",
    kind: "route",
    path: "/dev/legacy-entry",
    oldLocation: "/dev/legacy-entry — unlisted",
    disposition: "DEVELOPER-ONLY",
    legacyRoutes: ["/dev/legacy-entry"],
    dangerLevel: "none",
    status: "Prototype",
    developerOnly: true,
    authorization: "UNCHANGED — no route gate.",
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

  // =========================================================================
  // ARENA (archived)
  // =========================================================================
  {
    id: "arena-collections",
    title: "Collections",
    description: "Leagues, preset items, preset item images and matches for the retired voting product.",
    area: "arena",
    section: "collections",
    kind: "panel",
    path: "/admin/arena?section=collections",
    oldLocation: "/admin → Collections tab (page 1); also /moderator → Collections",
    disposition: "ARCHIVE",
    dangerLevel: "caution",
    warning: "Writes preset item and league data.",
    status: "Legacy",
    authorization: "AdminRoute (admin, master_admin) — unchanged. Also still in /moderator, unchanged.",
  },
  {
    id: "arena-bots",
    title: "League Bots",
    description: "Bot profile creation and deletion for the voting product. Unrelated to Ranked Bot.",
    area: "arena",
    section: "collections",
    kind: "panel",
    path: "/admin/arena?section=collections",
    oldLocation: "/admin → Bots tab (page 1); also /moderator → Bots",
    disposition: "ARCHIVE",
    dangerLevel: "caution",
    warning: "Creates and deletes real profile rows.",
    status: "Legacy",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes: 'Renamed "League Bots" to end the name collision with Ranked Bot, which is a different concept entirely.',
  },
  {
    id: "arena-promoted",
    title: "Promoted Leagues",
    description: "League promotion flags.",
    area: "arena",
    section: "collections",
    kind: "panel",
    path: "/admin/arena?section=collections",
    oldLocation: "/admin → Promoted tab (page 1)",
    disposition: "ARCHIVE",
    dangerLevel: "caution",
    warning: "Changes which leagues are promoted to users.",
    status: "Legacy",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
  },
  {
    id: "arena-themes",
    title: "Themes",
    description: "Sitewide theme configuration for the voting product.",
    area: "arena",
    section: "presentation",
    kind: "panel",
    path: "/admin/arena?section=presentation",
    oldLocation: "/admin → Themes tab (page 4, master-only)",
    disposition: "ARCHIVE",
    dangerLevel: "caution",
    warning: "Changes presentation for every user.",
    requiredRole: "master_admin",
    status: "Legacy",
    authorization: "Master-only in the UI exactly as before.",
  },
  {
    id: "arena-ranks",
    title: "Arena Ranks",
    description: "Rank thresholds for the voting product. A different concept from Ranked tiers.",
    area: "arena",
    section: "presentation",
    kind: "panel",
    path: "/admin/arena?section=presentation",
    oldLocation: "/admin → Ranks tab (page 4, master-only)",
    disposition: "ARCHIVE",
    dangerLevel: "caution",
    warning: "Changes rank thresholds for every user of the voting product.",
    requiredRole: "master_admin",
    status: "Legacy",
    authorization: "Master-only in the UI exactly as before.",
    notes: 'Renamed "Arena Ranks" to end the name collision with Ranked tier configuration.',
  },
  {
    id: "arena-play-layout",
    title: "Play Layout",
    description:
      "Play-hub layout editor: top-level items, categories, compete leagues, card stats and multiplayer settings.",
    area: "arena",
    section: "operations",
    kind: "route",
    path: "/admin/play",
    oldLocation: "/admin/play — linked only from the master-only header strip",
    disposition: "ARCHIVE",
    legacyRoutes: ["/admin/play"],
    dangerLevel: "caution",
    warning: "Writes the live play-hub layout.",
    status: "Legacy",
    authorization:
      "AdminRoute (admin, master_admin) — unchanged. Its internal moderator branch remains unreachable, exactly as before.",
  },
  {
    id: "arena-gaming",
    title: "Gaming Config",
    description:
      "Nine tabs: swipe games, swipe tab, first game, aura check, multiplayer, league display, ads, animations and sounds.",
    area: "arena",
    section: "operations",
    kind: "route",
    path: "/admin/gaming",
    oldLocation: "/admin/gaming — linked only from the master-only header strip",
    disposition: "ARCHIVE",
    legacyRoutes: ["/admin/gaming"],
    dangerLevel: "caution",
    warning: "Writes live game and advertising configuration.",
    status: "Legacy",
    authorization: "AdminRoute (admin, master_admin) — unchanged.",
    notes:
      "Its Aura Check tab is the same component /moderator mounts, and its Multiplayer tab configures a feature whose user routes now redirect. Both preserved.",
  },
  {
    id: "arena-demo",
    title: "Demo Studio",
    description: "Card and preset presentation sandbox.",
    area: "arena",
    section: "operations",
    kind: "route",
    path: "/admin/demo",
    oldLocation: "/admin/demo",
    disposition: "ARCHIVE",
    legacyRoutes: ["/admin/demo"],
    dangerLevel: "none",
    status: "Legacy",
    authorization:
      "AdminRoute (admin, master_admin) — unchanged. Its moderator and demo_access branches remain unreachable, exactly as before.",
  },
  {
    id: "arena-preset-items-orphan",
    title: "Preset Items Editor (orphaned)",
    description:
      "A 405-line preset item editor with seven write paths. Imported by nothing and reachable from nowhere.",
    area: "arena",
    section: "collections",
    kind: "gap",
    oldLocation: "components/admin/AdminPresetItems.tsx — zero imports anywhere in src/",
    disposition: "DEFERRED",
    dangerLevel: "caution",
    warning: "Seven unreviewed write paths against preset item data.",
    status: "Legacy",
    authorization: "n/a — not mounted anywhere.",
    notes:
      "DEFERRED — deliberately NOT mounted. It is unreachable today, so mounting it would ADD a capability rather than preserve one. The file is untouched; recorded here so it is no longer invisible. Owner decision.",
  },
  {
    id: "arena-swipe-ad-override",
    title: "Swipe Staff Ad Override",
    description: "Staff QA override of the ad gate on the swipe pages.",
    area: "arena",
    section: "operations",
    kind: "embedded",
    path: "/swipe-game",
    oldLocation: "/swipe-game, /swipe/preset/:id — inline user_roles read",
    disposition: "KEEP",
    dangerLevel: "none",
    status: "Legacy",
    authorization: "Inline user_roles read (admin / master_admin / moderator) — unchanged.",
    notes: "Kept in place; documented so it is visible to an inventory.",
  },
  {
    id: "shop-grant-diamonds",
    title: "Grant Diamonds",
    description: "Direct economy mutation embedded in the shop.",
    area: "people",
    section: "users",
    kind: "embedded",
    path: "/shop",
    oldLocation: "/shop — inline user_roles read",
    disposition: "KEEP",
    dangerLevel: "mutates-production",
    warning: "Mints currency directly into a user's balance.",
    status: "Production",
    authorization: "Inline user_roles read — unchanged.",
    notes:
      "Kept in place as a contextual affordance. Whether it moves into Users is an owner decision (IA §O.7); it is recorded here so it is no longer invisible.",
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
    ARCHIVE: 0,
    "DEVELOPER-ONLY": 0,
    DEFERRED: 0,
  } as Record<AdminDisposition, number>;
  for (const tool of ADMIN_TOOLS) counts[tool.disposition] += 1;
  return counts;
}
