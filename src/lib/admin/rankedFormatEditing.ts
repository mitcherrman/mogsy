// ---------------------------------------------------------------------------
// Pure edit operations on a RankedFormat.
//
// THE governing rule of this module: an edit changes exactly what it names and
// carries everything else through byte for byte.
//
// A format contains fields this build does not know about — fields a later
// backend added, fields the builder deliberately does not expose
// (pressure_seconds, rating_eligible, rollout_allowlist), and fields of modules
// no longer offered. Reconstructing a format from the handful of values the UI
// renders would silently drop every one of them, and the result would still
// validate: the schema rejects unknown keys, not missing optional ones. So a
// save would quietly change what players receive, with nothing anywhere saying
// so. Every function here spreads the original and overwrites one key.
//
// No validation lives here. Whether a value is legal is the backend's answer.
// ---------------------------------------------------------------------------

import type { CatalogOption, RankedFormatJson, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";

/** Move a segment one place earlier. Out-of-range moves are no-ops. */
export function moveSegmentUp(format: RankedFormatJson, index: number): RankedFormatJson {
  if (index <= 0 || index >= format.segment_pattern.length) return format;
  return swapSegments(format, index, index - 1);
}

/** Move a segment one place later. Out-of-range moves are no-ops. */
export function moveSegmentDown(format: RankedFormatJson, index: number): RankedFormatJson {
  if (index < 0 || index >= format.segment_pattern.length - 1) return format;
  return swapSegments(format, index, index + 1);
}

/**
 * Move a segment from one position straight to another.
 *
 * The reason this exists rather than being spelled as N calls to
 * `moveSegmentUp`: a newly added module lands last, and putting it in slot 1
 * meant clicking ↑ once per module already in the pattern. That is the same
 * edit either way, but only one of them is a usable control.
 *
 * A REMOVE-THEN-INSERT, deliberately, not a swap. Swapping two positions
 * reorders exactly two rows; dragging row 5 to slot 1 must shift rows 1-4 down
 * by one and leave their relative order intact, which is what splice does.
 * Out-of-range and no-op moves return the format unchanged (identity, so the
 * dirty check does not light up for a move that did not happen).
 */
export function moveSegmentTo(
  format: RankedFormatJson, from: number, to: number,
): RankedFormatJson {
  const length = format.segment_pattern.length;
  if (from < 0 || from >= length || to < 0 || to >= length || from === to) return format;
  const next = [...format.segment_pattern];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...format, segment_pattern: next };
}

/**
 * Insert a new segment at a chosen position rather than only at the end.
 *
 * `at` is clamped rather than refused: the caller is a position control whose
 * bounds are the list it is rendered from, so an out-of-range value is a bug
 * in the caller, not an instruction to silently drop the admin's new module.
 */
export function insertSegmentAt(
  format: RankedFormatJson, defaults: SegmentSpecJson, at: number,
): RankedFormatJson {
  const next = [...format.segment_pattern];
  const index = Math.max(0, Math.min(at, next.length));
  // Deep-cloned for the same reason `addSegment` clones: two rows added from
  // one catalog entry must never share a module_config object.
  next.splice(index, 0, structuredClone(defaults));
  return { ...format, segment_pattern: next };
}

function swapSegments(format: RankedFormatJson, a: number, b: number): RankedFormatJson {
  const next = [...format.segment_pattern];
  [next[a], next[b]] = [next[b], next[a]];
  return { ...format, segment_pattern: next };
}

/**
 * Remove a segment.
 *
 * Removing the LAST one is refused: a format's pattern must be non-empty, and
 * the backend would reject the save anyway. Refusing here means the admin sees
 * a disabled control rather than a save that fails for a reason the screen
 * could have prevented.
 */
export function removeSegment(format: RankedFormatJson, index: number): RankedFormatJson {
  if (format.segment_pattern.length <= 1) return format;
  if (index < 0 || index >= format.segment_pattern.length) return format;
  return {
    ...format,
    segment_pattern: format.segment_pattern.filter((_, i) => i !== index),
  };
}

/** Append a segment, built from the catalog module's production defaults. */
export function addSegment(
  format: RankedFormatJson,
  defaults: SegmentSpecJson,
): RankedFormatJson {
  return {
    ...format,
    // Deep-cloned so two rows added from the same catalog entry never share a
    // module_config object — editing one would otherwise edit the other.
    segment_pattern: [...format.segment_pattern, structuredClone(defaults)],
  };
}

/**
 * Set one field on one segment.
 *
 * `key` is either a plain segment field ("timer_seconds") or the dotted
 * "module_config.<name>" the catalog uses. Only that key is touched; every
 * other field of the segment, and every sibling key inside module_config,
 * survives unchanged.
 */
export function setSegmentField(
  format: RankedFormatJson,
  index: number,
  key: string,
  value: unknown,
): RankedFormatJson {
  const segment = format.segment_pattern[index];
  if (!segment) return format;

  let updated: SegmentSpecJson;
  if (key.startsWith("module_config.")) {
    const name = key.slice("module_config.".length);
    const existing = (segment.module_config ?? {}) as Record<string, unknown>;
    updated = { ...segment, module_config: { ...existing, [name]: value } };
  } else {
    updated = { ...segment, [key]: value };
  }

  const next = [...format.segment_pattern];
  next[index] = updated;
  return { ...format, segment_pattern: next };
}

/** Read the value the catalog's dotted key names. */
export function readSegmentField(segment: SegmentSpecJson, key: string): unknown {
  if (key.startsWith("module_config.")) {
    const config = (segment.module_config ?? {}) as Record<string, unknown>;
    return config[key.slice("module_config.".length)];
  }
  return segment[key];
}

/** Toggle one value of a multi-select field, preserving the option order. */
export function toggleMultiValue(
  current: unknown,
  value: string,
  allOptions: string[],
): string[] {
  const selected = new Set(Array.isArray(current) ? (current as string[]) : []);
  if (selected.has(value)) {
    selected.delete(value);
  } else {
    selected.add(value);
  }
  // Emitted in the catalog's own option order rather than click order, so the
  // same selection always serializes identically and a save produces no
  // spurious diff against the stored config.
  return allOptions.filter((option) => selected.has(option));
}

/**
 * One-off UX clamp: when the admin picks a Mastery set that carries a
 * `max_questions` ceiling (optional catalog metadata — not every deployment
 * will have it), and the segment's current `challenge_count` exceeds it,
 * pull `challenge_count` down to the ceiling.
 *
 * Presentational only. The backend remains the validation authority and is
 * not consulted here; this exists so the form does not display a value the
 * chosen set cannot support, nothing more. Deliberately NOT a generic
 * dependent-field mechanism — this is the one field pairing that has one
 * today, so it is named for exactly that pairing rather than generalized.
 */
export function clampChallengeCountForMasterySet(
  format: RankedFormatJson,
  index: number,
  setOptions: CatalogOption[] | undefined,
  selectedSetId: unknown,
): RankedFormatJson {
  if (typeof selectedSetId !== "string") return format;
  const maxQuestions = setOptions?.find((option) => option.value === selectedSetId)?.max_questions;
  if (typeof maxQuestions !== "number") return format;

  const segment = format.segment_pattern[index];
  const current = segment?.challenge_count;
  if (typeof current !== "number" || current <= maxQuestions) return format;

  return setSegmentField(format, index, "challenge_count", maxQuestions);
}

/** Whether two formats differ — the dirty check, by value not identity. */
export function formatsDiffer(a: RankedFormatJson | null, b: RankedFormatJson | null): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
