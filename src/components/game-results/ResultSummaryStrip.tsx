/**
 * THE COMPACT RECORD STRIP — Performance and Progress on one line.
 *
 * `ResultStatGrid` and `ResultProgress` stand up two headed sections, a tile
 * each and a row each. That is the right weight for a mode whose end screen
 * IS those figures. It is the wrong weight for one whose centrepiece is above
 * them (Ranked's duel poster and module comparison), where the same facts only
 * need to be legible, not staged — so this prints every stat and progress item
 * as one labelled cell of a single strip.
 *
 * Same model, same values, same test ids (`result-stat-<key>` /
 * `result-progress-<key>`, or the item's own override), so a mode can switch
 * between the two presentations without its contract moving. Hints are kept as
 * the cell's tooltip and accessible description rather than a second line.
 */
import type { ResultProgressItem, ResultStat } from "./model";

const STAT_TONE: Record<NonNullable<ResultStat["tone"]>, string> = {
  plain: "text-slate-100",
  good: "text-emerald-300",
  bad: "text-[#e2757b]",
};

function deltaTone(delta: number | null | undefined): string {
  if (typeof delta !== "number" || delta === 0) return "text-slate-100";
  return delta > 0 ? "text-emerald-300" : "text-[#e2757b]";
}

interface StripCell {
  key: string;
  testId: string;
  label: string;
  value: string;
  hint: string | null;
  tone: string;
}

export function ResultSummaryStrip({ stats, progress }: {
  stats: readonly ResultStat[];
  progress: readonly ResultProgressItem[];
}) {
  const cells: StripCell[] = [
    ...stats.map((s) => ({
      key: `stat-${s.key}`, testId: s.testId ?? `result-stat-${s.key}`,
      label: s.label, value: s.value, hint: s.hint ?? null,
      tone: STAT_TONE[s.tone ?? "plain"],
    })),
    ...progress.map((p) => ({
      key: `progress-${p.key}`, testId: p.testId ?? `result-progress-${p.key}`,
      label: p.label, value: p.value, hint: p.hint ?? null, tone: deltaTone(p.delta),
    })),
  ];
  if (cells.length === 0) return null;
  return (
    <section aria-label="Match record" data-testid="result-summary-strip">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[0.6rem] border border-white/10
        bg-white/5 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
        {cells.map((c) => (
          <div key={c.key} data-testid={c.testId} title={c.hint ?? undefined}
            className="min-w-0 bg-[#0b1727] px-3 py-1.5">
            <dt className="truncate text-[9.5px] font-semibold uppercase tracking-[0.14em]
              text-muted-foreground">
              {c.label}
            </dt>
            <dd className={`truncate text-sm font-bold tabular-nums leading-snug ${c.tone}`}>
              {c.value}
              {c.hint && <span className="sr-only">. {c.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
