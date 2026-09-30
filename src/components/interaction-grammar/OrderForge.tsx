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
 * INPUT. Drag uses framer-motion `Reorder`, but ONLY from a dedicated grip
 * handle (`dragListener={false}` + `useDragControls`, handle `touch-action:
 * none`), so a phone can still scroll the page by swiping anywhere else. Drag
 * is never the only way: every card has 44px up / down buttons, and the grip
 * itself answers ArrowUp / ArrowDown, so keyboard and screen-reader players
 * order the cards without a pointer. Moves are announced through a live
 * region. Reduced motion (OS or in-app) removes the layout animation.
 */
import {
  useEffect, useId, useRef, useState, type KeyboardEvent, type Ref,
} from "react";
import { Reorder, useDragControls } from "framer-motion";
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

/** Off-arena legibility; inside `.ranked-academy` the tablet paint takes over. */
const CARD_SURFACE = "border-[#7a6236]/55 bg-[#f4e9cc] text-[#2c2417] dark:bg-card dark:text-foreground";

function Rail({ text, edge }: { text: string; edge: "first" | "last" }) {
  return (
    <p data-testid={`forge-rail-${edge}`}
      className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ranked-ink-muted,#5a4a2e)]">
      <span aria-hidden>{edge === "first" ? "▼" : "▲"}</span>
      {edge === "first" ? "Start" : "End"}: {text}
    </p>
  );
}

function CardRow({
  entry, index, total, disabled, onMove, buttonRef, reduced,
}: {
  entry: OrderEntry;
  index: number;
  total: number;
  disabled: boolean;
  /** `via` is the control that asked, so focus can stay on it after the move. */
  onMove: (dir: Dir, via: Dir | "grip") => void;
  buttonRef: (key: string, el: HTMLButtonElement | null) => void;
  reduced: boolean;
}) {
  const controls = useDragControls();
  const key = (d: Dir | "grip") => `${entry.token}:${d}`;
  const onGripKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); onMove("up", "grip"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onMove("down", "grip"); }
  };
  const where = `position ${index + 1} of ${total}`;
  return (
    <Reorder.Item as="li" value={entry.token} dragListener={false} dragControls={controls}
      data-testid={`forge-card-${entry.token}`} data-position={index + 1}
      layout={reduced ? undefined : "position"}
      transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }}
      whileDrag={reduced ? undefined : { scale: 1.02, zIndex: 20 }}
      className={`relative flex min-h-[56px] list-none items-stretch gap-1.5 rounded-lg border px-1.5 py-1.5 sm:gap-2 sm:px-2 shadow-sm lg:min-h-[48px] lg:py-0.5 ${CARD_SURFACE}`}>
      <span aria-hidden data-testid={`forge-rank-${entry.token}`}
        className="flex w-5 shrink-0 items-center justify-center font-serif text-lg font-black tabular-nums text-[#7a6236] sm:w-7">
        {index + 1}
      </span>
      <SubjectArt media={entry.media} monogram={entry.label.slice(0, 1)}
        className="h-8 w-8 shrink-0 self-center rounded-md sm:h-11 sm:w-11 lg:h-9 lg:w-9" />
      {/* Wraps to two lines rather than truncating: on a 375px phone the three
          44px controls leave room for about 80px of name, and an ordering
          game whose card names are cut off is not playable. */}
      <span className="flex min-w-0 flex-1 items-center text-sm font-bold leading-tight sm:text-base">
        <span className="line-clamp-2 break-words">{entry.label}</span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        <button type="button" data-testid={`forge-up-${entry.token}`}
          ref={(el) => buttonRef(key("up"), el)}
          aria-label={`Move ${entry.label} up (currently ${where})`}
          disabled={disabled || index === 0} onClick={() => onMove("up", "up")}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-transparent hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30">
          <ArrowUp aria-hidden className="!size-5" />
        </button>
        <button type="button" data-testid={`forge-down-${entry.token}`}
          ref={(el) => buttonRef(key("down"), el)}
          aria-label={`Move ${entry.label} down (currently ${where})`}
          disabled={disabled || index === total - 1} onClick={() => onMove("down", "down")}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-transparent hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-30">
          <ArrowDown aria-hidden className="!size-5" />
        </button>
        {/* THE GRIP. The only element that starts a drag, and the only one with
            touch-action:none, so the rest of the card scrolls the page. */}
        <button type="button" data-testid={`forge-grip-${entry.token}`}
          ref={(el) => buttonRef(key("grip"), el)}
          aria-label={`Drag ${entry.label}, ${where}. Arrow keys also move it.`}
          disabled={disabled}
          onPointerDown={(e) => { if (!disabled) controls.start(e); }}
          onKeyDown={onGripKey}
          style={{ touchAction: "none" }}
          className="flex h-11 w-11 cursor-grab items-center justify-center rounded-md border border-[#7a6236]/40 bg-black/5 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default">
          <GripVertical aria-hidden className="!size-5" />
        </button>
      </span>
    </Reorder.Item>
  );
}

/** Plain, non-draggable rows for the locked and revealed phases. */
function StaticRow({
  entry, index, mark, value, testId,
}: {
  entry: OrderEntry; index: number; mark: boolean | null; value: string | null; testId: string;
}) {
  const state = mark === null ? "neutral" : mark ? "right" : "wrong";
  return (
    <li data-testid={testId} data-position={index + 1} data-mark={state}
      className={`flex min-h-[52px] items-center gap-2 rounded-lg border px-2 py-1.5 lg:min-h-[44px] lg:py-0.5 ${CARD_SURFACE} ${
        state === "right" ? "ring-2 ring-emerald-500" : state === "wrong" ? "ring-2 ring-destructive" : ""}`}>
      <span aria-hidden className="flex w-5 shrink-0 justify-center font-serif text-lg font-black tabular-nums text-[#7a6236] sm:w-7">
        {index + 1}
      </span>
      <SubjectArt media={entry.media} monogram={entry.label.slice(0, 1)}
        className="h-8 w-8 shrink-0 rounded-md sm:h-10 sm:w-10 lg:h-8 lg:w-8" />
      <span className="line-clamp-2 min-w-0 flex-1 break-words text-sm font-bold leading-tight sm:text-[15px]">{entry.label}</span>
      {value !== null && (
        <span data-testid={`${testId}-value`}
          className="shrink-0 font-serif text-base font-black tabular-nums">{value}</span>
      )}
      {mark !== null && (
        <span data-testid={`${testId}-mark`}
          className={`inline-flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
            mark ? "text-emerald-700" : "text-destructive"}`}>
          {mark ? <Check aria-hidden className="!size-4" /> : <X aria-hidden className="!size-4" />}
          <span className="sr-only">{mark ? "In the right place" : "In the wrong place"}</span>
        </span>
      )}
    </li>
  );
}

export function OrderForge({
  content, phase, value, onChange, onLock, reveal = null, promptRef,
}: OrderForgeProps) {
  const reduced = useReducedMotionPreference();
  const promptId = useId();
  const hintId = useId();
  const open = phase === "open";
  const byToken = new Map(content.entries.map((e) => [e.token, e]));
  // Only tokens the server dealt, each once; anything missing is appended so a
  // caller's stale or partial order can never hide a card.
  const seen = new Set<string>();
  const order = [...value, ...content.entries.map((e) => e.token)]
    .filter((t) => byToken.has(t) && !seen.has(t) && !!seen.add(t));
  const total = order.length;

  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map());
  const focusNext = useRef<{ token: string; dir: Dir | "grip" } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const setButton = (key: string, el: HTMLButtonElement | null) => {
    if (el) buttons.current.set(key, el); else buttons.current.delete(key);
  };

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

  const resultText = phase === "revealed" && reveal
    ? (reveal.isCorrect === true ? "Revealed. Your order was exactly right."
      : reveal.isCorrect === false ? "Revealed. Your order was not the correct order." : "Revealed.")
    : phase === "locked" ? "Order locked in. Waiting for the reveal." : "";

  return (
    <div data-testid="mig-order-forge" data-mig-primitive="order-forge" data-phase={phase}
      className="flex w-full flex-col gap-3 sm:gap-4">
      <header className="flex flex-col items-center gap-1.5 text-center">
        <MetricChip>{content.metricLabel}</MetricChip>
        <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="forge-prompt"
          className="max-w-[40rem] outline-none font-serif text-[1.05rem] font-bold leading-snug text-[var(--ranked-ink,#2c2417)] sm:text-xl lg:text-lg xl:text-xl">
          {content.prompt}
        </h2>
        {open && (
          <p id={hintId} data-testid="forge-hint"
            className="text-[12px] text-[var(--ranked-ink-muted,#5a4a2e)] lg:sr-only">
            Drag the grip, or use the arrows, to put the cards in order.
          </p>
        )}
      </header>

      {phase !== "revealed" && (
        <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-1.5"
          data-state={open ? "open" : "locked"}>
          <Rail edge="first" text={content.directionLabels.first} />
          {open ? (
            <Reorder.Group as="ol" axis="y" values={order}
              onReorder={(next: string[]) => onChange(next)}
              aria-labelledby={promptId} aria-describedby={hintId}
              data-testid="forge-list" className="flex flex-col gap-2 p-0 lg:gap-1.5">
              {order.map((token, i) => (
                <CardRow key={token} entry={byToken.get(token)!} index={i} total={total}
                  disabled={!open} reduced={reduced} buttonRef={setButton}
                  onMove={(dir, via) => move(token, dir, via)} />
              ))}
            </Reorder.Group>
          ) : (
            <ol aria-labelledby={promptId} data-testid="forge-list-locked"
              className="flex flex-col gap-2 p-0">
              {order.map((token, i) => (
                <StaticRow key={token} entry={byToken.get(token)!} index={i}
                  mark={null} value={null} testId={`forge-locked-${token}`} />
              ))}
            </ol>
          )}
          <Rail edge="last" text={content.directionLabels.last} />
        </div>
      )}

      {phase === "revealed" && reveal && (
        <div data-testid="forge-reveal"
          className="mx-auto grid w-full max-w-[52rem] grid-cols-1 gap-4 md:grid-cols-2">
          <section aria-labelledby={`${promptId}-mine`} data-testid="forge-reveal-mine"
            className="flex flex-col gap-1.5">
            <h3 id={`${promptId}-mine`}
              className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ranked-ink,#2c2417)]">
              My order
            </h3>
            <ol className="flex flex-col gap-2 p-0">
              {reveal.order.map((token, i) => {
                const entry = byToken.get(token);
                if (!entry) return null;
                return (
                  <StaticRow key={token} entry={entry} index={i}
                    mark={reveal.positionCorrect[i] ?? null}
                    value={reveal.valueDisplay[token] ?? null}
                    testId={`forge-mine-${token}`} />
                );
              })}
            </ol>
          </section>
          <section aria-labelledby={`${promptId}-canon`} data-testid="forge-reveal-correct"
            className="flex flex-col gap-1.5">
            <h3 id={`${promptId}-canon`}
              className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--ranked-ink,#2c2417)]">
              Correct order
            </h3>
            <ol className="flex flex-col gap-2 p-0">
              {reveal.canonicalOrder.map((token, i) => {
                const entry = byToken.get(token);
                if (!entry) return null;
                return (
                  <StaticRow key={token} entry={entry} index={i} mark={null}
                    value={reveal.valueDisplay[token] ?? null}
                    testId={`forge-correct-${token}`} />
                );
              })}
            </ol>
            <Rail edge="first" text={content.directionLabels.first} />
            <Rail edge="last" text={content.directionLabels.last} />
          </section>
        </div>
      )}

      <footer className="flex min-h-[2.75rem] flex-col items-center gap-2">
        {open && (
          <>
            <Button type="button" data-testid="forge-lock" onClick={lock}
              className="min-h-[48px] w-full max-w-[34rem] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14]">
              <Lock aria-hidden /> Lock in this order
            </Button>
            <p className="text-[11px] text-[var(--ranked-ink-muted,#5a4a2e)] lg:sr-only">
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
        {phase === "revealed" && reveal && reveal.isCorrect !== null && (
          <p data-testid="forge-verdict" data-correct={String(reveal.isCorrect)}
            className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ranked-ink,#2c2417)]">
            {reveal.isCorrect ? "Exactly right" : "Not quite"}
          </p>
        )}
      </footer>
      <p role="status" aria-live="polite" data-testid="forge-live" className="sr-only">
        {open ? announcement : resultText}
      </p>
    </div>
  );
}
