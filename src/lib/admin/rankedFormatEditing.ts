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

import type { RankedFormatJson, SegmentSpecJson } from "@/lib/admin/rankedFormatApi";

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

/** Whether two formats differ — the dirty check, by value not identity. */
export function formatsDiffer(a: RankedFormatJson | null, b: RankedFormatJson | null): boolean {
  return JSON.stringify(a) !== JSON.stringify(b);
}
