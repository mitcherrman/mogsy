/**
 * Display-layer compaction for the Combat Lab timeline.
 *
 * Seven basic attacks in a row are seven identical pills; as a run they are one
 * pill reading `AA ×7 · 107 each`. This module computes those runs and nothing
 * else: it never rewrites, reorders, merges or drops a combat history entry. The
 * returned runs hold the original entries by reference, in order, so the caller
 * can still expand a run back into the individual actions it stands for and the
 * detail panels keep operating on the untouched array.
 *
 * Only *consecutive* entries collapse, and only when their whole visible outcome
 * matches: same action, same target, same damage, same type, same mitigation,
 * same shield, and the same per-event breakdown (which is what carries crit
 * state and any other meaningful difference between two otherwise-identical
 * casts). Anything that differs starts a new run, so a compacted timeline never
 * hides a change in what happened.
 */

export type GroupableTimelineEntry = {
  id: number;
  index: number;
  kind: string;
  action_id?: string;
  label: string;
  abilityKey?: string;
  abilityRank?: number;
  defender?: string;
  final_damage: number;
  raw_damage?: number;
  damage_type?: string | null;
  shield_absorbed?: number;
  damage_reduction_percent?: number | null;
  hp_after: number;
  hp_max: number;
  events?: unknown[];
};

export type TimelineRun<T extends GroupableTimelineEntry> = {
  /** Stable React key — the id of the run's first entry. */
  key: number;
  /** The original entries, by reference, in their original order. */
  entries: T[];
  count: number;
  /** Newest entry in the run; its HP and index are what the pill shows. */
  latest: T;
  first: T;
  /** Damage of a single member — equal across the run by construction. */
  damageEach: number;
  totalDamage: number;
};

/** Round to one decimal so float noise below the displayed precision matches. */
function q(value: unknown): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return (Math.round(n * 10) / 10).toFixed(1);
}

/**
 * Compact digest of one raw engine event's meaningful outcome. Timestamps are
 * excluded (they always differ); crit flags, per-event damage, source and type
 * are included, so two casts that resolved differently never share a digest.
 */
function eventDigest(event: unknown): string {
  if (!event || typeof event !== "object") return String(event);
  const e = event as Record<string, unknown>;
  const meta = e.metadata && typeof e.metadata === "object" ? (e.metadata as Record<string, unknown>) : {};
  const crit = e.crit ?? e.is_crit ?? e.critical ?? meta.crit ?? meta.is_crit ?? null;
  return [
    String(e.type ?? ""),
    String(e.state ?? ""),
    String(e.source ?? ""),
    String(e.damage_type ?? ""),
    q(e.final_damage),
    q(e.raw_damage ?? e.damage),
    String(crit),
  ].join("|");
}

/**
 * Everything about an entry that a viewer can see. Two entries collapse into one
 * pill only when these match exactly.
 */
export function timelineEquivalenceKey(entry: GroupableTimelineEntry): string {
  const events = Array.isArray(entry.events) ? entry.events : [];
  return [
    entry.kind,
    entry.action_id ?? "",
    entry.label,
    entry.abilityKey ?? "",
    entry.abilityRank ?? "",
    entry.defender ?? "",
    String(entry.damage_type ?? "").toLowerCase(),
    q(entry.final_damage),
    q(entry.raw_damage),
    q(entry.shield_absorbed),
    entry.damage_reduction_percent == null ? "" : q(entry.damage_reduction_percent),
    String(events.length),
    events.map(eventDigest).join(";"),
  ].join("␟");
}

/**
 * Fold consecutive equivalent entries into runs. Entries that stand alone come
 * back as runs of one, so callers have a single shape to render.
 */
export function groupConsecutiveTimelineEntries<T extends GroupableTimelineEntry>(
  entries: T[],
): TimelineRun<T>[] {
  const runs: TimelineRun<T>[] = [];
  let currentKey: string | null = null;

  for (const entry of entries) {
    const key = timelineEquivalenceKey(entry);
    const run = runs[runs.length - 1];
    if (run && key === currentKey) {
      run.entries.push(entry);
      run.count += 1;
      run.latest = entry;
      run.totalDamage += Math.max(0, entry.final_damage || 0);
      continue;
    }
    currentKey = key;
    runs.push({
      key: entry.id,
      entries: [entry],
      count: 1,
      latest: entry,
      first: entry,
      damageEach: Math.max(0, entry.final_damage || 0),
      totalDamage: Math.max(0, entry.final_damage || 0),
    });
  }

  return runs;
}
