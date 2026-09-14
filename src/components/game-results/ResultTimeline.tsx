/**
 * THE MODULE / ROUND TIMELINE — ten modules at a glance, detail on demand.
 *
 * Ranked's end screen used to open on the last round's full settlement card —
 * two columns of damage, mitigation and HP transitions — and nothing at all
 * about the other nine modules. A player who wanted to know which subjects
 * went badly had no way to find out from the screen that just told them they
 * lost.
 *
 * This is the inverse: EVERY module, immediately, as one strip of marks a
 * reader crosses in a second, with the detail folded behind the mark. Position
 * is the module number, the mark's face is the verdict, and the points the
 * module awarded ride under it when an authority stated them.
 *
 * NOTHING IS SUMMED AND NOTHING IS INFERRED
 * ─────────────────────────────────────────
 * `points` is absent — and no chip is drawn — for any module whose award this
 * client cannot source. A module the player reconnected past has a real
 * verdict from the match review and no award from the local settlement log,
 * and it renders exactly that: a mark with no number, never a zero. A zero is
 * a claim that the module awarded nothing.
 *
 * ONE ROW OPEN AT A TIME, and the strip does not resize when it opens: the
 * detail mounts BELOW the strip rather than inside it, so clicking the tenth
 * mark cannot shuffle the first nine under the cursor.
 */
import { useState } from "react";
import { Check, Minus, X } from "lucide-react";
import type { ResultTimelineEntry } from "./model";

const MARK = {
  correct: {
    Icon: Check,
    ring: "border-emerald-400/55 bg-emerald-500/10 text-emerald-300",
    word: "correct",
  },
  incorrect: {
    Icon: X,
    ring: "border-[#e2757b]/55 bg-[#e2757b]/10 text-[#e2757b]",
    word: "incorrect",
  },
  unanswered: {
    Icon: Minus,
    ring: "border-white/15 bg-white/5 text-slate-500",
    word: "unanswered",
  },
} as const;

export function ResultTimeline({
  entries, unitLabel,
}: {
  entries: readonly ResultTimelineEntry[];
  /** What ONE entry is in this mode — "Modules", "Questions". */
  unitLabel: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (entries.length === 0) return null;
  const active = entries.find((e) => e.index === open) ?? null;
  const won = entries.filter((e) => e.outcome === "correct").length;

  return (
    <section aria-label={unitLabel} data-testid="result-timeline" className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="ranked-eyebrow ranked-eyebrow--cyan">{unitLabel}</h3>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {won} of {entries.length} won
        </span>
      </div>

      {/* Wraps rather than scrolls: ten marks fit one line on a desktop and two
          on a phone, and a horizontal scroller would hide modules behind a
          gesture on exactly the screen where they matter most. */}
      <ul className="flex flex-wrap gap-1.5">
        {entries.map((entry) => {
          const mark = MARK[entry.outcome];
          const isOpen = open === entry.index;
          return (
            <li key={entry.index}>
              <button
                type="button"
                data-testid={`timeline-mark-${entry.index}`}
                data-outcome={entry.outcome}
                aria-expanded={isOpen}
                aria-label={`${unitLabel} ${entry.index}, ${entry.label}, ${mark.word}${
                  typeof entry.points === "number" ? `, ${entry.points} points` : ""}`}
                onClick={() => setOpen(isOpen ? null : entry.index)}
                className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center
                  gap-0.5 rounded-[0.5rem] border px-1.5 transition-shadow
                  motion-reduce:transition-none ${mark.ring} ${
                  isOpen ? "ring-2 ring-[#f0d78c]/60" : ""}`}
              >
                <mark.Icon aria-hidden className="h-3.5 w-3.5" />
                {typeof entry.points === "number" ? (
                  <span className="text-[10px] font-bold tabular-nums leading-none">
                    {entry.points}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold tabular-nums leading-none opacity-50">
                    {entry.index}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {active && (
        <div
          data-testid="timeline-detail"
          className="rounded-[0.6rem] border border-white/10 bg-[#0b1727] px-3 py-2
            animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
        >
          <p className="flex items-baseline gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f0d78c]">
              {unitLabel.replace(/s$/, "")} {active.index}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-200">
              {active.label}
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-slate-400">
              {MARK[active.outcome].word}
              {typeof active.points === "number" && ` · ${active.points} pts`}
            </span>
          </p>
          {active.detail && (
            <p className="mt-1 text-[12px] leading-snug text-slate-300">{active.detail}</p>
          )}
          {active.detailHint && (
            <p className="mt-0.5 text-[10px] text-slate-500">{active.detailHint}</p>
          )}
        </div>
      )}
    </section>
  );
}
