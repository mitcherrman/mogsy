/**
 * MIG — ORDER FORGE. The first structured-response primitive.
 *
 * The player is dealt a handful of cards and arranges them into a sequence
 * along one stated direction ("Most expensive" at the top, "Cheapest" at the
 * bottom). The SEQUENCE is the answer: one Lock In, no per-card questions.
 *
 *   OPEN → drag / nudge cards into order → LOCK IN → (caller-owned) → REVEAL
 *
 * CONTENT-NEUTRAL. It knows labels, tokens and art, never what they measure.
 *
 * NO LEAK, NO GRADING. `content` (OrderForgePublic) has no field that could
 * hold a value or a rank. The canonical order, each card's value and the
 * per-position marks arrive only through `reveal`, and the primitive only
 * DISPLAYS them: it never derives which position is right.
 *
 * INPUT (OF4). Drag uses framer-motion `Reorder` with `dragListener={false}`:
 * the row starts the drag itself, so framer never puts `touch-action: none`
 * on the card and a phone can still scroll the page by swiping across it.
 *   * Mouse: press anywhere on the card (except the arrow buttons) and drag.
 *   * Touch / pen: press and HOLD the card (`LIFT_DELAY_MS`); a swipe that
 *     moves before then is a page scroll and is left to the browser. While a
 *     card is lifted, a non-passive `touchmove` listener on the list cancels
 *     the scroll. The grip keeps `touch-action: none` and lifts at once.
 * Drag is never the only way: every card has 44px up / down buttons, and the
 * grip answers ArrowUp / ArrowDown, so keyboard and screen-reader players
 * order the cards without a pointer. Moves are announced through a live
 * region. Reduced motion (OS or in-app) removes the layout animation.
 *
 * ONE FOOTPRINT (OF4). The numbered slots are a fixed rail beside the cards,
 * and every row, open, locked or revealed, has the same fixed height, so lock
 * and reveal change what is IN the rows and never where they are.
 *
 * ONE ROW (OF4-CONTINUITY). Each card is one element from the open board to
 * the settled reveal (`ForgeRow`), and its trailing slot keeps one width
 * (`TRAIL_W`), so the art, the label and its line breaks never move unless the
 * reveal is deliberately moving the whole card.
 *
 * THE REVEAL (OF4) teaches the answer, in two steps:
 *   1. "Your order": the cards stay where the player locked them; each gets
 *      its value and the authority's right / wrong mark.
 *   2. "Correct order": the cards travel (shared layout animation, a bounded
 *      tween, see `REVEAL_TIMING`) into the
 *      canonical order, so every wrong card is SEEN moving to where it
 *      belongs, and each keeps a note of the slot the player gave it.
 * It plays only when this mount watched the lock become a reveal. Mounting on
 * an existing reveal (a refresh, a resumed match) and reduced motion both
 * show the settled step 2 at once. Information is never removed, only motion.
 */
import {
  useEffect, useId, useRef, useState,
  type KeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type Ref,
} from "react";
import { Reorder, motion, useDragControls, type DragControls } from "framer-motion";
import { ArrowDown, ArrowUp, Check, GripVertical, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  InteractionPhase, OrderEntry, OrderForgePublic, OrderForgeResponse, OrderForgeReveal,
} from "@/lib/interaction-grammar/types";
import { MetricChip, SubjectArt, SuspenseDots } from "./shared";

export interface OrderForgeProps {
  content: OrderForgePublic;
  phase: InteractionPhase;
  /** The pending sequence (entry tokens), owned by the caller. */
  value: readonly string[];
  onChange: (order: string[]) => void;
  /** Commit. Emits the production `SegmentChoice` `order` shape. */
  onLock: (response: OrderForgeResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: OrderForgeReveal | null;
  /** The prompt heading (focusable, `tabIndex=-1`), so a host can move focus to it. */
  promptRef?: Ref<HTMLHeadingElement>;
}

type Dir = "up" | "down";

/** Move `token` one place; returns the same array when it cannot move. */
export function moveToken(order: readonly string[], token: string, dir: Dir): string[] {
  const at = order.indexOf(token);
  const to = dir === "up" ? at - 1 : at + 1;
  if (at < 0 || to < 0 || to >= order.length) return [...order];
  const next = [...order];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}

/** Touch / pen: how long a press must hold still before the card lifts. */
export const LIFT_DELAY_MS = 180;
/** Movement (px) before the lift that hands the gesture to the page scroll. */
export const LIFT_SLOP_PX = 8;

/**
 * The reveal's beats (ms from the moment the reveal arrives).
 *
 * THE BUDGET IS 900ms, NOT 1500. The Ranked controller holds a settled round
 * for `REVEAL_HOLD_MS` (1500) only when it learns of the settlement on time;
 * `anchoredRevealHoldMs` may shorten an ordinary reveal to `REVEAL_HOLD_MIN_MS`
 * (900) when the client discovers it late, so the next module keeps its title
 * window. 900 is therefore the only duration this component may rely on, and
 * the whole teaching sequence has to land, AND be readable, inside it. (OF4's
 * first timings, 700 / 1200, assumed the nominal 1500 and never finished in
 * production: see `ORDER_FORGE_OF4_HANDOFF.md`, OF4-FIX1.)
 *
 *   0 ........ values + marks fade in, card by card (done by ~300)
 *   240 ...... the cards start travelling into the canonical order
 *   480 ...... they have landed (a bounded tween, so this is a number and not
 *              a spring's tail); the "was N" notes fade in
 *   ~640 ..... notes done; the canonical order simply stays, up to the release
 *
 * That leaves `REVEAL_DWELL_MIN_MS` (420) on the finished, correct order inside
 * the shortest legal beat, and ~1000ms inside the nominal one. The numbers are
 * pinned against the real host constants in `orderForge.revealBudget.test.tsx`.
 */
export const REVEAL_TIMING = {
  /** Values and marks appear on the locked order, one card after another. */
  valueStaggerMs: 30,
  /** One value / mark fade. */
  valueFadeMs: 160,
  /** The marks trail their value by this much. */
  markLagMs: 50,
  /** The cards start travelling into the canonical order. */
  assembleAtMs: 240,
  /** How long the travel takes (a tween: bounded, not a spring). */
  moveMs: 240,
  /** The cards have landed; the "was N" notes appear. */
  settleAtMs: 480,
} as const;

/** What the finished, correct order is guaranteed to stay up inside the 900ms minimum. */
export const REVEAL_DWELL_MIN_MS = 420;

/** The reveal's reorder: bounded, so "landed" is a time, not a tail. */
const REVEAL_MOVE_TRANSITION = {
  type: "tween", duration: REVEAL_TIMING.moveMs / 1000, ease: [0.22, 1, 0.36, 1],
} as const;

/**
 * F1 - the big-desktop tier. The arena locks the stage to the viewport height
 * on desktop, so the larger cards use the literal `lg:[@media(min-height:860px)]:`
 * variant (width AND height): a short laptop keeps compact rows, only wider.
 * Literal classes, because Tailwind cannot see an interpolated variant.
 */

/** Off-arena legibility; inside `.ranked-academy` the tablet paint takes over. */
const CARD_SURFACE = "border-[#7a6236]/55 bg-[#f4e9cc] text-[#2c2417] dark:bg-card dark:text-foreground";
/**
 * OF4 - ONE row height for every phase (and the slot rail beside it), so the
 * cards never move when the input closes or the reveal lands. Sized to the
 * open row: 44px controls + padding on a phone, the F1 tiers on desktop.
 */
const ROW_H = "h-14 md:h-[60px] lg:h-[52px] lg:[@media(min-height:860px)]:h-[76px]";
const LIST_GAP = "gap-2 md:gap-2.5 lg:gap-1.5 lg:[@media(min-height:860px)]:gap-2.5";
const ART = "h-8 w-8 shrink-0 self-center rounded-md sm:h-11 sm:w-11 md:h-12 md:w-12 lg:h-10 lg:w-10 lg:[@media(min-height:860px)]:h-14 lg:[@media(min-height:860px)]:w-14";
const STACK_W = "max-w-[34rem] md:max-w-[44rem] xl:max-w-[52rem]";
/**
 * OF4-CONTINUITY - the row's trailing slot has ONE width in every phase: the
 * three 44px controls while open, nothing once locked, the value and the mark
 * once revealed. Before, the slot came and went with its content, so the label
 * gained ~160px at the lock and lost it again at the reveal; a two-line name
 * on a phone rewrapped to one line and back within 150ms. Sized to the wider
 * of the controls (136px / 144px) and a ten-character value ("3,450 gold")
 * with its mark.
 */
const TRAIL_W = "w-[8.5rem] sm:w-[9.5rem] md:w-[11.5rem]";

function Rail({ text, edge, aside }: { text: string; edge: "first" | "last"; aside?: React.ReactNode }) {
  return (
    <p data-testid={`forge-rail-${edge}`}
      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ranked-ink-muted,#5a4a2e)] md:text-[11px] md:tracking-[0.26em]">
      <span aria-hidden>{edge === "first" ? "▼" : "▲"}</span>
      {edge === "first" ? "Start" : "End"}: {text}
      <span aria-hidden className="hidden h-px flex-1 bg-gradient-to-r from-[#7a6236]/50 to-transparent md:block" />
      {aside}
    </p>
  );
}

/** The 1-5 numeral: a filled badge, so the top-to-bottom flow reads at a glance. */
function RankBadge({ n, testId }: { n: number; testId: string }) {
  return (
    <span aria-hidden data-testid={testId}
      className="flex h-7 w-6 shrink-0 items-center justify-center self-center rounded-full border border-[#7a6236]/50 bg-[#f4e9cc] font-serif text-lg font-black tabular-nums text-[#7a6236] shadow-sm sm:w-7 md:h-9 md:w-9 md:text-xl lg:h-8 lg:w-8 lg:text-lg xl:text-xl dark:bg-card">
      {n}
    </span>
  );
}

/**
 * The fixed slot numbers. The cards move; the slots do not. A card dragged or
 * revealed into slot 3 is next to the 3, and the numeral never jumps with it.
 */
function SlotRail({ count, prefix }: { count: number; prefix: string }) {
  return (
    <ol aria-hidden data-testid={`${prefix}-slots`} className={`flex shrink-0 flex-col p-0 ${LIST_GAP}`}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`flex list-none items-center ${ROW_H}`}>
          <RankBadge n={i + 1} testId={`${prefix}-slot-${i + 1}`} />
        </li>
      ))}
    </ol>
  );
}

/**
 * OF4 - press anywhere on the card to drag it (see the module note). Returns
 * the row's `onPointerDown`. `liftRef` is shared with the list's touchmove
 * guard: true only while a touch-lifted card is being dragged.
 */
function useRowDrag(controls: DragControls, disabled: boolean,
                    liftRef: MutableRefObject<boolean>, onLift: (lifted: boolean) => void) {
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => () => pending.current?.(), []);
  return (e: ReactPointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    const target = e.target as Element;
    // The arrow buttons are buttons: a press there is a click, never a drag.
    if (target.closest("[data-forge-nudge]")) return;
    const native = e.nativeEvent;
    const onGrip = !!target.closest("[data-forge-grip]");
    if (e.pointerType === "mouse" || onGrip) {
      // No text selection or native image drag under a mouse drag.
      if (e.pointerType === "mouse") e.preventDefault();
      controls.start(native);
      return;
    }
    // Touch / pen: arm a lift. Moving first means the player is scrolling.
    pending.current?.();
    const x0 = e.clientX, y0 = e.clientY, id = e.pointerId;
    const end = () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      pending.current = null;
      if (liftRef.current) {
        liftRef.current = false;
        onLift(false);
      }
    };
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id || liftRef.current) return;
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > LIFT_SLOP_PX) end();
    };
    const timer = window.setTimeout(() => {
      liftRef.current = true;
      onLift(true);
      controls.start(native);
    }, LIFT_DELAY_MS);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    pending.current = end;
  };
}

type Mark = "right" | "wrong" | "neutral";
type RevealStep = "mine" | "assembled";
type RowMode = "open" | "locked" | "revealed";

/** What a revealed row shows. Display only: every field is the server's, or an index into its orders. */
interface RowReveal {
  mark: Mark;
  /** The authority's value string, or null. */
  value: string | null;
  /** Where the player put this card (1-based). */
  yours: number | null;
  /** Which way the card travelled to its canonical slot, if it did. */
  moved: Dir | null;
  step: RevealStep;
  animate: boolean;
  /** Stagger index for the value beat (the card's slot in the LOCKED order). */
  order: number;
}

/**
 * ONE ROW, OPEN TO REVEAL (OF4-CONTINUITY). The open card, the locked card and
 * the revealed card are the SAME element: one `Reorder.Item` per token for the
 * whole round. The lock and the reveal change what is inside the row (the
 * controls give way to nothing, then to the value and the mark) and never
 * remount the row, its art or its label. Before this, the lock swapped the
 * `Reorder.Item` for a separate static row, replacing every row, art box and
 * image node at the exact moment the player pressed Lock In.
 *
 * Drag exists only while open (`drag={false}` afterwards: framer's
 * `Reorder.Item` spreads its props over its own `drag`). The row mounts as a
 * layout element (framer only projects elements that MOUNTED with `layout`),
 * so the reveal's reorder into the canonical order animates with the same
 * node the player dragged.
 */
function ForgeRow({
  entry, mode, index, total, onMove, buttonRef, reduced, liftRef, reveal,
}: {
  entry: OrderEntry;
  mode: RowMode;
  index: number;
  total: number;
  /** `via` is the control that asked, so focus can stay on it after the move. */
  onMove: (dir: Dir, via: Dir | "grip") => void;
  buttonRef: (key: string, el: HTMLButtonElement | null) => void;
  reduced: boolean;
  liftRef: MutableRefObject<boolean>;
  reveal: RowReveal | null;
}) {
  const open = mode === "open";
  const controls = useDragControls();
  const [lifted, setLifted] = useState(false);
  const onPointerDown = useRowDrag(controls, !open, liftRef, setLifted);
  const key = (d: Dir | "grip") => `${entry.token}:${d}`;
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); onMove("up", "grip"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onMove("down", "grip"); }
  };
  const where = `position ${index + 1} of ${total}`;
  const testId = open ? `forge-card-${entry.token}`
    : mode === "revealed" ? `forge-reveal-${entry.token}` : `forge-locked-${entry.token}`;
  const mark: Mark = reveal?.mark ?? "neutral";
  const animate = reveal?.animate === true;
  const ring = mark === "right" ? "ring-2 ring-emerald-600/80 border-emerald-700/40"
    : mark === "wrong" ? "ring-2 ring-red-600/75 border-red-700/40" : "";
  const fade = (delayMs: number) => (animate
    ? { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 },
      transition: { duration: REVEAL_TIMING.valueFadeMs / 1000, delay: delayMs / 1000 } }
    : { initial: false as const });
  const valueDelay = (reveal?.order ?? 0) * REVEAL_TIMING.valueStaggerMs;
  const yours = reveal?.yours ?? null;
  const showNote = reveal?.step === "assembled" && yours !== null;
  return (
    <Reorder.Item as="li" value={entry.token} drag={open ? "y" : false}
      dragListener={false} dragControls={controls}
      data-testid={testId} data-position={index + 1}
      data-lifted={lifted ? "true" : undefined}
      {...(open ? {} : { "data-mark": mark })}
      data-yours={yours ?? undefined} data-moved={reveal?.moved ?? undefined}
      onPointerDown={onPointerDown}
      // A long press must not open the touch callout / context menu.
      onContextMenu={(e) => { if (open) e.preventDefault(); }}
      // Reduced motion: never a layout element, so a reorder (a nudge, or the
      // reveal's jump to the canonical order) is one frame with no projected
      // in-between. Framer still measures a draggable row (its `drag` sets
      // `alwaysMeasureLayout`), which is all `Reorder` needs.
      layout={reduced ? false : "position"}
      // The reveal's reorder is FIX1's bounded tween; a drag or a nudge keeps
      // the spring; reduced motion never moves anything.
      transition={reduced ? { duration: 0 } : animate ? REVEAL_MOVE_TRANSITION
        : mode === "revealed" ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }}
      whileDrag={reduced || !open ? undefined : { scale: 1.02, zIndex: 20 }}
      style={{ WebkitTouchCallout: "none" }}
      className={`relative flex ${ROW_H} list-none select-none items-stretch gap-1.5 rounded-lg border px-1.5 py-1.5 shadow-sm sm:gap-2 sm:px-2 md:gap-4 md:px-3 lg:py-0.5 lg:[@media(min-height:860px)]:py-2 ${CARD_SURFACE} ${
        open ? "cursor-grab active:cursor-grabbing" : "cursor-default"} ${ring} ${
        lifted ? "z-20 shadow-lg ring-2 ring-[#c9a84c]" : ""}`}>
      <SubjectArt media={entry.media} monogram={entry.label.slice(0, 1)} className={ART} />
      {/* Wraps to two lines rather than truncating: on a 375px phone the three
          44px controls leave room for about 80px of name, and an ordering
          game whose card names are cut off is not playable. The label's width
          never changes with the phase (see `TRAIL_W`), so it never rewraps. */}
      <span className="flex min-w-0 flex-1 items-center text-sm font-bold leading-tight sm:text-base md:text-lg lg:text-base xl:text-lg">
        <span className="line-clamp-2 break-words">{entry.label}</span>
      </span>
      <span data-testid={`forge-trail-${entry.token}`}
        className={`flex ${TRAIL_W} shrink-0 items-center justify-end`}>
        {open && (
          <span className="flex items-center gap-0.5 md:gap-1.5">
            <button type="button" data-testid={`forge-up-${entry.token}`} data-forge-nudge=""
              ref={(el) => buttonRef(key("up"), el)}
              aria-label={`Move ${entry.label} up (currently ${where})`}
              disabled={index === 0} onClick={() => onMove("up", "up")}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-30">
              <ArrowUp aria-hidden className="!size-5" />
            </button>
            <button type="button" data-testid={`forge-down-${entry.token}`} data-forge-nudge=""
              ref={(el) => buttonRef(key("down"), el)}
              aria-label={`Move ${entry.label} down (currently ${where})`}
              disabled={index === total - 1} onClick={() => onMove("down", "down")}
              className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-transparent hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:opacity-30">
              <ArrowDown aria-hidden className="!size-5" />
            </button>
            {/* THE GRIP. Lifts at once on touch (it alone has touch-action:none)
                and is the keyboard handle; the rest of the card lifts on a hold. */}
            <button type="button" data-testid={`forge-grip-${entry.token}`} data-forge-grip=""
              ref={(el) => buttonRef(key("grip"), el)}
              aria-label={`Drag ${entry.label}, ${where}. Arrow keys also move it.`}
              onKeyDown={onGripKey}
              style={{ touchAction: "none" }}
              className="flex h-11 w-11 cursor-grab items-center justify-center rounded-md border border-[#7a6236]/40 bg-black/5 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default">
              <GripVertical aria-hidden className="!size-5" />
            </button>
          </span>
        )}
        {reveal && (
          <span className="flex items-center gap-1 md:gap-2">
            {reveal.value !== null && (
              <motion.span data-testid={`${testId}-value`} {...fade(valueDelay)}
                className="whitespace-nowrap rounded-md bg-[#2c2417]/[0.07] px-1 py-0.5 font-serif text-[14px] font-black tabular-nums leading-none text-[#2c2417] sm:text-base md:px-1.5 md:py-1 md:text-lg lg:text-base xl:text-lg dark:text-foreground">
                {reveal.value}
              </motion.span>
            )}
            <span className="flex w-9 shrink-0 flex-col items-center justify-center gap-0.5 md:w-12">
              {mark !== "neutral" && (
                <motion.span data-testid={`${testId}-mark`} {...fade(valueDelay + REVEAL_TIMING.markLagMs)}
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-white md:h-7 md:w-7 ${
                    mark === "right" ? "bg-emerald-700" : "bg-red-700"}`}>
                  {mark === "right"
                    ? <Check aria-hidden className="!size-4" strokeWidth={3} />
                    : <X aria-hidden className="!size-4" strokeWidth={3} />}
                </motion.span>
              )}
              {showNote && mark !== "right" && (
                <motion.span data-testid={`${testId}-from`} aria-hidden
                  {...(animate ? { initial: { opacity: 0 }, animate: { opacity: 1 },
                    transition: { duration: 0.15,
                      delay: (REVEAL_TIMING.settleAtMs - REVEAL_TIMING.assembleAtMs) / 1000 } }
                    : { initial: false as const })}
                  className="inline-flex items-center whitespace-nowrap text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-red-800 md:text-[11px] dark:text-red-300">
                  {reveal.moved === "up" ? <ArrowUp aria-hidden className="!size-3" strokeWidth={3} />
                    : reveal.moved === "down" ? <ArrowDown aria-hidden className="!size-3" strokeWidth={3} /> : null}
                  was {yours}
                </motion.span>
              )}
            </span>
          </span>
        )}
      </span>
      {yours !== null && (
        <span className="sr-only">
          {reveal?.value != null ? `, ${reveal.value}` : ""}
          {mark === "right" ? ". You placed it here: right."
            : mark === "wrong" ? `. You placed it at ${yours}: wrong.` : `. You placed it at ${yours}.`}
        </span>
      )}
    </Reorder.Item>
  );
}

/** A revealed row's display fields, read off the server's reveal. Never graded here. */
function rowReveal(reveal: OrderForgeReveal, token: string, step: RevealStep, animate: boolean): RowReveal {
  const p = reveal.order.indexOf(token);
  const c = reveal.canonicalOrder.indexOf(token);
  const stated = p >= 0 ? reveal.positionCorrect[p] : undefined;
  return {
    mark: stated === true ? "right" : stated === false ? "wrong" : "neutral",
    value: reveal.valueDisplay[token] ?? null,
    yours: p >= 0 ? p + 1 : null,
    moved: p < 0 || c < 0 || p === c ? null : c < p ? "up" : "down",
    step, animate, order: Math.max(p, 0),
  };
}

/**
 * The reveal's step. Plays "mine" -> "assembled" only when this mount saw the
 * primitive before the reveal existed (the lock turned into a reveal on
 * screen) and motion is allowed; otherwise it is "assembled" at once, which is
 * the settled, fully informative state.
 */
function useRevealStep(revealed: boolean, reduced: boolean): { step: RevealStep | null; animate: boolean } {
  const sawUnrevealed = useRef(!revealed);
  if (!revealed) sawUnrevealed.current = true;
  const playable = revealed && sawUnrevealed.current && !reduced;
  const [assembled, setAssembled] = useState(false);
  useEffect(() => {
    if (!playable || assembled) return;
    const t = window.setTimeout(() => setAssembled(true), REVEAL_TIMING.assembleAtMs);
    return () => window.clearTimeout(t);
  }, [playable, assembled]);
  if (!revealed) return { step: null, animate: false };
  return { step: !playable || assembled ? "assembled" : "mine", animate: playable };
}

export function OrderForge({
  content, phase, value, onChange, onLock, reveal = null, promptRef,
}: OrderForgeProps) {
  const reduced = useReducedMotionPreference();
  const promptId = useId();
  const hintId = useId();
  const open = phase === "open";
  const revealed = phase === "revealed" && !!reveal;
  const byToken = new Map(content.entries.map((e) => [e.token, e]));
  // Only tokens the server dealt, each once; anything missing is appended so a
  // caller's stale or partial order can never hide a card.
  const seen = new Set<string>();
  const order = [...value, ...content.entries.map((e) => e.token)]
    .filter((t) => byToken.has(t) && !seen.has(t) && !!seen.add(t));
  const total = order.length;
  const { step, animate } = useRevealStep(revealed, reduced);
  // What the list shows: the player's order until the reveal, then the order
  // the server says they locked ("Your order"), then the canonical order.
  const mine = revealed ? reveal!.order.filter((t) => byToken.has(t)) : order;
  const shown = revealed && step === "assembled"
    ? reveal!.canonicalOrder.filter((t) => byToken.has(t)) : mine;

  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusNext = useRef<{ token: string; dir: Dir | "grip" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const setButton = (key: string, el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el); else buttons.current.delete(key);
  };

  // While a touch-lifted card is dragged, the page must not scroll under it.
  // The listener is non-passive and present from the start of every touch on
  // the list (a listener added mid-gesture cannot cancel it); it cancels
  // nothing unless a card is lifted, so a swipe over the cards still scrolls.
  const listRef = useRef<HTMLOListElement | null>(null);
  const liftRef = useRef(false);
  useEffect(() => {
    const el = listRef.current;
    if (!el || !open) return;
    const guard = (e: TouchEvent) => { if (liftRef.current && e.cancelable) e.preventDefault(); };
    el.addEventListener("touchmove", guard, { passive: false });
    return () => el.removeEventListener("touchmove", guard);
  }, [open]);

  // After a nudge the card has moved: keep keyboard focus on the same control
  // (or its grip when it hit an end and that button became disabled).
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    const target = buttons.current.get(`${f.token}:${f.dir}`);
    (target && !target.disabled ? target : buttons.current.get(`${f.token}:grip`))?.focus();
  });

  const move = (token: string, dir: Dir, via: Dir | "grip") => {
    if (!open) return;
    const next = moveToken(order, token, dir);
    if (next.every((t, i) => t === order[i])) return;
    focusNext.current = { token, dir: via };
    const label = byToken.get(token)?.label ?? token;
    setAnnouncement(`${label} moved to position ${next.indexOf(token) + 1} of ${total}`);
    onChange(next);
  };

  const lock = () => { if (open) onLock({ order }); };

  const canonText = revealed
    ? reveal!.canonicalOrder.filter((t) => byToken.has(t))
      .map((t, i) => `${i + 1}, ${byToken.get(t)!.label}${reveal!.valueDisplay[t] ? `, ${reveal!.valueDisplay[t]}` : ""}`)
      .join("; ")
    : "";
  const resultText = revealed
    ? `${reveal!.isCorrect === true ? "Revealed. Your order was exactly right."
      : reveal!.isCorrect === false ? "Revealed. Your order was not the correct order." : "Revealed."} Correct order: ${canonText}.`
    : phase === "locked" ? "Order locked in. Waiting for the reveal." : "";

  // The one line under the prompt: the same box in every phase (phone), so the
  // list below it never moves. Desktop keeps it for screen readers only.
  const hint = open ? "Drag a card, or use the arrows, to put the cards in order."
    : revealed ? "Each card's value is shown. Wrong cards move to their correct place."
      : "Your order is locked in.";

  return (
    <div data-testid="mig-order-forge" data-mig-primitive="order-forge" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <MetricChip>{content.metricLabel}</MetricChip>
        <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="forge-prompt"
          // Two lines are reserved below `lg` (the stage there is content
          // height), so the next Order Forge round's prompt, one line or two,
          // does not resize the module and shift the page at the swap.
          className="flex min-h-[2.75em] max-w-[40rem] items-center justify-center md:max-w-[52rem] outline-none font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] sm:text-xl lg:min-h-0 lg:text-lg xl:text-xl">
          {content.prompt}
        </h2>
        <p id={hintId} data-testid="forge-hint"
          className="min-h-[2.75em] text-[12px] leading-snug text-[var(--ranked-ink-muted,#5a4a2e)] lg:sr-only">
          {hint}
        </p>
      </header>

      <div className={`mx-auto flex w-full ${STACK_W} flex-col gap-1.5`}
        data-state={open ? "open" : revealed ? "revealed" : "locked"}
        {...(revealed ? { "data-testid": "forge-reveal", "data-step": step!,
          "data-motion": animate ? "full" : reduced ? "reduced" : "settled" } : {})}>
        <Rail edge="first" text={content.directionLabels.first}
          aside={revealed ? (
            <span id={`${promptId}-step`} data-testid="forge-reveal-step"
              className={`ml-auto -my-1 shrink-0 whitespace-nowrap rounded-sm px-1.5 py-1 leading-none tracking-[0.18em] ${
                step === "assembled" ? "bg-[#2c2417] text-[#f6e6bb]" : "bg-[#7a6236]/15 text-[#2c2417]"}`}>
              {step === "assembled" ? "Correct order" : "Your order"}
            </span>
          ) : undefined} />
        {/* ONE list for the whole round (OF4-CONTINUITY): the same `ol`, slot
            rail and keyed rows from the open board through the lock to the
            settled reveal. Only the testids, the drag and the contents change. */}
        <div className="flex gap-1.5 sm:gap-2 md:gap-3">
          <SlotRail count={shown.length}
            prefix={open ? "forge" : revealed ? "forge-reveal" : "forge-locked"} />
          <Reorder.Group as="ol" axis="y" values={shown} ref={listRef}
            onReorder={(next: string[]) => { if (open) onChange(next); }}
            aria-labelledby={revealed ? `${promptId}-step` : promptId}
            aria-describedby={open ? hintId : undefined}
            data-testid={open ? "forge-list" : revealed ? "forge-reveal-list" : "forge-list-locked"}
            className={`flex min-w-0 flex-1 flex-col p-0 ${LIST_GAP}`}>
            {shown.map((token, i) => (
              <ForgeRow key={token} entry={byToken.get(token)!} index={i} total={shown.length}
                mode={open ? "open" : revealed ? "revealed" : "locked"}
                reduced={reduced} buttonRef={setButton} liftRef={liftRef}
                onMove={(dir, via) => move(token, dir, via)}
                reveal={revealed ? rowReveal(reveal!, token, step!, animate) : null} />
            ))}
          </Reorder.Group>
        </div>
        <Rail edge="last" text={content.directionLabels.last} />
      </div>

      {/* One footprint for the Lock In, the wait and the verdict, so the
          module's height (and the centred stage around it) never changes.
          The verdict sits on the folio, which is parchment in both themes. */}
      <footer data-testid="forge-footer"
        className="flex min-h-[4.5rem] flex-col items-center justify-start gap-2 lg:min-h-[48px] lg:[@media(min-height:860px)]:min-h-[56px]">
        {open && (
          <>
            <Button type="button" data-testid="forge-lock" onClick={lock}
              className={`min-h-[48px] w-full ${STACK_W} border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] shadow-md hover:bg-[#3a2d14] md:text-base lg:[@media(min-height:860px)]:min-h-[56px]`}>
              <Lock aria-hidden /> Lock in this order
            </Button>
            {/* `leading-4`: 48 + 8 + 16 = the footer's 4.5rem exactly, so the
                lock does not shrink it (it used to, by 4.5px, on a phone). */}
            <p className="text-[11px] leading-4 text-[var(--ranked-ink-muted,#5a4a2e)] lg:sr-only">
              Final once locked.
            </p>
          </>
        )}
        {phase === "locked" && (
          <p data-testid="forge-suspense"
            className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            <Lock aria-hidden className="!size-4" /> Locked in · Waiting <SuspenseDots animate={!reduced} />
          </p>
        )}
        {revealed && reveal!.isCorrect !== null && (
          <p data-testid="forge-verdict" data-correct={String(reveal!.isCorrect)}
            className={`inline-flex min-h-[44px] items-center gap-2 text-[12px] font-black uppercase tracking-[0.22em] md:text-[13px] ${
              reveal!.isCorrect ? "text-emerald-800" : "text-red-800"}`}>
            {reveal!.isCorrect
              ? <><Check aria-hidden className="!size-4" strokeWidth={3} /> Exactly right</>
              : <><X aria-hidden className="!size-4" strokeWidth={3} /> Not quite</>}
          </p>
        )}
      </footer>
      <p role="status" aria-live="polite" data-testid="forge-live" className="sr-only">
        {open ? announcement : resultText}
      </p>
    </div>
  );
}
