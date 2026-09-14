/**
 * PERFORMANCE SNAPSHOT — the figures behind the result.
 *
 * A plain grid, because these are plain facts and the hero above already did
 * the shouting. Tone is available but deliberately rare: a grid where every
 * cell is coloured tells the reader nothing about which cell matters.
 *
 * Every cell here is a value an ADAPTER sourced from its mode's own payload.
 * There is no cell this component can produce on its own, which is how a stat
 * a mode does not measure stays off the screen instead of reading "—".
 */
import type { ResultStat } from "./model";

const TONE: Record<NonNullable<ResultStat["tone"]>, string> = {
  plain: "text-slate-100",
  good: "text-emerald-300",
  bad: "text-[#e2757b]",
};

export function ResultStatGrid({ stats }: { stats: readonly ResultStat[] }) {
  if (stats.length === 0) return null;
  return (
    <section aria-label="Performance" data-testid="result-snapshot" className="space-y-2">
      <h3 className="ranked-eyebrow ranked-eyebrow--cyan">Performance</h3>
      <div className={`grid gap-2 ${
        stats.length <= 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
        {stats.map((s) => (
          <div
            key={s.key}
            data-testid={s.testId ?? `result-stat-${s.key}`}
            /* Opaque ground rather than `.ranked-subpanel`'s gradient, for the
               reason DiscoveryReveal's quiet strip states: a background-IMAGE
               cannot be made opaque by a utility, so a tile mounted outside
               `.theme-lol` takes the colour of whatever is behind the frame. */
            className="rounded-[0.6rem] border border-white/10 bg-[#0b1727] px-3 py-2"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {s.label}
            </p>
            <p className={`mt-1 text-lg font-bold tabular-nums leading-none ${
              TONE[s.tone ?? "plain"]}`}>
              {s.value}
            </p>
            {s.hint && <p className="mt-1 text-[10px] text-slate-400">{s.hint}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
