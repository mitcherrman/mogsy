/**
 * MIG — RECONSTRUCT. Unordered multiset assembly.
 *
 * One target, 2–4 sockets, a tray of choices. The player fills EVERY socket and
 * locks; the host grades the placement as a multiset and hands back a reveal.
 *
 *   OPEN → select a tray choice → tap a socket → LOCK → (caller-owned) → REVEAL
 *
 * CONTENT-NEUTRAL. It knows labels, tokens, art and placement limits. It does
 * not know what a part is, what the target is made of, or what any figure means.
 *
 * NO LEAK, NO GRADING. `content` (ReconstructPublic) has no field that could
 * hold the answer. Correctness, the settled sockets and every evidence figure
 * arrive only through `reveal`; the primitive DISPLAYS them and never imports
 * `gradeAssembly` (a source test pins that). Socket position carries no
 * meaning, here or in the grader.
 *
 * STATE OWNERSHIP
 *   host      `value` (the board), `phase`, `reveal`, grading, what happens after
 *             the reveal. `onChange` is the only way the board changes.
 *   primitive which tray choice is selected, the roving focus stops, the
 *             announcement text and the reveal's stage clock. All ephemeral UI
 *             state: none of it is graded or submitted.
 *
 * INPUT. Tap first: tapping a choice SELECTS it (aria-pressed), tapping a
 * socket PLACES it there, replacing an occupant; tapping a filled socket with
 * nothing selected REMOVES its occupant. After a placement the selection
 * clears. Drag (HTML5, desktop) from the tray to a socket is a progressive
 * enhancement through the same placement path; nothing needs it.
 *
 * KEYBOARD. Two tab stops (tray, sockets) plus Lock. Arrows (and Home/End) move
 * inside a group; Enter/Space are a native button's click; Delete/Backspace
 * removes the focused socket's occupant; Escape clears the selection. Focus
 * never moves on its own: every control keeps its element across a placement.
 *
 * SCREEN READER. One polite `role="status"` region, written only on discrete
 * actions (select, place, replace, remove, limit, lock) and once for the whole
 * reveal. Nothing announces per animation frame.
 *
 * REVEAL. Marks → settle → evidence on one bounded clock
 * (`lib/interaction-grammar/reconstructReveal`, ≤ 1.5 s). Reduced motion (OS or
 * in-app) skips the clock: the first reveal frame is the settled frame, with
 * every "your pick" and every figure on show. `onRevealComplete` tells the host
 * when the choreography has ended; continuing remains the host's.
 *
 * FIXED GEOMETRY (GM1-R1, the OF4-CONTINUITY lessons). Every phase draws the
 * same boxes at the same size: the status line under the sockets (hint, then
 * locked, then verdict), the "your pick" space under each socket, the tray box
 * (whose reserved height the evidence panel takes over IN PLACE at the
 * evidence stage) and the footer. Nothing appears or disappears in a way that
 * moves a node already on screen; the sockets keep their elements throughout.
 *
 * PRESENTATION. The interaction grammar's neutral paint, plus stable hooks for
 * a host scene to restyle: `data-mig-primitive`, `data-phase`,
 * `data-reveal-stage` on the root, and `data-part` (`target`, `sockets`,
 * `slot`, `socket`, `tray`, `option`, `lock`, `pick`, `evidence`) with
 * `data-state` / `data-mark` / `data-selected` on the parts. There are no
 * styling props.
 */
import {
  useEffect, useId, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type Ref,
} from "react";
import { Check, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  AssemblyOption, InteractionPhase, ReconstructChild, ReconstructPublic, ReconstructResponse,
  ReconstructReveal, ReconstructValue,
} from "@/lib/interaction-grammar/types";
import {
  assertReconstructContent, clearSlot, filledSummary, isBoardFull, maxUsesOf, normalizePlacement,
  numberWord, placeToken, countUses,
} from "@/lib/interaction-grammar/reconstruct";
import {
  planReveal, RECONSTRUCT_TIMING, settleDelayMs, showsEvidence, showsSettled, stageAt,
  type ReconstructPlan, type ReconstructStage,
} from "@/lib/interaction-grammar/reconstructReveal";
import { SubjectArt, SuspenseDots } from "./shared";

export interface ReconstructProps {
  content: ReconstructPublic;
  phase: InteractionPhase;
  /** The pending board, owned by the caller: one token or null per socket. */
  value: ReconstructValue;
  onChange: (next: (string | null)[]) => void;
  /** Commit. Fires only when every socket is filled; carries identity, never correctness. */
  onLock: (response: ReconstructResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: ReconstructReveal | null;
  /** Fires once per reveal when its choreography has finished (at once under reduced motion). */
  onRevealComplete?: () => void;
  /** The prompt heading (focusable, `tabIndex=-1`), so a host can move focus to it. */
  promptRef?: Ref<HTMLHeadingElement>;
}

/** Tray columns. Up / Down arrows move by this many options. */
const TRAY_COLS = 3;
/** Tray cell height and gap (px): the tray box is reserved at this size in every phase. */
const TRAY_CELL_PX = 92;
const TRAY_GAP_PX = 8;

/** Off-arena legibility; a host scene's own paint (via the data hooks) takes over. */
const SURFACE = "border-[#7a6236]/55 bg-[#f4e9cc] text-[#2c2417] dark:bg-card dark:text-foreground";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1";

// ------------------------------------------------------------------ reveal clock

/**
 * The reveal's stage, driven by `plan`. The stage is DERIVED while a reveal's
 * key is new (so a reduced-motion reveal never paints a frame of the unsettled
 * board first), then advanced by one timer per boundary. A new key restarts it;
 * a re-render with an equal reveal does not.
 */
function useRevealStage(plan: ReconstructPlan, active: boolean, key: string): ReconstructStage {
  const [run, setRun] = useState<{ key: string; stage: ReconstructStage } | null>(null);
  useEffect(() => {
    if (!active) { setRun(null); return; }
    setRun({ key, stage: stageAt(plan, 0) });
    const timers = plan.stages.map(({ end }) =>
      window.setTimeout(() => setRun({ key, stage: stageAt(plan, end) }), end));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, plan, key]);
  return run && run.key === key ? run.stage : stageAt(plan, 0);
}

// ----------------------------------------------------------------------- pieces

function MarkBadge({ right, animate }: { right: boolean; animate: boolean }) {
  return (
    <span aria-hidden data-part="mark" data-mark={right ? "right" : "wrong"}
      style={animate ? { animationDuration: `${RECONSTRUCT_TIMING.marksTween}ms` } : undefined}
      className={`absolute -right-1.5 -top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#f4e9cc] text-white ${
        right ? "bg-emerald-600" : "bg-destructive"} ${
        animate ? "animate-in fade-in zoom-in-50 fill-mode-both" : ""}`}>
      {right ? <Check className="!size-3.5" /> : <X className="!size-3.5" />}
    </span>
  );
}

/**
 * The player's wrong pick, kept on its socket as a corner badge once the
 * missing part has settled in. Absolute: it occupies no layout, so its
 * arrival moves nothing (reserved invisible before the settle stage).
 */
function PickBadge({ option, slot, shown, animate, delay }: {
  option: AssemblyOption | undefined; slot: number; shown: boolean; animate: boolean; delay: number;
}) {
  return (
    <span aria-hidden data-part="pick" data-testid={`reconstruct-pick-${slot}`} data-shown={shown ? "true" : "false"}
      title={option ? `Your pick: ${option.label}` : undefined}
      style={shown && animate
        ? { animationDuration: `${RECONSTRUCT_TIMING.settleTween}ms`, animationDelay: `${delay}ms` } : undefined}
      className={`absolute -left-2 -top-2 z-10 h-7 w-7 overflow-hidden rounded-md border-2 border-destructive bg-[#f4e9cc] shadow ${
        shown ? "" : "invisible"} ${shown && animate ? "animate-in fade-in zoom-in-150 fill-mode-both" : ""}`}>
      <SubjectArt media={option?.media} monogram={(option?.label ?? "?").slice(0, 1)}
        className="h-full w-full opacity-80 [&_span]:!text-[10px]" />
      <X className="absolute inset-0 m-auto !size-5 text-destructive drop-shadow" />
      <span className="sr-only">{`Your pick: ${option?.label ?? ""}`}</span>
    </span>
  );
}

/** One level further down: what a revealed part is itself made of. */
function ChildLine({ token, kids }: { token: string; kids: readonly ReconstructChild[] }) {
  if (kids.length === 0) {
    return (
      <span data-part="children" data-testid={`reconstruct-children-${token}`} data-basic="true"
        className="pl-[24px] text-[10.5px] italic leading-[14px] text-[var(--ranked-ink-muted,#5a4a2e)]">
        Basic part
      </span>
    );
  }
  return (
    <span data-part="children" data-testid={`reconstruct-children-${token}`}
      className="flex min-w-0 items-center gap-x-1 overflow-hidden whitespace-nowrap pl-[24px] text-[10.5px] leading-[14px] text-[var(--ranked-ink-muted,#5a4a2e)]">
      <span aria-hidden>=</span>
      {kids.map((k, i) => (
        <span key={`${k.label}:${i}`} data-part="child" className="inline-flex min-w-0 items-center gap-1">
          {i > 0 && <span aria-hidden>+</span>}
          <SubjectArt media={k.media} monogram={k.label.slice(0, 1)} className="h-3.5 w-3.5 shrink-0 rounded-sm [&_span]:!text-[8px]" />
          <span className="truncate font-semibold">{k.label}</span>
          {k.quantity > 1 && <span className="font-bold tabular-nums">{`×${k.quantity}`}</span>}
        </span>
      ))}
    </span>
  );
}

// -------------------------------------------------------------------- component

export function Reconstruct({
  content, phase, value, onChange, onLock, reveal = null, onRevealComplete, promptRef,
}: ReconstructProps) {
  assertReconstructContent(content);
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const hintId = useId();
  const lockHintId = useId();
  const open = phase === "open";
  const total = content.slotCount;
  const byToken = useMemo(() => new Map(content.options.map((o) => [o.token, o])), [content.options]);
  const labelOf = (token: string | null) => (token !== null ? byToken.get(token)?.label ?? "" : "");

  const board = normalizePlacement(content, value);
  const uses = countUses(board);
  const filled = board.filter((t) => t !== null).length;
  const full = isBoardFull(board);

  // ---- ephemeral UI state (never graded, never submitted)
  const [selected, setSelected] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [trayStop, setTrayStop] = useState<string | null>(null);
  const [slotStop, setSlotStop] = useState(0);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const dragToken = useRef<string | null>(null);
  const trayRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const slotRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // A selection only survives while it can still be placed.
  const selectedOption = open && selected !== null ? byToken.get(selected) ?? null : null;
  const armed = selectedOption !== null && (uses.get(selectedOption.token) ?? 0) < maxUsesOf(selectedOption)
    ? selectedOption : null;

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const hasEvidence = Boolean(reveal?.evidence && (
    Object.keys(reveal.evidence.values ?? {}).length > 0
    || Object.keys(reveal.evidence.annotations ?? {}).length > 0
    || (reveal.evidence.extras?.length ?? 0) > 0
    || (reveal.evidence.parts?.length ?? 0) > 0
    || reveal.evidence.total));
  const anyWrong = Boolean(reveal?.slotCorrect.some((c) => c === false));
  const plan = useMemo(() => planReveal({ reduced, anyWrong, hasEvidence }), [reduced, anyWrong, hasEvidence]);
  const revealKey = revealed && reveal
    ? JSON.stringify([reveal.placement, reveal.settled, reveal.slotCorrect]) : "";
  const stage = useRevealStage(plan, revealed, revealKey);
  const settledOn = revealed && showsSettled(stage);
  const evidenceOn = revealed && showsEvidence(stage);

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  // ---- actions
  const say = (text: string) => setAnnouncement(text);
  const where = (slot: number) => `part ${slot + 1} of ${total}`;

  const commit = (slot: number, token: string) => {
    if (!open) return;
    const out = placeToken(content, board, slot, token);
    const label = labelOf(token);
    if (out.kind === "same") { say(`${sentenceCase(where(slot))} already holds ${label}.`); return; }
    if (out.kind === "at-limit") { say(limitText(label, out.used, out.max)); return; }
    if (out.kind === "invalid") return;
    onChange(out.next);
    setSelected(null);
    const count = out.next.filter((t) => t !== null).length;
    say(`${label} placed in ${where(slot)}${out.kind === "replaced" ? `, replacing ${labelOf(out.previous)}` : ""}. ${
      filledSummary(count, total)}`);
  };

  const remove = (slot: number) => {
    if (!open) return;
    const { next, removed } = clearSlot(board, slot);
    if (removed === null) { say(`${sentenceCase(where(slot))} is empty. Select a part from the tray first.`); return; }
    onChange(next);
    say(`${labelOf(removed)} removed from ${where(slot)}. ${filledSummary(next.filter((t) => t !== null).length, total)}`);
  };

  const tapOption = (token: string) => {
    if (!open) return;
    const option = byToken.get(token);
    if (!option) return;
    if (selected === token) { setSelected(null); say(`${option.label} deselected.`); return; }
    const used = uses.get(token) ?? 0;
    const max = maxUsesOf(option);
    if (used >= max) { say(limitText(option.label, used, max)); return; }
    setSelected(token);
    say(`${option.label} selected. Choose a part to place it in.`);
  };

  const tapSocket = (slot: number) => {
    if (!open) return;
    if (armed) commit(slot, armed.token);
    else remove(slot);
  };

  const lock = () => { if (open && full) onLock({ placement: board as string[] }); };

  const clearSelection = () => {
    if (open && selected !== null) { setSelected(null); say("Selection cleared."); }
  };

  // ---- keyboard (roving focus inside a group; Enter/Space are the button's own click)
  const focusOption = (token: string | undefined) => { if (token) trayRefs.current.get(token)?.focus(); };
  const optionKeys = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const last = content.options.length - 1;
    const to = e.key === "ArrowRight" ? index + 1
      : e.key === "ArrowLeft" ? index - 1
      : e.key === "ArrowDown" ? index + TRAY_COLS
      : e.key === "ArrowUp" ? index - TRAY_COLS
      : e.key === "Home" ? 0
      : e.key === "End" ? last : null;
    if (to === null) return;
    e.preventDefault();
    if (to >= 0 && to <= last) focusOption(content.options[to].token);
  };
  const socketKeys = (slot: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const to = e.key === "ArrowRight" || e.key === "ArrowDown" ? slot + 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? slot - 1
      : e.key === "Home" ? 0
      : e.key === "End" ? total - 1 : null;
    if (to !== null) {
      e.preventDefault();
      if (to >= 0 && to < total) slotRefs.current.get(to)?.focus();
    } else if ((e.key === "Delete" || e.key === "Backspace") && board[slot] !== null) {
      e.preventDefault();
      remove(slot);
    }
  };

  // ---- drag (progressive enhancement; same placement path as a tap)
  const onSlotDragOver = (slot: number) => (e: DragEvent) => {
    if (!open || dragToken.current === null) return;
    e.preventDefault();
    if (dragOver !== slot) setDragOver(slot);
  };
  const onSlotDrop = (slot: number) => (e: DragEvent) => {
    const token = dragToken.current;
    dragToken.current = null;
    setDragOver(null);
    if (!open || token === null) return;
    e.preventDefault();
    commit(slot, token);
  };

  // ---- derived display
  const settledTokens = reveal?.settled ?? [];
  const placementTokens = reveal?.placement ?? [];
  const shown = (i: number): string | null => {
    if (revealed && reveal) return (settledOn ? settledTokens[i] : placementTokens[i]) ?? null;
    return board[i] ?? null;
  };
  const rightCount = reveal ? reveal.slotCorrect.filter((c) => c).length : 0;
  const verdict = !revealed || !reveal ? ""
    : reveal.isCorrect === true ? "Every part right"
    : reveal.slotCorrect.length > 0 ? `${rightCount} of ${reveal.slotCorrect.length} parts right`
    : "";

  const resultText = revealed && reveal ? revealSummary(reveal, byToken, total, verdict)
    : phase === "locked" ? "Build locked. Waiting for the reveal." : "";

  const wrongOrder = revealed && reveal
    ? reveal.slotCorrect.map((c, i) => (c === false ? i : -1)).filter((i) => i >= 0) : [];
  const evidenceRows: { token: string; quantity: number | null }[] = !revealed || !reveal?.evidence ? []
    : reveal.evidence.parts
      ? reveal.evidence.parts.map((p) => ({ token: p.token, quantity: p.quantity }))
      : distinct(settledTokens).filter((t) =>
        reveal.evidence?.values?.[t] !== undefined || reveal.evidence?.annotations?.[t] !== undefined)
        .map((token) => ({ token, quantity: null }));
  const trayRows = Math.ceil(content.options.length / TRAY_COLS);
  const trayBoxPx = trayRows * TRAY_CELL_PX + (trayRows - 1) * TRAY_GAP_PX;
  // The tray box shows the (inert) tray until the evidence stage, then the evidence in place.
  const evidenceInBox = revealed && hasEvidence && evidenceOn;
  // What each wrong pick WAS, stated from the host's own lists: a pick the
  // host's parts name is a copy too many; any other is not in the build.
  const partTokens = new Set((reveal?.evidence?.parts ?? []).map((p) => p.token));
  const wrongNotes = revealed && reveal && settledOn
    ? distinct(wrongOrder.map((i) => placementTokens[i]).filter((t): t is string => !!t)).map((t) =>
      (partTokens.has(t) ? `One ${labelOf(t)} too many` : `${labelOf(t)} isn't part of it`))
    : [];
  const statusLine = revealed && reveal ? verdict
    : phase === "locked" ? "Locked in. Waiting for the reveal."
    : full ? `All ${total} parts filled. Lock in when you're sure.`
    : `Pick a part, then a socket. ${sentenceCase(numberWord(filled))} of ${numberWord(total)} filled.`;

  const trayStopToken = trayStop && byToken.has(trayStop) ? trayStop : content.options[0].token;

  return (
    <div data-testid="mig-reconstruct" data-mig-primitive="reconstruct" data-phase={phase}
      data-reveal-stage={revealed ? stage : undefined}
      data-filled={filled} data-slots={total}
      onKeyDown={(e) => { if (e.key === "Escape") clearSelection(); }}
      className="flex w-full flex-col gap-2">
      {/* The target leads, beside the prompt: one row, so the board fits a
          short desktop stage without scrolling. */}
      <header data-part="target" data-testid="reconstruct-target"
        className="flex min-h-[56px] items-center justify-center gap-3">
        {/* A tall stage (>= 800px) has room to give the target more presence. */}
        <SubjectArt media={content.target.media} monogram={content.target.label.slice(0, 1)}
          className="h-14 w-14 shrink-0 rounded-lg ring-1 ring-[#7a6236]/70 [@media(min-height:800px)]:h-20 [@media(min-height:800px)]:w-20" />
        <div className="flex min-w-0 flex-col items-start text-left">
          <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="reconstruct-prompt"
            className="outline-none text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            {content.prompt}
          </h2>
          <p className="max-w-full break-words font-serif text-lg font-bold leading-tight text-[var(--ranked-ink,#2c2417)] sm:text-xl [@media(min-height:800px)]:text-2xl">
            {content.target.label}
          </p>
        </div>
      </header>

      <div role="group" aria-label={`Build of ${content.target.label}`} data-part="sockets"
        data-testid="reconstruct-sockets"
        className="mx-auto flex w-full items-start justify-center gap-2 pt-1">
        {board.map((_, i) => {
          const token = shown(i);
          const option = token !== null ? byToken.get(token) : undefined;
          const mark = revealed && reveal ? reveal.slotCorrect[i] ?? null : null;
          const pickToken = revealed && reveal && mark === false ? placementTokens[i] ?? null : null;
          const pickOption = pickToken !== null ? byToken.get(pickToken) : undefined;
          const state = revealed
            ? (mark === false ? (settledOn ? "settled" : "wrong") : mark === true ? "correct" : "filled")
            : phase === "locked" ? (token ? "locked" : "empty")
            : token ? "filled" : "empty";
          // A replaced socket's new token enters from below (the tray); a kept one does not move.
          const entering = revealed && settledOn && mark === false && animate;
          const wrongIndex = wrongOrder.indexOf(i);
          const base = `${sentenceCase(where(i))}`;
          const socketName = token === null
            ? `${base}, empty.${armed ? ` Press to place ${armed.label}.` : ""}`
            : `${base}: ${labelOf(token)}.${armed ? ` Press to replace it with ${armed.label}.` : " Press to remove."}`;
          const statusText = revealed
            ? (mark === true ? "Right part."
              : mark === false ? (settledOn ? `Your pick, ${labelOf(pickToken)}, was wrong.` : "Wrong part.") : "")
            : "";
          const socketBox = `relative h-14 w-14 [@media(min-height:800px)]:h-16 [@media(min-height:800px)]:w-16 shrink-0 rounded-lg border-2 ${SURFACE} ${
            token === null ? "border-dashed" : ""} ${
            mark === true ? "ring-2 ring-emerald-500" : ""} ${
            mark === false && !settledOn ? "ring-2 ring-destructive" : ""} ${
            state === "settled" ? "ring-2 ring-[#7a6236]" : ""}`;
          const art = (
            <span key={`${i}:${token ?? "empty"}`}
              style={entering ? { animationDuration: `${RECONSTRUCT_TIMING.settleTween}ms`, animationDelay: `${settleDelayMs(wrongIndex)}ms` } : undefined}
              className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-[6px] ${
                entering ? "animate-in fade-in slide-in-from-bottom-6 fill-mode-both" : ""}`}>
              {token !== null ? (
                <SubjectArt media={option?.media} monogram={(option?.label ?? "?").slice(0, 1)} className="h-full w-full" />
              ) : (
                <span aria-hidden className="font-serif text-lg font-black tabular-nums text-[#7a6236]/60">{i + 1}</span>
              )}
            </span>
          );
          return (
            <div key={i} data-part="slot" data-testid={`reconstruct-slot-${i}`} data-slot={i}
              className="flex min-w-0 max-w-[76px] flex-1 basis-0 flex-col items-center gap-1">
              {open ? (
                <button type="button" ref={(el) => { if (el) slotRefs.current.set(i, el); else slotRefs.current.delete(i); }}
                  data-part="socket" data-testid={`reconstruct-socket-${i}`} data-state={state}
                  data-token={token ?? undefined} data-armed={armed ? "true" : "false"}
                  data-drag-over={dragOver === i ? "true" : undefined}
                  aria-label={socketName} aria-describedby={hintId}
                  tabIndex={slotStop === i ? 0 : -1}
                  onFocus={() => setSlotStop(i)}
                  onClick={() => tapSocket(i)} onKeyDown={socketKeys(i)}
                  onDragOver={onSlotDragOver(i)} onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
                  onDrop={onSlotDrop(i)}
                  className={`${socketBox} cursor-pointer ${FOCUS} data-[armed=true]:border-[#b8872b] data-[drag-over=true]:ring-2 data-[drag-over=true]:ring-primary`}>
                  {art}
                </button>
              ) : (
                <div data-part="socket" data-testid={`reconstruct-socket-${i}`} data-state={state}
                  data-token={token ?? undefined} data-mark={mark === null ? undefined : mark ? "right" : "wrong"}
                  className={socketBox}>
                  {art}
                  {mark !== null && (mark || !settledOn) && <MarkBadge right={mark} animate={animate} />}
                  {revealed && mark === false && (
                    <PickBadge option={pickOption} slot={i} shown={settledOn && pickToken !== null}
                      animate={animate} delay={settleDelayMs(Math.max(0, wrongIndex))} />
                  )}
                  {state === "settled" && (
                    <span aria-hidden data-part="answer-tag"
                      className="absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded-sm bg-[#2a2110] px-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#f6e6bb]">
                      Answer
                    </span>
                  )}
                  <span className="sr-only" data-testid={`reconstruct-slot-status-${i}`}>
                    {`${base}: ${labelOf(token)}. ${statusText}`}
                  </span>
                </div>
              )}
              <span data-part="slot-label" data-testid={`reconstruct-label-${i}`} aria-hidden
                className="line-clamp-2 h-[2.5em] w-full break-words text-center text-[11px] font-semibold leading-tight text-[var(--ranked-ink,#2c2417)]">
                {token !== null ? labelOf(token) : ""}
              </span>
            </div>
          );
        })}
      </div>

      {/* One fixed line in every phase: the instruction, then the lock, then
          the verdict with what each wrong pick was. */}
      <div id={hintId} data-part={revealed && verdict ? "verdict" : "status-line"}
        data-testid={revealed && verdict ? "reconstruct-verdict" : "reconstruct-hint"}
        data-correct={revealed && reveal ? String(reveal.isCorrect) : undefined}
        className="flex h-[34px] flex-col items-center justify-center overflow-hidden text-center leading-tight">
        {revealed && verdict ? (
          <>
            <span data-testid="reconstruct-verdict-text"
              className="text-[12px] font-bold uppercase tracking-[0.2em] text-[var(--ranked-ink,#2c2417)]">
              {verdict}
            </span>
            <span data-testid="reconstruct-wrong-notes"
              className="max-w-full truncate text-[11px] text-[var(--ranked-ink-muted,#5a4a2e)]">
              {wrongNotes.join(" · ")}
            </span>
          </>
        ) : (
          <span className="text-[12px] text-[var(--ranked-ink-muted,#5a4a2e)]">{statusLine}</span>
        )}
      </div>

      <div data-part="tray-box" data-testid="reconstruct-tray-box"
        style={{ minHeight: `${trayBoxPx}px` }}
        className="mx-auto flex w-full max-w-[34rem] flex-col">
      {!evidenceInBox && (
        <div role="group" aria-label="Parts" data-part="tray" data-testid="reconstruct-tray"
          data-state={open ? "open" : "locked"}
          className="grid w-full grid-cols-3 gap-2">
          {content.options.map((option, index) => {
            const used = uses.get(option.token) ?? 0;
            const max = maxUsesOf(option);
            const atLimit = used >= max;
            const isSelected = armed?.token === option.token;
            // Quiet until used: an identical "0 / N" on every cell is noise.
            const usage = used === 0 ? "" : max > 1 ? `${used}/${max}` : "✓";
            const name = `${option.label}, ${max > 1 ? `used ${used} of ${max}` : used > 0 ? "used" : "not used"}`;
            return (
              <button key={option.token} type="button"
                ref={(el) => { if (el) trayRefs.current.set(option.token, el); else trayRefs.current.delete(option.token); }}
                data-part="option" data-testid={`reconstruct-option-${option.token}`}
                data-selected={isSelected ? "true" : "false"} data-at-limit={atLimit ? "true" : "false"}
                data-used={used}
                aria-label={name} aria-pressed={isSelected} aria-disabled={atLimit || undefined}
                disabled={!open} tabIndex={trayStopToken === option.token ? 0 : -1}
                draggable={open && !atLimit}
                onDragStart={(e) => {
                  if (!open || atLimit) { e.preventDefault(); return; }
                  dragToken.current = option.token;
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("text/plain", option.token);
                }}
                onDragEnd={() => { dragToken.current = null; setDragOver(null); }}
                onFocus={() => setTrayStop(option.token)}
                onClick={() => tapOption(option.token)} onKeyDown={optionKeys(index)}
                className={`flex h-[92px] min-w-0 flex-col items-center gap-1 overflow-hidden rounded-lg border px-1.5 py-1.5 text-center ${SURFACE} ${FOCUS} ${
                  isSelected ? "bg-[#ecd9a2] ring-2 ring-[#2a2110]" : ""} ${
                  atLimit && !isSelected ? "opacity-60" : ""} ${open ? "cursor-pointer" : "cursor-default opacity-70"}`}>
                <span className="relative shrink-0">
                  <SubjectArt media={option.media} monogram={option.label.slice(0, 1)}
                    className="h-10 w-10 rounded-md" />
                  <span aria-hidden data-part="usage" data-testid={`reconstruct-usage-${option.token}`}
                    className={`absolute -right-2.5 -top-1.5 min-w-[1.6rem] rounded-full bg-[#2a2110] px-1 text-center text-[10px] font-bold tabular-nums leading-4 text-[#f6e6bb] ${
                      usage ? "" : "invisible"}`}>
                    {usage}
                  </span>
                </span>
                <span aria-hidden className="line-clamp-2 break-words text-[12px] font-bold leading-tight">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {evidenceInBox && reveal?.evidence && (
        <div data-part="evidence" data-testid="reconstruct-evidence" data-shown="true"
          style={animate ? { animationDuration: `${RECONSTRUCT_TIMING.evidenceTween}ms` } : undefined}
          className={`flex w-full flex-1 flex-col gap-1 rounded-md border border-[#7a6236]/40 bg-[#2c2417]/[0.07] px-2.5 py-1 ${
            animate ? "animate-in fade-in fill-mode-both" : ""}`}>
          {(evidenceRows.length > 0 || (reveal.evidence.extras?.length ?? 0) > 0) && (
            <ul className="flex flex-col gap-1 p-0">
              {evidenceRows.map(({ token, quantity }) => {
                const option = byToken.get(token);
                const kids = reveal.evidence?.children?.[token];
                return (
                  <li key={token} data-testid={`reconstruct-evidence-${token}`}
                    className="flex list-none flex-col">
                    <span className="flex items-center justify-between gap-2 text-[12.5px] leading-5">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <SubjectArt media={option?.media} monogram={labelOf(token).slice(0, 1)}
                          className="h-[18px] w-[18px] shrink-0 rounded-sm [&_span]:!text-[9px]" />
                        <span className="min-w-0 truncate font-semibold">{labelOf(token)}</span>
                        {quantity !== null && quantity > 1 && (
                          <span data-part="quantity" data-testid={`reconstruct-evidence-qty-${token}`}
                            className="shrink-0 rounded-sm bg-[#2c2417]/10 px-1 text-[11px] font-bold tabular-nums leading-4">
                            {`×${quantity}`}
                          </span>
                        )}
                        {reveal.evidence?.annotations?.[token] !== undefined && (
                          <span data-part="annotation" className="shrink-0 rounded-sm bg-destructive/10 px-1 text-[10.5px] font-bold tabular-nums leading-4 text-destructive">
                            {reveal.evidence.annotations[token]}
                          </span>
                        )}
                      </span>
                      {reveal.evidence?.values?.[token] !== undefined && (
                        <span className="shrink-0 font-serif font-black tabular-nums">{reveal.evidence.values[token]}</span>
                      )}
                    </span>
                    {kids !== undefined && <ChildLine token={token} kids={kids} />}
                  </li>
                );
              })}
              {(reveal.evidence.extras ?? []).map((x, i) => (
                <li key={`${x.label}:${i}`} data-testid={`reconstruct-evidence-extra-${i}`}
                  className="flex list-none items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 break-words font-semibold">{x.label}</span>
                  <span className="shrink-0 font-serif font-black tabular-nums">{x.valueDisplay}</span>
                </li>
              ))}
            </ul>
          )}
          {reveal.evidence.total && (
            <p data-testid="reconstruct-evidence-total"
              className="mt-auto flex items-baseline justify-between gap-2 border-t border-[#7a6236]/40 pt-1 text-[13px] font-bold">
              <span className="min-w-0 truncate">{reveal.evidence.total.label}</span>
              <span className="shrink-0 font-serif text-base font-black tabular-nums">{reveal.evidence.total.valueDisplay}</span>
            </p>
          )}
        </div>
      )}
      </div>

      <footer data-part="footer" className="flex h-12 flex-col items-center justify-center">
        {open && (
          <>
            <Button type="button" data-part="lock" data-testid="reconstruct-lock" onClick={lock}
              disabled={!full} aria-describedby={lockHintId}
              className="min-h-[48px] w-full max-w-[34rem] border border-[#d5b66f]/80 bg-[#2a2110] uppercase tracking-[0.2em] text-[#f6e6bb] hover:bg-[#3a2d14]">
              <Lock aria-hidden /> Lock in
            </Button>
            <p id={lockHintId} data-testid="reconstruct-lock-hint" className="sr-only">
              {full ? "Final once locked." : `Fill all ${total} parts to lock in.`}
            </p>
          </>
        )}
        {phase === "locked" && (
          <p data-testid="reconstruct-suspense"
            className="inline-flex min-h-[44px] items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--ranked-ink-muted,#5a4a2e)]">
            <Lock aria-hidden className="!size-4" /> Locked in · Waiting <SuspenseDots animate={animate} />
          </p>
        )}
      </footer>
      <p role="status" aria-live="polite" data-testid="reconstruct-live" className="sr-only">
        {open ? announcement : resultText}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------- helpers

function sentenceCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function limitText(label: string, used: number, max: number): string {
  return max === 1
    ? `${label} is already placed. Remove it to use it again.`
    : `${label} is already used ${numberWord(used)} of ${numberWord(max)} times. Remove one to use it again.`;
}

/** Tokens in order of first appearance. */
function distinct(tokens: readonly string[]): string[] {
  return [...new Set(tokens)];
}

/** The whole reveal in one string, for the single live region. */
function revealSummary(
  reveal: ReconstructReveal, byToken: Map<string, AssemblyOption>, total: number, verdict: string,
): string {
  const counts = new Map<string, number>();
  for (const t of reveal.settled) counts.set(t, (counts.get(t) ?? 0) + 1);
  const parts = [...counts].map(([t, n]) => {
    const label = byToken.get(t)?.label ?? "";
    return n > 1 ? `${label}, ${n} of the ${total} parts` : label;
  });
  const ev = reveal.evidence;
  const evidence = [
    ...(ev?.extras ?? []).map((x) => `${x.label} ${x.valueDisplay}.`),
    ev?.total ? `${ev.total.label} ${ev.total.valueDisplay}.` : "",
  ].filter(Boolean).join(" ");
  return [
    verdict ? `${verdict}.` : "Revealed.",
    parts.length > 0 ? `The build is: ${parts.join("; ")}.` : "",
    evidence,
  ].filter(Boolean).join(" ");
}
