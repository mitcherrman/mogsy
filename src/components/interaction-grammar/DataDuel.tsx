/**
 * MIG1.1 — DATA DUEL.
 *
 * Two subjects face each other; the player picks the side that satisfies the
 * comparison, locks it, and after a short beat both deciding values arrive.
 *
 *   OPEN → pick LEFT/RIGHT → LOCK → (suspense, caller-owned) → REVEAL
 *
 * CONTENT-NEUTRAL. The same component draws a Pro Play team comparison and a
 * champion cooldown comparison; it knows labels, tokens and art, never what
 * they mean.
 *
 * NO LEAK BY CONSTRUCTION. `content` (DataDuelPublic) has nowhere to put an
 * answer or a value. The canonical side and both values arrive only through
 * `reveal`, and the component merely marks what it was told — it never
 * compares the values or decides which side won.
 *
 * STYLING IS THE ARENA'S. Each side is a Ranked "carved tablet": the section
 * carries `data-answers-state` and each side `data-quiz-choice` /
 * `data-choice-state`, so `.ranked-academy` paints idle, selected, locked,
 * correct and incorrect-selected exactly as it paints the answer grid. No new
 * CSS was written for this. The attribute is bare (not `data-quiz-choice={i}`):
 * it opts into the tablet's paint, not into the answer grid's identity, and
 * only stylesheets consume it (no SFX, analytics or reporter reads it).
 */
import { useId, useRef, type KeyboardEvent } from "react";
import { Check, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  DataDuelPublic, DataDuelResponse, DataDuelReveal, DuelSide, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import { EvidencePlate, MetricChip, SubjectArt, SuspenseDots } from "./shared";

export interface DataDuelProps {
  content: DataDuelPublic;
  phase: InteractionPhase;
  /** The pending pick (a side token), owned by the caller. */
  value: string | null;
  onChange: (token: string) => void;
  /** Commit. Emits the production `SegmentChoice` scalar shape. */
  onLock: (response: DataDuelResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: DataDuelReveal | null;
}

type ChoiceState = "idle" | "selected" | "correct" | "incorrect-selected";

function choiceState(token: string, value: string | null, reveal: DataDuelReveal | null): ChoiceState {
  if (reveal) {
    if (token === reveal.canonicalToken) return "correct";
    return token === value ? "incorrect-selected" : "idle";
  }
  return token === value ? "selected" : "idle";
}

function SideTablet({
  side, which, state, phase, reveal, picked, tabIndex, onPick, onKeyDown, animate, buttonRef,
}: {
  side: DuelSide;
  which: "left" | "right";
  state: ChoiceState;
  phase: InteractionPhase;
  reveal: DataDuelReveal | null;
  picked: boolean;
  tabIndex: number;
  onPick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  animate: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
}) {
  const open = phase === "open";
  const canonical = reveal !== null && reveal.canonicalToken === side.token;
  const value = reveal ? reveal.values[side.token] ?? "—" : null;
  const tags = [picked ? "your pick" : null, canonical ? "answer" : null].filter(Boolean).join(", ");
  const label = [side.label, side.sublabel, value, tags].filter(Boolean).join(" — ");
  return (
    <button ref={buttonRef} type="button" role="radio" aria-checked={picked}
      aria-label={label} aria-disabled={!open || undefined}
      tabIndex={tabIndex}
      data-testid={`duel-side-${which}`} data-quiz-choice data-choice-state={state}
      data-canonical={reveal ? String(canonical) : undefined}
      onClick={open ? onPick : undefined} onKeyDown={onKeyDown}
      // `!py-0`: the tablet borrows the answer grid's COLOUR states, never its
      // padding — the art is flush to the tablet's top edge at every viewport.
      className={`group relative flex min-h-[44px] w-full flex-col overflow-hidden rounded-lg border !py-0 text-left outline-none ${
        open ? "cursor-pointer" : "cursor-default"} ${
        animate && state === "selected" && open ? "motion-safe:animate-in motion-safe:zoom-in-[0.98] duration-150" : ""}`}>
      <SubjectArt media={side.media} monogram={side.monogram ?? side.label}
        className="h-20 w-full shrink-0 sm:h-28 lg:h-[clamp(4.5rem,15vh,8.5rem)]" />
      <span className="flex flex-1 flex-col gap-0.5 px-2.5 pb-2.5 pt-2 sm:px-3">
        <span className="text-[15px] font-bold leading-tight sm:text-base">{side.label}</span>
        {side.sublabel && (
          <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.14em]">
            {side.sublabel}
          </span>
        )}
        {/* THE VALUE SLOT. Reserved before the reveal (an empty rule, no
            number, no placeholder digit) so the value's arrival moves nothing.
            `mt-auto` pins it to the tablet's floor, so both values sit on one
            line even when one side's sublabel wraps. */}
        <span className="mt-auto flex h-9 items-end gap-2 pt-1.5 sm:h-10" data-testid={`duel-value-${which}`}>
          {value !== null ? (
            <span key={`${side.token}:${value}`}
              className={`font-serif text-[1.65rem] font-black tabular-nums leading-none sm:text-3xl ${
                animate ? `animate-in fade-in zoom-in-50 slide-in-from-bottom-2 duration-500 fill-mode-both ${
                  which === "right" ? "[animation-delay:160ms]" : ""}` : ""}`}>
              {value}
            </span>
          ) : (
            <span aria-hidden className="mb-2 h-px w-10 bg-current opacity-30" />
          )}
        </span>
      </span>
      {/* Tags carry the meaning in words, so the reveal never depends on colour. */}
      <span className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
        {picked && (
          <span data-testid={`duel-tag-pick-${which}`}
            className="inline-flex items-center gap-1 rounded-sm bg-black/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f0d78c]">
            {phase === "open" ? "Your pick" : <><Lock aria-hidden className="!size-3" /> Locked</>}
          </span>
        )}
        {canonical && (
          <span data-testid={`duel-tag-answer-${which}`}
            className={`inline-flex items-center gap-1 rounded-sm bg-[#0d2740]/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#bfe4ff] ${
              animate ? "animate-in fade-in zoom-in-75 duration-300 fill-mode-both [animation-delay:420ms]" : ""}`}>
            <Check aria-hidden className="!size-3" /> Answer
          </span>
        )}
      </span>
    </button>
  );
}

export function DataDuel({ content, phase, value, onChange, onLock, reveal = null }: DataDuelProps) {
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const refs = useRef<{ left: HTMLButtonElement | null; right: HTMLButtonElement | null }>({ left: null, right: null });
  const open = phase === "open";
  const sides = { left: content.left, right: content.right } as const;
  const pickedWhich = value === content.left.token ? "left" : value === content.right.token ? "right" : null;

  const pick = (which: "left" | "right") => {
    if (!open) return;
    onChange(sides[which].token);
    refs.current[which]?.focus();
  };
  const lock = () => {
    if (open && value !== null) onLock({ selected: value });
  };

  // Radio-group keys: arrows move AND select (the WAI radio pattern), Enter
  // commits the current pick so a keyboard player never has to leave the pair.
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); pick("left"); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); pick("right"); }
    else if (e.key === "Enter" && value !== null) { e.preventDefault(); lock(); }
  };

  const selectedLabel = pickedWhich ? sides[pickedWhich].label : null;
  const canonicalSide = reveal
    ? [content.left, content.right].find((s) => s.token === reveal.canonicalToken) ?? null : null;
  const announcement = phase === "revealed" && reveal
    ? `Revealed. ${canonicalSide?.label ?? "Unknown"} is the answer. ${content.left.label}: ${
      reveal.values[content.left.token] ?? "unknown"}. ${content.right.label}: ${reveal.values[content.right.token] ?? "unknown"}.`
    : phase === "locked" ? `Locked in ${selectedLabel ?? ""}. Revealing.` : "";

  return (
    <div data-testid="mig-data-duel" data-mig-primitive="data-duel" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <MetricChip>{content.metricLabel}</MetricChip>
          {content.context && <MetricChip>{content.context}</MetricChip>}
        </div>
        <h2 id={promptId} data-testid="duel-prompt"
          className="max-w-[40rem] font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] sm:text-xl">
          {content.prompt}
        </h2>
      </header>

      <div role="radiogroup" aria-labelledby={promptId}
        data-answers-state={open ? "open" : "locked"}
        className="relative grid grid-cols-2 gap-3 sm:gap-6">
        {(["left", "right"] as const).map((which) => (
          <SideTablet key={which} side={sides[which]} which={which}
            state={choiceState(sides[which].token, value, reveal)}
            phase={phase} reveal={reveal} picked={pickedWhich === which}
            // Roving tab stop: the pick, else the left side.
            tabIndex={(pickedWhich ?? "left") === which ? 0 : -1}
            onPick={() => pick(which)} onKeyDown={onKeyDown} animate={animate}
            buttonRef={(el) => { refs.current[which] = el; }} />
        ))}
        {/* The VS seal between the two tablets. Decorative. */}
        <span aria-hidden
          className="pointer-events-none absolute left-1/2 top-[22px] z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[#d5b66f]/80 bg-[#0b1727] font-serif text-[11px] font-black tracking-wider text-[#f0d78c] shadow-[0_0_0_3px_rgba(11,23,39,0.55),0_6px_16px_-6px_rgba(0,0,0,0.9)] sm:top-[34px] sm:h-11 sm:w-11 sm:text-xs lg:top-[calc(clamp(4.5rem,15vh,8.5rem)/2_-_1.375rem)]">
          VS
        </span>
      </div>

      <footer className="flex min-h-[2.75rem] flex-col items-center gap-2">
        {phase === "open" && (
          <Button type="button" data-testid="duel-lock" onClick={lock} disabled={value === null}
            className="min-h-[44px] min-w-[10rem] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14]">
            <Lock aria-hidden /> {value === null ? "Pick a side" : "Lock in"}
          </Button>
        )}
        {phase === "locked" && (
          <p data-testid="duel-suspense"
            className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            Locked · Revealing <SuspenseDots animate={animate} />
          </p>
        )}
        {phase === "revealed" && reveal && (
          <div className="w-full max-w-[40rem]">
            <EvidencePlate evidence={reveal.evidence} source={reveal.source} animate={animate} />
          </div>
        )}
      </footer>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
