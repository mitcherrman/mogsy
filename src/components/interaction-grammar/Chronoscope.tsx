/**
 * MIG — CHRONOSCOPE (SCRUB). Find the checkpoint where a state becomes true.
 *
 * One objective, a rail of discrete checkpoints, a lens that shows the world
 * at the checkpoint under the reticle, and one Lock. The player scrubs the
 * reticle along the rail — continuously, the lens interpolating between
 * neighbouring checkpoints — and releases onto a detent. The LOCKED CHECKPOINT
 * is the answer; the host grades it and hands back a reveal.
 *
 *   OPEN → scrub (drag, tap, keys) → LOCK → (caller-owned) → REVEAL
 *
 * CONTENT-NEUTRAL. The primitive knows tokens, labels, engravings and a scene
 * payload it never reads: `renderScene` (the host's) draws the lens interior
 * from the frame the instrument hands it. It does not know what a checkpoint
 * is, what the objective means, or what any figure is.
 *
 * NO LEAK, NO GRADING. `content` has no field that could hold the answer or
 * say where the state changes. The canonical checkpoint and the proof arrive
 * only through `reveal`, and the primitive only DISPLAYS them: it never
 * compares a checkpoint's scene to the objective. Every detent is drawn alike
 * (an `emphasised` detent is a uniform public fact the host marks for every
 * checkpoint of its kind).
 *
 * INPUT. The whole rail box is the pointer target (mouse, touch, pen): press
 * anywhere to put the reticle there, drag to scrub, release to magnetise to
 * the nearest detent. A tap on a detent is the same gesture. The rail is a
 * `role="slider"`: arrows step one checkpoint, PageUp / PageDown step
 * `pageStep`, Home / End go to the ends. Every path commits through ONE
 * helper (`commitIndex`), so every path yields the same `{checkpoint}`.
 *
 * REVEAL. Clamp → traverse (wrong lock only) → settle → proof, on one bounded
 * clock (`lib/interaction-grammar/chronoscope`). The reticle visibly travels
 * from the locked detent to the canonical one through every state between
 * them, the canonical detent lights, and the reading plate becomes the
 * before → after proof. Reduced motion (OS or in-app) has no clock: the first
 * reveal frame is the settled, proven frame with both markers on the rail.
 *
 * FIXED GEOMETRY. Every region — objective, lens, reading, rail, footer — is a
 * box of constant height per viewport tier (see `chronoscope.css`), the same
 * in every phase. Layers inside them crossfade on opacity; the reticle and
 * markers are absolutely positioned; nothing is inserted into flow between
 * open and the next round.
 */
import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref,
} from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  ChronoscopeCheckpoint, ChronoscopePublic, ChronoscopeResponse, ChronoscopeReveal, InteractionPhase,
} from "@/lib/interaction-grammar/types";
import {
  assertChronoscopeContent, clampPosition, detentFraction, frameAt, planChronoscopeReveal,
  positionFromPointer, revealPosition, showsCanonical, showsProof, snapPosition, stageAt,
  stepIndexForKey, type ChronoscopePlan, type ChronoscopeStage,
} from "@/lib/interaction-grammar/chronoscope";
import "./chronoscope.css";

/** What the host's scene renderer is handed every frame. */
export interface ChronoscopeFrame<TScene> {
  /** The checkpoint the reticle is at or just past. */
  from: ChronoscopeCheckpoint<TScene>;
  /** The next checkpoint along (equal to `from` at the last detent). */
  to: ChronoscopeCheckpoint<TScene>;
  /** 0 at `from`, approaching 1 at `to`. */
  t: number;
  /** The checkpoint the instrument is READING: the nearest detent. */
  nearest: ChronoscopeCheckpoint<TScene>;
  phase: InteractionPhase;
  /** The reveal stage in force, or null before a reveal. */
  stage: ChronoscopeStage | null;
  /** The player's hand is on the rail. */
  dragging: boolean;
  /** Motion is allowed. */
  animate: boolean;
}

/** Sound hooks the host may wire; the primitive plays nothing itself. */
export type ChronoscopeCue = "detent" | "lock" | "traverse" | "settle" | "resolve";

export interface ChronoscopeProps<TScene> {
  content: ChronoscopePublic<TScene>;
  phase: InteractionPhase;
  /** The pending checkpoint token, owned by the caller; null before the first move. */
  value: string | null;
  onChange: (token: string) => void;
  /** Commit. Carries identity, never correctness. */
  onLock: (response: ChronoscopeResponse) => void;
  /** Null until the caller's authority resolves. */
  reveal?: ChronoscopeReveal | null;
  /** Fires once per reveal when its choreography has finished (at once under reduced motion). */
  onRevealComplete?: () => void;
  /** The host draws the lens interior. */
  renderScene: (frame: ChronoscopeFrame<TScene>) => ReactNode;
  /** PageUp / PageDown step. Default 3. */
  pageStep?: number;
  /** The reveal's total length. Default 1500 ms; a host with a shorter hold passes it. */
  revealBudgetMs?: number;
  onCue?: (cue: ChronoscopeCue) => void;
  /** The prompt heading (focusable, `tabIndex=-1`), so a host can move focus to it. */
  promptRef?: Ref<HTMLHeadingElement>;
}

/** How far the detent track is inset from the rail box's ends (px). Matches `--cs-inset`. */
export const RAIL_INSET_PX = 22;

// ------------------------------------------------------------------ reveal clock

/**
 * One rAF clock for the whole reveal: the stage in force and the reticle's
 * position are both derived from the elapsed time, so the traverse can never
 * outrun its own stage boundaries. Restarts when the reveal key changes.
 */
function useRevealClock(plan: ChronoscopePlan, active: boolean, key: string) {
  const [run, setRun] = useState<{ key: string; elapsed: number } | null>(null);
  useEffect(() => {
    if (!active) { setRun(null); return; }
    if (plan.instant) { setRun({ key, elapsed: plan.totalMs }); return; }
    let raf = 0;
    const t0 = performance.now();
    setRun({ key, elapsed: 0 });
    const tick = () => {
      const elapsed = performance.now() - t0;
      setRun({ key, elapsed: Math.min(plan.totalMs, elapsed) });
      if (elapsed < plan.totalMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, plan, key]);
  return run && run.key === key ? run.elapsed : 0;
}

// -------------------------------------------------------------------- component

export function Chronoscope<TScene>({
  content, phase, value, onChange, onLock, reveal = null, onRevealComplete, renderScene,
  pageStep = 3, revealBudgetMs, onCue, promptRef,
}: ChronoscopeProps<TScene>) {
  assertChronoscopeContent(content);
  const reduced = useReducedMotionPreference();
  const animate = !reduced;
  const promptId = useId();
  const railHintId = useId();
  const lockHintId = useId();
  const open = phase === "open";
  const checkpoints = content.checkpoints;
  const count = checkpoints.length;
  const indexOf = useMemo(() => new Map(checkpoints.map((c, i) => [c.token, i])), [checkpoints]);
  const valueIndex = value !== null ? indexOf.get(value) ?? null : null;

  // ---- ephemeral UI state (never graded, never submitted)
  const railRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ pointerId: number; position: number } | null>(null);
  // Whether the rail's focus came from a pointer (no ring) or the keyboard (ring).
  const [focusFrom, setFocusFrom] = useState<"pointer" | "keyboard">("keyboard");
  const dragRef = useRef<{ pointerId: number; position: number; rail: { left: number; width: number } } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastDetent = useRef<number | null>(null);

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const lockedIndex = revealed ? indexOf.get(reveal.lockedToken) ?? valueIndex ?? 0 : valueIndex;
  const canonicalIndex = revealed ? indexOf.get(reveal.canonicalToken) ?? null : null;
  const distance = revealed && canonicalIndex !== null && lockedIndex !== null
    ? Math.abs(canonicalIndex - lockedIndex) : 0;
  const plan = useMemo(
    () => planChronoscopeReveal({ reduced, distance, budgetMs: revealBudgetMs }),
    [reduced, distance, revealBudgetMs],
  );
  const revealKey = revealed ? `${reveal.lockedToken}>${reveal.canonicalToken}` : "";
  const elapsed = useRevealClock(plan, revealed, revealKey);
  const stage: ChronoscopeStage | null = revealed ? stageAt(plan, elapsed) : null;

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  // Cues at stage boundaries (the host decides what, if anything, they sound like).
  const cuedStage = useRef<ChronoscopeStage | null>(null);
  useEffect(() => {
    if (!revealed || !stage || cuedStage.current === stage) return;
    cuedStage.current = stage;
    if (stage === "traverse") onCue?.("traverse");
    else if (stage === "settle") onCue?.("settle");
    else if (stage === "proof") onCue?.("resolve");
  }, [revealed, stage, onCue]);
  useEffect(() => { if (!revealed) cuedStage.current = null; }, [revealed]);

  // A drag never survives the rail closing.
  useEffect(() => { if (!open) { dragRef.current = null; setDrag(null); } }, [open]);

  // ---- the ONE position the instrument reads from
  const position: number = revealed && lockedIndex !== null && canonicalIndex !== null
    ? revealPosition(plan, elapsed, lockedIndex, canonicalIndex)
    : drag ? drag.position
      : valueIndex ?? 0;
  const frame = frameAt(position, count);
  const nearestIndex = snapPosition(position, count);
  const nearest = checkpoints[nearestIndex];

  // The detent "click": the nearest checkpoint changed under a moving reticle.
  useEffect(() => {
    if (lastDetent.current !== null && lastDetent.current !== nearestIndex && (drag || stage === "traverse")) {
      onCue?.("detent");
    }
    lastDetent.current = nearestIndex;
  }, [nearestIndex, drag, stage, onCue]);

  // ---- actions: every input path commits here
  const commitIndex = useCallback((index: number, how: "pointer" | "key") => {
    if (!open) return;
    const next = checkpoints[clampPosition(index, count)];
    if (!next) return;
    if (next.token !== value) onChange(next.token);
    if (how === "key") setAnnouncement(`${next.label}, ${next.clock}.`);
  }, [open, checkpoints, count, value, onChange]);

  const lock = () => {
    if (!open || value === null || !indexOf.has(value)) return;
    onCue?.("lock");
    onLock({ checkpoint: value });
  };

  // ---- pointer (mouse, touch, pen): the whole rail box
  const railGeometry = () => {
    const r = railRef.current?.getBoundingClientRect();
    return { left: r?.left ?? 0, width: r?.width ?? 1 };
  };
  const onRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || (e.pointerType === "mouse" && e.button !== 0)) return;
    const rail = railGeometry();
    const p = positionFromPointer(e.clientX, { ...rail, insetPx: RAIL_INSET_PX }, count);
    dragRef.current = { pointerId: e.pointerId, position: p, rail };
    setDrag({ pointerId: e.pointerId, position: p });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom / released */ }
    setFocusFrom("pointer");
    e.currentTarget.focus({ preventScroll: true });
    e.preventDefault();
  };
  const onRailPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = positionFromPointer(e.clientX, { ...d.rail, insetPx: RAIL_INSET_PX }, count);
    dragRef.current = { ...d, position: p };
    setDrag({ pointerId: e.pointerId, position: p });
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (commit) commitIndex(snapPosition(d.position, count), "pointer");
  };

  // ---- keyboard: the rail owns its keys
  const onRailKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const to = stepIndexForKey(e.key, valueIndex ?? 0, count, pageStep);
    if (to === null) return;
    e.preventDefault();
    setFocusFrom("keyboard");
    commitIndex(to, "key");
  };

  // ---- derived display
  const lockedCheckpoint = lockedIndex !== null ? checkpoints[lockedIndex] : null;
  const canonicalCheckpoint = canonicalIndex !== null ? checkpoints[canonicalIndex] : null;
  const canonicalOn = revealed && stage !== null && showsCanonical(stage);
  const proofOn = revealed && stage !== null && showsProof(stage);
  const traversing = stage === "traverse";
  const verdict = !revealed ? ""
    : reveal.isCorrect === true ? "Exact checkpoint"
    : reveal.isCorrect === false ? "Not the first checkpoint"
    : "Revealed";
  // The reserved line under the footer: the hand's instruction while open,
  // the host's footnote (the authority's own caveat) once the hand is off.
  const statusLine = !open ? (content.footnote ?? "")
    : valueIndex === null ? `Scrub the rail to move through time, then lock a ${content.unitLabel.toLowerCase()}.`
    : `Reading ${nearest.label} · ${nearest.clock}. Lock it in when you're sure.`;
  const valueText = `${nearest.label}, ${nearest.clock}. ${nearest.reading.map((l) => `${l.label} ${l.value}`).join(", ")}`;
  const resultText = revealed
    ? [`${verdict}.`, `The first ${content.unitLabel.toLowerCase()} is ${canonicalCheckpoint?.label ?? ""}.`,
      reveal.note ?? "", reveal.proof.thresholdLine ?? ""].filter(Boolean).join(" ")
    : phase === "locked" ? `Locked on ${lockedCheckpoint?.label ?? ""}. Waiting for the reveal.` : "";

  const sceneFrame: ChronoscopeFrame<TScene> = {
    from: checkpoints[frame.from], to: checkpoints[frame.to], t: frame.t, nearest,
    phase, stage, dragging: drag !== null, animate,
  };

  const fractionStyle = (f: number) => ({ ["--f" as string]: String(f) });

  return (
    <div data-testid="mig-chronoscope" data-mig-primitive="chronoscope" data-phase={phase}
      data-reveal-stage={revealed ? stage ?? undefined : undefined}
      data-dragging={drag ? "true" : undefined}
      data-animate={animate ? "true" : "false"}
      className="chronoscope flex w-full flex-col items-stretch">
      {/* THE OBJECTIVE: one fixed box, ink on the folio. */}
      <header data-part="objective" data-testid="chronoscope-objective" className="cs-objective">
        <p className="cs-eyebrow" data-testid="chronoscope-eyebrow">{content.eyebrow}</p>
        <h2 id={promptId} ref={promptRef} tabIndex={-1} data-testid="chronoscope-prompt" className="cs-prompt">
          {content.prompt}
        </h2>
      </header>

      {/* THE INSTRUMENT: stone and brass, one carved block with the lens, the
          reading and the rail. Every part a fixed box. */}
      <div data-part="instrument" data-testid="chronoscope-instrument" className="cs-instrument">
        <div data-part="lens" data-testid="chronoscope-lens" className="cs-lens"
          data-nearest={nearest.token} data-traversing={traversing ? "true" : undefined}>
          <div className="cs-lens-glass">
            {renderScene(sceneFrame)}
          </div>
          <span aria-hidden className="cs-lens-sheen" />
          <span aria-hidden className="cs-lens-bezel" />
        </div>

        {/* THE READING: the live engraving, or the proof in its place. */}
        <div data-part="reading" data-testid="chronoscope-reading" className="cs-reading"
          data-mode={proofOn ? "proof" : "live"}>
          <dl data-part="reading-live" data-testid="chronoscope-reading-live"
            className="cs-reading-layer cs-reading-live" aria-hidden={proofOn || undefined}>
            <div className="cs-reading-cell cs-reading-cell--name">
              <dt>{content.unitLabel}</dt>
              <dd data-testid="chronoscope-reading-label">{nearest.label.replace(new RegExp(`^${content.unitLabel}\\s*`, "i"), "")}</dd>
            </div>
            <div className="cs-reading-cell">
              <dt>Clock</dt>
              <dd data-testid="chronoscope-reading-clock">{nearest.clock}</dd>
            </div>
            {nearest.reading.map((line) => (
              <div key={line.label} className="cs-reading-cell">
                <dt>{line.label}</dt>
                <dd data-testid={`chronoscope-reading-${slug(line.label)}`}>{line.value}</dd>
              </div>
            ))}
          </dl>
          {revealed && (
            <div data-part="proof" data-testid="chronoscope-proof" data-shown={proofOn ? "true" : "false"}
              className="cs-reading-layer cs-reading-proof" aria-hidden={!proofOn || undefined}>
              {reveal.proof.before ? (
                <ProofColumn reading={reveal.proof.before} role="before" />
              ) : (
                <div className="cs-proof-col cs-proof-col--none" data-part="proof-before">
                  <span className="cs-proof-title">No earlier checkpoint</span>
                </div>
              )}
              <span aria-hidden className="cs-proof-arrow">→</span>
              <ProofColumn reading={reveal.proof.after} role="after" />
              {reveal.proof.thresholdLine && (
                <p className="cs-proof-threshold" data-testid="chronoscope-proof-threshold">{reveal.proof.thresholdLine}</p>
              )}
            </div>
          )}
        </div>

        {/* THE RAIL: the whole box is the hand's target. */}
        <div ref={railRef} data-part="rail" data-testid="chronoscope-rail" className="cs-rail"
          role="slider" tabIndex={open ? 0 : -1}
          aria-label={`${content.unitLabel} chronoscope`}
          aria-valuemin={0} aria-valuemax={count - 1} aria-valuenow={nearestIndex}
          aria-valuetext={valueText} aria-describedby={railHintId}
          aria-disabled={!open || undefined} aria-orientation="horizontal"
          data-count={count} data-focus-from={focusFrom}
          onPointerDown={onRailPointerDown} onPointerMove={onRailPointerMove}
          onPointerUp={(e) => endDrag(e, true)} onPointerCancel={(e) => endDrag(e, false)}
          onKeyDown={onRailKeyDown}>
          <span aria-hidden className="cs-channel" />
          {/* The traverse trace: energy from the locked detent to the reticle. */}
          {revealed && lockedIndex !== null && (
            <span aria-hidden data-part="trace" data-testid="chronoscope-trace" className="cs-trace"
              data-on={traversing || canonicalOn ? "true" : "false"}
              style={{
                ["--a" as string]: String(detentFraction(Math.min(lockedIndex, position), count)),
                ["--b" as string]: String(detentFraction(Math.max(lockedIndex, position), count)),
              }} />
          )}
          {checkpoints.map((c, i) => (
            <span key={c.token} aria-hidden data-part="detent" data-testid={`chronoscope-detent-${i}`}
              data-emphasised={c.emphasised ? "true" : undefined}
              data-near={i === nearestIndex ? "true" : undefined}
              data-passed={revealed && lockedIndex !== null && canonicalIndex !== null
                && ((i - lockedIndex) * (canonicalIndex - lockedIndex) > 0) && (i - lockedIndex) * (position - lockedIndex) > 0
                && Math.abs(i - lockedIndex) <= Math.abs(position - lockedIndex) ? "true" : undefined}
              className="cs-detent" style={fractionStyle(detentFraction(i, count))} />
          ))}
          {(content.railMarks ?? []).map((m) => (
            <span key={m.index} aria-hidden data-part="rail-mark" className="cs-rail-mark"
              style={fractionStyle(detentFraction(m.index, count))}>{m.text}</span>
          ))}
          {/* The lock marker: where the player's hand stopped, kept for the round. */}
          <span aria-hidden data-part="lock-mark" data-testid="chronoscope-lock-mark"
            data-shown={!open && lockedIndex !== null ? "true" : "false"}
            className="cs-lock-mark"
            style={fractionStyle(detentFraction(lockedIndex ?? 0, count))} />
          {/* The canonical marker: gold, only ever drawn from the reveal. */}
          <span aria-hidden data-part="canon-mark" data-testid="chronoscope-canon-mark"
            data-shown={canonicalOn ? "true" : "false"}
            className="cs-canon-mark"
            style={fractionStyle(detentFraction(canonicalIndex ?? 0, count))} />
          <span aria-hidden data-part="reticle" data-testid="chronoscope-reticle" className="cs-reticle"
            data-state={revealed ? (traversing ? "traversing" : canonicalOn ? "settled" : "clamped")
              : phase === "locked" ? "clamped" : drag ? "held" : "idle"}
            style={fractionStyle(detentFraction(position, count))}>
            <span className="cs-reticle-crystal" />
          </span>
          <p id={railHintId} className="sr-only">
            Drag along the rail or use the arrow keys to move through the {content.unitLabel.toLowerCase()}s. Page Up and Page Down move {pageStep} at a time.
          </p>
        </div>
      </div>

      {/* THE FOOTER: one fixed box — the lock, then the wait, then the verdict. */}
      <footer data-part="footer" data-testid="chronoscope-footer" className="cs-footer"
        data-correct={revealed && reveal ? String(reveal.isCorrect) : undefined}>
        {open && (
          <>
            <Button type="button" data-part="lock" data-testid="chronoscope-lock" onClick={lock}
              disabled={valueIndex === null} aria-describedby={lockHintId} className="cs-lock-button">
              <Lock aria-hidden /> Lock {valueIndex === null ? content.unitLabel.toLowerCase() : nearest.label.toLowerCase()}
            </Button>
            <p id={lockHintId} data-testid="chronoscope-lock-hint" className="sr-only">
              {valueIndex === null ? `Choose a ${content.unitLabel.toLowerCase()} on the rail first.` : "Final once locked."}
            </p>
          </>
        )}
        {phase === "locked" && (
          <p data-testid="chronoscope-suspense" className="cs-status cs-status--wait">
            <Lock aria-hidden className="!size-3.5" /> Locked on {lockedCheckpoint?.label} · reading
            <span aria-hidden className="cs-dots"><i /><i /><i /></span>
          </p>
        )}
        {revealed && (
          <div data-testid="chronoscope-verdict" className="cs-verdict" data-shown={proofOn ? "true" : "false"}>
            <span data-testid="chronoscope-verdict-text" className="cs-verdict-text">{verdict}</span>
            <span data-testid="chronoscope-verdict-note" className="cs-verdict-note">
              {reveal.note ?? reveal.proof.after.caption ?? ""}
            </span>
          </div>
        )}
      </footer>

      {/* One status line for the sighted player, reserved in every phase. */}
      <p data-part="status-line" data-testid="chronoscope-status" className="cs-status-line" aria-hidden>
        {statusLine}
      </p>
      <p role="status" aria-live="polite" data-testid="chronoscope-live" className="sr-only">
        {open ? announcement : resultText}
      </p>
    </div>
  );
}

function ProofColumn({ reading, role }: { reading: ChronoscopeReveal["proof"]["after"]; role: "before" | "after" }) {
  return (
    <div className="cs-proof-col" data-part={`proof-${role}`} data-testid={`chronoscope-proof-${role}`}
      data-satisfied={reading.satisfied ? "true" : "false"}>
      <span className="cs-proof-title">{reading.title}</span>
      <span className="cs-proof-lines">
        {reading.lines.map((l) => (
          <span key={l.label} className="cs-proof-line">
            <span className="cs-proof-label">{l.label}</span>
            <span className="cs-proof-value">{l.value}</span>
          </span>
        ))}
      </span>
      {reading.caption && <span className="cs-proof-caption">{reading.caption}</span>}
    </div>
  );
}

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
