/**
 * MATCH GRID — the relational instrument. A content-neutral MIG primitive:
 * entities (sigils) are seated onto groups (seals) and the board draws the
 * relationships as threads, so the player builds a classification rather than
 * answering "which category?" N times.
 *
 * Ownership follows Reconstruct / Order Forge: the host owns `value`, `phase`,
 * `reveal` and all grading. This component owns only what is ephemeral — the
 * sigil in hand, the drag in flight, the live-region note, the reveal clock.
 *
 * NO ANSWER LEAKAGE: before `reveal` arrives every seal accepts every sigil
 * identically, no thread is coloured by correctness, no data attribute
 * describes correctness, and nothing here can compute it (`board.ts` has no
 * grader). Correctness enters only through `reveal` and is drawn only then.
 *
 * CONTINUITY: one board, one coordinate space, reserved geometry. Sigils are
 * absolutely positioned and move by `transform` between a well socket and a
 * seat; the frame never changes height because knowledge changed. The ledger
 * takes over the well's footprint by opacity after the reveal.
 */
import {
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
  type ReactNode, type Ref, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import { Lock } from "lucide-react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { InteractionPhase, MatchGroup, MatchPublic, MatchResponse, MatchReveal, MatchValue } from "@/lib/match-grid/contract";
import {
  assertMatchContent, isBoardComplete, membersOf, normalizeValue, numberWord, seatEntity, settleReveal, snapToGroup,
  toMatchResponse, unseatEntity, unsortedCount,
} from "@/lib/match-grid/board";
import { computeLayout, compositionFor, instrumentHeight, wellSockets, type HeightTier, type InstrumentLayout } from "@/lib/match-grid/layout";
import { planReveal, reached, type RevealStage } from "@/lib/match-grid/reveal";
import "./matchGrid.css";

export interface MatchGridProps {
  content: MatchPublic;
  phase: InteractionPhase;
  value: MatchValue;
  onChange: (next: MatchValue) => void;
  onLock: (response: MatchResponse) => void;
  reveal: MatchReveal | null;
  /** Art for a seal's face. The host owns what a group looks like; the primitive owns where it sits. */
  renderGroupGlyph?: (group: MatchGroup) => ReactNode;
  /** The prompt heading, so a host can move focus to it. */
  promptRef?: Ref<HTMLHeadingElement>;
  /** Called once per reveal when the sequence has fully settled. */
  onRevealComplete?: () => void;
  /**
   * The host's height budget, when it knows better than the viewport (a
   * framed stage is shorter than the window). Omitted: chosen from the viewport.
   */
  heightTier?: HeightTier;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const TOUCH_HOLD_MS = 180;
const TOUCH_SLOP = 8;
const MOUSE_SLOP = 4;
const GAP_INSTRUMENT_WELL = 12;

interface DragState {
  token: string;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  /** Pointer offset from the sigil centre at grab, so it does not jump under the finger. */
  grabDx: number;
  grabDy: number;
  /** Board-space pointer position. */
  x: number;
  y: number;
  /** Set once movement (mouse) or the hold (touch) commits this to a drag. */
  active: boolean;
}

const COMPACT_QUERY = "(max-height: 719px)";
const TALL_QUERY = "(min-height: 820px) and (min-width: 1360px)";

function readHeightTier(): HeightTier {
  if (typeof window === "undefined" || !window.matchMedia) return "normal";
  if (window.matchMedia(COMPACT_QUERY).matches) return "compact";
  if (window.matchMedia(TALL_QUERY).matches) return "tall";
  return "normal";
}

/** Height tier: short desktops and short phones get the compact instrument; roomy desktops the tall one. */
function useHeightTier(): HeightTier {
  const [tier, setTier] = useState<HeightTier>(readHeightTier);
  useEffect(() => {
    const queries = [COMPACT_QUERY, TALL_QUERY].map((q) => window.matchMedia?.(q)).filter(Boolean) as MediaQueryList[];
    const sync = () => setTier(readHeightTier());
    sync();
    queries.forEach((mq) => mq.addEventListener?.("change", sync));
    return () => queries.forEach((mq) => mq.removeEventListener?.("change", sync));
  }, []);
  return tier;
}

function useMeasuredWidth(ref: React.RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Layout width, not the painted box: a host may scale the board to fit a
    // short frame, and the board must lay out at its own width regardless.
    const read = () => setWidth(Math.round(el.clientWidth || el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export function MatchGrid({ content, phase, value, onChange, onLock, reveal, renderGroupGlyph, promptRef, onRevealComplete, heightTier }: MatchGridProps) {
  assertMatchContent(content);
  const { entities, groups } = content;
  const K = groups.length;
  const N = entities.length;

  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const measured = useMeasuredWidth(rootRef);
  const width = measured || 960;
  const viewportTier = useHeightTier();
  const tier = heightTier ?? viewportTier;
  const compact = tier === "compact";
  const reduced = useReducedMotionPreference();

  // ------------------------------------------------------------ geometry
  const composition = compositionFor(width, K, tier);
  const instrH = instrumentHeight(composition, K, tier);
  const layout: InstrumentLayout = useMemo(
    () => computeLayout({ width, height: instrH, groupCount: K, tier }),
    [width, instrH, K, tier],
  );
  const sigil = layout.sigil;
  const captionBand = composition === "ledger" ? 18 : compact ? 20 : tier === "tall" ? 26 : 24;
  const wellPitch = composition === "ledger" ? Math.max(58, Math.floor((width - 16) / Math.min(N, 6))) : compact ? 80 : tier === "tall" ? 102 : 92;
  const wellPad = 14;
  const wellRowH = sigil + captionBand + 8;
  const well = useMemo(() => wellSockets(N, width - 2 * wellPad, wellPitch), [N, width, wellPitch]);
  const wellH = well.rows * wellRowH + wellPad * 2;
  const wellTop = instrH + GAP_INSTRUMENT_WELL;
  const boardH = wellTop + wellH;
  const socketCenter = useCallback((i: number) => {
    const p = well.at(i);
    return { x: wellPad + p.x, y: wellTop + wellPad + p.y * wellRowH + sigil / 2 };
  }, [well, wellTop, wellRowH, sigil]);

  // ------------------------------------------------------------ board state
  const board = useMemo(() => normalizeValue(content, value), [content, value]);
  const complete = isBoardComplete(content, board);
  const remaining = unsortedCount(content, board);
  const groupIndex = useMemo(() => new Map(groups.map((g, i) => [g.token, i])), [groups]);
  const groupLabel = useCallback((token: string) => groups.find((g) => g.token === token)?.label ?? token, [groups]);
  const entityLabel = useCallback((token: string) => entities.find((e) => e.token === token)?.label ?? token, [entities]);

  const [held, setHeld] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [note, setNote] = useState("");
  const holdTimer = useRef<number | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;

  const open = phase === "open" && !reveal;

  // Leaving the open phase drops anything in hand.
  useEffect(() => {
    if (!open) { setHeld(null); setDrag(null); }
  }, [open]);

  // ------------------------------------------------------------ reveal clock
  const settledPlan = useMemo(
    () => (reveal ? settleReveal(content, board, reveal) : null),
    [content, board, reveal],
  );
  const hasTravel = (settledPlan?.travel.length ?? 0) > 0;
  const [stage, setStage] = useState<RevealStage>("freeze");
  const completedFor = useRef<MatchReveal | null>(null);
  useEffect(() => {
    if (!reveal) { setStage("freeze"); return; }
    const plan = planReveal({ reduced, hasTravel });
    if (plan.instant) {
      setStage("done");
      if (completedFor.current !== reveal) { completedFor.current = reveal; onRevealComplete?.(); }
      return;
    }
    setStage("freeze");
    const timers = plan.stages.map((s) => window.setTimeout(() => {
      setStage(s.stage);
      if (s.stage === "done" && completedFor.current !== reveal) { completedFor.current = reveal; onRevealComplete?.(); }
    }, s.at));
    return () => timers.forEach((t) => window.clearTimeout(t));
    // The clock restarts only for a new reveal object; a motion-preference flip mid-reveal is not re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, hasTravel]);

  const marksShown = Boolean(reveal) && reached(stage, "marks");
  const travelled = Boolean(reveal) && reached(stage, "travel") && hasTravel;
  const ledgerShown = Boolean(reveal) && reached(stage, "ledger");
  const drawn = travelled && settledPlan ? settledPlan.settled : board;
  const travellers = useMemo(() => new Set(settledPlan?.travel.map((t) => t.entity) ?? []), [settledPlan]);

  // One announcement for the whole reveal.
  useEffect(() => {
    if (!reveal) return;
    const wrong = entities.filter((e) => reveal.entityCorrect[e.token] === false);
    const head = reveal.isCorrect
      ? `Classification resolved: every ${content.entityNoun} is in its ${content.groupNoun}.`
      : `${numberWord(entities.length - wrong.length)} of ${numberWord(entities.length)} relationships stable.`;
    const tail = wrong.map((e) => `${e.label} belongs to ${reveal.canonical[e.token]?.map(groupLabel).join(" and ") ?? "another group"}, not ${groupLabel(reveal.assignments[e.token] ?? "")}.`);
    setNote([head, ...tail].join(" "));
  }, [reveal, entities, content.entityNoun, content.groupNoun, groupLabel]);

  // ------------------------------------------------------------ actions
  const commitSeat = useCallback((token: string, group: string) => {
    const out = seatEntity(content, board, token, group);
    if (out.kind === "invalid") return;
    if (out.kind !== "same") onChange(out.next);
    const n = membersOf(out.next, group).length;
    const gl = groupLabel(group);
    setNote(out.kind === "moved"
      ? `${entityLabel(token)} moved from ${groupLabel(out.previous)} to ${gl}. ${gl} holds ${numberWord(n)}.`
      : out.kind === "same" ? `${entityLabel(token)} is already in ${gl}.`
      : `${entityLabel(token)} seated in ${gl}. ${gl} holds ${numberWord(n)}.`);
    setHeld(null);
  }, [content, board, onChange, groupLabel, entityLabel]);

  const commitUnseat = useCallback((token: string) => {
    const out = unseatEntity(board, token);
    if (out.removed === null) { setNote(`${entityLabel(token)} is already in the well.`); setHeld(null); return; }
    onChange(out.next);
    setNote(`${entityLabel(token)} returned to the well from ${groupLabel(out.removed)}.`);
    setHeld(null);
  }, [board, onChange, entityLabel, groupLabel]);

  const toggleHeld = useCallback((token: string) => {
    if (held === token) { setHeld(null); setNote(`Put ${entityLabel(token)} down.`); return; }
    setHeld(token);
    const where = board[token] ? `, now in ${groupLabel(board[token].group)}` : "";
    setNote(`Holding ${entityLabel(token)}${where}. Choose a ${content.groupNoun}: tap one, or press 1 to ${K}${board[token] ? ", or Delete to return it" : ""}.`);
  }, [held, board, entityLabel, groupLabel, content.groupNoun, K]);

  const lock = useCallback(() => {
    if (!open || !complete) return;
    setHeld(null);
    setNote("Locked in.");
    onLock(toMatchResponse(content, board));
  }, [open, complete, content, board, onLock]);

  // ------------------------------------------------------------ pointer drag
  const boardPoint = useCallback((e: { clientX: number; clientY: number }) => {
    const el = boardRef.current;
    const r = el?.getBoundingClientRect();
    // Painted px -> board px, so drops land correctly under a host's fit scale.
    const scale = el && r && el.offsetWidth ? r.width / el.offsetWidth : 1;
    const k = scale > 0 ? scale : 1;
    return { x: (e.clientX - (r?.left ?? 0)) / k, y: (e.clientY - (r?.top ?? 0)) / k };
  }, []);

  const clearHold = () => { if (holdTimer.current !== null) { window.clearTimeout(holdTimer.current); holdTimer.current = null; } };

  const onSigilPointerDown = (token: string, center: { x: number; y: number }) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!open || e.button !== 0) return;
    const p = boardPoint(e);
    const next: DragState = {
      token, pointerId: e.pointerId, pointerType: e.pointerType, startX: p.x, startY: p.y,
      grabDx: p.x - center.x, grabDy: p.y - center.y, x: p.x, y: p.y, active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(next);
    if (e.pointerType !== "mouse") {
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        const d = dragRef.current;
        if (d && d.token === token && !d.active) setDrag({ ...d, active: true });
      }, TOUCH_HOLD_MS);
    }
  };

  const onSigilPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = boardPoint(e);
    const dist = Math.hypot(p.x - d.startX, p.y - d.startY);
    if (!d.active) {
      if (d.pointerType === "mouse") {
        if (dist < MOUSE_SLOP) return;
        setDrag({ ...d, x: p.x, y: p.y, active: true });
      } else if (dist > TOUCH_SLOP) {
        // A swipe before the hold: this is a scroll, not a drag.
        clearHold();
        setDrag(null);
      }
      return;
    }
    setDrag({ ...d, x: p.x, y: p.y });
  };

  const resolveDrop = useCallback((d: DragState) => {
    const zones = layout.seals.map((s) => s.zone);
    const g = snapToGroup({ x: d.x, y: d.y }, zones, { x: 24, y: GAP_INSTRUMENT_WELL + 24 });
    if (g !== null && d.y < wellTop + 24) { commitSeat(d.token, groups[g].token); return; }
    const inWell = d.y >= wellTop - 24 && d.y <= boardH + 24 && d.x >= -24 && d.x <= width + 24;
    if (inWell) { if (board[d.token]) commitUnseat(d.token); else setHeld(null); return; }
    setNote(`${entityLabel(d.token)} put back.`);
  }, [layout, wellTop, boardH, width, groups, board, commitSeat, commitUnseat, entityLabel]);

  const onSigilPointerUp = (token: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    clearHold();
    if (!d || d.pointerId !== e.pointerId) return;
    setDrag(null);
    if (d.active) {
      const moved = Math.hypot(d.x - d.startX, d.y - d.startY) >= MOUSE_SLOP;
      if (moved) { resolveDrop(d); return; }
    }
    // A press without movement is a tap: pick the sigil up (or put it down).
    toggleHeld(token);
  };

  const onSigilPointerCancel = () => { clearHold(); setDrag(null); };

  // While a touch drag is active the page must not scroll under it.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const guard = (ev: TouchEvent) => { if (dragRef.current?.active) ev.preventDefault(); };
    el.addEventListener("touchmove", guard, { passive: false });
    return () => el.removeEventListener("touchmove", guard);
  }, []);

  // ------------------------------------------------------------ keyboard
  const digitGroup = (key: string): number | null => {
    const n = Number.parseInt(key, 10);
    return Number.isInteger(n) && n >= 1 && n <= K ? n - 1 : null;
  };

  const onSigilKeyDown = (token: string) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open) return;
    const g = digitGroup(e.key);
    if (g !== null) { e.preventDefault(); commitSeat(token, groups[g].token); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); commitUnseat(token); return; }
    if (e.key === "Escape" && held) { e.preventDefault(); setHeld(null); setNote(`Put ${entityLabel(token)} down.`); }
  };

  const onSealKeyDown = (g: number) => (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open) return;
    if ((e.key === "Enter" || e.key === " ") && held) { e.preventDefault(); commitSeat(held, groups[g].token); return; }
    const d = digitGroup(e.key);
    if (d !== null && held) { e.preventDefault(); commitSeat(held, groups[d].token); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); sealRefs.current[(g + 1) % K]?.focus(); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); sealRefs.current[(g - 1 + K) % K]?.focus(); }
    if (e.key === "Escape" && held) { e.preventDefault(); setHeld(null); setNote("Put it down."); }
  };

  const onSealClick = (g: number) => () => {
    if (!open) return;
    if (held) { commitSeat(held, groups[g].token); return; }
    const names = membersOf(board, groups[g].token).map((m) => entityLabel(m.token));
    setNote(names.length ? `${groups[g].label} holds ${names.join(", ")}.` : `${groups[g].label} is empty. Pick up a ${content.entityNoun} first.`);
  };

  const sealRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // ------------------------------------------------------------ derived paint
  const sealCount = (token: string) => membersOf(drawn, token).length;
  const positions = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>();
    entities.forEach((e, i) => {
      const s = drawn[e.token];
      out.set(e.token, s ? layout.seat(groupIndex.get(s.group) ?? 0, s.seat) : socketCenter(i));
    });
    return out;
  }, [entities, drawn, layout, groupIndex, socketCenter]);

  const markOf = (token: string): "stable" | "fractured" | "corrected" | null => {
    if (!reveal || !marksShown) return null;
    if (reveal.entityCorrect[token]) return "stable";
    return travelled && travellers.has(token) ? "corrected" : "fractured";
  };

  type Thread = { key: string; entity: string; group: string; state: "open" | "stable" | "fractured" | "inked" };
  const threads: Thread[] = [];
  for (const e of entities) {
    const lockedSeat = board[e.token];
    const finalSeat = drawn[e.token];
    const mark = markOf(e.token);
    if (reveal && travelled && travellers.has(e.token) && finalSeat) {
      if (lockedSeat && !ledgerShown) threads.push({ key: `${e.token}:${lockedSeat.group}`, entity: e.token, group: lockedSeat.group, state: "fractured" });
      threads.push({ key: `${e.token}:${finalSeat.group}:inked`, entity: e.token, group: finalSeat.group, state: "inked" });
      continue;
    }
    if (!lockedSeat) continue;
    threads.push({
      key: `${e.token}:${lockedSeat.group}`, entity: e.token, group: lockedSeat.group,
      state: mark === "stable" ? "stable" : mark === "fractured" ? "fractured" : "open",
    });
  }

  const threadEnds = (t: Thread) => {
    const s = layout.seals[groupIndex.get(t.group) ?? 0];
    const p = t.state === "fractured" && board[t.entity]
      ? layout.seat(groupIndex.get(board[t.entity].group) ?? 0, board[t.entity].seat)
      : positions.get(t.entity)!;
    const dx = p.x - s.x, dy = p.y - s.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    return { x1: s.x + ux * (s.r + 2), y1: s.y + uy * (s.r + 2), x2: p.x - ux * (sigil / 2 + 2), y2: p.y - uy * (sigil / 2 + 2) };
  };

  const hueStyle = (g: MatchGroup): CSSProperties => (g.hue == null ? {} : ({ "--mg-hue": String(g.hue) } as CSSProperties));

  const verdictLine = reveal
    ? reveal.isCorrect
      ? "Classification resolved"
      : `${numberWord(entities.filter((e) => reveal.entityCorrect[e.token] === false).length)} corrected`
    : null;

  const statusText = reveal
    ? `${verdictLine} · ${numberWord(entities.filter((e) => reveal.entityCorrect[e.token]).length)} of ${numberWord(N)} stable`
    : phase === "locked"
      ? "Locked in · waiting for the Academy"
      : held
        ? `Holding ${entityLabel(held)} — choose a ${content.groupNoun}`
        : remaining === 0
          ? "Every relationship drawn — lock when you are sure"
          : `${numberWord(remaining)} ${remaining === 1 ? content.entityNoun : `${content.entityNoun}s`} unsorted · drag, or tap then tap`;

  const dragging = drag?.active ? drag : null;

  return (
    <div
      ref={rootRef}
      data-mig-primitive="match-grid"
      data-phase={reveal ? "revealed" : phase}
      data-composition={composition}
      data-tier={tier}
      data-compact={compact ? "" : undefined}
      data-reduced-motion={reduced ? "" : undefined}
      data-reveal-stage={reveal ? stage : undefined}
      className="mg-root"
      onKeyDown={(e) => { if (e.key === "Escape" && (held || drag)) { setHeld(null); setDrag(null); clearHold(); } }}
    >
      <header className="mg-head" data-part="head">
        {content.context ? <p className="mg-eyebrow">{content.context}</p> : <p className="mg-eyebrow">&nbsp;</p>}
        <h2 ref={promptRef} tabIndex={-1} className="mg-prompt">{content.prompt}</h2>
      </header>

      <div
        ref={boardRef}
        className="mg-board"
        data-part="board"
        style={{ height: boardH, "--mg-sigil": `${sigil}px`, "--mg-instr": `${instrH}px` } as CSSProperties}
      >
        {/* Engraved guides: fixed per layout, independent of state. */}
        <svg className="mg-guides" width={width} height={boardH} aria-hidden>
          <defs>
            <linearGradient id="mg-baseline" x1="0" x2="1">
              <stop offset="0" stopColor="#d5b66f" stopOpacity="0" />
              <stop offset="0.5" stopColor="#d5b66f" stopOpacity="0.55" />
              <stop offset="1" stopColor="#d5b66f" stopOpacity="0" />
            </linearGradient>
          </defs>
          {composition === "constellation" ? (
            <>
              <line x1={0} x2={width} y1={layout.seals[0].y} y2={layout.seals[0].y} stroke="url(#mg-baseline)" strokeWidth={1} />
              {layout.seals.map((s, g) => {
                const r1 = Math.hypot(layout.seat(g, 0).x - s.x, layout.seat(g, 0).y - s.y);
                const r2 = Math.hypot(layout.seat(g, 5).x - s.x, layout.seat(g, 5).y - s.y);
                return (
                  <g key={g} className="mg-guide-orbit">
                    <circle cx={s.x} cy={s.y} r={r1} />
                    <circle cx={s.x} cy={s.y} r={r2} />
                    {g > 0 && <line x1={s.x - layout.width / K / 2} x2={s.x - layout.width / K / 2} y1={8} y2={instrH - 8} className="mg-guide-divider" />}
                  </g>
                );
              })}
            </>
          ) : (
            layout.seals.map((s, g) => (
              <line key={g} x1={s.x + s.r + 6} x2={width - 8} y1={s.y} y2={s.y} className="mg-guide-wire" />
            ))
          )}
          <rect x={6} y={wellTop + 0.5} width={Math.max(0, width - 12)} height={Math.max(0, wellH - 1)} rx={10} className="mg-well-plate" />
          {entities.map((e, i) => {
            const c = socketCenter(i);
            return <circle key={e.token} cx={c.x} cy={c.y} r={sigil / 2 + 3} className="mg-socket" data-empty={drawn[e.token] ? "" : undefined} />;
          })}
        </svg>

        {/* Threads: the relationships themselves. */}
        <svg className="mg-threads" width={width} height={boardH} aria-hidden>
          {threads.map((t) => {
            const ends = threadEnds(t);
            const g = groups[groupIndex.get(t.group) ?? 0];
            return (
              <g key={t.key} className="mg-thread" data-state={t.state} style={hueStyle(g)}>
                <line {...ends} className="mg-thread-halo" pathLength={1} />
                <line {...ends} className="mg-thread-core" pathLength={1} />
              </g>
            );
          })}
        </svg>

        {/* Seals. */}
        {groups.map((g, gi) => {
          const s = layout.seals[gi];
          const count = sealCount(g.token);
          const names = membersOf(drawn, g.token).map((m) => entityLabel(m.token));
          const sealed = Boolean(reveal) && ledgerShown;
          return (
            <div key={g.token} className="mg-seal-wrap" data-part="seal" style={{ left: s.x, top: s.y, ...hueStyle(g) }}>
              <button
                ref={(el) => { sealRefs.current[gi] = el; }}
                type="button"
                className="mg-seal"
                style={{ width: s.r * 2, height: s.r * 2 }}
                data-count={count}
                data-armed={held ? "" : undefined}
                data-sealed={sealed ? "" : undefined}
                aria-label={`${g.label}, ${content.groupNoun} ${gi + 1} of ${K}. Holds ${numberWord(count)}${names.length ? `: ${names.join(", ")}` : ""}.`}
                aria-disabled={!open || undefined}
                onClick={onSealClick(gi)}
                onKeyDown={onSealKeyDown(gi)}
              >
                <svg className="mg-seal-ring" viewBox="0 0 100 100" aria-hidden>
                  <circle cx="50" cy="50" r="47" className="mg-seal-rim" />
                  <circle cx="50" cy="50" r="40" className="mg-seal-groove" />
                  {Array.from({ length: 12 }, (_, i) => {
                    const a = (-90 + i * 30) * (Math.PI / 180);
                    return (
                      <line
                        key={i}
                        x1={50 + Math.cos(a) * 42} y1={50 + Math.sin(a) * 42}
                        x2={50 + Math.cos(a) * 46} y2={50 + Math.sin(a) * 46}
                        className="mg-seal-tick" data-lit={i < count ? "" : undefined}
                      />
                    );
                  })}
                </svg>
                <span className="mg-seal-face" aria-hidden>
                  {renderGroupGlyph?.(g) ?? (g.media?.src
                    ? <img src={g.media.src} alt="" draggable={false} />
                    : <span className="mg-seal-mono">{g.label.slice(0, 1)}</span>)}
                </span>
                <span className="mg-seal-index" aria-hidden>{ROMAN[gi] ?? String(gi + 1)}</span>
              </button>
              <span className="mg-seal-name" aria-hidden style={{ marginTop: s.r + (composition === "constellation" ? 6 : 3) }}>{g.label}</span>
            </div>
          );
        })}

        {/* Sigils: one node each for the whole round, moved by transform. */}
        {entities.map((e) => {
          const seat = drawn[e.token];
          const home = positions.get(e.token)!;
          const isDragging = dragging?.token === e.token;
          const center = isDragging ? { x: dragging.x - dragging.grabDx, y: dragging.y - dragging.grabDy } : home;
          const mark = markOf(e.token);
          const g = seat ? groups[groupIndex.get(seat.group) ?? 0] : null;
          const state = isDragging ? "dragging" : held === e.token ? "held" : seat ? "seated" : "unsorted";
          const art = e.media?.src ?? null;
          return (
            <button
              key={e.token}
              type="button"
              className="mg-sigil"
              data-part="sigil"
              data-state={state}
              data-mark={mark ?? undefined}
              data-traveller={travellers.has(e.token) && travelled ? "" : undefined}
              style={{
                width: sigil, height: sigil,
                transform: `translate(${center.x - sigil / 2}px, ${center.y - sigil / 2}px)`,
                zIndex: isDragging ? 40 : held === e.token ? 30 : 20 + (travellers.has(e.token) ? 5 : 0),
                ...(g ? hueStyle(g) : {}),
              }}
              aria-label={`${e.label}${e.sublabel ? `, ${e.sublabel}` : ""}. ${seat ? `In ${groupLabel(seat.group)}` : "Unsorted, in the well"}${mark === "stable" ? ". Correct" : mark === "fractured" ? ". Misplaced" : mark === "corrected" ? `. Moved to ${groupLabel(seat?.group ?? "")}` : ""}.`}
              aria-pressed={held === e.token}
              aria-disabled={!open || undefined}
              onPointerDown={onSigilPointerDown(e.token, home)}
              onPointerMove={onSigilPointerMove}
              onPointerUp={onSigilPointerUp(e.token)}
              onPointerCancel={onSigilPointerCancel}
              onKeyDown={onSigilKeyDown(e.token)}
              onClick={(ev) => { ev.preventDefault(); }}
            >
              <span className="mg-sigil-disc" aria-hidden>
                {art ? <img src={art} alt="" draggable={false} /> : <span className="mg-sigil-mono">{(e.monogram ?? e.label).slice(0, 2)}</span>}
                <span className="mg-sigil-mark" data-mark={mark ?? undefined} />
              </span>
              <span className="mg-sigil-caption" aria-hidden>{e.label}</span>
            </button>
          );
        })}

        {/* The ledger: the written classification, in the well's footprint, only once a reveal exists. */}
        {reveal && settledPlan ? (
          <Ledger
            content={content}
            reveal={reveal}
            shown={ledgerShown}
            style={{ top: wellTop, height: wellH }}
            groupLabel={groupLabel}
          />
        ) : null}
      </div>

      <footer className="mg-foot" data-part="foot">
        <p className="mg-status" data-part="status">{statusText}</p>
        <button
          type="button"
          className="mg-lock"
          data-part="lock"
          aria-label={reveal ? "Resolved" : phase === "locked" ? "Locked in, waiting" : complete ? "Lock in" : `Lock in (seat every ${content.entityNoun} first)`}
          disabled={!open || !complete}
          onClick={lock}
        >
          <Lock aria-hidden className="mg-lock-icon" />
          <span>{reveal ? "Resolved" : phase === "locked" ? "Locked in" : "Lock in"}</span>
        </button>
      </footer>

      <p role="status" aria-live="polite" className="sr-only" data-part="live">{note}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Ledger

function Ledger({ content, reveal, shown, style, groupLabel }: {
  content: MatchPublic;
  reveal: MatchReveal;
  shown: boolean;
  style: CSSProperties;
  groupLabel: (token: string) => string;
}) {
  const wrong = content.entities.filter((e) => reveal.entityCorrect[e.token] === false);
  const right = content.entities.length - wrong.length;
  const cards = wrong.length
    ? wrong.map((e) => ({
      key: e.token,
      media: e.media?.src ?? null,
      title: e.label,
      line: `${groupLabel(reveal.canonical[e.token]?.[0] ?? "")}`,
      from: groupLabel(reveal.assignments[e.token] ?? ""),
      facts: reveal.facts?.[e.token] ?? [],
    }))
    : content.groups.map((g) => {
      const members = content.entities.filter((e) => reveal.canonical[e.token]?.includes(g.token));
      return {
        key: g.token, media: null, title: g.label,
        line: members.map((m) => m.label).join(" · ") || "—",
        from: null as string | null,
        facts: [] as readonly { label: string; value: string }[],
      };
    });
  return (
    <section
      className="mg-ledger"
      data-part="ledger"
      data-shown={shown ? "" : undefined}
      aria-hidden={!shown}
      aria-label="Classification"
      style={style}
    >
      <div className="mg-ledger-head">
        <p className="mg-ledger-verdict">{reveal.isCorrect ? "Classification resolved" : `${numberWord(wrong.length)} corrected`}</p>
        <p className="mg-ledger-sub">{numberWord(right)} of {numberWord(content.entities.length)} relationships stable</p>
        {reveal.source ? <p className="mg-ledger-source">{reveal.source}</p> : null}
      </div>
      <ul className="mg-ledger-cards">
        {cards.map((c) => (
          <li key={c.key} className="mg-ledger-card" data-kind={wrong.length ? "corrected" : "group"}>
            {c.media ? <img src={c.media} alt="" className="mg-ledger-art" /> : null}
            <div className="mg-ledger-text">
              <p className="mg-ledger-title">{c.title}</p>
              <p className="mg-ledger-line">
                {wrong.length ? <><span className="mg-ledger-arrow">→</span> {c.line}</> : c.line}
                {c.facts.length ? <span className="mg-ledger-facts"> · {c.facts.map((f) => f.value).join(" · ")}</span> : null}
              </p>
              {c.from ? <p className="mg-ledger-from">was in {c.from}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
