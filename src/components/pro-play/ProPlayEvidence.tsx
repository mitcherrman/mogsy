/**
 * Reveal-only statistical evidence.
 *
 * MOUNTED ONLY AFTER AN ANSWER. Everything here is a number the pre-answer
 * card must never show, so the component takes an evidence blob that only
 * exists on `result` — there is no path by which it can render early.
 *
 * GENERIC, NOT PER-FAMILY. The server types evidence per METRIC (a win rate
 * carries the wins and games it stands on; a ban count carries the scope size
 * instead), so this renders whichever fields are present rather than
 * switching on a family or a shape. A new metric with a new field set gets a
 * sensible row here with no frontend change, and a metric that omits a field
 * simply does not show it — the alternative, hardcoded per-family copy, would
 * invent zeros for the fields that metric does not have.
 *
 * `display` is the SERVER'S formatting ("75.0%", "31"). It is shown verbatim
 * and never recomputed from the raw value, so a rounding rule lives in one
 * place and the reveal cannot disagree with the explanation beside it.
 */
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  ProPlayEvidence as Evidence,
  ProPlayEvidenceSubject,
} from "@/lib/pro-play/contract";

/**
 * The supporting line under a subject's headline value — the sample the
 * number stands on.
 *
 * METRIC-AWARE, so it never repeats the headline. For a WINS question the big
 * number already IS the wins, so the line says "of 27 games"; for a GAMES
 * question the big number is the games, so the line says "24 wins". Printing
 * "12" above "27 games · 12W" is the repetition the card is meant to avoid,
 * and it was visible on a real reveal before this.
 *
 * Built only from fields that are actually present, so a metric that carries
 * no sample simply gets no line rather than an invented one.
 */
function supportLine(
  subject: ProPlayEvidenceSubject,
  metricId: string | undefined,
): string | null {
  const parts: string[] = [];
  const games = subject.games;
  const wins = subject.wins;

  if (metricId === "wins") {
    if (typeof games === "number") parts.push(`of ${games} games`);
  } else if (metricId === "games_played") {
    if (typeof wins === "number") parts.push(`${wins} won`);
  } else if (metricId === "picks" || metricId === "bans") {
    if (typeof subject.scope_games === "number") {
      parts.push(`of ${subject.scope_games} scope games`);
    }
  } else if (metricId === "presence") {
    if (typeof subject.picks === "number") parts.push(`${subject.picks} picks`);
    if (typeof subject.bans === "number") parts.push(`${subject.bans} bans`);
  } else if (metricId === "champion_share") {
    if (typeof games === "number" && typeof subject.total_games_in_scope === "number") {
      parts.push(`${games} of ${subject.total_games_in_scope} games`);
    }
  } else {
    // win_rate, and any future rate metric: the rate is the headline, so the
    // line carries the whole sample it was computed from.
    if (typeof games === "number") {
      parts.push(`${games} game${games === 1 ? "" : "s"}`);
    }
    if (typeof wins === "number") {
      parts.push(
        typeof subject.losses === "number"
          ? `${wins}W–${subject.losses}L`
          : `${wins}W`,
      );
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

export interface ProPlayEvidenceProps {
  evidence: Evidence;
  className?: string;
}

export default function ProPlayEvidence({ evidence, className }: ProPlayEvidenceProps) {
  const subjects = evidence.subjects ?? [];
  if (!subjects.length) return null;
  return (
    <section
      data-pro-play-evidence
      aria-label="Evidence"
      className={cn("rounded-lg border border-border/60 bg-background/40 p-3", className)}
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {evidence.metric?.label || "Evidence"}
        </span>
        {evidence.scope_label ? (
          <span className="min-w-0 truncate text-[10px] text-muted-foreground/80">
            {evidence.scope_label}
          </span>
        ) : null}
      </header>
      <ul
        className={cn(
          // Side by side for a two-way comparison, stacked for a ranking —
          // four ranked rows side by side would compress every value.
          "grid gap-2",
          subjects.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {subjects.map((subject, i) => {
          const isCorrect = subject.label === evidence.correct_label;
          const support = supportLine(subject, evidence.metric?.id);
          return (
            <li
              key={`${subject.label}:${i}`}
              data-pro-play-evidence-subject
              data-correct={isCorrect ? "true" : undefined}
              className={cn(
                "min-w-0 rounded-md border px-2.5 py-2",
                isCorrect
                  ? "border-emerald-400/40 bg-emerald-400/10"
                  : "border-border/60 bg-muted/20",
              )}
            >
              <div className="flex items-center gap-1.5">
                {isCorrect ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                ) : null}
                <span className="min-w-0 truncate text-sm font-semibold" title={subject.label}>
                  {subject.label}
                </span>
              </div>
              <p
                data-pro-play-evidence-value
                className="mt-0.5 text-lg font-bold leading-tight tabular-nums"
              >
                {subject.display ?? "—"}
              </p>
              {support ? (
                <p className="text-[11px] text-muted-foreground">{support}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
