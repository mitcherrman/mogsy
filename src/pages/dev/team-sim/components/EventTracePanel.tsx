/**
 * The attributed chronological event trace.
 *
 * Not a playback: Phase 4B renders the trace as a readable record, because
 * comprehension of a deterministic sequential model is the goal and an
 * animation would imply a continuous fight the engine does not simulate.
 *
 * Honesty rules, in the order they matter:
 *  - `action_failed` rows are never hidden by a filter or by the render cap,
 *    and are highlighted;
 *  - when the backend truncated the trace, both counts and the truncation rule
 *    are shown, so a short list is never mistaken for a short fight;
 *  - Phase 7A: when the backend COMPACTED the trace, that is stated as a
 *    separate fact from truncation, with the level and the number of events
 *    folded or omitted — a compacted trace is a complete simulation shown in
 *    fewer rows, and a truncated one is not, so the two must never read as one
 *    hedge;
 *  - a filter that matches nothing because the LEVEL dropped that source says
 *    so, instead of the same "no events match" a genuinely empty filter gives.
 *
 * The trace-detail SELECTOR is deliberately not here. It is a setting for the
 * next run (the backend decides the level while building the response and puts
 * it in the request digest), so it lives with the other scheduler limits in
 * TeamSimPage. Nothing in this panel can re-fetch.
 */
import { useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";
import {
  describeEvent,
  filterEvents,
  isActionFailure,
  traceReport,
  TRACE_DETAIL_LABELS,
  TRACE_FILTERS,
  type TraceFilterKey,
} from "@/lib/combat-lab/team-sim/result";

/**
 * Rows rendered before the panel stops and offers "show all".
 *
 * Pre-existing (Phase 4B). Phase 7A re-examined it and left it alone, and the
 * reasoning is worth recording because the alternative considered was
 * virtualization:
 *
 *  - the bound is what the trace ceiling makes necessary. At the backend's
 *    1000-event cap an unbounded table is 1000 rows x 8 cells, and Phase 7A's
 *    tests exercise 500/1000/2000-row traces against exactly this cap;
 *  - what CHANGED is that the bound bites less often, not more: `standard`
 *    returns ~25-40% fewer rows for the same fight, so an ordinary result now
 *    lands under 400 where it used to exceed it;
 *  - so nothing measured here justifies a virtualization dependency. Bounded
 *    rendering plus an explicit, labelled opt-out is a dozen lines with no
 *    scroll-position, measurement or accessibility behaviour to get wrong.
 *
 * Browser-level render timing was NOT measured in this phase — the tests here
 * are jsdom, and the claim above is about DOM node COUNT, not about frames.
 */
const MAX_RENDERED = 400;

export function EventTracePanel({ response }: { response: TeamSimulationResponse }) {
  const [filter, setFilter] = useState<TraceFilterKey>("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (filter === "all") return response.events;
    const base = filterEvents(response.events, filter);
    // Failed actions survive every filter: they are the evidence that a plan
    // step the operator wrote did not run.
    const kept = new Set(base.map((e) => e.seq));
    const failures = response.events.filter(
      (e) => isActionFailure(e) && !kept.has(e.seq)
    );
    return failures.length === 0
      ? base
      : [...base, ...failures].sort((a, b) => a.seq - b.seq);
  }, [response.events, filter]);

  // The render cap must never be what hides a failed action: take the first
  // MAX_RENDERED rows PLUS every action_failed beyond them, so the module's
  // "failures are always visible" rule survives a 1000-event trace.
  const rendered = useMemo(() => {
    if (showAll || filtered.length <= MAX_RENDERED) return filtered;
    const head = filtered.slice(0, MAX_RENDERED);
    const tailFailures = filtered.slice(MAX_RENDERED).filter(isActionFailure);
    return tailFailures.length === 0 ? head : [...head, ...tailFailures];
  }, [filtered, showAll]);
  const { trace } = response;
  const report = traceReport(response);

  return (
    <Card className="space-y-2 p-3" data-testid="event-trace">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Event trace
          {report.detail ? (
            <span
              className="ml-1.5 rounded border border-border px-1 py-0.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground"
              data-testid="trace-detail-badge"
            >
              {TRACE_DETAIL_LABELS[report.detail] ?? report.detail}
            </span>
          ) : null}
        </h2>
        <p className="text-[11px] text-muted-foreground" data-testid="trace-counts">
          {trace.truncated ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Truncated: {trace.returned_event_count} of {trace.simulated_event_count} simulated
              events returned ({trace.rule}).
            </span>
          ) : report.compacted ? (
            /* NOT an amber warning: a compacted trace is a COMPLETE
               simulation shown in fewer rows, and colouring it like
               truncation would teach the operator to distrust the default. */
            <span data-testid="trace-compacted">
              {report.returned} rows for {report.simulated} simulated events —
              compacted
              {report.grouped > 0
                ? `, ${report.grouped} folded into repeat rows`
                : ""}
              {report.omitted > report.grouped
                ? `, ${report.omitted - report.grouped} omitted at this detail level`
                : ""}
              .
            </span>
          ) : (
            <>All {trace.simulated_event_count} simulated events returned.</>
          )}{" "}
          {/* Stated from the flag, never asserted over it: the backend owns
              this claim and the sentence must flip with it, not append a
              retraction to the wrong statement. */}
          {trace.summaries_cover_full_simulation ? (
            "Summaries cover the full run."
          ) : (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              The backend reports that the summaries do NOT cover the full run.
            </span>
          )}
        </p>
      </header>

      <div className="flex flex-wrap gap-1" role="group" aria-label="Trace filters">
        {TRACE_FILTERS.map((spec) => (
          <button
            key={spec.key}
            type="button"
            aria-pressed={filter === spec.key}
            onClick={() => setFilter(spec.key)}
            className={cn(
              "rounded border px-2 py-0.5 text-[11px]",
              filter === spec.key
                ? "border-primary bg-primary/15 font-medium"
                : "border-border hover:bg-muted"
            )}
          >
            {spec.label}
          </button>
        ))}
      </div>

      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full min-w-[36rem] text-left text-[11px]">
          <thead className="sticky top-0 bg-background">
            <tr className="text-muted-foreground">
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Time</th>
              <th className="py-1 pr-2 font-medium">Source</th>
              <th className="py-1 pr-2 font-medium">Type</th>
              <th className="py-1 pr-2 font-medium">Actor</th>
              <th className="py-1 pr-2 font-medium">Target</th>
              <th className="py-1 pr-2 font-medium">Action</th>
              <th className="py-1 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rendered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-2 text-muted-foreground">
                  {/* An empty KERNEL filter at `summary` is a property of the
                      level, not of the fight. Saying "no events match" there
                      would read as "nothing happened", which is the opposite
                      of true. */}
                  {filter === "combat" && report.detail === "summary"
                    ? "The Summary detail level does not return kernel events. Re-run at Standard or Full to see the per-mechanic combat breakdown."
                    : "No events match this filter."}
                </td>
              </tr>
            ) : null}
            {rendered.map((event) => (
              <tr
                key={event.seq}
                className={cn(
                  "border-t border-border/60 align-top",
                  isActionFailure(event) && "bg-destructive/10 font-medium"
                )}
                data-testid={isActionFailure(event) ? "trace-action-failed" : undefined}
              >
                <td className="py-0.5 pr-2 tabular-nums text-muted-foreground">{event.seq}</td>
                <td className="py-0.5 pr-2 tabular-nums">{event.time.toFixed(3)}</td>
                <td className="py-0.5 pr-2">{event.source}</td>
                <td className="py-0.5 pr-2 font-mono">
                  {event.type}
                  {event.repeats && event.repeats.count > 1 ? (
                    <span
                      className="ml-1 rounded bg-muted px-1 text-[10px] font-sans tabular-nums text-muted-foreground"
                      data-testid="trace-repeat-badge"
                      title={`${event.repeats.count} identical events, #${event.repeats.first_seq}–${event.repeats.last_seq}`}
                    >
                      ×{event.repeats.count}
                    </span>
                  ) : null}
                </td>
                <td className="py-0.5 pr-2 font-mono">{event.actor_id ?? "—"}</td>
                <td className="py-0.5 pr-2 font-mono">{event.target_id ?? "—"}</td>
                <td className="py-0.5 pr-2 font-mono">{event.action_id ?? "—"}</td>
                <td className="py-0.5">{describeEvent(event)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > rendered.length ? (
        <button
          type="button"
          className="text-[11px] underline text-muted-foreground hover:text-foreground"
          onClick={() => setShowAll(true)}
        >
          Showing {rendered.length} of {filtered.length} matching rows (every failed
          action is included) — show all
        </button>
      ) : null}
    </Card>
  );
}
