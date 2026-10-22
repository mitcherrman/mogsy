/**
 * UX-3 — the Baron encounter driven by the server. Same VIS-F4 pit, stakes
 * ladder and outcome arrival as `ObjectivePanel`, but:
 *
 *  - the stakes are the E1 prompt's own `outcomes[]` (approved wording + effects);
 *  - questions come from the objective host's public view (E2 pending: the UX-3
 *    contract double serves placeholders); the client never sees a correct value;
 *  - an answer is locked by the host and comes back graded; the count is never
 *    sent by the client — "Settle" carries only the encounter id;
 *  - the outcome card renders the settled E1 event (category, narrative, effects).
 */
import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, X } from "lucide-react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import type { E1Event, E1Objective, ObjectiveSessionView } from "@/lib/dynasty/e1/contracts";
import { hush, playCue, setTension } from "../audio";
import { CasterPop, SimTag, ambientQuestionOpen, useStinger } from "../broadcast";
import { Btn, Eyebrow, PLATE, SIGIL_COLOR, Sigil, SourceChip } from "../parts";
import { ObjectiveSpectacle, PIT_PLACE } from "../spectacle";
import { SeriesAuthorityContext } from "./authority";
import { CATEGORY_TITLE, CATEGORY_TONE, effectGood, effectText } from "./present";

const TONE_BORDER = { great: "border-[#e3c66f]/70", good: "border-emerald-400/45", mixed: "border-amber-400/45", bad: "border-rose-400/50" } as const;
const TONE_WORD = { great: ["Exceptional", "text-[#f2dc98]"], good: ["Success", "text-emerald-200"], mixed: ["Partial success", "text-amber-200"], bad: ["Disaster", "text-rose-200"] } as const;
const TONE_STING = { great: "gold", good: "ice", mixed: "ember", bad: "red" } as const;
const TONE_CUE = { great: "dynasty.obj.outcome_exceptional", good: "dynasty.obj.outcome_success", mixed: "dynasty.obj.outcome_partial", bad: "dynasty.obj.outcome_disaster" } as const;

export function ServerEffectChip({ e }: { e: E1Event["effects"][number] }) {
  const live = useContext(SeriesAuthorityContext) === "live";
  const good = effectGood(e);
  return (
    <span data-testid="effect-chip" data-sign={good ? "+" : "-"} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", good ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200")}>
      <span className="sr-only">{good ? "Good for you: " : "Bad for you: "}</span>{effectText(e, live)}
    </span>
  );
}

export function ServerOutcomeCard({ event }: { event: E1Event }) {
  const motion = useMotionAllowed();
  const cat = event.outcome.category!;
  const tone = CATEGORY_TONE[cat];
  const [word, wordTone] = TONE_WORD[tone];
  return (
    <div data-testid="objective-outcome" data-correct={event.outcome.correct_count} data-category={cat} data-tone={tone}
      className={cn(PLATE, "dyn-out flex flex-col gap-2.5 rounded-2xl border p-4", TONE_BORDER[tone], motion && `dyn-out--${tone}`)}>
      <div className="flex items-start gap-3">
        <Sigil kind="baron" size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Eyebrow>Baron Nashor</Eyebrow>
            <span className={cn("text-[10.5px] font-bold uppercase tracking-[0.18em]", wordTone)}>{word}</span>
            <span className="dyn-num ml-auto text-[11px] text-white/55">{event.outcome.correct_count} of 3 correct</span>
          </div>
          <h3 className="dyn-title mt-1 text-[22px] font-semibold leading-tight">{CATEGORY_TITLE[cat]}</h3>
        </div>
      </div>
      <p className="text-sm leading-snug text-white/80">{event.explanation.short}</p>
      <div className="flex flex-wrap gap-1.5">{event.effects.map((e, i) => <ServerEffectChip key={i} e={e} />)}</div>
      <SourceChip kind="event" />
    </div>
  );
}

export interface ServerObjectiveProps {
  prompt: E1Objective | null;
  session: ObjectiveSessionView | null;
  /** the settled E1 objective event, once the grade is applied */
  result: E1Event | null;
  busy: boolean;
  accent?: string;
  onOpen: () => void;
  onAnswer: (index: number, option: number) => void;
  onSettle: () => void;
  onContinue: () => void;
  continueLabel: string;
}

export function ServerObjective({ prompt, session, result, busy, accent, onOpen, onAnswer, onSettle, onContinue, continueLabel }: ServerObjectiveProps) {
  const motion = useMotionAllowed();
  const sting = useStinger();
  const live = useContext(SeriesAuthorityContext) === "live";
  const color = SIGIL_COLOR.baron;
  const phase: "stakes" | "ask" | "graded" | "outcome" = result ? "outcome" : !session ? "stakes" : session.state === "in_progress" ? "ask" : "graded";
  // Purely visual: after a lock, keep the just-answered question on screen until the player moves on.
  const [review, setReview] = useState<number | null>(null);
  const seenResult = useRef(false);
  const unsupported = !!prompt && prompt.encounter_kind !== "baron_three_question";

  // As in VIS-F4: each step of the encounter starts at the top of the page.
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [phase, session?.question_index, review]);
  useEffect(() => { ambientQuestionOpen(phase === "ask"); return () => ambientQuestionOpen(false); }, [phase]);
  useEffect(() => { setTension(phase === "stakes" || phase === "ask", phase === "ask" ? 1 + (session?.question_index ?? 0) : 0); return () => setTension(false); }, [phase, session?.question_index]);
  useEffect(() => {
    if (!result || seenResult.current) return;
    seenResult.current = true;
    const tone = CATEGORY_TONE[result.outcome.category!];
    hush(380);
    const t = window.setTimeout(() => sting({ id: "objective.result", kicker: `Baron · ${result.outcome.correct_count} of 3`, title: CATEGORY_TITLE[result.outcome.category!], tone: TONE_STING[tone], ms: 2000, cue: TONE_CUE[tone] }), 380);
    const t2 = tone === "great" ? window.setTimeout(() => playCue("dynasty.crowd.roar"), 750) : tone === "bad" ? window.setTimeout(() => playCue("dynasty.crowd.gasp"), 650) : null;
    return () => { window.clearTimeout(t); if (t2) window.clearTimeout(t2); };
  }, [result, sting]);

  const qIndex = session?.question_index ?? 0;
  const shown = review !== null ? session?.questions[review] : session?.questions[Math.min(qIndex, 2)];
  const answered = session?.questions.filter((q) => q.state === "revealed_correct" || q.state === "revealed_incorrect") ?? [];
  const correctSoFar = answered.filter((q) => q.state === "revealed_correct").length;
  const intensity = phase === "stakes" ? 0 : phase === "ask" ? Math.min(3, 1 + qIndex) : 3;
  const tone = result ? CATEGORY_TONE[result.outcome.category!] : null;

  if (unsupported) {
    return (
      <div className={cn(PLATE, "flex flex-col gap-2 p-4")} data-testid="objective-unsupported">
        <Eyebrow>Objective encounter</Eyebrow>
        <p className="text-sm text-white/80">This objective type ({prompt!.encounter_kind}) has no host yet. Nothing was awarded and no answer was recorded. The game cannot continue until the server supports it.</p>
      </div>
    );
  }

  return (
    <div data-testid="objective-panel" data-kind="baron" data-phase={phase} data-source="server"
      className={cn(PLATE, "dyn-plate--ornate flex flex-col gap-3 p-4", motion && "dyn-enter-fast")}
      style={{ borderColor: `${color}55`, boxShadow: `inset 0 1px 0 ${color}33, 0 0 48px -18px ${color}66, 0 24px 48px -32px rgba(0,0,0,0.95)` } as CSSProperties}>
      <ObjectiveSpectacle kind="baron" phase={phase === "stakes" ? "stakes" : phase === "outcome" ? "outcome" : "ask"} tone={tone} intensity={intensity} accent={accent}>
        <div className="relative flex items-center gap-3">
          <Sigil kind="baron" size={phase === "stakes" ? 44 : 34} breathe={phase !== "outcome"} className="sm:h-12 sm:w-12" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Eyebrow>{phase === "stakes" ? "Objective encounter" : phase === "ask" || review !== null ? `Question ${(shown?.index ?? Math.min(qIndex, 2)) + 1} of 3` : phase === "graded" ? "Graded by the server" : "Outcome"}</Eyebrow>
              <span data-testid="objective-contract" data-contract={live ? "e2" : "e1"}><SimTag className="border-violet-300/40 bg-violet-300/10 text-violet-100/90">{live ? "E2 · server-hosted questions" : "E1 encounter · E2 host pending"}</SimTag></span>
            </div>
            <h3 className="dyn-title mt-0.5 truncate text-[20px] font-semibold leading-tight sm:text-[24px]">Baron Nashor</h3>
          </div>
          <span className="hidden text-right text-[10px] uppercase leading-tight tracking-[0.16em] text-white/55 sm:block">{PIT_PLACE.baron}<br /><span className="text-white/40">Server-graded · knowledge decides this</span></span>
        </div>
      </ObjectiveSpectacle>

      {phase === "stakes" && prompt ? (
        <>
          <p className="line-clamp-2 text-[13px] leading-snug text-white/80 sm:line-clamp-none" data-testid="objective-qualification" title={prompt.qualification}>{prompt.qualification}</p>
          <CasterPop moment="objective.offer" k={`${prompt.encounter_id}|offer`} ctx={{ objective: "Baron" }} compact className="hidden sm:flex" />
          <ul className={cn("flex flex-col gap-1", motion && "dyn-ladder")} aria-label="Possible outcomes" data-testid="objective-ladder">
            {prompt.outcomes.map((row, idx) => {
              const top = row.correct_count === 3, bottom = row.correct_count === 0;
              return (
                <li key={row.correct_count} style={{ "--i": idx } as CSSProperties} data-testid={`ladder-${row.correct_count}`}
                  className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-1 text-[12.5px] leading-snug sm:px-3 sm:py-2 sm:text-[13px]", top ? "border-[#e3c66f]/45 bg-[#e3c66f]/[0.08]" : bottom ? "border-rose-400/35 bg-rose-400/[0.06]" : "border-white/10 bg-white/[0.03]")}>
                  <span className={cn("dyn-num flex h-7 w-10 shrink-0 items-center justify-center rounded-lg border text-[11.5px] font-bold sm:h-8 sm:w-11", top ? "border-[#e3c66f]/60 text-[#f2dc98]" : bottom ? "border-rose-400/50 text-rose-200" : "border-white/20 text-white/80")}>{row.correct_count}/3</span>
                  <span className="min-w-0 text-white/85">{row.intent}{row.ends_game ? <strong className="ml-1 text-[#f2dc98]">Ends the game.</strong> : null}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex justify-end"><Btn primary beckon testId="objective-start" disabled={busy} onClick={onOpen}>Go for the Baron</Btn></div>
        </>
      ) : null}

      {(phase === "ask" || (phase === "graded" && review !== null)) && session && shown ? (
        <>
          <ol className="flex items-center gap-2" aria-label="Question progress">
            {session.questions.map((q) => (
              <li key={q.index} aria-label={`Question ${q.index + 1} ${q.state.replace("revealed_", "").replace("_", " ")}`} data-testid={`q-pip-${q.index}`} data-state={q.state}
                className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-colors",
                  q.state === "revealed_correct" ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200" : q.state === "revealed_incorrect" || q.state === "timed_out" ? "border-rose-400/60 bg-rose-400/15 text-rose-200"
                    : q.state === "answering" ? "border-[#e3c66f] bg-[#e3c66f]/10 text-[#e3c66f] shadow-[0_0_14px_-3px_rgba(227,198,111,0.8)]" : "border-white/20 text-white/35")}>
                {q.state === "revealed_correct" ? <Check className="h-3.5 w-3.5" aria-hidden /> : q.state === "revealed_incorrect" ? <X className="h-3.5 w-3.5" aria-hidden /> : q.index + 1}
              </li>
            ))}
            <li aria-hidden className="ml-auto text-[10px] uppercase tracking-[0.16em] text-white/40">{correctSoFar} correct so far</li>
          </ol>
          <div role="group" aria-labelledby="objective-q" className="flex flex-col gap-2" key={shown.index}>
            <p id="objective-q" className={cn("text-[17px] font-semibold leading-snug text-white", motion && "dyn-enter-fast")} data-testid="objective-question">{shown.prompt}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/40" data-testid="objective-content-label">{session.content_label}</p>
            {(shown.options ?? []).map((o, n) => {
              const mine = shown.chosen === n;
              const st = shown.state === "revealed_correct" && mine ? "right" : shown.state === "revealed_incorrect" && mine ? "wrong" : "idle";
              const locked = shown.state !== "answering" || busy;
              return (
                <button key={n} type="button" data-testid={`objective-opt-${n}`} disabled={locked} onClick={() => { setReview(shown.index); onAnswer(shown.index, n); }}
                  className={cn("dyn-opt flex min-h-[44px] items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]",
                    st === "right" ? cn("border-emerald-400/70 bg-emerald-400/15 text-emerald-50", motion && "dyn-opt--right") : st === "wrong" ? cn("border-rose-400/70 bg-rose-400/15 text-rose-50", motion && "dyn-opt--wrong")
                      : locked ? "border-white/10 bg-white/[0.02] text-white/40" : "border-white/15 bg-white/[0.04] text-white/90 hover:border-[#e3c66f]/50 hover:bg-white/[0.07]")}>
                  <span className="dyn-title flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/20 text-[11px] font-bold text-white/60">{"ABCD"[n]}</span>
                  <span className="min-w-0 flex-1">{o}</span>
                  {st === "right" ? <Check className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden /> : st === "wrong" ? <X className="h-4 w-4 shrink-0 text-rose-300" aria-hidden /> : null}
                  {st === "right" ? <span className="sr-only"> (your answer, correct)</span> : st === "wrong" ? <span className="sr-only"> (your answer, incorrect)</span> : null}
                </button>
              );
            })}
          </div>
          <div aria-live="polite" className={cn("min-h-[1.25rem] text-sm font-semibold", shown.state === "revealed_correct" ? "text-emerald-200" : shown.state === "revealed_incorrect" ? "text-rose-200" : "text-white/50")} data-testid="objective-feedback">
            {busy && shown.state === "answering" ? "Locking your answer…" : shown.state === "revealed_correct" ? "Correct." : shown.state === "revealed_incorrect" ? "Not quite." : ""}
          </div>
          {review !== null && shown.state !== "answering" ? (
            <div className="flex justify-end"><Btn primary testId="objective-next" onClick={() => setReview(null)}>{session.state === "in_progress" ? "Next question" : "See the grade"}</Btn></div>
          ) : null}
        </>
      ) : null}

      {phase === "graded" && review === null && session?.graded ? (
        <div className="flex flex-col gap-2" data-testid="objective-graded" data-correct={session.graded.correct_count}>
          <p className="text-sm text-white/85"><b className="dyn-num text-white">{session.graded.correct_count} of 3</b> correct, graded by the objective host. {live ? "The server has already applied the matching E1 outcome." : "Settling applies the matching E1 outcome to the game."}</p>
          <div className="flex justify-end"><Btn primary beckon testId="objective-settle" disabled={busy} onClick={onSettle}>{busy ? (live ? "Loading…" : "Settling…") : live ? "See the outcome" : "Settle the Baron"}</Btn></div>
        </div>
      ) : null}

      {result ? (
        <>
          <ServerOutcomeCard event={result} />
          <p className="dyn-consequence flex flex-wrap items-center gap-x-2 pt-2 text-[12px] text-white/70" data-testid="objective-consequence"><b className="text-white/90">Back to the match:</b> {result.outcome.category === "baron_ace_closeout" ? "the game ends here; the result is next." : "the Late stage opens with these effects applied by the server."}</p>
          <div className="flex justify-end"><Btn primary beckon testId="objective-continue" disabled={busy} onClick={onContinue}>{continueLabel}</Btn></div>
        </>
      ) : null}
    </div>
  );
}
