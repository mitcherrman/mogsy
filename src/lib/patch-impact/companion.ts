/**
 * Companion-state reconstruction: assemble the four numbers a projection needs.
 *
 * A projection at patch P needs base and growth, before and after. The changed
 * half or halves always come from Riot's line. The other half is resolved in a
 * fixed order and the first rule that applies decides; a rule that applies and
 * fails ends in "unavailable", never in a weaker source:
 *
 * 1. Riot itself: a compound line states both halves; otherwise another
 *    supported line in the SAME card supplies the companion before and after.
 * 2. Mogzy's current canonical value, held constant across P, only with the
 *    continuity proof in ./continuity.ts.
 */
import type {
  PatchReconciliationStatus,
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "@/lib/patch-reports/api";
import type { ChampionBaseStats } from "@/lib/league-docs/api";
import type { EligibleLine } from "./eligibility";
import { classifyLineageEntry, proveCompanionContinuity, resolveLaterHistory } from "./continuity";
import { V1_PROPERTIES, companionOf, isProjectableFamily } from "./families";
import type {
  ImpactHalf,
  ImpactUnavailableReason,
  ProjectionInputs,
  ProjectionTrust,
  StatValue,
} from "./types";

export type CompanionEvidence = {
  card: PatchReportCard;
  change: PatchReportChange;
  patchVersion: string;
  /** Live `/api/meta/champion-stats` rows. */
  canonical?: readonly ChampionBaseStats[] | null;
  /** Reports for every version after P, oldest first or not (sorted here). */
  laterReports?: readonly PatchReportDetail[] | null;
  /** Every version `/api/patch-reports` lists, used for the gap check. */
  laterVersionsExpected?: readonly string[] | null;
  /** Reconciliation status by version. P's own status belongs here. */
  reconciliationByVersion?: Readonly<Record<string, PatchReconciliationStatus | undefined>>;
};

export type CompanionResolution =
  | { ok: true; inputs: ProjectionInputs; trust: ProjectionTrust }
  | { ok: false; reason: ImpactUnavailableReason };

const riot = (value: number, provenance: StatValue["provenance"]): StatValue => ({ value, provenance });

/** A projection's four values from one compound line: all stated by Riot. */
function fromCompound(line: EligibleLine): ProjectionInputs | null {
  const base = line.stated.base;
  const growth = line.stated.growth;
  if (!base || !growth) return null;
  return {
    baseBefore: riot(base.before, "riot_line"),
    baseAfter: riot(base.after, "riot_line"),
    growthBefore: riot(growth.before, "riot_line"),
    growthAfter: riot(growth.after, "riot_line"),
  };
}

function assemble(
  half: ImpactHalf,
  changed: { before: number; after: number },
  changedProvenance: StatValue["provenance"],
  companion: { before: StatValue; after: StatValue },
): ProjectionInputs {
  const mine = {
    before: riot(changed.before, changedProvenance),
    after: riot(changed.after, changedProvenance),
  };
  return half === "base"
    ? {
        baseBefore: mine.before,
        baseAfter: mine.after,
        growthBefore: companion.before,
        growthAfter: companion.after,
      }
    : {
        baseBefore: companion.before,
        baseAfter: companion.after,
        growthBefore: mine.before,
        growthAfter: mine.after,
      };
}

const RIOT_ONLY_TRUST: ProjectionTrust = {
  usesMogzyData: false,
  canonicalEntity: null,
  laterVersionsChecked: [],
};

export function resolveProjectionInputs(
  line: EligibleLine,
  evidence: CompanionEvidence,
): CompanionResolution {
  if (!isProjectableFamily(line.family)) return { ok: false, reason: "projection_deferred" };
  const { card, change } = evidence;

  // Everything else in P's own card that is a base-stat line of this family.
  const sameFamily = card.changes
    .filter((other) => other !== change)
    .map((other) => ({ other, entry: classifyLineageEntry(card, other) }))
    .filter(
      (item) =>
        item.entry !== null &&
        ((item.entry.kind === "eligible" && item.entry.line.family === line.family) ||
          (item.entry.kind === "family_uncertain" && item.entry.family === line.family)),
    );

  /* Rule 1a — a compound line states both halves itself. */
  if (line.shape === "compound") {
    if (sameFamily.length > 0) {
      return {
        ok: false,
        reason: sameFamily.some((item) => item.entry?.kind === "eligible")
          ? "ambiguous_card_lines"
          : "family_continuity_unproven",
      };
    }
    const inputs = fromCompound(line);
    return inputs
      ? { ok: true, inputs, trust: RIOT_ONLY_TRUST }
      : { ok: false, reason: "unparseable_value" };
  }

  const changed = line.stated[line.half];
  const companionProperty = companionOf(line.property);
  if (!changed || !companionProperty) return { ok: false, reason: "unparseable_value" };
  const companionHalf = V1_PROPERTIES[companionProperty].half;

  /* Rule 1b — the companion's own supported line in the same card. */
  if (sameFamily.length > 0) {
    const eligible = sameFamily.flatMap((item) =>
      item.entry?.kind === "eligible" ? [item.entry.line] : [],
    );
    const uncertain = sameFamily.length - eligible.length;
    const duplicateOrCompound = eligible.some(
      (other) => other.shape === "compound" || other.half === line.half,
    );
    if (duplicateOrCompound || eligible.length > 1) return { ok: false, reason: "ambiguous_card_lines" };
    if (uncertain > 0) return { ok: false, reason: "family_continuity_unproven" };
    const pair = eligible[0]?.stated[companionHalf];
    if (!pair) return { ok: false, reason: "ambiguous_card_lines" };
    return {
      ok: true,
      inputs: assemble(line.half, changed, "riot_line", {
        before: riot(pair.before, "riot_same_card"),
        after: riot(pair.after, "riot_same_card"),
      }),
      trust: RIOT_ONLY_TRUST,
    };
  }

  /* Rule 2 — canonical, with the continuity proof. */
  const entityRef = card.mogzy_entity_ref;
  if (!entityRef) return { ok: false, reason: "identity_unresolved" };

  if (!evidence.canonical || !evidence.laterReports || !evidence.laterVersionsExpected) {
    return { ok: false, reason: "history_incomplete" };
  }
  const rows = evidence.canonical.filter((row) => row.champion_name === entityRef);
  if (rows.length !== 1) return { ok: false, reason: "identity_unresolved" };
  const row = rows[0];

  const history = resolveLaterHistory(
    evidence.patchVersion,
    evidence.laterReports,
    evidence.laterVersionsExpected,
  );
  if (history.ok === false) return { ok: false, reason: history.reason };

  const statuses = [
    evidence.reconciliationByVersion?.[evidence.patchVersion],
    ...history.reports.map(
      (report) =>
        evidence.reconciliationByVersion?.[report.patch_version] ?? report.reconciliation?.status,
    ),
  ];
  if (statuses.includes("RECONCILIATION_FAILED")) return { ok: false, reason: "reconciliation_failed" };

  if (line.family === "mana" && !(Number.isFinite(row.mp) && row.mp > 0)) {
    return { ok: false, reason: "no_resource" };
  }

  const column = V1_PROPERTIES[companionProperty].column as keyof ChampionBaseStats;
  const canonicalValue = row[column];
  if (typeof canonicalValue !== "number" || !Number.isFinite(canonicalValue) || canonicalValue < 0) {
    return { ok: false, reason: "canonical_value_invalid" };
  }

  const proof = proveCompanionContinuity({
    card,
    excluded: [change],
    entityRef,
    family: line.family,
    companion: companionProperty,
    canonicalValue,
    laterReports: history.reports,
  });
  if (proof.ok === false) return { ok: false, reason: proof.reason };

  const anchored: StatValue = {
    value: proof.anchor.value,
    provenance: proof.anchor.provenance,
    ...(proof.anchor.patch ? { patch: proof.anchor.patch } : {}),
  };
  return {
    ok: true,
    inputs: assemble(line.half, changed, "riot_line", { before: anchored, after: { ...anchored } }),
    trust: {
      usesMogzyData: true,
      canonicalEntity: row.champion_name,
      laterVersionsChecked: proof.laterVersionsChecked,
    },
  };
}
