/**
 * UX-1 / VIS-F1 — the reusable objective encounter: stakes card -> N questions -> outcome.
 * Used for Baron (3Q, post-Mid), Dragon (1Q, Early) and Elder (3Q, tight Late).
 * Questions are SYNTHETIC placeholders about the prototype's own rules; the
 * production version would mount a server-graded Ranked arena instead.
 *
 * VIS-F1: an encounter banner with the objective's sigil and light, a stakes
 * ladder that cascades in, answer options with right / wrong motion, and four
 * distinct outcome arrivals (great / good / mixed / bad). All motion gated.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check, X } from "lucide-react";
import { useSfx } from "@/lib/audio/useSfx";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { draw } from "./engine";
import { SYN_QUESTIONS } from "./fixtures";
import { OBJECTIVES, ladderFor, objectiveOutcome, type ObjectiveKind, type ObjectiveOutcome } from "./objectives";
import { Btn, EffectChip, Eyebrow, PLATE, SIGIL_COLOR, Sigil, SourceChip } from "./parts";
import { CasterPop, ChatBurst, useStinger } from "./broadcast";

const PIT_LIGHT: Record<ObjectiveKind, string> = { dragon: "22 90% 56%", baron: "262 70% 64%", elder: "190 85% 62%" };
const TONE_STINGER: Record<ObjectiveOutcome["tone"], "gold" | "ice" | "ember" | "red"> = { great: "gold", good: "ice", mixed: "ember", bad: "red" };

const TONE: Record<ObjectiveOutcome["tone"], string> = {
  great: "border-[#e3c66f]/70 bg-[radial-gradient(80%_70%_at_50%_0%,rgba(227,198,111,0.22),rgba(227,198,111,0.02)),linear-gradient(180deg,hsl(213_48%_11%/0.94),hsl(214_52%_7%/0.94))]",
  good: "border-emerald-400/45 bg-[radial-gradient(80%_70%_at_50%_0%,rgba(52,211,153,0.16),rgba(52,211,153,0.01)),linear-gradient(180deg,hsl(213_48%_11%/0.94),hsl(214_52%_7%/0.94))]",
  mixed: "border-amber-400/45 bg-[radial-gradient(80%_70%_at_50%_0%,rgba(251,191,36,0.16),rgba(251,191,36,0.01)),linear-gradient(180deg,hsl(213_48%_11%/0.94),hsl(214_52%_7%/0.94))]",
  bad: "border-rose-400/50 bg-[radial-gradient(80%_70%_at_50%_0%,rgba(244,63,94,0.18),rgba(244,63,94,0.01)),linear-gradient(180deg,hsl(213_48%_11%/0.94),hsl(214_52%_7%/0.94))]",
};
const TONE_WORD: Record<ObjectiveOutcome["tone"], [string, string]> = {
  great: ["Exceptional", "text-[#f2dc98]"], good: ["Success", "text-emerald-200"], mixed: ["Partial success", "text-amber-200"], bad: ["Disaster", "text-rose-200"],
};

export function OutcomeCard({ outcome, testId = "objective-outcome" }: { outcome: ObjectiveOutcome; testId?: string }) {
  const motion = useMotionAllowed();
  const [word, wordTone] = TONE_WORD[outcome.tone];
  return (
    <div data-testid={testId} data-correct={outcome.correct} data-tone={outcome.tone} data-closeout={outcome.closeout}
      className={cn(PLATE, "dyn-out flex flex-col gap-2.5 rounded-2xl border p-4", TONE[outcome.tone], motion && `dyn-out--${outcome.tone}`)}>
      <div className="flex items-start gap-3">
        <Sigil kind={outcome.kind} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Eyebrow>{OBJECTIVES[outcome.kind].title}</Eyebrow>
            <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.18em]", wordTone)}>{word}</span>
            <span className="dyn-num ml-auto text-[11px] text-white/55">{outcome.correct} of {outcome.total} correct</span>
          </div>
          <h3 className="dyn-title mt-1 text-[22px] font-semibold leading-tight">{outcome.title}</h3>
        </div>
      </div>
      <p className="text-sm leading-snug text-white/80">{outcome.summary}</p>
      <div className="flex flex-wrap gap-1.5">
        {outcome.effects.length === 0 && outcome.closeout ? <span className="rounded-full border border-[#e3c66f]/60 bg-[#e3c66f]/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#f2dc98]">Game ends here</span> : null}
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
  const motion = useMotionAllowed();
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
  const color = SIGIL_COLOR[kind];
  const sting = useStinger();
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [phase, i]);
  useEffect(() => {
    if (!outcome) return;
    sting({ id: "objective.result", kicker: `${def.title} · ${outcome.correct} of ${outcome.total}`, title: outcome.title, tone: TONE_STINGER[outcome.tone], ms: 2000, cue: outcome.tone === "bad" ? "ui.feedback.error" : "ranked.points.awarded" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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
    <div data-testid="objective-panel" data-kind={kind} data-phase={phase}
      className={cn(PLATE, "dyn-plate--ornate flex flex-col gap-3 p-4", motion && "dyn-enter-fast")}
      style={{ borderColor: `${color}55`, boxShadow: `inset 0 1px 0 ${color}33, 0 0 48px -18px ${color}66, 0 24px 48px -32px rgba(0,0,0,0.95)` } as CSSProperties}>
      {/* Encounter banner: the pit, a map moment */}
      <div className={cn("dyn-pit -mx-4 -mt-4 mb-1 px-4 pb-3 pt-4", motion && "dyn-pit--motion")} style={{ "--dyn-light": PIT_LIGHT[kind] } as CSSProperties} data-testid="objective-pit">
        <span aria-hidden className="dyn-pit-sky" /><span aria-hidden className="dyn-pit-ring" /><span aria-hidden className="dyn-pit-mist" />
        {outcome ? <span aria-hidden className={cn("absolute inset-0", `dyn-pit-wash--${outcome.tone}`)} /> : null}
      <div className="relative flex items-center gap-3">
        <Sigil kind={kind} size={phase === "stakes" ? 48 : 40} breathe={phase !== "outcome"} className="sm:h-14 sm:w-14" />
        <div className="min-w-0 flex-1">
          <Eyebrow>{phase === "stakes" ? "Objective encounter" : phase === "ask" ? `Question ${i + 1} of ${def.questions}` : "Outcome"}</Eyebrow>
          <h3 className="dyn-title mt-0.5 truncate text-[20px] font-semibold leading-tight sm:text-[24px]">{def.title}</h3>
        </div>
        <span className="hidden text-right text-[10px] uppercase leading-tight tracking-[0.16em] text-white/45 sm:block">Optional boost<br />knowledge decides this</span>
      </div>
      </div>


      {phase === "stakes" ? (
        <>
          <p className="text-[13px] leading-snug text-white/80">{reason ?? def.intro} <span className="text-white/45 sm:hidden">Optional boost: knowledge decides this.</span></p>
          <CasterPop moment="objective.offer" k={`${seed}|${kind}`} ctx={{ objective: def.title }} compact className="hidden sm:flex" />
          <ul className={cn("flex flex-col gap-1", motion && "dyn-ladder")} aria-label="Possible outcomes">
            {[...ladder].reverse().map((row, idx) => {
              const top = row.correct === def.questions, bottom = row.correct === 0;
              return (
                <li key={row.correct} style={{ "--i": idx } as CSSProperties}
                  className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-[12.5px] leading-snug sm:px-3 sm:py-2 sm:text-[13px]",
                    top ? "border-[#e3c66f]/45 bg-[#e3c66f]/[0.08]" : bottom ? "border-rose-400/35 bg-rose-400/[0.06]" : "border-white/10 bg-white/[0.03]")}>
                  <span className={cn("dyn-num flex h-7 w-10 shrink-0 items-center justify-center rounded-lg border text-[11.5px] font-bold sm:h-8 sm:w-11", top ? "border-[#e3c66f]/60 text-[#f2dc98]" : bottom ? "border-rose-400/50 text-rose-200" : "border-white/20 text-white/80")}>{row.correct}/{def.questions}</span>
                  <span className="min-w-0 text-white/85"><strong className="font-semibold text-white">{row.tier}.</strong> {row.summary}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end"><Btn primary beckon testId="objective-start" onClick={() => setPhase("ask")}>Go for the {def.title}</Btn></div>
        </>
      ) : null}

      {phase === "ask" ? (
        <>
          <ol className="flex items-center gap-2" aria-label="Question progress">
            {qs.map((_, n) => (
              <li key={n} aria-label={`Question ${n + 1} ${n < answers.length ? (answers[n] ? "correct" : "incorrect") : n === i ? "current" : "to come"}`}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-colors",
                  n < answers.length ? (answers[n] ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : "border-rose-400/60 bg-rose-400/15 text-rose-200")
                    : n === i ? "border-[#e3c66f] bg-[#e3c66f]/10 text-[#e3c66f] shadow-[0_0_14px_-3px_rgba(227,198,111,0.8)]" : "border-white/20 text-white/35")}>
                {n < answers.length ? (answers[n] ? <Check className="h-3.5 w-3.5" aria-hidden /> : <X className="h-3.5 w-3.5" aria-hidden />) : n + 1}
              </li>
            ))}
            <li aria-hidden className="ml-auto text-[10px] uppercase tracking-[0.16em] text-white/40">{correct} correct so far</li>
          </ol>
          <div role="group" aria-labelledby="objective-q" className="flex flex-col gap-2" key={i}>
            <p id="objective-q" className={cn("text-[17px] font-semibold leading-snug text-white", motion && "dyn-enter-fast")} data-testid="objective-question">{qs[i].prompt}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Synthetic placeholder question, not Mogzy graded content</p>
            {qs[i].options.map((o, n) => {
              const state = picked === null ? "idle" : n === qs[i].correct ? "right" : n === picked ? "wrong" : "idle";
              return (
                <button key={n} type="button" data-testid={`objective-opt-${n}`} data-synthetic-correct={n === qs[i].correct} disabled={picked !== null} onClick={() => answer(n)}
                  className={cn("dyn-opt flex min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]",
                    state === "right" ? cn("border-emerald-400/70 bg-emerald-400/15 text-emerald-50", motion && "dyn-opt--right")
                      : state === "wrong" ? cn("border-rose-400/70 bg-rose-400/15 text-rose-50", motion && "dyn-opt--wrong")
                      : picked !== null ? "border-white/10 bg-white/[0.02] text-white/40" : "border-white/15 bg-white/[0.04] text-white/90 hover:border-[#e3c66f]/50 hover:bg-white/[0.07]")}>
                  <span className={cn("dyn-title flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold", state === "right" ? "border-emerald-300/60" : state === "wrong" ? "border-rose-300/60" : "border-white/20 text-white/60")}>{"ABC"[n]}</span>
                  <span className="min-w-0 flex-1">{o}</span>
                  {state === "right" ? <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden /> : state === "wrong" ? <X className="h-4 w-4 shrink-0 text-rose-300" aria-hidden /> : null}
                  {state === "right" ? <span className="sr-only"> (correct)</span> : state === "wrong" ? <span className="sr-only"> (your answer, incorrect)</span> : null}
                </button>
              );
            })}
          </div>
          <div aria-live="polite" className={cn("min-h-[1.25rem] text-sm font-semibold", picked === null ? "" : picked === qs[i].correct ? "text-emerald-200" : "text-rose-200")}>{picked === null ? "" : picked === qs[i].correct ? "Correct." : "Not quite."}</div>
          <div className="flex justify-end"><Btn primary testId="objective-next" disabled={picked === null} onClick={next}>{i + 1 >= qs.length ? "See the outcome" : "Next question"}</Btn></div>
        </>
      ) : null}

      {outcome ? (
        <>
          <OutcomeCard outcome={outcome} />
          <div className="hidden gap-2 sm:grid sm:grid-cols-[1.3fr_1fr]">
            <CasterPop moment="objective.result" k={`${seed}|${kind}|out`} ctx={{ tier: outcome.title }} compact />
            <ChatBurst moment="objective.result" k={`${seed}|${kind}|${correct}`} n={3} good={outcome.tone === "great" || outcome.tone === "good"} />
          </div>
          <div className="flex justify-end"><Btn primary beckon testId="objective-continue" onClick={() => onResolve(correct, outcome)}>Continue</Btn></div>
        </>
      ) : null}
    </div>
  );
}
