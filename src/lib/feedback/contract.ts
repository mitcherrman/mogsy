/**
 * FB1 — Feedback Center shared contract.
 *
 * The single source of truth for the vocabulary that FB1's UI, its admin
 * surface and the database agree on. Every union here is mirrored by a CHECK
 * constraint in supabase/migrations/20260812120000_fb1_feedback_foundation.sql;
 * contract.test.ts asserts the two never drift apart.
 *
 * This module is types and constants only — no components, no Supabase calls.
 * FB1-2 builds the form on top of it.
 */

/**
 * The four doors of the Feedback Center. This is what the user chose, and it is
 * never rewritten — including by admins, who reclassify {@link FeedbackType}
 * instead. Keeping the two apart is what lets us answer "is gameplay feedback
 * actually arriving?" after a report has been retriaged.
 */
export const FEEDBACK_ENTRY_INTENTS = ["bug", "feature", "gameplay", "other"] as const;
export type FeedbackEntryIntent = (typeof FEEDBACK_ENTRY_INTENTS)[number];

/**
 * The triage workflow: reproduce it, weigh it, or read it. Derived from the
 * entry intent server-side on insert, then owned by admins.
 */
export const FEEDBACK_TYPES = ["bug", "feature", "feedback"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/**
 * Entry intent -> triage type. Mirrors normalize_feedback_submission(). The
 * database is authoritative: whatever `type` a client sends on insert is
 * overwritten. This map exists so the UI can predict the outcome, not set it.
 */
export const ENTRY_INTENT_TO_TYPE: Record<FeedbackEntryIntent, FeedbackType> = {
  bug: "bug",
  feature: "feature",
  gameplay: "feedback",
  other: "feedback",
};

/** User-facing labels for the four entry points. */
export const ENTRY_INTENT_LABELS: Record<FeedbackEntryIntent, string> = {
  bug: "Report a Bug",
  feature: "Request a Feature",
  gameplay: "Gameplay Feedback",
  other: "Other Feedback",
};

/**
 * User-reported impact, bugs only. Distinct from `priority`, which stays
 * admin-owned: severity is "how badly did this block you", priority is "when
 * will I fix it". Letting users set priority makes every report critical.
 */
export const FEEDBACK_SEVERITIES = ["blocking", "major", "minor"] as const;
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

export const FEEDBACK_SEVERITY_LABELS: Record<FeedbackSeverity, string> = {
  blocking: "Blocking — I could not continue",
  major: "Major — it got in the way",
  minor: "Minor — cosmetic or small",
};

export const FEEDBACK_REPRODUCIBILITIES = ["always", "sometimes", "once"] as const;
export type FeedbackReproducibility = (typeof FEEDBACK_REPRODUCIBILITIES)[number];

export const FEEDBACK_REPRODUCIBILITY_LABELS: Record<FeedbackReproducibility, string> = {
  always: "Every time",
  sometimes: "Sometimes",
  once: "Happened once",
};

/**
 * Product areas, audited against the six LolHub destinations (LolHub.tsx) and
 * the /quiz sub-routes on main. This is classification data only — FB1 reads no
 * mode's code and imports nothing from Ranked, Daily, Stat Check or Combat Lab.
 *
 * Deliberately absent:
 *   "Meta Reflex"  — not a destination; it lives inside Leaguecraft and the
 *                    League Swipe hub subsection is behind SHOW_SWIPE_GAMES=false.
 *   "Mobile / UI"  — a dimension, not an area. A mobile bug in Ranked is a
 *                    Ranked bug; the viewport is captured automatically.
 *   "Mechanics Explorer" — /lol/mechanics is not on main yet (MECH1 5B1).
 *
 * The database seeds this same list into app_settings.feedback_config, which
 * stays the runtime authority so the owner can edit it without a deploy.
 */
export const FEEDBACK_CATEGORIES = [
  "General",
  "Leaguecraft",
  "Daily Challenge",
  "Ranked",
  "Stat Check",
  "Combat Lab",
  "Mastery",
  "Mogzy Archives",
  "Patch Reports",
  "Quiz History",
  "Account & Profile",
  "Performance",
  "Other",
] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

/**
 * Route prefix -> product area, longest prefix wins. Lets the Feedback Center
 * preselect a category from where the user came from, so no contextual "Report
 * a problem" button has to be injected into an active mode's surface.
 */
export const ROUTE_CATEGORY_PREFIXES: ReadonlyArray<readonly [string, FeedbackCategory]> = [
  ["/quiz/daily", "Daily Challenge"],
  ["/quiz/ranked", "Ranked"],
  ["/quiz/stat-check", "Stat Check"],
  ["/quiz/mastery", "Mastery"],
  ["/quiz", "Leaguecraft"],
  ["/combat-lab", "Combat Lab"],
  ["/lol/patch-reports", "Patch Reports"],
  ["/lol/history", "Quiz History"],
  ["/lol/missed-questions", "Quiz History"],
  ["/lol/docs", "Mogzy Archives"],
  ["/profile", "Account & Profile"],
  ["/settings", "Account & Profile"],
  ["/auth", "Account & Profile"],
];

/** Resolve a pathname to its product area, or "General" if nothing matches. */
export function categoryForRoute(pathname: string): FeedbackCategory {
  let best: FeedbackCategory = "General";
  let bestLength = 0;
  for (const [prefix, category] of ROUTE_CATEGORY_PREFIXES) {
    if (pathname.startsWith(prefix) && prefix.length > bestLength) {
      best = category;
      bestLength = prefix.length;
    }
  }
  return best;
}

/**
 * Workflow status. This is the vocabulary already shipped in the database and
 * written by AdminFeedback.tsx today — FB1 preserves it rather than renaming
 * live rows for tidiness. No CHECK constraint pins it, so treat any unknown
 * value as "received" when rendering.
 */
export const FEEDBACK_STATUSES = [
  "open",
  "in-progress",
  "planned",
  "completed",
  "declined",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** What the submitter is shown. "declined" reads as closed, not rejected. */
export const FEEDBACK_STATUS_PUBLIC_LABELS: Record<FeedbackStatus, string> = {
  open: "Received",
  "in-progress": "In progress",
  planned: "Planned",
  completed: "Resolved",
  declined: "Closed",
};

/**
 * Admin-only columns on public.feedback. Never selected by a user-facing query:
 * the submitter read path is the list_my_feedback() RPC, whose RETURNS TABLE
 * contract omits all of these and cannot be widened by a caller.
 *
 * NOTE (pre-existing, not introduced by FB1): the column-level REVOKE that is
 * supposed to hide `admin_notes` is a no-op on this project, because
 * ALTER DEFAULT PRIVILEGES grants SELECT at table level and a column REVOKE
 * cannot subtract from that. See the header of
 * 20260812120000_fb1_feedback_foundation.sql. Until Feedback.tsx moves off
 * .select("*") in FB1-3, treat every column on this table as readable by its
 * submitter.
 */
export const FEEDBACK_ADMIN_ONLY_FIELDS = [
  "admin_notes",
  "client_meta",
  "duplicate_of",
] as const;

/**
 * Diagnostics captured automatically at submit time. Strictly allow-listed: the
 * form sends these keys and nothing else, so no identifier can be swept up by
 * accident. Notably absent — IP address, geolocation, and anything read from
 * localStorage or the session.
 */
export interface FeedbackClientMeta {
  /** navigator.userAgent, truncated. Identifies browser and OS family. */
  ua?: string;
  /** "1280x800". Distinguishes a mobile layout bug from a desktop one. */
  viewport?: string;
  /** Build identifier, so a report can be tied to what was deployed. */
  app_version?: string;
}

export const FEEDBACK_CLIENT_META_KEYS: ReadonlyArray<keyof FeedbackClientMeta> = [
  "ua",
  "viewport",
  "app_version",
];

/**
 * Thrown by the enforce_feedback_rate_limit() trigger. The database raises this
 * exact token as the message; the human sentence lives here so it can be
 * changed and translated without a migration.
 */
export const FEEDBACK_RATE_LIMIT_ERROR = "feedback_rate_limit_exceeded";
export const FEEDBACK_RATE_LIMIT_PER_HOUR = 5;
export const FEEDBACK_RATE_LIMIT_MESSAGE =
  "You've sent a few reports in a short time. Please try again in a little while.";

/** Field length caps. Mirrored by CHECK constraints where the database enforces them. */
export const FEEDBACK_LIMITS = {
  title: 200,
  body: 4000,
  expectedResult: 1000,
  actualResult: 1000,
  evidenceUrl: 2040,
  screenshotPath: 512,
  pageUrl: 512,
} as const;

/** The submitter-visible shape returned by list_my_feedback(). */
export interface MyFeedbackRow {
  id: string;
  entry_intent: FeedbackEntryIntent;
  type: FeedbackType;
  category: string;
  title: string;
  body: string;
  status: string;
  severity: FeedbackSeverity | null;
  reproducibility: FeedbackReproducibility | null;
  expected_result: string | null;
  actual_result: string | null;
  evidence_url: string | null;
  screenshot_path: string | null;
  page_url: string | null;
  page_reference: string | null;
  created_at: string;
  updated_at: string;
}
