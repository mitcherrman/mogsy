/**
 * LAYER 1 — Riot-line collection.
 *
 * Every change line of every card of every included report becomes exactly one
 * `CatchUpRiotLine`, whether or not Mogzy can understand or chain it. Order is
 * chronological by patch, then the Patch Report page's own order (official
 * section order → entity → group → change), and anchors are the page's own
 * semantic ids, taken from `buildPatchReportStructure` so a Catch-Up deep link
 * can never disagree with the report it points into.
 */
import type {
  PatchReportCard,
  PatchReportChange,
  PatchReportDetail,
} from "@/lib/patch-reports/api";
import { buildPatchReportStructure } from "@/lib/patch-reports/report-structure";
import {
  cardAnchors,
  reportEntityAnchors,
  sectionAnchor,
  sectionKey,
} from "@/lib/patch-reports/semantic-ids";
import { continuityKey, continuityKeyString } from "./keys";
import type {
  CatchUpEmptyCard,
  CatchUpRiotLine,
  LineEligibility,
  PatchContinuityKey,
  PatchReportTarget,
  ScopeLabel,
} from "./types";
import { canonicalLabel, canonicalValue, isEligibleValue } from "./value";

export type ScopeResolver = (card: PatchReportCard) => ScopeLabel | null;

export type LineCollection = {
  lines: CatchUpRiotLine[];
  cardsWithoutChanges: CatchUpEmptyCard[];
};

function entityKeyOf(
  card: PatchReportCard,
  scope: ScopeLabel | null,
  section: string,
): string {
  const name = canonicalLabel(card.entity_name);
  return scope ? `${scope}|${name}` : `${section}|${card.entity_type}|${name}`;
}

/**
 * Line-level gates (PH3-A §13 rules 1–5). `ambiguous` says the key occurs more
 * than once in the line's patch, in any card and of any kind.
 */
function eligibilityOf(
  scope: ScopeLabel | null,
  key: PatchContinuityKey | null,
  change: PatchReportChange,
  ambiguous: boolean,
): LineEligibility {
  if (!scope) return { status: "out_of_scope" };
  if (change.change_kind !== "numeric") return { status: "refused", reason: "not_numeric" };
  if (!isEligibleValue(change.before_raw) || !isEligibleValue(change.after_raw)) {
    return { status: "refused", reason: "value_ineligible" };
  }
  if (canonicalValue(change.before_raw) === canonicalValue(change.after_raw)) {
    return { status: "refused", reason: "no_op_line" };
  }
  if (!key) return { status: "refused", reason: "key_incomplete" };
  if (ambiguous) return { status: "refused", reason: "key_ambiguous_in_patch" };
  return { status: "candidate" };
}

/**
 * Collect every Riot line of the included reports (one report per patch, oldest
 * first). Pure: the payload objects are referenced, never copied or mutated.
 */
export function collectRiotLines(args: {
  reports: readonly PatchReportDetail[];
  resolveScope: ScopeResolver;
}): LineCollection {
  const { reports, resolveScope } = args;
  const lines: CatchUpRiotLine[] = [];
  const cardsWithoutChanges: CatchUpEmptyCard[] = [];

  reports.forEach((report, patchOrdinal) => {
    const patch = report.patch_version;
    const cards = report.cards ?? [];
    const entityAnchors = reportEntityAnchors(cards);
    const cardIndexByAnchor = new Map(entityAnchors.map((anchor, i) => [anchor, i]));

    /* Pass 1: per-card scope and key, and key occurrence counts for this patch. */
    const scopes = cards.map((card) => resolveScope(card));
    const keys = cards.map((card, ci) =>
      scopes[ci]
        ? (card.changes ?? []).map((change) => continuityKey(scopes[ci] as ScopeLabel, card, change))
        : [],
    );
    const occurrences = new Map<string, number>();
    keys.forEach((cardKeys) =>
      cardKeys.forEach((key) => {
        if (!key) return;
        const text = continuityKeyString(key);
        occurrences.set(text, (occurrences.get(text) ?? 0) + 1);
      }),
    );

    /* Pass 2: walk the page's own structure for order and anchors. */
    const emitted = new Set<string>();
    const emit = (
      ci: number,
      changeIndex: number,
      target: Omit<PatchReportTarget, "patch">,
    ) => {
      const id = `${patch}#${ci}.${changeIndex}`;
      if (emitted.has(id)) return;
      emitted.add(id);
      const card = cards[ci];
      const change = card.changes[changeIndex];
      const scope = scopes[ci];
      const key = scope ? (keys[ci][changeIndex] ?? null) : null;
      const section = sectionKey(card);
      lines.push({
        id,
        patch,
        patchOrdinal,
        order: lines.length,
        cardIndex: ci,
        changeIndex,
        entityKey: entityKeyOf(card, scope, section),
        entityType: card.entity_type,
        entityName: card.entity_name,
        sectionKey: section,
        sectionTitle: card.section_title,
        groupTitle: change.group_title,
        target: { patch, ...target },
        card,
        change,
        key,
        eligibility: eligibilityOf(
          scope,
          key,
          change,
          key !== null && (occurrences.get(continuityKeyString(key)) ?? 0) > 1,
        ),
        chainId: null,
        identityRefusal: null,
      });
    };

    const structure = buildPatchReportStructure({
      patch_version: patch,
      cards,
      section_titles: report.section_titles,
    });
    for (const section of structure.sections) {
      for (const entity of section.entities) {
        const ci = cardIndexByAnchor.get(entity.anchor);
        if (ci === undefined) continue;
        for (const group of entity.groups) {
          for (const node of group.changes) {
            emit(ci, node.index, {
              section: section.anchor,
              entity: entity.anchor,
              group: group.anchor,
              change: node.anchor,
            });
          }
        }
      }
    }

    /* Defensive: the structure builder never drops a change, but if it ever
       did, the line must still be returned (coverage is non-negotiable). */
    cards.forEach((card, ci) => {
      (card.changes ?? []).forEach((_, changeIndex) => {
        if (emitted.has(`${patch}#${ci}.${changeIndex}`)) return;
        const anchors = cardAnchors(card, entityAnchors[ci]);
        emit(ci, changeIndex, {
          section: sectionAnchor(card),
          entity: anchors.entity,
          group: anchors.changes[changeIndex].group,
          change: anchors.changes[changeIndex].change,
        });
      });
      if ((card.changes ?? []).length === 0) {
        cardsWithoutChanges.push({
          patch,
          cardIndex: ci,
          entityName: card.entity_name,
          sectionKey: sectionKey(card),
        });
      }
    });
  });

  return { lines, cardsWithoutChanges };
}
