/**
 * MIG1 — DATA DUEL. Production since DD1-B (ported from the certified MIG1.2
 * lab primitive; the lab, its fixtures and its cues stayed behind).
 *
 * Its production host is `features/mastery/interactions/ComparisonQuestionView`
 * (every ordinary `comparison_left_right` Mastery question), adapted by
 * `toDataDuel.ts`. It emits no sound: the host surface owns every cue.
 *
 * Two subjects face each other; the player picks the side that satisfies the
 * comparison (or "same", when the comparison's domain has a tie), locks it,
 * and after a short beat both deciding values arrive with the MARGIN between
 * them drawn as a centre-origin bar.
 *
 *   OPEN → pick LEFT / RIGHT / (TIE) → LOCK → (suspense, caller-owned) → REVEAL
 *
 * CONTENT-NEUTRAL. The same component draws a Pro Play team comparison and a
 * champion cooldown comparison; it knows labels, tokens and art, never what
 * they mean.
 *
 * NO LEAK BY CONSTRUCTION. `content` (DataDuelPublic) has nowhere to put an
 * answer or a value. The canonical side and both values arrive only through
 * `reveal`, and the component merely marks what it was told. The margin bar is
 * drawn FROM the revealed numbers toward the side the reveal names — it never
 * decides a winner from them (which side "wins" depends on the metric: the
 * shorter cooldown, the higher win rate, and the component does not know
 * which).
 *
 * STYLING IS THE ARENA'S. Each side is a Ranked "carved tablet": the group
 * carries `data-answers-state` and each option `data-quiz-choice` /
 * `data-choice-state`, so `.ranked-academy` paints idle, selected, locked,
 * correct and incorrect-selected exactly as it paints the answer grid. The
 * attribute is bare (valueless, unlike the answer grid's indexed one): it opts
 * into the tablet's paint, not into the answer grid's identity, and only
 * stylesheets consume it (no SFX, analytics or reporter reads it). The
 * canonical-grid source scan (`AnswerGrid.elimination.test`) keys on the
 * indexed JSX form, so this primitive is not a second answer grid.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Check, Equal, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  DataDuelPublic, DataDuelResponse, DataDuelReveal, DuelSide, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import { EvidencePlate, MetricChip, SubjectArt, SuspenseDots } from "./shared";

export interface DataDuelProps {
  content: DataDuelPublic;
  phase: InteractionPhase;
  /** The pending pick (an option token), owned by the caller. */
  value: string | null;
  onChange: (token: string) => void;
  /** Commit. Emits the production `SegmentChoice` scalar shape. */
  onLock: (response: DataDuelResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: DataDuelReveal | null;
  /** The prompt heading (focusable, `tabIndex=-1`), so a host can move focus to it. */
  promptRef?: Ref<HTMLHeadingElement>;
}

type ChoiceState = "idle" | "selected" | "correct" | "incorrect-selected";

/**
 * Off-arena legibility. Inside `.ranked-academy` the arena's tablet rules
 * (higher specificity) paint every state and these are inert; on a surface
 * without them (the Admin Generator Lab, dev Mastery pages) the pick and the
 * reveal would otherwise be invisible. Rings, not borders: the RA1 1.5
 * geometry lock owns the border box.
 */
const OFF_ARENA_STATES = "border-border bg-card"
  + " data-[choice-state=selected]:ring-2 data-[choice-state=selected]:ring-primary"
  + " data-[choice-state=correct]:ring-2 data-[choice-state=correct]:ring-emerald-500"
  + " data-[choice-state=incorrect-selected]:ring-2 data-[choice-state=incorrect-selected]:ring-destructive";
type Which = "left" | "right" | "tie";

function choiceState(token: string, value: string | null, reveal: DataDuelReveal | null): ChoiceState {
  if (reveal) {
    if (token === reveal.canonicalToken) return "correct";
    return token === value ? "incorrect-selected" : "idle";
  }
  return token === value ? "selected" : "idle";
}

/** Tags carry the meaning in words, so the reveal never depends on colour. */
function Tags({ which, picked, canonical, phase, animate }: {
  which: Which; picked: boolean; canonical: boolean; phase: InteractionPhase; animate: boolean;
}) {
  return (
    <>
      {picked && (
        <span data-testid={`duel-tag-pick-${which}`}
          className="inline-flex items-center gap-1 rounded-sm bg-black/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#f0d78c]">
          {phase === "open" ? "Your pick" : <><Lock aria-hidden className="!size-3" /> Locked</>}
        </span>
      )}
      {canonical && (
        <span data-testid={`duel-tag-answer-${which}`}
          className={`inline-flex items-center gap-1 rounded-sm bg-[#0d2740]/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[#bfe4ff] ${
            animate ? "animate-in fade-in zoom-in-75 duration-300 fill-mode-both [animation-delay:380ms]" : ""}`}>
          <Check aria-hidden className="!size-3" /> Answer
        </span>
      )}
    </>
  );
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
  // A reveal with no value for this side (a legacy reveal) shows NO value —
  // never a placeholder that reads like a number.
  const value = reveal ? reveal.values[side.token] ?? null : null;
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
      className={`group relative flex min-h-[44px] w-full flex-col overflow-hidden rounded-lg border !py-0 text-left outline-none ${OFF_ARENA_STATES} ${
        open ? "cursor-pointer" : "cursor-default"} ${
        // Selection answers the tap; the lock COMPRESSES the committed tablet
        // once. Both are one-shot entrance animations, never loops.
        animate && open && state === "selected" ? "animate-in zoom-in-[0.97] duration-150" : ""} ${
        animate && phase === "locked" && picked ? "animate-in zoom-in-95 duration-200 ease-out" : ""}`}>
      {/* No art and no authored short code → one initial, like the Journey
          board's monogram; three letters of a name read as a typo. */}
      <SubjectArt media={side.media} monogram={side.monogram ?? side.label.slice(0, 1)}
        className="h-20 w-full shrink-0 sm:h-28 lg:h-[clamp(4rem,12vh,8rem)]" />
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
        <span className="mt-auto flex h-10 items-end gap-2 pt-1.5 sm:h-11" data-testid={`duel-value-${which}`}>
          {value !== null ? (
            <span key={`${side.token}:${value}`}
              className={`font-serif text-[1.8rem] font-black tabular-nums leading-none sm:text-[2.1rem] ${
                animate ? `animate-in fade-in zoom-in-50 slide-in-from-bottom-2 duration-500 fill-mode-both ${
                  which === "right" ? "[animation-delay:140ms]" : ""}` : ""}`}>
              <ValueText text={value} />
            </span>
          ) : reveal ? null : (
            <span aria-hidden className="mb-2 h-px w-10 bg-current opacity-30" />
          )}
        </span>
      </span>
      <span className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
        <Tags which={which} picked={picked} canonical={canonical} phase={phase} animate={animate} />
      </span>
    </button>
  );
}

/**
 * An authority-formatted value ("590 HP", "25.0%", "90s") drawn with the
 * number at full size and its unit a step down, so "590 HP" reads as a number
 * with a unit rather than two equal words. Pure typography: the string is
 * rendered verbatim, only split at the first non-numeric character.
 */
function ValueText({ text }: { text: string }) {
  const m = text.match(/^([-+]?[\d.,]+)(.*)$/);
  if (!m || !m[2]) return <>{text}</>;
  return <>{m[1]}<span className="font-sans text-[0.5em] font-bold tracking-wide opacity-80">{m[2]}</span></>;
}

/**
 * THE MARGIN. A centre-origin bar: the fill grows from the middle toward the
 * side the reveal named, and its length is the gap RELATIVE to the larger
 * value (a 90s-vs-180s duel reads as a rout, 583-vs-590 as a whisker). A tie
 * draws a single centred mark. Everything is also written out in words — in
 * the AUTHORITY's formatting (`values`, `marginDisplay`), never the client's.
 */
function MarginBar({ content, reveal, animate }: {
  content: DataDuelPublic; reveal: DataDuelReveal; animate: boolean;
}) {
  const [grown, setGrown] = useState(!animate);
  useEffect(() => {
    if (!animate) { setGrown(true); return; }
    const id = window.requestAnimationFrame(() => setGrown(true));
    return () => window.cancelAnimationFrame(id);
  }, [animate]);
  const nums = reveal.numericValues;
  const a = nums?.[content.left.token];
  const b = nums?.[content.right.token];
  const shownA = reveal.values[content.left.token];
  const shownB = reveal.values[content.right.token];
  if (a === undefined || b === undefined || shownA === undefined || shownB === undefined) return null;
  const tieCanonical = content.tie != null && reveal.canonicalToken === content.tie.token;
  const toward: Which = tieCanonical ? "tie"
    : reveal.canonicalToken === content.left.token ? "left"
    : reveal.canonicalToken === content.right.token ? "right" : "tie";
  const delta = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b));
  // Half the track at most; a floor so a real but tiny gap is still visible.
  const reach = toward === "tie" || scale === 0 ? 0 : Math.max(0.05, Math.min(1, delta / scale)) * 50;
  const winner = toward === "left" ? content.left.label : toward === "right" ? content.right.label : null;
  // A decisive margin needs the authority's own margin string; without one the
  // bar is still drawn, and the words fall back to the two values it already
  // printed.
  const text = toward === "tie"
    ? (shownA === shownB ? `Dead even — ${shownA} each` : `Dead even — ${shownA} · ${shownB}`)
    : reveal.marginDisplay ? `${winner} by ${reveal.marginDisplay}` : `${shownA} vs ${shownB}`;
  return (
    <div data-testid="duel-margin" data-margin-toward={toward}
      className={`flex w-full max-w-[34rem] flex-col items-center gap-1.5 ${
        animate ? "animate-in fade-in duration-300 fill-mode-both [animation-delay:260ms]" : ""}`}>
      <div aria-hidden className="relative h-2.5 w-full rounded-full bg-[#2c2417]/15 ring-1 ring-[#7a6236]/35">
        <span className="absolute -top-1 left-1/2 h-[18px] w-0.5 -translate-x-1/2 rounded bg-[#2c2417]/45" />
        {toward === "tie" ? (
          <span data-testid="duel-margin-even"
            className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[#0d2740] bg-[#8fd0f5]" />
        ) : (
          <span data-testid="duel-margin-fill" data-reach={Math.round(reach * 10) / 10}
            className="absolute top-0 h-full rounded-full bg-gradient-to-r from-[#2f8fca] to-[#8fd0f5] transition-[width] duration-700 ease-out motion-reduce:transition-none"
            style={{
              [toward === "left" ? "right" : "left"]: "50%",
              width: `${grown ? reach : 0}%`,
            }} />
        )}
      </div>
      <p data-testid="duel-margin-text"
        className="text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--ranked-ink,#2c2417)]">
        {text}
      </p>
    </div>
  );
}

export function DataDuel({ content, phase, value, onChange, onLock, reveal = null, promptRef }: DataDuelProps) {
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const refs = useRef<Record<Which, HTMLButtonElement | null>>({ left: null, right: null, tie: null });
  const open = phase === "open";
  const order: Which[] = content.tie ? ["left", "right", "tie"] : ["left", "right"];
  const tokenOf = (w: Which) =>
    w === "left" ? content.left.token : w === "right" ? content.right.token : content.tie!.token;
  const pickedWhich = order.find((w) => tokenOf(w) === value) ?? null;

  const pick = (which: Which) => {
    if (!open) return;
    onChange(tokenOf(which));
    refs.current[which]?.focus();
  };
  const lock = () => {
    if (open && value !== null) onLock({ selected: value });
  };

  // Radio-group keys, relative to the FOCUSED option: arrows move AND select
  // (the WAI radio pattern) through left → right → (tie); Enter commits, so a
  // keyboard player never has to leave the group.
  const keysFor = (from: Which) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) return;
    const at = order.indexOf(from);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); pick(order[Math.max(0, at - 1)]); }
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); pick(order[Math.min(order.length - 1, at + 1)]); }
    else if (e.key === "Enter" && value !== null) { e.preventDefault(); lock(); }
  };

  const labelOf = (w: Which) =>
    w === "left" ? content.left.label : w === "right" ? content.right.label : content.tie!.label;
  const canonicalWhich = reveal ? order.find((w) => tokenOf(w) === reveal.canonicalToken) ?? null : null;
  const spoken = (side: DuelSide) =>
    reveal?.values[side.token] !== undefined ? ` ${side.label}: ${reveal.values[side.token]}.` : "";
  const announcement = phase === "revealed" && reveal
    ? `Revealed. ${canonicalWhich ? labelOf(canonicalWhich) : "Unknown"} is the answer.${
      spoken(content.left)}${spoken(content.right)}`
    : phase === "locked" ? `Locked in ${pickedWhich ? labelOf(pickedWhich) : ""}. Revealing.` : "";
  const rovingStop: Which = pickedWhich ?? "left";

  return (
    <div data-testid="mig-data-duel" data-mig-primitive="data-duel" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <MetricChip>{content.metricLabel}</MetricChip>
          {content.context && <MetricChip>{content.context}</MetricChip>}
        </div>
        <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="duel-prompt"
          className="max-w-[40rem] outline-none font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] sm:text-xl lg:text-lg xl:text-xl">
          {content.prompt}
        </h2>
      </header>

      <div role="radiogroup" aria-labelledby={promptId}
        data-answers-state={open ? "open" : "locked"}
        className="flex flex-col gap-2 sm:gap-2.5">
        <div className="relative grid grid-cols-2 gap-3 sm:gap-6">
          {(["left", "right"] as const).map((which) => {
            const side = which === "left" ? content.left : content.right;
            return (
              <SideTablet key={which} side={side} which={which}
                state={choiceState(side.token, value, reveal)}
                phase={phase} reveal={reveal} picked={pickedWhich === which}
                tabIndex={rovingStop === which ? 0 : -1}
                onPick={() => pick(which)} onKeyDown={keysFor(which)} animate={animate}
                buttonRef={(el) => { refs.current[which] = el; }} />
            );
          })}
          {/* The VS seal between the two tablets. Decorative. */}
          <span aria-hidden
            className="pointer-events-none absolute left-1/2 top-[22px] z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-[#d5b66f]/80 bg-[#0b1727] font-serif text-[11px] font-black tracking-wider text-[#f0d78c] shadow-[0_0_0_3px_rgba(11,23,39,0.55),0_6px_16px_-6px_rgba(0,0,0,0.9)] sm:top-[34px] sm:h-11 sm:w-11 sm:text-xs lg:top-[calc(clamp(4rem,12vh,8rem)/2_-_1.375rem)]">
            VS
          </span>
        </div>
        {content.tie && (() => {
          const tie = content.tie;
          const picked = pickedWhich === "tie";
          const canonical = reveal !== null && reveal.canonicalToken === tie.token;
          const tags = [picked ? "your pick" : null, canonical ? "answer" : null].filter(Boolean).join(", ");
          return (
            // THE TIE. A slim, neutral tablet under the pair — present because
            // the comparison's domain has a "same" answer, never a hint that
            // this particular duel is one.
            <button ref={(el) => { refs.current.tie = el; }} type="button" role="radio"
              aria-checked={picked} aria-label={[tie.label, tags].filter(Boolean).join(" — ")}
              aria-disabled={!open || undefined}
              tabIndex={rovingStop === "tie" ? 0 : -1}
              data-testid="duel-side-tie" data-quiz-choice
              data-choice-state={choiceState(tie.token, value, reveal)}
              data-canonical={reveal ? String(canonical) : undefined}
              onClick={open ? () => pick("tie") : undefined} onKeyDown={keysFor("tie")}
              className={`relative mx-auto flex min-h-[44px] w-full max-w-[26rem] flex-wrap items-center justify-center gap-2 rounded-lg border !py-0 text-[13px] font-bold uppercase tracking-[0.2em] outline-none ${OFF_ARENA_STATES} ${
                open ? "cursor-pointer" : "cursor-default"} ${
                animate && phase === "locked" && picked ? "animate-in zoom-in-95 duration-200 ease-out" : ""}`}>
              <Equal aria-hidden className="!size-4" /> {tie.label}
              {/* Inline, not absolute: the pill is short and a tag laid over it
                  would cover its own label. */}
              <span className="pointer-events-none flex gap-1 tracking-normal">
                <Tags which="tie" picked={picked} canonical={canonical} phase={phase} animate={animate} />
              </span>
            </button>
          );
        })()}
      </div>

      <footer className="flex min-h-[2.75rem] flex-col items-center gap-2.5">
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
          <>
            <MarginBar content={content} reveal={reveal} animate={animate} />
            <div className="w-full max-w-[40rem]">
              <EvidencePlate evidence={reveal.evidence} source={reveal.source} animate={animate} />
            </div>
          </>
        )}
      </footer>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}
