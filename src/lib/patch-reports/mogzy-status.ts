import type { MogzyStatus, PatchReconciliation, PatchReportChange } from "./api";

/**
 * The consumer vocabulary for Mogzy's data status (PHSR1).
 *
 * Two different questions sit beside every Riot patch line, and a player must
 * never mistake one for the other:
 *
 *   1. What did Riot change?           — the patch note. Authoritative, always.
 *   2. Has MOGZY's own data caught up? — everything in this module.
 *
 * The backend enums (`MogzyStatus`, the reconciliation terminal states) are
 * untouched and stay visible under "Technical details". This module only
 * decides how they read.
 *
 * TIMING, which every sentence below respects: a line's `mogzy_status` and
 * `mogzy_current_raw` are recorded when the report is BUILT (`promote-report`),
 * which runs BEFORE Mogzy updates its data (`reconcile-knowledge`). A line built
 * as `mismatch` may since have been applied — Draven 26.19 Base AD was built
 * with Mogzy holding 62 and Mogzy has held Riot's 64 since reconciliation. So no
 * line-level copy claims "pending" or "currently": it says what Mogzy held when
 * the report was built, and points at the report's data status for what
 * happened after.
 */

// ── line-level labels ─────────────────────────────────────────────────────────

/**
 * Old → new, and why each new label stays true for every way the backend
 * resolver produces the status (`knowledge_engine/patch_report/resolver.py`):
 *
 * - `matches`   Mogzy's value already equalled Riot's new value at build.
 * - `applied`   …and Mogzy applied that value itself.
 * - `pending`   Different at build, with an update proposal awaiting review.
 * - `mismatch`  Mogzy holds this value and it was flagged at build. For a plain
 *               value, Mogzy's number differed from Riot's new one; for a
 *               FORMULA the resolver flags every line without comparing (the
 *               formula check happens during the data update). "Flagged" is true
 *               of both. "Update pending" would not be: many are applied, some
 *               are held for review, none is promised.
 * - `unresolved`  Mogzy maps the property but could not find the entity, or has
 *               no stored value for it.
 * - `needs_interpretation`  Riot described the change in words, or in a value
 *               shape Mogzy cannot read as numbers. Nothing compares it
 *               automatically. "Needs review" would promise a review that, for
 *               a prose note, nobody is going to do.
 * - `not_represented`  No Mogzy property holds this number at all.
 */
export const MOGZY_STATUS_LABEL: Record<MogzyStatus, string> = {
  matches: "Mogzy data current",
  applied: "Mogzy data updated",
  pending: "Mogzy update in review",
  mismatch: "Mogzy data update flagged",
  unresolved: "Not yet matched to Mogzy data",
  needs_interpretation: "Not auto-checked by Mogzy",
  not_represented: "Not modeled by Mogzy",
};

/** One-sentence gloss for a status, used where only the status is known. */
export const MOGZY_STATUS_GLOSS: Record<MogzyStatus, string> = {
  matches: "Mogzy's data already had Riot's new value when this report was built.",
  applied: "Mogzy has updated its data to Riot's new value.",
  pending: "When this report was built, a Mogzy data update for this was waiting for review.",
  mismatch: "When this report was built, Mogzy's data had not caught up with this change yet.",
  unresolved: "Mogzy couldn't match this to an entry in its data, so it hasn't been checked.",
  needs_interpretation:
    "Riot's change isn't in a form Mogzy can compare with its data automatically.",
  not_represented: "Mogzy doesn't model this value, so its calculations don't include it.",
};

/** States describing Mogzy as already holding Riot's new value. */
const CURRENT: ReadonlySet<MogzyStatus> = new Set(["matches", "applied"]);

/**
 * Mogzy properties the backend stores as an expression rather than a number
 * (the adapters declaring `value_type="formula"`). Their "value" is a formula
 * string, which is technical evidence, not something to put in a sentence.
 */
export function isFormulaEvidence(change: PatchReportChange): boolean {
  return /_formula$/.test(change.mogzy_property ?? "");
}

/**
 * The plain-English explanation of one line's Mogzy status, in reading order.
 * `impactScoped`: the line carries a Mogzy Impact analysis, which works from
 * Riot's published numbers and should never look as though it disagrees.
 */
export function explainChangeStatus(
  change: PatchReportChange,
  { impactScoped = false }: { impactScoped?: boolean } = {},
): string[] {
  const status = change.mogzy_status;
  const value = change.mogzy_current_raw?.trim() || null;
  const formula = isFormulaEvidence(change);
  const out: string[] = [];

  switch (status) {
    case "mismatch":
      if (formula) {
        out.push(
          "Mogzy calculates this from a formula, so the change was flagged for a Mogzy data check against Riot's new numbers.",
        );
      } else if (value) {
        out.push(
          `When this report was built, Mogzy's data still had ${value} here, not Riot's new value, so it was flagged for a Mogzy data update.`,
        );
      } else {
        out.push("This change was flagged for a Mogzy data update when this report was built.");
      }
      break;
    case "pending":
      out.push(
        value && !formula
          ? `When this report was built, Mogzy's data had ${value} here and an update to Riot's new value was waiting for review.`
          : MOGZY_STATUS_GLOSS.pending,
      );
      break;
    case "needs_interpretation":
      out.push(
        change.change_kind === "mechanical"
          ? "Riot describes this change in words, so Mogzy can't check it against its data automatically."
          : MOGZY_STATUS_GLOSS.needs_interpretation,
      );
      break;
    default:
      out.push(MOGZY_STATUS_GLOSS[status]);
  }

  if (status === "mismatch" || status === "pending") {
    out.push(
      "Mogzy updates its own data in a separate step after the report is published, and not every flagged change can be applied automatically. This report's Mogzy data status shows what was updated and what is held.",
    );
  }
  if (!CURRENT.has(status)) {
    out.push(
      impactScoped
        ? "This is about Mogzy's own data, not Riot's patch note. Mogzy Impact works from Riot's published numbers."
        : "This is about Mogzy's own data, not Riot's patch note.",
    );
  }
  return out;
}

/**
 * Mogzy's tracked value as a reader-facing fact, or null when there is none
 * (or it is a formula, which belongs under Technical details).
 */
export function trackedValueAtBuild(change: PatchReportChange): string | null {
  if (isFormulaEvidence(change)) return null;
  return change.mogzy_current_raw?.trim() || null;
}

/**
 * Whether a line's own Mogzy status row would only repeat its entry's header.
 *
 * The header already states the entry's aggregate status. A line row earns its
 * place when it says something new: a different status, a tracked property or
 * value, a review, or a Mogzy Impact analysis that should sit beside its data
 * status. Aphelios 26.19 — five `not_represented` numeric lines with nothing
 * tracked under a `not_represented` header — repeats; Aurora's
 * `not_represented` R line under a `mismatch` header does not.
 */
export function restatesEntityStatus(
  change: PatchReportChange,
  entityStatus: MogzyStatus,
  { impactScoped = false }: { impactScoped?: boolean } = {},
): boolean {
  return (
    change.mogzy_status === entityStatus &&
    !impactScoped &&
    !change.proposal_status &&
    change.proposal_id == null &&
    !change.mogzy_current_raw &&
    !change.mogzy_property
  );
}

// ── patch-level reconciliation ────────────────────────────────────────────────

/**
 * Terminal states the reconciliation reports, with what each one means to a
 * player. Order is display order. A key the backend adds later is still shown,
 * raw, under Technical details — never dropped and never guessed at.
 */
export const RECONCILIATION_STATES: ReadonlyArray<{ key: string; meaning: string }> = [
  { key: "AUTO_APPLIED", meaning: "Up to date — Mogzy now has Riot's new value" },
  { key: "AUTO_APPLIED_REVIEW", meaning: "Up to date, with a note for a follow-up check" },
  { key: "HELD_RUNTIME_WORK", meaning: "Not modeled by Mogzy yet — Mogzy keeps the previous value" },
  { key: "HELD_AUTHORITY", meaning: "Needs a Mogzy review before it can be applied" },
  { key: "FAILED", meaning: "Couldn't be processed" },
  { key: "NO_MOGZY_CONSUMER", meaning: "Nothing for Mogzy to update" },
];

const KNOWN_STATES = new Set(RECONCILIATION_STATES.map((s) => s.key));

export type ReconciliationSummary = {
  status: string;
  recorded: boolean;
  headline: string;
  body: string;
  /** Applied (with or without a follow-up note). */
  updated: number;
  /** Real gameplay numbers Mogzy has no property, writer or runtime for. */
  notModeled: number;
  /** Mogzy could model it; a decision is needed first. */
  needsReview: number;
  failed: number;
  /** Prose, bug fixes, announcements and mode-scoped numbers: nothing to write. */
  nothingToUpdate: number;
  /**
   * The changes the data update actually had to act on. This — not the number
   * of report lines — is the denominator for every "updated / held" count.
   */
  checked: number;
  /** Everything the reconciliation counted, in its own units. */
  total: number;
  /** Every terminal-state count the backend sent, known states first. */
  technical: Array<{ key: string; count: number; meaning: string | null }>;
};

const HEADLINE: Record<string, string> = {
  RECONCILED: "Mogzy's gameplay data is up to date with this patch",
  RECONCILED_WITH_HELDS: "Mogzy's gameplay data is partly updated for this patch",
  RECONCILIATION_FAILED: "Mogzy's gameplay data update didn't finish",
  PUBLISHED_NOT_RECONCILED: "No full Mogzy data update is recorded for this patch",
};

const RIOT_LEADS = "Riot's patch notes below are complete.";

function heldPhrase(notModeled: number, needsReview: number): string {
  const parts = [
    notModeled > 0 ? "some mechanics aren't modeled by Mogzy yet" : null,
    needsReview > 0 ? "some need a Mogzy review first" : null,
  ].filter(Boolean);
  return parts.join(" and ");
}

export function summarizeReconciliation(reconciliation?: PatchReconciliation): ReconciliationSummary {
  const status = reconciliation?.status ?? "PUBLISHED_NOT_RECONCILED";
  const recorded = Boolean(reconciliation?.reconciliation_recorded);
  const counts = reconciliation?.changes_by_terminal_state ?? {};
  const n = (key: string) => (Number.isFinite(counts[key]) ? counts[key] : 0);

  const updated = n("AUTO_APPLIED") + n("AUTO_APPLIED_REVIEW");
  const notModeled = n("HELD_RUNTIME_WORK");
  const needsReview = n("HELD_AUTHORITY");
  const failed = n("FAILED");
  const nothingToUpdate = n("NO_MOGZY_CONSUMER");
  const checked = updated + notModeled + needsReview + failed;
  const total = Object.values(counts).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);

  let body: string;
  switch (status) {
    case "RECONCILED":
      body = `${RIOT_LEADS} Mogzy has updated every gameplay number in them that it tracks.`;
      break;
    case "RECONCILED_WITH_HELDS": {
      const held = heldPhrase(notModeled, needsReview);
      body =
        `${RIOT_LEADS} Mogzy has updated the changes it can safely apply to its own data` +
        (held ? `; ${held}, so Mogzy still uses the previous values for those.` : ".");
      break;
    }
    case "RECONCILIATION_FAILED":
      body = `${RIOT_LEADS} Mogzy's update of its own gameplay data didn't finish, so some values Mogzy uses may still be from the previous patch.`;
      break;
    case "PUBLISHED_NOT_RECONCILED":
      body = `${RIOT_LEADS} Mogzy has no record of a full check of its own gameplay data against them, so some values Mogzy uses may still be from an earlier patch.`;
      break;
    default:
      // A status this build does not know: say only what is always true, and
      // let the backend's own sentence (under Technical details) carry the rest.
      body = RIOT_LEADS;
  }

  const technical = [
    ...RECONCILIATION_STATES.filter((s) => s.key in counts).map((s) => ({
      key: s.key,
      count: n(s.key),
      meaning: s.meaning,
    })),
    ...Object.keys(counts)
      .filter((key) => !KNOWN_STATES.has(key))
      .sort()
      .map((key) => ({ key, count: n(key), meaning: null })),
  ];

  return {
    status,
    recorded,
    headline: HEADLINE[status] ?? "Mogzy data status",
    body,
    updated,
    notModeled,
    needsReview,
    failed,
    nothingToUpdate,
    checked,
    total,
    technical,
  };
}
