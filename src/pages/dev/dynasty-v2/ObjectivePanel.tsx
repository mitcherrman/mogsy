/**
 * UX-1 — the reusable objective encounter: stakes card -> N questions -> outcome.
 * Used for Baron (3Q, post-Mid), Dragon (1Q, Early) and Elder (3Q, tight Late).
 * Questions are SYNTHETIC placeholders about the prototype's own rules; the
 * production version would mount a server-graded Ranked arena instead.
 */
import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useSfx } from "@/lib/audio/useSfx";
import { cn } from "@/lib/utils";
import { draw } from "./engine";
import { SYN_QUESTIONS } from "./fixtures";
import { OBJECTIVES, ladderFor, objectiveOutcome, type ObjectiveKind, type ObjectiveOutcome } from "./objectives";
import { Btn, EffectChip, Eyebrow, SURFACE, SourceChip } from "./parts";

const TONE: Record<ObjectiveOutcome["tone"], string> = {
  great: "border-[#e3c66f]/60 bg-[#e3c66f]/10", good: "border-emerald-400/40 bg-emerald-400/[0.07]",
  mixed: "border-amber-400/40 bg-amber-400/[0.07]", bad: "border-rose-400/40 bg-rose-400/[0.07]",
};

export function OutcomeCard({ outcome, testId = "objective-outcome" }: { outcome: ObjectiveOutcome; testId?: string }) {
  return (
    <div data-testid={testId} data-correct={outcome.correct} data-tone={outcome.tone} data-closeout={outcome.closeout}
      className={cn("flex flex-col gap-2 rounded-2xl border p-4", TONE[outcome.tone])}>
      <Eyebrow>{OBJECTIVES[outcome.kind].title} · {outcome.correct} of {outcome.total} correct</Eyebrow>
      <h3 className="text-xl font-semibold text-white">{outcome.title}</h3>
      <p className="text-sm text-white/80">{outcome.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {outcome.effects.length === 0 && outcome.closeout ? <span className="rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/10 px-2 py-0.5 text-[11px] font-semibold text-[#e3c66f]">Game ends here</span> : null}
        {outcome.effects.map((e, i) => <EffectChip key={i} e={e} />)}
      </div>
      <SourceChip kind="event" />
    </div>
  );
}

export interface ObjectivePanelProps {
  kind: ObjectiveKind;
  seed: string;
  closeoutOffered?: boolean;
  /** Called with the correct count when the player continues from the outcome card. */
  onResolve: (correct: number, outcome: ObjectiveOutcome) => void;
  reason?: string;
}

export function ObjectivePanel({ kind, seed, closeoutOffered = false, onResolve, reason }: ObjectivePanelProps) {
  const def = OBJECTIVES[kind];
  const sfx = useSfx();
  const qs = useMemo(
    () => [...SYN_QUESTIONS].map((q) => ({ q, k: draw(seed, `${kind}|q|${q.id}`) })).sort((a, b) => a.k - b.k).slice(0, def.questions).map((x) => x.q),
    [seed, kind, def.questions],
  );
  const [phase, setPhase] = useState<"stakes" | "ask" | "outcome">("stakes");
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const ladder = ladderFor(kind, closeoutOffered);
  const correct = answers.filter(Boolean).length;
  const outcome = phase === "outcome" ? objectiveOutcome(kind, correct, { closeoutOffered }) : null;

  const answer = (n: number) => {
    if (picked !== null) return;
    const ok = n === qs[i].correct;
    setPicked(n);
    sfx.play(ok ? "ranked.answer.correct" : "ranked.answer.incorrect");
  };
  const next = () => {
    const ok = picked === qs[i].correct;
    const all = [...answers, ok];
    setAnswers(all);
    setPicked(null);
    if (i + 1 >= qs.length) setPhase("outcome"); else setI(i + 1);
  };

  return (
    <div data-testid="objective-panel" data-kind={kind} data-phase={phase} className={cn(SURFACE, "flex flex-col gap-3 p-4")}>
      <div className="flex items-center justify-between gap-2">
        <Eyebrow>{def.title} · {def.questions === 1 ? "1 question" : `${def.questions} questions`}</Eyebrow>
        <span className="text-[10.5px] uppercase tracking-wider text-white/45">Optional boost · knowledge decides this</span>
      </div>

      {phase === "stakes" ? (
        <>
          <p className="text-sm text-white/80">{reason ?? def.intro}</p>
          <ul className="flex flex-col gap-1.5" aria-label="Possible outcomes">
            {ladder.map((row) => (
              <li key={row.correct} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px]">
                <span className="mt-0.5 w-12 shrink-0 text-[11px] font-bold text-[#e3c66f]">{row.correct}/{def.questions}</span>
                <span className="text-white/85"><strong className="text-white">{row.tier}.</strong> {row.summary}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end"><Btn primary testId="objective-start" onClick={() => setPhase("ask")}>Go for the {def.title}</Btn></div>
        </>
      ) : null}

      {phase === "ask" ? (
        <>
          <ol className="flex items-center gap-2" aria-label="Question progress">
            {qs.map((_, n) => (
              <li key={n} aria-label={`Question ${n + 1} ${n < answers.length ? (answers[n] ? "correct" : "incorrect") : n === i ? "current" : "to come"}`}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold",
                  n < answers.length ? (answers[n] ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-rose-400/60 bg-rose-400/15 text-rose-200")
                    : n === i ? "border-[#e3c66f] text-[#e3c66f]" : "border-white/20 text-white/35")}>
                {n < answers.length ? (answers[n] ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />) : n + 1}
              </li>
            ))}
          </ol>
          <div role="group" aria-labelledby="objective-q" className="flex flex-col gap-2">
            <p id="objective-q" className="text-base font-semibold text-white" data-testid="objective-question">{qs[i].prompt}</p>
            <p className="text-[10.5px] uppercase tracking-wider text-white/40">Synthetic placeholder question, not Mogzy graded content</p>
            {qs[i].options.map((o, n) => {
              const state = picked === null ? "idle" : n === qs[i].correct ? "right" : n === picked ? "wrong" : "idle";
              return (
                <button key={n} type="button" data-testid={`objective-opt-${n}`} data-synthetic-correct={n === qs[i].correct} disabled={picked !== null} onClick={() => answer(n)}
                  className={cn("min-h-[44px] rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]",
                    state === "right" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-100" : state === "wrong" ? "border-rose-400/60 bg-rose-400/15 text-rose-100" : "border-white/15 bg-white/[0.04] text-white/90 hover:bg-white/[0.08]")}>
                  {o}{state === "right" ? <span className="sr-only"> (correct)</span> : state === "wrong" ? <span className="sr-only"> (your answer, incorrect)</span> : null}
                </button>
              );
            })}
          </div>
          <div aria-live="polite" className="min-h-[1.25rem] text-sm text-white/70">{picked === null ? "" : picked === qs[i].correct ? "Correct." : "Not quite."}</div>
          <div className="flex justify-end"><Btn primary testId="objective-next" disabled={picked === null} onClick={next}>{i + 1 >= qs.length ? "See the outcome" : "Next question"}</Btn></div>
        </>
      ) : null}

      {outcome ? (
        <>
          <OutcomeCard outcome={outcome} />
          <div className="flex justify-end"><Btn primary testId="objective-continue" onClick={() => onResolve(correct, outcome)}>Continue</Btn></div>
        </>
      ) : null}
    </div>
  );
}
