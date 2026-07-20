// ---------------------------------------------------------------------------
// Admin Directory registry — the single descriptive source of truth for the
// /admin/directory page (and, later, the homepage admin shortcut).
//
// Purely descriptive: it records verified, already-registered destinations and
// never generates router declarations. Route registration stays in App.tsx.
// Legacy aliases are metadata only — the aliases keep working via their
// existing redirects and must never be rendered as primary cards.
// ---------------------------------------------------------------------------

/** Canonical path of the directory page itself. */
export const ADMIN_DIRECTORY_PATH = "/admin/directory";

export const ADMIN_DIRECTORY_CATEGORIES = [
  "Quiz Content",
  "Broadcast",
  "Data & Documentation",
  "Site Operations",
  "Development & QA",
] as const;
export type AdminDirectoryCategory = (typeof ADMIN_DIRECTORY_CATEGORIES)[number];

/** Textual status label — always rendered as text, never color alone. */
export type AdminDirectoryStatus =
  | "Production"
  | "Internal"
  | "Prototype"
  | "Development"
  | "Public Preview";

export type AdminDangerLevel = "none" | "caution" | "mutates-production";

export interface AdminDirectoryChildAction {
  label: string;
  /** Full internal path, including any required query string. */
  path: string;
  /** Open in a new tab (capture/OBS surfaces only). */
  newTab?: boolean;
  /** Short textual note rendered next to the action (e.g. "public OBS viewer"). */
  note?: string;
}

export interface AdminDirectoryItem {
  id: string;
  title: string;
  description: string;
  /** Canonical internal path (no query string; child actions carry those). */
  path: string;
  category: AdminDirectoryCategory;
  status: AdminDirectoryStatus;
  /** "all" renders everywhere; "development" only when the build is a dev build. */
  environment: "all" | "development";
  dangerLevel: AdminDangerLevel;
  /** Explicit textual warning shown on the card when dangerLevel !== "none". */
  warning?: string;
  /** Extra role requirement beyond standard admin (e.g. "master_admin"). */
  requiredRole?: string;
  /** Old paths that redirect into this destination — metadata, never cards. */
  legacyAliases?: string[];
  childActions?: AdminDirectoryChildAction[];
}

export const ADMIN_DIRECTORY_ITEMS: AdminDirectoryItem[] = [
  // --- Quiz Content --------------------------------------------------------
  {
    id: "quiz-content-workspace",
    title: "Quiz Content Workspace",
    description:
      "Unified workspace for building, reviewing, and curating quiz and Ranked Duel content.",
    path: "/admin/quiz-content",
    category: "Quiz Content",
    status: "Production",
    environment: "all",
    dangerLevel: "none",
    legacyAliases: ["/admin/quiz-builder", "/admin/quiz-review", "/admin/workspace"],
    childActions: [
      { label: "Quiz Builder", path: "/admin/quiz-content?tab=builder" },
      { label: "Quiz Review", path: "/admin/quiz-content?tab=review" },
      { label: "Ranked Duel Review", path: "/admin/quiz-content?tab=ranked-duel" },
    ],
  },
  {
    id: "quiz-admin-hub",
    title: "Quiz Admin Hub",
    description: "Standalone quiz administration and operations hub.",
    path: "/quiz/admin",
    category: "Quiz Content",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },

  // --- Broadcast -----------------------------------------------------------
  {
    id: "quiz-broadcast-studio",
    title: "Quiz Broadcast Studio",
    description: "Live quiz broadcast control room for streams and OBS capture.",
    path: "/admin/quiz-broadcast",
    category: "Broadcast",
    status: "Production",
    environment: "all",
    dangerLevel: "mutates-production",
    warning: "Publishes changes to the live public broadcast state.",
    childActions: [
      {
        label: "Window-capture view",
        path: "/admin/quiz-broadcast/view",
        newTab: true,
        note: "admin capture surface",
      },
      {
        label: "Live view",
        path: "/broadcast/live-view",
        newTab: true,
        note: "public OBS viewer surface",
      },
    ],
  },
  {
    id: "quiz-video-export",
    title: "Quiz Video Export",
    description: "Render and export quiz content as video assets.",
    path: "/admin/quiz-video-export",
    category: "Broadcast",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },

  // --- Data & Documentation ------------------------------------------------
  {
    id: "knowledge-admin",
    title: "Knowledge Base Admin",
    description: "Champion knowledge base curation: queue, review, health, and rundown.",
    path: "/admin/knowledge",
    category: "Data & Documentation",
    status: "Production",
    environment: "all",
    dangerLevel: "caution",
    warning: "Edits published champion knowledge content.",
    requiredRole: "master_admin",
    childActions: [
      { label: "Queue", path: "/admin/knowledge/queue" },
      { label: "Health", path: "/admin/knowledge/health" },
      { label: "Rundown", path: "/admin/knowledge/rundown" },
    ],
  },
  {
    id: "blog-cms",
    title: "Blog CMS",
    description: "Write, edit, and publish Mogzy blog posts.",
    path: "/admin/blog",
    category: "Data & Documentation",
    status: "Production",
    environment: "all",
    dangerLevel: "caution",
    warning: "Publishes public blog content.",
  },
  {
    id: "internal-docs",
    title: "Internal Docs",
    description: "Internal architecture and route documentation for the site.",
    path: "/admin/about",
    category: "Data & Documentation",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },

  // --- Site Operations -----------------------------------------------------
  {
    id: "admin-dashboard",
    title: "Admin Dashboard",
    description: "The existing top-level admin dashboard and its operational panels.",
    path: "/admin",
    category: "Site Operations",
    status: "Production",
    environment: "all",
    dangerLevel: "none",
  },
  {
    id: "combat-sim-battles",
    title: "Combat Sim Battles",
    description:
      "Create, validate, publish, void, and settle Combat Sim Battle events. The server derives all results — no winner/outcome/score input.",
    path: "/admin/combat-battles",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "mutates-production",
    warning: "Publishing and settling write immutable live event state.",
  },
  {
    id: "admin-diagnostics",
    title: "Site Diagnostics",
    description: "Admin diagnostics, route registry, and internal health pages.",
    path: "/admin/diagnostics",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },
  {
    id: "admin-play-ops",
    title: "Play Operations",
    description: "Operational tooling for the Play experience.",
    path: "/admin/play",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },
  {
    id: "admin-data-ops",
    title: "Data Operations",
    description: "Operational data management tooling.",
    path: "/admin/data",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "caution",
    warning: "Operates on production data.",
  },
  {
    id: "admin-demo-ops",
    title: "Demo Operations",
    description: "Demo content and presentation tooling.",
    path: "/admin/demo",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },
  {
    id: "admin-gaming-ops",
    title: "Gaming Operations",
    description: "Gaming and league operational tooling.",
    path: "/admin/gaming",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
  },
  {
    id: "moderator-tools",
    title: "Moderator Tools",
    description:
      "Broader-role operational tooling shared with moderators — not admin-only administration.",
    path: "/moderator",
    category: "Site Operations",
    status: "Internal",
    environment: "all",
    dangerLevel: "none",
    requiredRole: "moderator+",
  },

  // --- Development & QA (dev builds only) ----------------------------------
  {
    id: "dev-ranked-duel-prototype",
    title: "Ranked Duel Prototype",
    description: "E2-owned Ranked Duel prototype with local mock state. Do not modify from here.",
    path: "/dev/ranked-duel",
    category: "Development & QA",
    status: "Prototype",
    environment: "development",
    dangerLevel: "none",
  },
  {
    id: "dev-quiz-render",
    title: "Quiz Render Harness",
    description: "Screenshot render harness for social-format quiz captures (inert without injected data).",
    path: "/dev/quiz-render",
    category: "Development & QA",
    status: "Development",
    environment: "development",
    dangerLevel: "none",
  },
  {
    id: "dev-content-studio",
    title: "Content Post Studio",
    description: "Local content post studio driving the loopback studio server.",
    path: "/dev/content-studio",
    category: "Development & QA",
    status: "Development",
    environment: "development",
    dangerLevel: "none",
  },
  {
    id: "quiz-diagnostics",
    title: "Quiz Diagnostics",
    description: "Public quiz diagnostics page used for QA checks.",
    path: "/quiz/diagnostics",
    category: "Development & QA",
    status: "Public Preview",
    environment: "development",
    dangerLevel: "none",
  },
  {
    id: "combat-lab-diagnostics",
    title: "Combat Lab Diagnostics",
    description: "Public Combat Lab diagnostics page used for QA checks.",
    path: "/combat-lab/diagnostics",
    category: "Development & QA",
    status: "Public Preview",
    environment: "development",
    dangerLevel: "none",
  },
];

/** Items visible for the given build mode (dev entries only in dev builds). */
export function visibleAdminDirectoryItems(
  includeDevelopment: boolean,
): AdminDirectoryItem[] {
  return ADMIN_DIRECTORY_ITEMS.filter(
    (item) => item.environment === "all" || includeDevelopment,
  );
}

export interface AdminDirectoryGroup {
  category: AdminDirectoryCategory;
  items: AdminDirectoryItem[];
}

/** Visible items grouped in stable category order; empty categories omitted. */
export function groupedAdminDirectoryItems(
  includeDevelopment: boolean,
): AdminDirectoryGroup[] {
  const visible = visibleAdminDirectoryItems(includeDevelopment);
  return ADMIN_DIRECTORY_CATEGORIES.map((category) => ({
    category,
    items: visible.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}
