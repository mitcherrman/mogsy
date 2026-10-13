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
 *
 * MPE — the knowledge cells (XP, collection) carry the same gold emphasis the
 * full list gives its knowledge rows, and an EARNED XP gain counts up here
 * exactly as it does there (`isEarnedXp`, one predicate), so Ranked's compact
 * screen and the practice screen reward the same thing the same way.
 */
import type { CSSProperties } from "react";
import { EarnedXpValue } from "./EarnedXpValue";
import type { ResultProgressItem, ResultStat } from "./model";
import { EARNED_XP_LEAD_MS, isEarnedXp, isKnowledgeItem } from "./ResultProgress";

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
  knowledge: boolean;
  /** The settled gain for an earned-XP cell, else null. */
  earned: number | null;
}

const CELL_STEP_MS = 40;

export function ResultSummaryStrip({ stats, progress, enterDelayMs = 0 }: {
  stats: readonly ResultStat[];
  progress: readonly ResultProgressItem[];
  enterDelayMs?: number;
}) {
  const cells: StripCell[] = [
    ...stats.map((s) => ({
      key: `stat-${s.key}`, testId: s.testId ?? `result-stat-${s.key}`,
      label: s.label, value: s.value, hint: s.hint ?? null,
      tone: STAT_TONE[s.tone ?? "plain"], knowledge: false, earned: null,
    })),
    ...progress.map((p) => ({
      key: `progress-${p.key}`, testId: p.testId ?? `result-progress-${p.key}`,
      label: p.label, value: p.value, hint: p.hint ?? null, tone: deltaTone(p.delta),
      knowledge: isKnowledgeItem(p), earned: isEarnedXp(p) ? p.delta : null,
    })),
  ];
  if (cells.length === 0) return null;
  return (
    <section aria-label="Match record" data-testid="result-summary-strip">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[0.6rem] border border-white/10
        bg-white/5 sm:grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))]">
        {cells.map((c, index) => (
          <div key={c.key} data-testid={c.testId} title={c.hint ?? undefined}
            data-knowledge={c.knowledge ? "true" : undefined}
            className="reward-enter relative min-w-0 bg-[#0b1727] px-3 py-1.5"
            style={{ "--reward-delay": `${enterDelayMs + index * CELL_STEP_MS}ms` } as CSSProperties}>
            {c.knowledge && (
              <>
                {/* The wash sits on an opaque ground, so the strip's hairline
                    grid never shows through a tinted cell. */}
                <span aria-hidden className="pointer-events-none absolute inset-0
                  bg-gradient-to-br from-[#f0d78c]/[0.10] to-transparent" />
                <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px
                  bg-gradient-to-r from-transparent via-[#f0d78c]/70 to-transparent" />
              </>
            )}
            <dt className="relative truncate text-[9.5px] font-semibold uppercase tracking-[0.14em]
              text-muted-foreground">
              {c.label}
            </dt>
            <dd className={`relative truncate text-sm font-bold tabular-nums leading-snug ${
              c.earned !== null ? "text-[#f5e6b8]" : c.tone}`}>
              {c.earned !== null ? (
                <EarnedXpValue amount={c.earned} value={c.value}
                  delayMs={enterDelayMs + index * CELL_STEP_MS + EARNED_XP_LEAD_MS} />
              ) : c.value}
              {c.hint && <span className="sr-only">. {c.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
