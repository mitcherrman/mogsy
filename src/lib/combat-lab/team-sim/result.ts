/**
 * Read-only derivations over a completed simulation response.
 *
 * Everything here reads backend-authoritative fields. Nothing re-computes a
 * metric the response already reports — in particular no damage total is ever
 * summed out of the event trace, because `combatant_summaries` covers the
 * WHOLE run while `events` may be truncated.
 *
 * One attribution trap is handled here rather than in a component: on a
 * `death` event the scheduler puts the KILLER in `actor_id` and the combatant
 * that died in `target_id`. A naive "actor did something" reading of the trace
 * reports the wrong casualty, so death rows are described explicitly.
 */
import type {
  EffectiveBuild,
  TeamSimEvent,
  TeamSimulationResponse,
  TraceDetail,
} from "./contract";

/* ─────────────────────── catalog digest agreement ─────────────────────── */

export type DigestReport = {
  /**
   * Digest the request was configured against, or null when that is not
   * knowable here — a result collected from the server by recovery id
   * (Phase 4E) was configured in a browser session this page never saw.
   * Null means "no configured-vs-executed comparison exists", never "they
   * agreed".
   */
  configuredDigest: string | null;
  /** Digest of the catalog currently loaded in the page. */
  loadedDigest: string | null;
  /** Distinct digests stamped into the response's effective builds. */
  responseDigests: string[];
  /**
   * The dangerous one: the catalog the ENGINE executed against was not the
   * catalog that configured the request. A missing or empty digest counts —
   * silence is not agreement.
   */
  executionMismatch: boolean;
  /**
   * Benign but worth saying: the page has since loaded a different catalog.
   * Configuration and execution still agreed; only the editor has moved on.
   */
  pageDrift: boolean;
  /** Either condition. */
  mismatch: boolean;
};

export function digestReport(
  response: TeamSimulationResponse,
  configuredDigest: string | null,
  loadedDigest: string | null
): DigestReport {
  const stamped = Object.values(response.effective_builds).map(
    (build) => build?.data_version?.catalog_digest ?? ""
  );
  const responseDigests = Array.from(new Set(stamped)).sort();

  // With no configured digest there is nothing to compare execution against,
  // so no mismatch is CLAIMED — the panel says the comparison is unavailable
  // rather than implying agreement. Drift is still reported, measured against
  // what the response actually executed on, which is knowable either way.
  const executionMismatch =
    configuredDigest !== null &&
    (stamped.length === 0 ||
      // An empty/absent digest is treated as disagreement rather than filtered
      // out: dropping it would let one silent build hide behind its siblings and
      // produce a confident "matched on every effective build".
      stamped.some((digest) => digest !== configuredDigest));
  const pageDrift =
    loadedDigest !== null &&
    (configuredDigest !== null
      ? loadedDigest !== configuredDigest
      : responseDigests.length > 0 &&
        responseDigests.some((digest) => digest !== loadedDigest));

  return {
    configuredDigest,
    loadedDigest,
    responseDigests,
    executionMismatch,
    pageDrift,
    mismatch: executionMismatch || pageDrift,
  };
}

/* ───────────────────────────── event trace ───────────────────────────── */

export type TraceFilterKey =
  | "all"
  | "combat"
  | "targeting"
  | "lifecycle"
  | "scheduler";

export const TRACE_FILTERS: Array<{
  key: TraceFilterKey;
  label: string;
  /** Scheduler event SOURCES this filter admits. Source, never inferred type. */
  sources: string[] | null;
}> = [
  { key: "all", label: "All", sources: null },
  { key: "combat", label: "Kernel / combat", sources: ["kernel"] },
  { key: "targeting", label: "Targeting", sources: ["targeting"] },
  { key: "lifecycle", label: "Lifecycle / death", sources: ["lifecycle"] },
  {
    key: "scheduler",
    label: "Scheduler / termination",
    sources: ["scheduler", "termination"],
  },
];

export function filterEvents(
  events: TeamSimEvent[],
  filter: TraceFilterKey
): TeamSimEvent[] {
  const spec = TRACE_FILTERS.find((f) => f.key === filter);
  if (!spec || spec.sources === null) return events;
  const allowed = new Set(spec.sources);
  return events.filter((e) => allowed.has(e.source));
}

/** Failed actions are never hidden by a filter — they are combat evidence. */
export function isActionFailure(event: TeamSimEvent): boolean {
  return event.type === "action_failed";
}

/**
 * A short, attribution-correct description of one event.
 * Deliberately returns text, not JSX, so it is unit-testable.
 */
export function describeEvent(event: TeamSimEvent): string {
  const base = describeOneEvent(event);
  const repeats = event.repeats;
  if (!repeats || repeats.count <= 1) return base;
  // A collapsed row says so IN ITS OWN TEXT, not only through a badge: the
  // span is what makes "this happened 12 times" readable rather than a row
  // that looks like a single event at t=0.
  return (
    `${base} — ×${repeats.count} through ${formatSeconds(repeats.last_time)} ` +
    `(#${repeats.first_seq}–${repeats.last_seq})`
  );
}

function describeOneEvent(event: TeamSimEvent): string {
  const meta = (event.meta ?? {}) as Record<string, unknown>;
  const payload = (event.payload ?? {}) as Record<string, unknown>;

  switch (event.type) {
    case "death": {
      const killer = typeof meta.cause_actor_id === "string" ? meta.cause_actor_id : event.actor_id;
      const selfInflicted = meta.self_inflicted === true;
      // target_id is the combatant that DIED.
      return selfInflicted
        ? `${event.target_id ?? "?"} died (self-inflicted)`
        : `${event.target_id ?? "?"} died — killed by ${killer ?? "?"}`;
    }
    case "target_assigned":
      return `target set to ${event.target_id ?? "?"} (${String(meta.policy ?? "policy")})`;
    case "target_changed":
      return `retargeted ${String(meta.previous_target_id ?? "?")} → ${event.target_id ?? "?"} (${String(meta.policy ?? "policy")})`;
    case "action_failed":
      return `action rejected: ${String(meta.error ?? "no reason reported")}`;
    case "action_executed": {
      const accounting = (meta.damage_accounting ?? {}) as Record<string, unknown>;
      const applied = accounting.total_applied_hp_damage;
      return typeof applied === "number"
        ? `${event.action_id ?? "action"} → ${formatNumber(applied)} HP damage`
        : `${event.action_id ?? "action"} executed`;
    }
    // The meta keys below are the scheduler's own, verified against
    // team_combat/scheduler.py: skips and halts carry {policy, error}, and a
    // delay carries {from_time, to_time, waiting_for} — there is no
    // `reason`/`eligibility` key to fall back on.
    case "plan_step_skipped":
      return `plan step skipped (on_failure=${String(meta.policy ?? "skip")})${
        meta.error ? `: ${String(meta.error)}` : ""
      }`;
    case "plan_halted":
      return `plan halted (on_failure=${String(meta.policy ?? "halt")})${
        meta.error ? `: ${String(meta.error)}` : ""
      }`;
    case "plan_exhausted":
      return `plan exhausted after ${String(meta.steps ?? "?")} steps — combatant idles`;
    case "delay": {
      const waitingFor = Array.isArray(meta.waiting_for)
        ? (meta.waiting_for as unknown[]).join(", ")
        : "";
      const until = formatSeconds(Number(meta.to_time ?? event.time));
      return waitingFor
        ? `idle until ${until} (waiting for ${waitingFor})`
        : `idle until ${until}`;
    }
    case "terminated":
      return `simulation ended: ${String(meta.reason ?? "unknown")}${
        meta.winner ? ` (winner ${String(meta.winner)})` : " (no winner)"
      }`;
    default: {
      const description = payload.description;
      if (typeof description === "string" && description) return description;
      const state = payload.state;
      if (typeof state === "string" && state) return state;
      return event.type.replace(/_/g, " ");
    }
  }
}

export type DeathRecord = {
  time: number;
  /** The combatant that died. */
  runtimeId: string;
  /** null when the killing event fell outside a truncated trace. */
  killerId: string | null;
  selfInflicted: boolean;
  /** True when no lifecycle event for this death was returned. */
  attributionUnavailable: boolean;
};

/**
 * Casualty list, from `combatant_summaries` — which covers the WHOLE run.
 *
 * Reading it out of the event trace instead would be wrong whenever the
 * backend truncated: deaths are structurally tail events, so a `first_N_by_seq`
 * cut drops them preferentially and the list would silently under-report (or
 * vanish) while the very same panel showed those combatants as dead. The
 * lifecycle events are used only to attribute the KILLER, which is genuinely
 * trace-only information and is reported as unavailable when it was cut.
 */
export function deathOrder(response: TeamSimulationResponse): DeathRecord[] {
  const attribution = new Map<string, { killerId: string | null; selfInflicted: boolean }>();
  for (const event of response.events) {
    if (event.source !== "lifecycle" || event.type !== "death") continue;
    const meta = (event.meta ?? {}) as Record<string, unknown>;
    attribution.set(String(event.target_id ?? "?"), {
      killerId:
        typeof meta.cause_actor_id === "string" ? meta.cause_actor_id : event.actor_id,
      selfInflicted: meta.self_inflicted === true,
    });
  }

  return Object.values(response.combatant_summaries)
    .filter((summary) => summary.death_time !== null)
    .sort((a, b) => (a.death_time ?? 0) - (b.death_time ?? 0) || a.slot_index - b.slot_index)
    .map((summary) => {
      const attributed = attribution.get(summary.runtime_id);
      return {
        time: summary.death_time as number,
        runtimeId: summary.runtime_id,
        killerId: attributed?.killerId ?? null,
        selfInflicted: attributed?.selfInflicted ?? false,
        attributionUnavailable: attributed === undefined,
      };
    });
}

/* ─────────────────────────── result summary ─────────────────────────── */

export type ResultOverview = {
  winner: string | null;
  outcomeLabel: string;
  terminationReason: string;
  terminationDetail: string;
  duration: number;
  simulatedEventCount: number;
  returnedEventCount: number;
  truncated: boolean;
  truncationRule: string;
};

export function resultOverview(response: TeamSimulationResponse): ResultOverview {
  const winner = response.termination.winner ?? null;
  return {
    winner,
    outcomeLabel: winner ? `Team ${winner} wins` : "No winner",
    terminationReason: response.termination.reason,
    terminationDetail: response.termination.detail,
    duration: response.duration,
    simulatedEventCount: response.trace.simulated_event_count,
    returnedEventCount: response.trace.returned_event_count,
    truncated: response.trace.truncated,
    truncationRule: response.trace.rule,
  };
}

/* ────────────────────── trace completeness (Phase 7A) ────────────────────── */

export type TraceReport = {
  /** Null when the response predates trace levels — never guessed as a level. */
  detail: TraceDetail | null;
  simulated: number;
  returned: number;
  /** Simulated events not present as their own row, for ANY reason. */
  omitted: number;
  /** Of those, the ones folded into a `repeats` row rather than dropped. */
  grouped: number;
  truncated: boolean;
  truncationRule: string;
  compacted: boolean;
};

/**
 * The two reasons a returned trace can be shorter than the simulation, read
 * apart rather than conflated: the max_trace_events CAP (`truncated`) and the
 * requested trace LEVEL (`compacted`).
 *
 * Every field is taken from the backend's own `trace` block; nothing here
 * recomputes a count from `events.length`, because the backend's number is the
 * authority on what it decided to send and a disagreement is worth showing
 * rather than hiding. `omitted` falls back to the arithmetic only when the
 * field is absent (a pre-Phase-7A response), and never goes negative.
 */
export function traceReport(response: TeamSimulationResponse): TraceReport {
  const trace = response.trace;
  const simulated = trace.simulated_event_count;
  const returned = trace.returned_event_count;
  const omitted = trace.omitted_event_count ?? Math.max(0, simulated - returned);
  return {
    detail: trace.detail ?? null,
    simulated,
    returned,
    omitted,
    grouped: trace.grouped_event_count ?? 0,
    truncated: trace.truncated,
    truncationRule: trace.rule,
    // Never inferred from the counts: `compacted` is the backend's claim, and
    // a pre-7A response that simply truncated must not be reported as
    // compacted just because it returned fewer events than it simulated.
    compacted: trace.compacted === true,
  };
}

export const TRACE_DETAIL_LABELS: Record<TraceDetail, string> = {
  summary: "Summary",
  standard: "Standard",
  full: "Full",
};

/** How many raw events a row stands for. 1 for an ordinary row. */
export function repeatCount(event: TeamSimEvent): number {
  return event.repeats?.count ?? 1;
}

/** Runtime IDs in scenario slot order, from the backend's own summaries. */
export function orderedRuntimeIds(response: TeamSimulationResponse): string[] {
  return Object.values(response.combatant_summaries)
    .slice()
    .sort((a, b) => a.slot_index - b.slot_index)
    .map((s) => s.runtime_id);
}

export function effectiveBuildEntries(
  response: TeamSimulationResponse
): Array<[string, EffectiveBuild]> {
  const order = orderedRuntimeIds(response);
  const entries = Object.entries(response.effective_builds);
  return entries.sort(
    ([a], [b]) => indexOrLast(order, a) - indexOrLast(order, b)
  );
}

function indexOrLast(order: string[], id: string): number {
  const at = order.indexOf(id);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
}

/* ───────────────────────────── formatting ───────────────────────────── */

export function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatSeconds(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(3)}s`;
}
