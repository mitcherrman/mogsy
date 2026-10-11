/**
 * PPQ2-C — the SESSION PANEL, the arena's right `panel` flank.
 *
 * Three facts and nothing else, all real:
 *   - the current question number of the server's plan (`number / total`);
 *   - the server's score (`session.score` of `session.answered`);
 *   - one pip per question, from results this client actually RECEIVED.
 *
 * There is no opponent, rating, HP, streak or clock in Pro Play, so there is
 * none here. A pip with no received result stays neutral even if the server
 * may have graded it — the panel never infers an outcome.
 *
 * Desktop only by contract (panel flanks are `hidden lg:block`); on phones
 * the header title and the arena's round timeline carry the same facts.
 */
import { Check, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { GoldHairline } from "./ArenaOrnaments";
import type { ProPlayOutcome } from "./proPlayArenaModel";

export interface ProPlaySessionPanelProps {
  /** The current question's number (1-based), from the served question. */
  number: number;
  /** The server's plan length. */
  total: number;
  /** `session.score` — the server's count, never a client tally. */
  score: number;
  /** `session.answered`. */
  answered: number;
  /** Received verdicts keyed by question number (1-based). */
  outcomes: ReadonlyMap<number, ProPlayOutcome>;
  /** True once the session is complete (no current question). */
  complete?: boolean;
  className?: string;
}

type PipState = ProPlayOutcome | "current" | "upcoming" | "unknown";

function pipState(n: number, current: number, outcomes: ReadonlyMap<number, ProPlayOutcome>, complete: boolean): PipState {
  const outcome = outcomes.get(n);
  if (outcome) return outcome;
  if (!complete && n === current) return "current";
  return n < current || complete ? "unknown" : "upcoming";
}

const PIP_CLASS: Record<PipState, string> = {
  correct: "border-[#2f8fca] bg-[#0d2740] text-[#8fd0f5]",
  incorrect: "border-[#b8494f] bg-[#331316] text-[#e2757b]",
  current: "border-[#d5b66f] bg-[#2a2110] text-[#f6e6bb] shadow-[0_0_12px_-2px_rgba(213,182,111,0.7)]",
  upcoming: "border-white/15 bg-white/[0.03] text-white/35",
  unknown: "border-white/25 bg-white/[0.05] text-white/45",
};

const PIP_LABEL: Record<PipState, string> = {
  correct: "correct",
  incorrect: "incorrect",
  current: "current question",
  upcoming: "not played yet",
  unknown: "answered",
};

export default function ProPlaySessionPanel({
  number, total, score, answered, outcomes, complete = false, className,
}: ProPlaySessionPanelProps) {
  const positions = Array.from({ length: Math.max(0, total) }, (_, i) => i + 1);
  return (
    <aside
      aria-label="Your run"
      data-testid="pro-play-session-panel"
      className={cn("ranked-panel flex h-full min-h-0 flex-col gap-4 overflow-hidden p-4 text-left xl:p-5", className)}
    >
      <div className="space-y-2">
        <div className="ranked-eyebrow">Your run</div>
        <GoldHairline className="w-full" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div data-testid="session-question"
          className="rounded-md border border-[#c9a84c]/25 bg-white/[0.03] px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">Question</p>
          <p className="ranked-title mt-1 leading-none text-[#f0e6d2]">
            <span className="text-[1.75rem] font-bold xl:text-[2rem]">{complete ? total : number}</span>
            <span className="ml-1 text-sm text-white/50">/ {total}</span>
          </p>
        </div>
        <div data-testid="session-score"
          className="rounded-md border border-[#c9a84c]/25 bg-white/[0.03] px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/45">Correct</p>
          <p className="ranked-title mt-1 leading-none text-[#f0dcae]">
            <span className="text-[1.75rem] font-bold xl:text-[2rem]">{score}</span>
            <span className="ml-1 text-sm text-white/50">/ {answered}</span>
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/45">Questions</p>
        <ol data-testid="session-pips" className="grid grid-cols-5 gap-1.5">
          {positions.map((n) => {
            const state = pipState(n, number, outcomes, complete);
            return (
              <li key={n} data-pip={n} data-pip-state={state}
                aria-label={`Question ${n}: ${PIP_LABEL[state]}`}
                className={cn(
                  "flex aspect-square min-w-0 items-center justify-center rounded-md border text-[11px] font-bold",
                  PIP_CLASS[state],
                )}>
                {state === "correct" ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                  : state === "incorrect" ? <X aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />
                    : <span aria-hidden>{n}</span>}
              </li>
            );
          })}
        </ol>
        <ul aria-hidden className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[10px] text-white/55">
          <li className="flex items-center gap-1"><Check className="h-3 w-3 text-[#8fd0f5]" strokeWidth={3} />Correct</li>
          <li className="flex items-center gap-1"><X className="h-3 w-3 text-[#e2757b]" strokeWidth={3} />Incorrect</li>
          <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-[#d5b66f] bg-[#2a2110]" />Current</li>
        </ul>
      </div>

      {/* Progress through the server's plan: answered of total. Pinned to the
          panel's foot so the column reads as one instrument, top to bottom. */}
      <div data-testid="session-progress" className="mt-auto space-y-1.5">
        <div className="flex items-baseline justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
          <span>Answered</span>
          <span className="tabular-nums text-white/70">{answered} / {total}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.18)]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#7a5e22] via-[#c9a84c] to-[#f0d78c] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${total > 0 ? Math.min(100, Math.max(0, (answered / total) * 100)) : 0}%` }} />
        </div>
      </div>
    </aside>
  );
}
