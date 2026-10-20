/**
 * Notifications 2.0 (#92) — the product policy, in one place.
 *
 * The database is authoritative: classification, expiry and resolution happen
 * in 20261019120000_notifications_v2_lifecycle.sql, and the inbox RPCs filter
 * on the server. This module is the client's statement of the SAME policy, for
 * labels, routing and the legacy fallback. notificationsV2Policy.test.ts runs
 * the SQL classifier over a table of types and pins it to the functions here,
 * so the two cannot drift apart unnoticed.
 *
 * Lifecycle vocabulary (per recipient unless noted):
 *   unread → read      seen; the badge counts unread ACTIVE items only
 *   done               removed from my active inbox (never deleted for anyone)
 *   saved              kept for later; survives expiry
 *   expired (shared)   routine item past its category's lifetime
 *   resolved (shared)  the underlying issue was handled, by its own workflow
 */
import { FEEDBACK_STATUS_PUBLIC_LABELS, type FeedbackStatus } from "@/lib/feedback/contract";
import { questionReportReasonLabel } from "@/lib/feedback/report-context";

export type AdminCategory = "action" | "community" | "platform";
export type AdminTab = AdminCategory | "completed" | "saved";
export type Priority = "critical" | "high" | "normal" | "low";
export type ItemState = "active" | "done" | "expired" | "resolved";

export type PlayerCategory =
  | "social"
  | "feedback"
  | "progress"
  | "announcement"
  | "account"
  | "security"
  | "comment"
  | "legacy"
  | "other";

export const ADMIN_TABS: ReadonlyArray<{ id: AdminTab; label: string; description: string }> = [
  {
    id: "action",
    label: "Action required",
    description: "Reports, moderation and critical problems. Stays here until the underlying item is resolved.",
  },
  {
    id: "community",
    label: "Community",
    description: "Player feedback and suggestions. Leaves the inbox after 30 days unless saved.",
  },
  {
    id: "platform",
    label: "Platform",
    description: "Routine operational updates. Leaves the inbox after 7 days unless saved.",
  },
  {
    id: "completed",
    label: "Completed",
    description: "Resolved, done and expired items — the full history, nothing is deleted.",
  },
  { id: "saved", label: "Saved", description: "Items you kept for later." },
];

/** Category lifetimes in days; null = never expires. Mirrors the SQL. */
export const ADMIN_EXPIRY_DAYS: Record<AdminCategory, number | null> = {
  action: null,
  community: 30,
  platform: 7,
};

export const ADMIN_ACTION_TYPES = new Set([
  "comment_report",
  "image_report",
  "image_report_critical",
  "user_report",
  "mod_delete_request",
  "mod_action",
]);

export interface FeedbackDigest {
  entry_intent?: string | null;
  type?: string | null;
  severity?: string | null;
  status?: string | null;
  reason?: string | null;
  question_prompt?: string | null;
  selected_answer?: string | null;
  canonical_answer?: string | null;
  has_evidence?: boolean | null;
  mode?: string | null;
  page_url?: string | null;
}

/** Mirror of public.notification_admin_profile(): category and priority. */
export function classifyAdmin(
  type: string,
  feedback: FeedbackDigest | null = null,
  metadata: Record<string, unknown> | null = null,
): { category: AdminCategory; priority: Priority } {
  const intent = feedback?.entry_intent ?? null;
  const fbType = feedback?.type ?? null;
  const severity = feedback?.severity ?? null;
  const blockingBug = type === "feedback" && fbType === "bug" && severity === "blocking";
  const isReport = type === "feedback" && (intent === "question_report" || intent === "page_report");

  let category: AdminCategory;
  if (ADMIN_ACTION_TYPES.has(type) || isReport || blockingBug) category = "action";
  else if (type === "feedback") category = "community";
  else category = "platform";

  let priority: Priority;
  if (type === "image_report_critical") priority = "critical";
  else if (type === "comment_report" && metadata?.auto_hidden === true) priority = "critical";
  else if (blockingBug) priority = "critical";
  else if (["comment_report", "user_report", "mod_delete_request", "mod_action"].includes(type)) priority = "high";
  else if (type === "feedback" && (isReport || severity === "major")) priority = "high";
  else if (type === "image_report" || type === "feedback") priority = "normal";
  else priority = "low";

  return { category, priority };
}

/** Mirror of public.notification_user_profile(): the player category. */
export function classifyPlayer(type: string): PlayerCategory {
  switch (type) {
    case "friend_request":
    case "friend_accepted":
      return "social";
    case "comment_reply":
    case "comment_reaction":
      return "comment";
    case "feedback_update":
      return "feedback";
    case "achievement_unlocked":
    case "progression_milestone":
      return "progress";
    case "warning":
      return "account";
    case "security_notice":
      return "security";
    case "general":
    case "update":
    case "lol_quiz":
    case "quiz_broadcast":
    case "combat_lab":
    case "lol_patch":
    case "esports_quiz":
    case "lol_site_notice":
      return "announcement";
    case "new_item":
    case "elo_milestone":
    case "new_league":
    case "promotion":
    case "spotlight":
      return "legacy";
    default:
      return "other";
  }
}

/** Categories a player ever sees. comment (not activated), legacy and unknown never render. */
export const PLAYER_VISIBLE_CATEGORIES: ReadonlySet<PlayerCategory> = new Set([
  "social",
  "feedback",
  "progress",
  "announcement",
  "account",
  "security",
]);

/** What a player may switch off. account/security are absent by construction (DB CHECK too). */
export const MUTABLE_PLAYER_CATEGORIES: ReadonlyArray<{ id: PlayerCategory; label: string; description: string }> = [
  { id: "social", label: "Friends", description: "Friend requests and accepted requests." },
  { id: "feedback", label: "Report updates", description: "When the team moves a report or suggestion you sent." },
  { id: "progress", label: "Progress", description: "Milestones and achievements." },
  { id: "announcement", label: "Announcements", description: "Game and product news." },
];

export const LOCKED_PLAYER_CATEGORIES: ReadonlyArray<{ id: PlayerCategory; label: string }> = [
  { id: "account", label: "Account notices" },
  { id: "security", label: "Security notices" },
];

export const isPlayerVisibleType = (type: string | null | undefined): boolean =>
  typeof type === "string" && PLAYER_VISIBLE_CATEGORIES.has(classifyPlayer(type));

export const PRIORITY_LABELS: Record<Priority, string> = {
  critical: "Critical",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const RESOLUTION_LABELS: Record<string, string> = {
  approved: "Approved",
  denied: "Denied",
  completed: "Resolved",
  declined: "Declined",
  archived: "Archived",
  resolved_report: "Report resolved",
  dismissed_report: "Report dismissed",
  hidden_by_admin: "Comment hidden",
  restored: "Comment restored",
  dismissed: "Dismissed",
  actioned: "Actioned",
  subject_deleted: "Record deleted",
  merged: "Merged into newer alert",
  superseded: "Superseded",
  accepted: "Accepted",
  withdrawn: "Withdrawn",
};

export const resolutionLabel = (resolution: string | null | undefined): string =>
  (resolution && RESOLUTION_LABELS[resolution]) || "Resolved";

export const feedbackStatusLabel = (status: string | null | undefined): string =>
  (status && FEEDBACK_STATUS_PUBLIC_LABELS[status as FeedbackStatus]) || "Received";

export const feedbackReasonLabel = (reason: string | null | undefined): string | null =>
  reason ? questionReportReasonLabel(reason) : null;

export const ADMIN_NOTIFICATIONS_PATH = "/admin/operations?section=notifications";

/** The notification's own permalink: the admin inbox opened on exactly this item. */
export const adminNotificationPermalink = (id: string): string =>
  `${ADMIN_NOTIFICATIONS_PATH}&notification=${encodeURIComponent(id)}`;

/**
 * Where an admin notification takes you: always ONE specific record, by stable
 * id — never a list position, search text or a generic landing page.
 *
 *   feedback / question & page reports → the feedback view, record expanded
 *   user reports                        → the reports view, report highlighted
 *   comment reports                     → the comments view, comment highlighted
 *   moderator requests                  → the moderator queue, request highlighted
 *   image reports, platform/system      → the notification's own permalink, whose
 *                                         detail card shows the record (the image
 *                                         and its hide/restore control live there,
 *                                         since the legacy image product has no
 *                                         admin page of its own)
 *
 * `focus` is the record id the destination opens; `from_notification` lets it
 * mark THIS notification read once — and only once — the record has actually
 * opened. A record that was deleted sends you to the permalink instead, which
 * explains what happened.
 */
export function adminRecordLink(item: {
  id: string;
  subjectType: string | null;
  subjectId: string | null;
  resolution?: string | null;
}): { href: string; label: string; kind: "record" | "notification" } {
  const permalink = { href: adminNotificationPermalink(item.id), label: "Open details", kind: "notification" as const };
  if (item.resolution === "subject_deleted") return permalink;
  const target = item.subjectType === "mod_request" ? item.id : item.subjectId;
  if (!target) return permalink;
  const q = `&focus=${encodeURIComponent(target)}&from_notification=${encodeURIComponent(item.id)}`;
  switch (item.subjectType) {
    case "feedback":
      return { href: `/admin/users?section=moderation&view=feedback${q}`, label: "Open feedback", kind: "record" };
    case "user_report":
      return { href: `/admin/users?section=moderation&view=reports${q}`, label: "Open report", kind: "record" };
    case "comment":
      return { href: `/admin/users?section=moderation&view=comments${q}`, label: "Open comment", kind: "record" };
    case "mod_request":
      return { href: `/admin/users?section=moderation&view=mod-config${q}`, label: "Review request", kind: "record" };
    case "image":
      return { ...permalink, label: "Open image" };
    default:
      return permalink;
  }
}

/** Unresolved Action Required work leaves the inbox only by being resolved. */
export const canMarkDone = (item: { category: string; resolvedAt: string | null }): boolean =>
  !(item.category === "action" && !item.resolvedAt);

/**
 * Alerts with no workflow of their own may be resolved from the inbox. Feedback,
 * user reports and moderator requests are resolved where they live — the
 * server refuses the shortcut, and the UI does not offer it.
 */
export const canResolveFromInbox = (item: { subjectType: string | null; resolvedAt: string | null }): boolean =>
  !item.resolvedAt &&
  item.subjectType !== "feedback" &&
  item.subjectType !== "user_report" &&
  item.subjectType !== "mod_request";

/** Compact relative time; the absolute time goes in the element's title. */
export function formatRelative(iso: string, nowMs: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((nowMs - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString();
}
