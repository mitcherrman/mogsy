// ---------------------------------------------------------------------------
// One line that says what a module slot IS, for the collapsed builder row.
//
// CATALOG-DRIVEN, not a per-module switch. The builder's whole point is that
// the backend catalog decides what a module exposes; a hardcoded summary per
// module id would be a second description of the same thing, and it would go
// stale the moment a module gains or loses a field. So this reads the catalog
// entry it is handed and picks by field SHAPE, which is why a module this
// build has never heard of still summarises sensibly instead of crashing.
//
// It is presentation only. It never edits, never validates, and is never the
// source of anything saved — `segment_pattern` is.
// ---------------------------------------------------------------------------

import type { CatalogModule, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";
import { readSegmentField } from "@/lib/admin/rankedFormatEditing";

/** Human label for an enum value, falling back to the raw value. */
function optionLabel(module: CatalogModule, key: string, value: unknown): string | null {
  if (typeof value !== "string" || value === "") return null;
  const field = module.fields.find((f) => f.key === key);
  return field?.options?.find((o) => o.value === value)?.label ?? value;
}

/**
 * What a slot's countable unit is called.
 *
 * Read off the catalog rather than the module id: a module whose vocabulary is
 * cards (Meta Reflex names a `card_timer_seconds` and card families) counts
 * cards; everything else counts questions. Keyed on the field names the module
 * itself publishes, so a future card module gets the right noun for free.
 */
function countNoun(module: CatalogModule): "cards" | "questions" {
  const mentionsCards = module.fields.some((f) => f.key.includes("card"))
    || Object.keys(module.fixed ?? {}).some((k) => k.includes("card"));
  return mentionsCards ? "cards" : "questions";
}

function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * The collapsed row's line, e.g.
 *   `Quiz — easy_item_cost — 20s`
 *   `Mastery Slice — Ahri vs Syndra — 5 questions`
 *   `Meta Reflex — 5 cards — 20s/card`
 *
 * A module the catalog does not describe is named by its own id and version.
 * That row is deliberately read-only elsewhere in the builder, and this must
 * not invent a description for it either.
 */
export function summarizeSegment(
  segment: SegmentSpecJson, module: CatalogModule | undefined,
): string {
  if (!module) return `${segment.module_id}.v${segment.module_version}`;

  const parts: string[] = [module.label];

  // 1. IDENTITY — the single-choice field that says which content this slot
  //    draws on (the quiz pool, the Mastery set). Multi-enums are skipped on
  //    purpose: a list of five card families is not an identity, it is a
  //    setting, and it belongs in the expanded row.
  const identityField = module.fields.find((f) => f.type === "enum");
  if (identityField) {
    const label = optionLabel(
      module, identityField.key, readSegmentField(segment, identityField.key));
    if (label) parts.push(label);
  }

  // 2. COUNT — from the segment when the admin sets it, from the catalog's
  //    `fixed` block when the module owns it (a Meta Reflex block IS five
  //    cards). Both are worth showing; only one is editable.
  //
  //    A count of 1 is only worth a word when the module lets an admin CHOOSE
  //    it. Every one-question module carries `challenge_count: 1` as a
  //    structural fact, and reprinting it on each Quiz row would be noise in
  //    the one line that has to earn its space — while a Mastery slice set to
  //    a single question is a real, chosen setting.
  const count = numeric(readSegmentField(segment, "challenge_count"))
    ?? numeric(module.fixed?.challenge_count);
  const countIsChosen = module.fields.some((f) => f.key === "challenge_count");
  if (count !== null && (count > 1 || countIsChosen)) {
    const noun = countNoun(module);
    parts.push(`${count} ${count === 1 ? noun.replace(/s$/, "") : noun}`);
  }

  // 3. TIMER — whole-segment, or per-card where that is what the module times.
  const timer = numeric(readSegmentField(segment, "timer_seconds"));
  if (timer !== null) parts.push(`${timer}s`);
  const cardTimer = numeric(readSegmentField(segment, "card_timer_seconds"));
  if (cardTimer !== null) parts.push(`${cardTimer}s/card`);

  return parts.join(" — ");
}
