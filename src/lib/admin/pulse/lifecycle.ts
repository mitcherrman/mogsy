// ---------------------------------------------------------------------------
// PULSE-2B — content lifecycle: what a record is at a moment, and which
// owner actions may move it. Pure; the server applies the same table
// (pulse_admin_transition_item) and is the authority.
//
//   draft ──publish/schedule──► published ──unpublish──► unpublished
//     ▲                            │  ▲                      │
//     └───── revert-to-draft ──────┼──┴──── publish/schedule ┘
//                                  ▼
//   archived ◄──── archive (from draft or unpublished only)
//
// "published" splits by the clock into scheduled (publishAt in the future),
// live, and expired (expiresAt reached). Live content must be unpublished
// before it can be archived, so nothing leaves the public Home Hub by accident.
// ---------------------------------------------------------------------------

import type { PulseContentRecord, PulseEditorialState, PulseEffectiveStatus, PulseItemTransition } from "./contract";

function ms(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function effectiveStatus(
  record: Pick<PulseContentRecord, "state" | "publishAt" | "expiresAt">,
  now: Date,
): PulseEffectiveStatus {
  if (record.state !== "published") return record.state;
  const t = now.getTime();
  const end = ms(record.expiresAt);
  if (end !== null && end <= t) return "expired";
  const start = ms(record.publishAt);
  if (start !== null && start > t) return "scheduled";
  return "live";
}

export const STATUS_LABEL: Record<PulseEffectiveStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
  expired: "Expired",
  unpublished: "Unpublished",
  archived: "Archived",
};

const ALLOWED: Record<PulseEditorialState, ReadonlySet<PulseItemTransition["action"]>> = {
  draft: new Set(["publish", "schedule", "archive"]),
  published: new Set(["unpublish", "schedule"]),
  unpublished: new Set(["publish", "schedule", "revert-to-draft", "archive"]),
  archived: new Set(["revert-to-draft"]),
};

export function canTransition(state: PulseEditorialState, action: PulseItemTransition["action"]): boolean {
  return ALLOWED[state].has(action);
}

export function allowedTransitions(state: PulseEditorialState): PulseItemTransition["action"][] {
  return [...ALLOWED[state]];
}

/** The fields a transition writes (the server stamps the times itself). */
export function applyTransition(
  record: PulseContentRecord,
  t: PulseItemTransition,
  nowIso: string,
): Pick<PulseContentRecord, "state" | "publishAt" | "publishedAt"> {
  switch (t.action) {
    case "publish":
      return { state: "published", publishAt: null, publishedAt: nowIso };
    case "schedule":
      return { state: "published", publishAt: t.publishAt, publishedAt: record.publishedAt ?? nowIso };
    case "unpublish":
      return { state: "unpublished", publishAt: record.publishAt, publishedAt: record.publishedAt };
    case "archive":
      return { state: "archived", publishAt: record.publishAt, publishedAt: record.publishedAt };
    case "revert-to-draft":
      return { state: "draft", publishAt: null, publishedAt: record.publishedAt };
  }
}
