/**
 * MIG — POSITIONAL ASSEMBLY (ASSIGN).
 *
 * An Academy assembly board. A row of labelled positions is engraved into a
 * dark stone plate; beneath it, a tray of identity cards (or icon cards). The
 * player seats one card in every position and Locks. Each position MEANS
 * something, so a card in the wrong position is wrong even when it belongs
 * on the board — which is what separates this from Reconstruct's unordered
 * sockets.
 *
 * NOTHING HERE GRADES. `content` has no field that could hold the answer; the
 * canonical card for a position reaches this component only through
 * `reveal`, which it draws: the mark, the settle and the context plate are
 * all facts it is handed. Before a reveal every position and every card is
 * identical in treatment.
 *
 * INPUT. Every path ends in ONE placement (`placeCard`):
 *   * tap a tray card, then tap a position (or press its number key);
 *   * drag a tray card onto a position (mouse, touch, pen), forgiving drop;
 *   * tap a seated card to pick it up, then tap another position to move it
 *     (an occupied position swaps); drag a seated card back to the tray, tap
 *     its hollow in the tray, or press Delete on the position, to return it.
 *   A card from the tray dropped on an occupied position replaces the
 *   occupant, which returns to the tray. One card per position; a card in
 *   one position only (the library's invariants).
 *
 * CONTINUITY. Head, board, stage region and plate are reserved boxes in every
 * phase; a seated card leaves a hollow in the tray so the tray never
 * reflows; the player's wrong pick demotes into a reserved chip row under
 * the position; the context plate is stacked over the tray and crossfades.
 * The drag ghost is a fixed-position portal. Nothing in flow appears or
 * disappears because knowledge changed.
 */
import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Check, Lock, X } from "lucide-react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  AssemblyCard, InteractionPhase, PositionalAssemblyPublic, PositionalAssemblyResponse,
  PositionalAssemblyReveal, PositionalAssemblyValue,
} from "@/lib/interaction-grammar/types";
import {
  assertPositionalAssemblyContent, assemblyStageAt, BOARD_DROP_SLACK, clearPosition, DRAG_THRESHOLD_PX,
  filledCount, gridMove, insideRect, isBoardFull, markDelayMs, monogramFor, normalizeBoard, placeCard,
  planAssemblyReveal, positionForDigit, positionOf, sentenceCase, settleDelayMs, showsContext, showsSettled,
  type AssemblyPlan, type AssemblyStage,
} from "@/lib/interaction-grammar/positionalAssembly";
import { numberWord } from "@/lib/interaction-grammar/reconstruct";
import { SubjectArt } from "./shared";
import "./positionalAssembly.css";

export type PositionalAssemblyCue = "arm" | "seat" | "return" | "lock" | "mark" | "settle" | "resolve";

export interface PositionalAssemblyProps {
  content: PositionalAssemblyPublic;
  phase: InteractionPhase;
  /** The board, owned by the caller: position id → token or null. */
  value: PositionalAssemblyValue;
  onChange: (next: Record<string, string | null>) => void;
  /** Commit. Fires only when every position is filled; carries identity, never correctness. */
  onLock: (response: PositionalAssemblyResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: PositionalAssemblyReveal | null;
  /** Fires once per reveal when its choreography has finished (at once under reduced motion). */
  onRevealComplete?: () => void;
  onCue?: (cue: PositionalAssemblyCue) => void;
  promptRef?: Ref<HTMLHeadingElement>;
  /** A definite height from a host that measured its stage (`useStageRoom`). Absent: natural height. */
  maxHeight?: number;
  /** Tray columns. Default 5. */
  trayColumns?: number;
  /** The Lock button's words. Default "Lock in". */
  lockLabel?: string;
}

/**
 * The reveal's stage, driven by `plan`: one timer per stage boundary
 * (Reconstruct's clock, not a rAF loop — a background tab throttles rAF to a
 * halt, and the stage only has to advance at its boundaries; the tweens
 * inside a stage are CSS). A new key restarts it; an equal reveal does not.
 */
function useRevealStage(plan: AssemblyPlan, active: boolean, key: string): AssemblyStage {
  const [run, setRun] = useState<{ key: string; stage: AssemblyStage } | null>(null);
  useEffect(() => {
    if (!active) { setRun((r) => (r === null ? r : null)); return; }
    // The first stage is DERIVED below (a new key reads `stageAt(plan, 0)`), so only the boundaries set state.
    const timers = plan.stages.map(({ end }) => window.setTimeout(() => setRun({ key, stage: assemblyStageAt(plan, end) }), end));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, plan, key]);
  return run && run.key === key ? run.stage : assemblyStageAt(plan, 0);
}

interface DragState {
  token: string;
  /** The position the card came from, or null from the tray. */
  from: string | null;
  pointerId: number;
  x0: number; y0: number;
  x: number; y: number;
  active: boolean;
  /** A position id, "tray", or null (nowhere). */
  target: string | null;
  /** The pressed element's box, so the ghost lifts from where the finger is. */
  w: number; h: number; dx: number; dy: number;
}

/** One card's face: the SAME drawing in the tray, in a position and in the drag ghost. */
export function CardFace({ card, kind, dim = false }: { card: AssemblyCard; kind: "identity" | "icon"; dim?: boolean }) {
  const mono = card.monogram ?? monogramFor(card.label);
  // Long names shrink deterministically (no measuring): six characters fit at full size, ten at 0.66.
  const fit = Math.max(0.66, Math.min(1, 6.5 / card.label.length));
  return (
    <span className="pa-face" data-kind={kind} data-dim={dim ? "true" : undefined} style={{ ["--pa-fit" as string]: fit }}>
      <span className="pa-face-art">
        {kind === "identity" ? (
          <span className="pa-seal" aria-hidden>
            <span className="pa-seal-ring" />
            <span className="pa-seal-text">{mono.slice(0, 3)}</span>
          </span>
        ) : (
          <SubjectArt media={card.media} monogram={mono} className="pa-icon" />
        )}
      </span>
      <span className="pa-face-text">
        <span className="pa-face-label" title={card.label}>{card.label}</span>
        {card.sublabel ? <span className="pa-face-sub">{card.sublabel}</span> : null}
      </span>
    </span>
  );
}

export function PositionalAssembly({
  content, phase, value, onChange, onLock, reveal = null, onRevealComplete, onCue, promptRef, maxHeight,
  trayColumns = 5, lockLabel = "Lock in",
}: PositionalAssemblyProps) {
  assertPositionalAssemblyContent(content);
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const hintId = useId();
  const open = phase === "open";
  const { positions, cards, cardKind } = content;
  const total = positions.length;
  const byToken = useMemo(() => new Map(cards.map((c) => [c.token, c])), [cards]);
  const byPosition = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);
  const labelOf = useCallback((token: string | null | undefined) => (token ? byToken.get(token)?.label ?? "" : ""), [byToken]);
  const posLabel = useCallback((id: string | null | undefined) => (id ? byPosition.get(id)?.label ?? "" : ""), [byPosition]);

  const board = useMemo(() => normalizeBoard(content, value), [content, value]);
  const filled = filledCount(board);
  const full = isBoardFull(board);

  // ---- ephemeral UI state (never graded, never submitted)
  const [announcement, setAnnouncement] = useState("");
  const [armed, setArmed] = useState<{ token: string; from: string | null } | null>(null);
  const [trayStop, setTrayStop] = useState<string | null>(null);
  const [posStop, setPosStop] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const wellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const trayRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const anyWrong = Boolean(reveal && positions.some((p) => reveal.positionCorrect[p.id] === false));
  const plan = useMemo(() => planAssemblyReveal({ reduced, anyWrong }), [reduced, anyWrong]);
  const revealKey = revealed && reveal ? JSON.stringify([reveal.assignment, reveal.canonical, reveal.positionCorrect]) : "";
  const liveStage = useRevealStage(plan, revealed, revealKey);
  const stage: AssemblyStage | null = revealed ? liveStage : null;
  const settledOn = revealed && stage !== null && showsSettled(stage);
  const contextOn = revealed && stage !== null && showsContext(stage);

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  const cuedStage = useRef<AssemblyStage | null>(null);
  useEffect(() => {
    if (!revealed || !stage || cuedStage.current === stage) return;
    cuedStage.current = stage;
    if (stage === "marks") onCue?.("mark");
    else if (stage === "settle") onCue?.("settle");
    else if (stage === "context" || stage === "done") onCue?.("resolve");
  }, [revealed, stage, onCue]);
  useEffect(() => { if (!revealed) cuedStage.current = null; }, [revealed]);

  // A drag or an armed card never survives the board closing.
  useEffect(() => { if (!open) { dragRef.current = null; setDrag(null); setArmed(null); } }, [open]);
  // An armed card that left the board (host change) is disarmed.
  useEffect(() => {
    if (armed && !byToken.has(armed.token)) setArmed(null);
  }, [armed, byToken]);

  // ---- actions: every input path commits here
  const say = (text: string) => setAnnouncement(text);
  const summary = (next: PositionalAssemblyValue) => {
    const n = filledCount(next);
    return n === total ? `All ${numberWord(total)} placed. Lock in when you're sure.` : `${sentenceCase(numberWord(n))} of ${numberWord(total)} placed.`;
  };

  /** THE placement. */
  const seat = (positionId: string, token: string) => {
    if (!open) return;
    const out = placeCard(board, positionId, token);
    if (out.kind === "invalid") return;
    setArmed(null);
    const label = labelOf(token);
    const where = posLabel(positionId);
    if (out.kind === "same") { say(`${label} is already at ${where}.`); return; }
    onChange(out.next);
    onCue?.("seat");
    const tail = out.kind === "replaced" ? `, replacing ${labelOf(out.displaced)}, which is back in the tray`
      : out.kind === "swapped" ? `, swapping with ${labelOf(out.other)}`
      : out.kind === "moved" ? ` from ${posLabel(out.from)}` : "";
    say(`${label} placed at ${where}${tail}. ${summary(out.next)}`);
  };

  const unseat = (positionId: string) => {
    if (!open) return;
    const { next, removed } = clearPosition(board, positionId);
    if (removed === null) { say(`${posLabel(positionId)} is empty.`); return; }
    setArmed(null);
    onChange(next);
    onCue?.("return");
    say(`${labelOf(removed)} returned to the tray. ${summary(next)}`);
  };

  const arm = (token: string, from: string | null) => {
    if (!open) return;
    if (armed?.token === token) { setArmed(null); say(`${labelOf(token)} put down.`); return; }
    setArmed({ token, from });
    onCue?.("arm");
    say(`${labelOf(token)} selected. Choose a position: press 1 to ${total}, or tap one.`);
  };

  const lock = () => {
    if (!open || !full) return;
    onCue?.("lock");
    say("Locked. Waiting for the reveal.");
    onLock({ assignment: board as Record<string, string> });
  };

  // ---- taps
  const onCardClick = (token: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!open) return;
    const at = positionOf(board, token);
    if (at !== null) { unseat(at); return; }
    arm(token, null);
  };
  const onWellClick = (positionId: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (!open) return;
    if (armed) {
      if (armed.from === positionId) { setArmed(null); say(`${labelOf(armed.token)} put down at ${posLabel(positionId)}.`); return; }
      seat(positionId, armed.token);
      return;
    }
    const occupant = board[positionId];
    if (occupant) { arm(occupant, positionId); return; }
    say(`${posLabel(positionId)} is empty. Choose a card from the tray first.`);
  };

  // ---- pointer drag (mouse, touch, pen), straight from the card or the seated card
  const wellRects = () => positions.map((p) => {
    const r = wellRefs.current.get(p.id)?.getBoundingClientRect();
    return { id: p.id, rect: r ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: NaN, top: NaN, right: NaN, bottom: NaN } };
  });
  const dropTarget = (x: number, y: number, from: string | null): string | null => {
    const board_ = boardRef.current?.getBoundingClientRect();
    if (board_ && insideRect({ x, y }, board_, BOARD_DROP_SLACK)) {
      const rects = wellRects();
      let best: string | null = null;
      let bestD = Infinity;
      for (const { id, rect } of rects) {
        const dx = x - (rect.left + rect.right) / 2;
        const dy = y - (rect.top + rect.bottom) / 2;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = id; }
      }
      return best;
    }
    const tray = trayRef.current?.getBoundingClientRect();
    if (from !== null && tray && insideRect({ x, y }, tray, { x: 8, y: 8 })) return "tray";
    return null;
  };
  const endDrag = () => { dragRef.current = null; setDrag(null); };

  const onPressStart = (token: string, from: string | null) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!open || (e.pointerType === "mouse" && e.button !== 0)) return;
    suppressClick.current = false;
    const r = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      token, from, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      active: false, target: null, w: r.width, h: r.height, dx: e.clientX - r.left, dy: e.clientY - r.top,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom / released */ }
  };
  const onPressMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const moved = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active && moved < DRAG_THRESHOLD_PX) return;
    const next: DragState = { ...d, x: e.clientX, y: e.clientY, active: true, target: dropTarget(e.clientX, e.clientY, d.from) };
    dragRef.current = next;
    setDrag(next);
    if (!d.active) setArmed(null);
  };
  const onPressEnd = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    endDrag();
    if (!d.active) return; // a press without travel: the click handles it
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const target = dropTarget(e.clientX, e.clientY, d.from);
    if (target === null) { say(`${labelOf(d.token)} not moved.`); return; }
    if (target === "tray") { if (d.from !== null) unseat(d.from); return; }
    seat(target, d.token);
  };
  const onPressCancel = (e: ReactPointerEvent<HTMLElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    endDrag();
  };

  // ---- keyboard
  const focusCard = (i: number) => { const t = cards[i]?.token; if (t) cardRefs.current.get(t)?.focus(); };
  const focusWell = (i: number) => { const id = positions[i]?.id; if (id) wellRefs.current.get(id)?.focus(); };
  const digitSeat = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (!armed) return false;
    const i = positionForDigit(e.key, total);
    if (i === null) return false;
    e.preventDefault();
    seat(positions[i].id, armed.token);
    return true;
  };
  const cardKeys = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (digitSeat(e)) return;
    const to = gridMove(e.key, index, cards.length, trayColumns);
    if (to === null) return;
    e.preventDefault();
    focusCard(to);
  };
  const wellKeys = (index: number, id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (digitSeat(e)) return;
    if ((e.key === "Delete" || e.key === "Backspace") && board[id] !== null) { e.preventDefault(); unseat(id); return; }
    const to = gridMove(e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key, index, total, total);
    if (to === null) return;
    e.preventDefault();
    focusWell(to);
  };
  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (dragRef.current) { endDrag(); e.preventDefault(); return; }
      if (armed) { setArmed(null); say(`${labelOf(armed.token)} put down.`); e.preventDefault(); }
    }
  };

  // ---- derived display
  const shownAt = (id: string): string | null => {
    if (revealed && reveal) return (settledOn ? reveal.canonical[id] : reveal.assignment[id]) ?? null;
    return board[id] ?? null;
  };
  const rightCount = reveal ? positions.filter((p) => reveal.positionCorrect[p.id]).length : 0;
  const wrongOrder = revealed && reveal ? positions.filter((p) => reveal.positionCorrect[p.id] === false).map((p) => p.id) : [];
  const dragging = drag?.active ? drag : null;
  const verdictOn = contextOn;

  const statusLine = revealed && reveal ? (verdictOn ? reveal.verdictText : "Revealing the lineup…")
    : phase === "locked" ? "Locked. Waiting for the reveal."
    : armed ? `${labelOf(armed.token)} — choose a position (1–${total}), or tap it again to put it down.`
    : full ? `All ${numberWord(total)} placed. Lock in when you're sure.`
    : filled === 0 ? "Tap a card, then a position — or drag it there."
    : `${sentenceCase(numberWord(filled))} of ${numberWord(total)} placed. Tap a seated card to pick it up.`;
  const resultText = revealed && reveal
    ? [reveal.verdictText, ...positions.map((p) => {
      const ok = reveal.positionCorrect[p.id];
      const canon = labelOf(reveal.canonical[p.id]);
      const mine = labelOf(reveal.assignment[p.id]);
      return ok ? `${p.label}: ${canon}, right.` : `${p.label}: ${canon}; you placed ${mine}.`;
    })].join(" ")
    : phase === "locked" ? "Locked. Waiting for the reveal." : "";

  const trayStopToken = trayStop && byToken.has(trayStop) ? trayStop : cards[0].token;
  const posStopId = posStop && byPosition.has(posStop) ? posStop : positions[0].id;
  const rows = Math.ceil(cards.length / trayColumns);

  return (
    <div data-testid="mig-positional-assembly" data-mig-primitive="positional-assembly" data-phase={phase}
      data-reveal-stage={stage ?? undefined} data-verdict={verdictOn && reveal ? (reveal.isCorrect ? "right" : "wrong") : undefined}
      data-kind={cardKind} data-filled={filled} data-positions={total} data-reduced={reduced ? "true" : "false"}
      data-armed={armed ? "true" : undefined} data-dragging={dragging ? "true" : undefined}
      data-sized={maxHeight !== undefined ? "true" : "false"}
      onKeyDown={onRootKeyDown}
      className="pa" style={{ ...(maxHeight !== undefined ? { height: maxHeight, flex: "none" } : {}), ["--pa-cols" as string]: trayColumns, ["--pa-rows" as string]: rows }}>
      <header data-part="head" data-testid="pa-head" className="pa-head">
        <span className="pa-subject-mark">
          <SubjectArt media={content.subject.media} monogram={content.subject.monogram ?? monogramFor(content.subject.label)} className="h-full w-full" />
        </span>
        <div className="pa-head-text">
          <p className="pa-eyebrow">{content.eyebrow}</p>
          <h2 ref={promptRef} id={promptId} tabIndex={-1} className="pa-prompt" data-testid="pa-prompt">{content.prompt}</h2>
          <p className="pa-subject" data-testid="pa-subject">
            <b>{content.subject.label}</b>{content.subject.sublabel ? <> · {content.subject.sublabel}</> : null}
          </p>
        </div>
      </header>

      <div ref={boardRef} data-part="board" data-testid="pa-board" className="pa-board" role="group" aria-label="Positions" aria-describedby={hintId}>
        <span aria-hidden className="pa-bezel" />
        <span aria-hidden className="pa-corner" data-at="tl" /><span aria-hidden className="pa-corner" data-at="tr" />
        <span aria-hidden className="pa-corner" data-at="bl" /><span aria-hidden className="pa-corner" data-at="br" />
        <ol className="pa-positions">
          {positions.map((p, i) => {
            const token = shownAt(p.id);
            const card = token ? byToken.get(token) : undefined;
            const mark = revealed && reveal ? reveal.positionCorrect[p.id] ?? null : null;
            const pickToken = revealed && reveal && mark === false ? reveal.assignment[p.id] ?? null : null;
            const pick = pickToken ? byToken.get(pickToken) : undefined;
            const wrongIndex = wrongOrder.indexOf(p.id);
            const state = revealed
              ? (mark === false ? (settledOn ? "settled" : "wrong") : mark === true ? "correct" : "filled")
              : phase === "locked" ? (token ? "locked" : "empty")
              : token ? "filled" : "empty";
            const dropHere = dragging?.target === p.id;
            const lifted = dragging?.from === p.id || armed?.from === p.id;
            const entering = revealed && settledOn && mark === false && animate;
            const name = token === null
              ? `${p.label} position, empty.${armed ? ` Press to place ${labelOf(armed.token)} here.` : ""}`
              : `${p.label} position: ${labelOf(token)}.${armed ? (armed.from === p.id ? " Press to put it down." : ` Press to place ${labelOf(armed.token)} here instead.`) : " Press to pick it up."}`;
            const setWellRef = (el: HTMLElement | null) => { if (el) wellRefs.current.set(p.id, el); else wellRefs.current.delete(p.id); };
            // The settle: the player's wrong card SINKS out of the well while the canonical card RISES in, on the
            // same stagger, so a wrong pick is still there to be seen until its own moment comes (it then lives on
            // as the chip below). Under reduced motion the outgoing layer is simply hidden.
            const leaving = revealed && settledOn && mark === false && pick ? (
              <span key={`${p.id}:out:${pickToken}`} aria-hidden className="pa-well-face" data-leaving="true"
                style={animate ? { animationDelay: `${settleDelayMs(Math.max(0, wrongIndex))}ms` } : undefined}>
                <CardFace card={pick} kind={cardKind} />
              </span>
            ) : null;
            const face = card ? (
              <>
                {leaving}
                <span key={`${p.id}:${token}`} className="pa-well-face" data-entering={entering ? "true" : undefined}
                  style={entering ? { animationDelay: `${settleDelayMs(Math.max(0, wrongIndex))}ms` } : undefined}>
                  <CardFace card={card} kind={cardKind} dim={lifted} />
                </span>
              </>
            ) : null;
            const markSeal = mark !== null && (mark || !settledOn) ? (
              <span aria-hidden data-part="mark" data-mark={mark ? "right" : "wrong"} className="pa-mark"
                style={animate ? { animationDelay: `${markDelayMs(i)}ms` } : undefined}>
                {mark ? <Check /> : <X />}
              </span>
            ) : null;
            return (
              <li key={p.id} data-part="position" data-testid={`pa-position-${p.id}`} data-id={p.id} data-state={state}
                data-mark={mark === null ? undefined : mark ? "right" : "wrong"} data-drop-target={dropHere ? "true" : undefined}
                data-index={i + 1} className="pa-position">
                <span className="pa-pos-label" aria-hidden>
                  {p.emblem?.src ? <img src={p.emblem.src} alt="" width={14} height={14} draggable={false} className="pa-pos-emblem" /> : null}
                  <span className="pa-pos-name"><span className="pa-pos-full">{p.label}</span><span className="pa-pos-short">{p.short ?? p.label}</span></span>
                </span>
                {open ? (
                  <button type="button" ref={setWellRef} data-part="well" data-testid={`pa-well-${p.id}`} data-token={token ?? undefined}
                    aria-label={name} aria-describedby={hintId} tabIndex={posStopId === p.id ? 0 : -1}
                    onFocus={() => setPosStop(p.id)} onClick={() => onWellClick(p.id)} onKeyDown={wellKeys(i, p.id)}
                    onPointerDown={token ? onPressStart(token, p.id) : undefined} onPointerMove={onPressMove}
                    onPointerUp={onPressEnd} onPointerCancel={onPressCancel} onDragStart={(e) => e.preventDefault()}
                    className="pa-well">
                    <span aria-hidden className="pa-well-ghost">{p.emblem?.src ? <img src={p.emblem.src} alt="" draggable={false} /> : null}</span>
                    <span aria-hidden className="pa-pos-key">{i + 1}</span>
                    {face}
                  </button>
                ) : (
                  <div ref={setWellRef} data-part="well" data-testid={`pa-well-${p.id}`} data-token={token ?? undefined} className="pa-well">
                    <span aria-hidden className="pa-well-ghost">{p.emblem?.src ? <img src={p.emblem.src} alt="" draggable={false} /> : null}</span>
                    {face}
                    {markSeal}
                  </div>
                )}
                {/* Reserved chip row: the player's wrong pick, once the canonical card has settled in. */}
                <span data-part="pick" data-testid={`pa-pick-${p.id}`} data-shown={settledOn && pick ? "true" : "false"} aria-hidden className="pa-pick"
                  style={settledOn && pick && animate ? { animationDelay: `${settleDelayMs(Math.max(0, wrongIndex)) + 120}ms` } : undefined}>
                  {pick ? (
                    <>
                      <span className="pa-pick-x"><X /></span>
                      <span className="pa-pick-art">
                        {cardKind === "identity" ? <span className="pa-pick-mono">{(pick.monogram ?? monogramFor(pick.label)).slice(0, 2)}</span>
                          : <SubjectArt media={pick.media} monogram={monogramFor(pick.label)} className="h-full w-full" />}
                      </span>
                      <span className="pa-pick-name">{pick.label}</span>
                    </>
                  ) : null}
                </span>
                <span className="sr-only" data-testid={`pa-position-status-${p.id}`}>
                  {revealed ? (mark === true ? `${p.label}: ${labelOf(token)}, right.` : mark === false ? `${p.label}: ${labelOf(reveal?.canonical[p.id])}; your pick ${labelOf(pickToken)} was wrong.` : "") : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div data-part="stage-region" data-testid="pa-region" className="pa-region">
        <div data-part="tray-layer" className="pa-tray-layer" data-shown={contextOn ? "false" : "true"} aria-hidden={contextOn || undefined}>
          <div ref={trayRef} role="group" aria-label="Cards" data-part="tray" data-testid="pa-tray" data-state={open ? "open" : "locked"}
            data-drop-target={dragging?.target === "tray" ? "true" : undefined} className="pa-tray">
            {cards.map((card, index) => {
              const at = positionOf(board, card.token);
              const seated = at !== null;
              const isArmed = armed?.token === card.token;
              const lifted = dragging?.token === card.token && dragging.from === null;
              const name = seated ? `${card.label}, placed at ${posLabel(at)}. Press to return it to the tray.`
                : isArmed ? `${card.label}, selected. Press to put it down.` : `${card.label}. Press to select it, then choose a position.`;
              return (
                <div key={card.token} data-part="cell" className="pa-cell" data-seated={seated ? "true" : undefined}>
                  <button type="button"
                    ref={(el) => { if (el) cardRefs.current.set(card.token, el); else cardRefs.current.delete(card.token); }}
                    data-part="card" data-testid={`pa-card-${card.token}`} data-seated={seated ? "true" : undefined}
                    data-armed={isArmed ? "true" : undefined} data-lifted={lifted ? "true" : undefined}
                    aria-label={name} aria-pressed={isArmed || undefined} disabled={!open} tabIndex={trayStopToken === card.token ? 0 : -1}
                    onPointerDown={seated ? undefined : onPressStart(card.token, null)} onPointerMove={onPressMove}
                    onPointerUp={onPressEnd} onPointerCancel={onPressCancel}
                    onLostPointerCapture={(e) => { if (dragRef.current?.pointerId === e.pointerId && !dragRef.current.active) dragRef.current = null; }}
                    onDragStart={(e) => e.preventDefault()}
                    onFocus={() => setTrayStop(card.token)} onClick={() => onCardClick(card.token)} onKeyDown={cardKeys(index)}
                    className="pa-card">
                    <CardFace card={card} kind={cardKind} dim={seated || lifted} />
                    <span aria-hidden className="pa-card-seated-tag">{seated ? (byPosition.get(at!)?.short ?? posLabel(at)) : ""}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div data-part="context" data-testid="pa-context" className="pa-context" data-shown={contextOn ? "true" : "false"} aria-hidden={!contextOn || undefined}>
          {reveal ? (
            <>
              <p className="pa-context-title">{reveal.context.title}</p>
              <ul className="pa-context-lines">
                {reveal.context.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
              {reveal.cardNotes && wrongOrder.length > 0 ? (
                <ul className="pa-context-notes" data-testid="pa-context-notes">
                  {wrongOrder.map((id) => {
                    const t = reveal.assignment[id];
                    const note = t ? reveal.cardNotes?.[t] : undefined;
                    return note ? <li key={id} title={`${labelOf(t)} — ${note}`}><b>{labelOf(t)}</b> — {note}</li> : null;
                  })}
                </ul>
              ) : null}
              {reveal.context.source ? (
                <p className="pa-context-source">
                  {reveal.context.source.url ? <a href={reveal.context.source.url} target="_blank" rel="noreferrer">{reveal.context.source.label}</a> : reveal.context.source.label}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <div data-part="plate" data-testid="pa-plate" className="pa-plate">
        <p data-part="status" data-testid="pa-status" id={hintId} className="pa-status" data-verdict={verdictOn && reveal ? (reveal.isCorrect ? "right" : "wrong") : undefined}>
          {statusLine}
        </p>
        <div className="pa-lockwrap" data-part="lock" data-testid="pa-lockwrap">
          <button type="button" className="pa-lock" data-testid="pa-lock" data-shown={open ? "true" : "false"}
            onClick={lock} disabled={!open || !full} aria-describedby={hintId}>
            <Lock aria-hidden /> {lockLabel}
          </button>
          <span className="pa-lockstate" data-testid="pa-lockstate" data-shown={open ? "false" : "true"}
            data-verdict={verdictOn && reveal ? (reveal.isCorrect ? "right" : "wrong") : undefined} aria-hidden={open || undefined}>
            {verdictOn && reveal ? `${rightCount} / ${total}` : <><Lock aria-hidden className="!size-3.5" /> Locked <span aria-hidden className="pa-dots"><i /><i /><i /></span></>}
          </span>
        </div>
      </div>
      <p role="status" aria-live="polite" data-testid="pa-live" className="sr-only">{resultText || announcement}</p>

      {dragging && typeof document !== "undefined" ? createPortal(
        <span aria-hidden data-testid="pa-drag-ghost" className="pa-ghost" data-kind={cardKind}
          style={{ width: dragging.w, height: dragging.h, transform: `translate(${dragging.x - dragging.dx}px, ${dragging.y - dragging.dy}px)` }}>
          {byToken.get(dragging.token) ? <CardFace card={byToken.get(dragging.token)!} kind={cardKind} /> : null}
        </span>, document.body) : null}
    </div>
  );
}
