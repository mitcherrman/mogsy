/**
 * MIG — RANGEFINDER (PLACE).
 *
 * An Academy targeting board. The subject stands at a fixed origin on a stone
 * field engraved with calibration rings; the player drags a brass training
 * target across the ground and the subject's reach projects from the origin
 * to wherever the target stands: a ring and a filled disc. Only the distance
 * matters — the bearing is theirs — and that distance settles onto one of the
 * field's discrete STOPS on release. One Lock submits that stop's token.
 *
 * NOTHING HERE GRADES. `content` has no field that could hold an answer, and
 * the true reach reaches this component only through `reveal`, which it
 * draws: the canonical ring grows out of the origin by the same map that
 * drew the player's ring, so the scene itself is the proof. Before a reveal
 * every stop is identical — the same rings, the same detent, the same target.
 *
 * INPUT. The whole field is the pointer target (mouse, touch, pen): press
 * anywhere and the target is there; drag and it follows; release and it
 * settles onto the nearest stop. The field is a `role="slider"`: arrows step
 * one stop, Shift / Page keys step coarse, Home / End reach the lens' ends.
 * The vernier buttons step one stop for a thumb that cannot land on 7px.
 *
 * CONTINUITY. Head, field, plate and status are reserved boxes; the target
 * moves by transform, the rings are SVG inside the field, the plate's live
 * reading and proof are stacked layers that swap by opacity.
 */
import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent, type Ref,
} from "react";
import { Lock } from "lucide-react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type {
  InteractionPhase, RangefinderLens, RangefinderPublic, RangefinderResponse, RangefinderReveal, RangefinderValue,
} from "@/lib/interaction-grammar/types";
import {
  assertRangefinderContent, calibrationRings, clampBearing, fieldGeometry, formatUnits, lastVisibleStopIndex,
  lensShowing, nearestStopIndex, placementFromPointer, placementPoint, planRangefinderReveal, projectionProgress,
  showsProof, showsVerdict, stageAt, stepStopForKey, stopIndexOf, unitsToPx,
  type FieldBox, type Placement, type RangefinderPlan, type RangefinderStage,
} from "@/lib/interaction-grammar/rangefinder";
import { SubjectArt } from "./shared";
import "./rangefinder.css";

export type RangefinderCue = "detent" | "lock" | "project" | "settle" | "resolve";

export interface RangefinderProps {
  content: RangefinderPublic;
  phase: InteractionPhase;
  /** The host-owned stop token. */
  value: RangefinderValue;
  onChange: (token: string) => void;
  onLock: (response: RangefinderResponse) => void;
  reveal?: RangefinderReveal | null;
  /** Fires once per reveal, when the choreography (or, reduced, the first frame) is done. */
  onRevealComplete?: () => void;
  /** Scales the reveal choreography. Default 1500ms. */
  revealBudgetMs?: number;
  onCue?: (cue: RangefinderCue) => void;
  promptRef?: Ref<HTMLHeadingElement>;
  /** Stops stepped by Shift / Page keys. Default 4 (100 units on a 25-unit field). */
  coarseStep?: number;
  /**
   * A definite height for the whole instrument, from a host that measured its
   * stage (`useStageRoom`). The field absorbs it. Absent: natural height.
   */
  maxHeight?: number;
}

/** Drives one requestAnimationFrame clock for a plan; returns elapsed ms. */
function useRevealClock(plan: RangefinderPlan, active: boolean, key: string): number {
  const [run, setRun] = useState<{ key: string; elapsed: number } | null>(null);
  useEffect(() => {
    if (!active || plan.instant) { setRun(null); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      setRun({ key, elapsed });
      if (elapsed < plan.totalMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, plan, key]);
  return run && run.key === key ? run.elapsed : 0;
}

/** Fields narrower than this are the phone composition: origin at the bottom, reach upward. */
export const PORTRAIT_BELOW_PX = 480;

/** The field's box, kept current by a ResizeObserver. */
function useFieldBox(ref: React.RefObject<HTMLDivElement | null>): FieldBox | null {
  const [box, setBox] = useState<FieldBox | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width);
      const height = Math.round(r.height);
      if (!width || !height) return;
      // The phone composition is decided by WIDTH: a short phone's field can be
      // wider than tall and must still point up from a bottom origin.
      setBox((b) => (b && b.width === width && b.height === height ? b
        : { width, height, orientation: width < PORTRAIT_BELOW_PX ? "portrait" : "landscape" }));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export function Rangefinder({
  content, phase, value, onChange, onLock, reveal = null, onRevealComplete, revealBudgetMs, onCue, promptRef,
  coarseStep = 4, maxHeight,
}: RangefinderProps) {
  assertRangefinderContent(content);
  const reduced = useReducedMotionPreference();
  const promptId = useId();
  const fieldHintId = useId();
  const open = phase === "open";
  const { stops, lenses, unitLabel } = content.field;
  const valueIndex = stopIndexOf(value, stops);

  // ---- ephemeral UI state (never graded, never submitted)
  const fieldRef = useRef<HTMLDivElement>(null);
  const box = useFieldBox(fieldRef);
  const [lensId, setLensId] = useState(lenses[0].id);
  const lens: RangefinderLens = lenses.find((l) => l.id === lensId) ?? lenses[0];
  const [bearing, setBearing] = useState(0);
  const [drag, setDrag] = useState<{ pointerId: number; placement: Placement } | null>(null);
  const dragRef = useRef<{ pointerId: number; placement: Placement } | null>(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const focusFrom = useRef<"pointer" | "keyboard">("keyboard");
  const [announcement, setAnnouncement] = useState("");
  const lastDetent = useRef<number | null>(null);

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const lockedIndex = revealed ? stopIndexOf(reveal.lockedToken, stops) ?? valueIndex : valueIndex;
  const canonicalIndex = revealed ? stopIndexOf(reveal.canonicalToken, stops) : null;
  const plan = useMemo(() => planRangefinderReveal({ reduced, budgetMs: revealBudgetMs }), [reduced, revealBudgetMs]);
  const revealKey = revealed ? `${reveal.lockedToken}>${reveal.canonicalToken}` : "";
  const elapsed = useRevealClock(plan, revealed, revealKey);
  const stage: RangefinderStage | null = revealed ? stageAt(plan, elapsed) : null;

  // The instrument refocuses ONCE, before the first revealed frame, so the
  // truth is on the field: geometry then stays fixed for the whole reveal.
  useLayoutEffect(() => {
    if (!revealed || canonicalIndex === null) return;
    const needed = lensShowing(stops[canonicalIndex].units, lenses);
    setLensId((cur) => (lenses.find((l) => l.id === cur)?.maxUnits ?? 0) >= stops[canonicalIndex].units ? cur : needed.id);
  }, [revealed, canonicalIndex, stops, lenses]);

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  const cuedStage = useRef<RangefinderStage | null>(null);
  useEffect(() => {
    if (!revealed || !stage || cuedStage.current === stage) return;
    cuedStage.current = stage;
    if (stage === "project") onCue?.("project");
    else if (stage === "settle") onCue?.("settle");
    else if (stage === "proof") onCue?.("resolve");
  }, [revealed, stage, onCue]);
  useEffect(() => { if (!revealed) cuedStage.current = null; }, [revealed]);

  // A drag never survives the field closing.
  useEffect(() => { if (!open) { dragRef.current = null; setDrag(null); } }, [open]);

  // ---- geometry
  const geom = useMemo(() => (box ? fieldGeometry(box) : null), [box]);
  const lastIndex = lastVisibleStopIndex(lens, stops);

  // The ONE placement the instrument reads from.
  const livePlacement: Placement | null = drag ? drag.placement
    : valueIndex !== null ? { units: stops[Math.min(valueIndex, lastIndex)].units, bearing } : null;
  const readingIndex = livePlacement ? Math.min(lastIndex, nearestStopIndex(livePlacement.units, stops)) : null;

  // The detent "click": the nearest stop changed under a moving target.
  useEffect(() => {
    if (drag && lastDetent.current !== null && lastDetent.current !== readingIndex) onCue?.("detent");
    lastDetent.current = readingIndex;
  }, [readingIndex, drag, onCue]);

  // ---- actions: every input path commits here
  const commitIndex = useCallback((index: number, how: "pointer" | "key") => {
    if (!open) return;
    const next = stops[Math.max(0, Math.min(lastIndex, index))];
    if (!next) return;
    if (next.token !== value) onChange(next.token);
    if (how === "key") setAnnouncement(`${formatUnits(next.units)} ${unitLabel}.`);
  }, [open, stops, lastIndex, value, onChange, unitLabel]);

  const lock = () => {
    if (!open || value === null || valueIndex === null) return;
    onCue?.("lock");
    setAnnouncement(`Locked at ${formatUnits(stops[valueIndex].units)} ${unitLabel}.`);
    onLock({ stop: value });
  };

  // ---- pointer (mouse, touch, pen): the whole field
  const localPoint = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onFieldPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || !geom || (e.pointerType === "mouse" && e.button !== 0)) return;
    const p = localPoint(e);
    const placement = placementFromPointer(p.x, p.y, lens, geom, content.field);
    dragRef.current = { pointerId: e.pointerId, placement };
    setDrag({ pointerId: e.pointerId, placement });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom / released */ }
    focusFrom.current = "pointer";
    setFocusVisible(false);
    e.currentTarget.focus({ preventScroll: true });
    e.preventDefault();
  };
  const onFieldPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || !geom) return;
    const p = localPoint(e);
    const placement = placementFromPointer(p.x, p.y, lens, geom, content.field);
    dragRef.current = { ...d, placement };
    setDrag({ pointerId: e.pointerId, placement });
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (commit && geom) {
      const index = Math.min(lastIndex, nearestStopIndex(d.placement.units, stops));
      setBearing(clampBearing(d.placement.bearing, unitsToPx(stops[index].units, lens, geom), geom));
      commitIndex(index, "pointer");
    }
  };

  // ---- keyboard: the field owns its keys
  const onFieldKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const to = stepStopForKey(e.key, e.shiftKey, valueIndex ?? -1, lastIndex, coarseStep);
    if (to === null) return;
    e.preventDefault();
    focusFrom.current = "keyboard";
    setFocusVisible(true);
    commitIndex(to, "key");
  };
  const nudge = (delta: number) => {
    if (!open) return;
    commitIndex((valueIndex ?? -1) + delta, "key");
  };
  const cycleLens = () => {
    if (!open || lenses.length < 2) return;
    const i = lenses.findIndex((l) => l.id === lens.id);
    const next = lenses[(i + 1) % lenses.length];
    setLensId(next.id);
    setAnnouncement(`${next.label} lens: the field shows ${formatUnits(next.maxUnits)} ${unitLabel}.`);
  };

  // ---- derived display
  const lockedUnits = lockedIndex !== null ? stops[lockedIndex].units : null;
  const canonicalUnits = canonicalIndex !== null ? stops[canonicalIndex].units : null;
  const verdictOn = revealed && stage !== null && showsVerdict(stage);
  const proofOn = revealed && stage !== null && showsProof(stage);
  const progress = revealed ? projectionProgress(plan, elapsed) : 0;
  const readingStop = readingIndex !== null ? stops[readingIndex] : null;
  const stepUnits = stops.length > 1 ? stops[1].units - stops[0].units : 0;
  const verdictWord = !revealed ? "" : reveal.verdict === "exact" ? "Exact reach"
    : reveal.verdict === "short" ? `Short ${reveal.deltaText ?? ""}`.trim() : `Long ${reveal.deltaText ?? ""}`.trim();

  const statusLine = !open ? (content.footnote ?? "")
    : valueIndex === null ? "Press anywhere on the field to set the target, then drag it to where the cast ends."
    : `Reading ${formatUnits(readingStop?.units ?? 0)} ${unitLabel}. Arrows nudge ${stepUnits}; Shift for ${stepUnits * coarseStep}. Lock it in when you're sure.`;
  const valueText = readingStop ? `${formatUnits(readingStop.units)} ${unitLabel}` : "no placement";
  const resultText = revealed
    ? [`${verdictWord}.`, `${reveal.measurement.label} is ${reveal.measurement.valueText} ${unitLabel}.`, reveal.note ?? ""].filter(Boolean).join(" ")
    : phase === "locked" && lockedUnits !== null ? `Locked at ${formatUnits(lockedUnits)} ${unitLabel}. Waiting for the reveal.` : "";

  // ---- scene
  const rings = useMemo(() => calibrationRings(lens), [lens]);
  const playerPx = geom && lockedUnits !== null ? unitsToPx(lockedUnits, lens, geom) : null;
  const livePx = geom && livePlacement ? unitsToPx(livePlacement.units, lens, geom) : null;
  const canonPx = geom && canonicalUnits !== null ? unitsToPx(canonicalUnits, lens, geom) : null;
  const shownCanonPx = canonPx !== null ? canonPx * progress : null;
  const targetPoint = geom && livePlacement ? placementPoint(livePlacement, lens, geom) : geom ? geom.origin : null;
  const canonPoint = geom && canonicalUnits !== null
    ? placementPoint({ units: canonicalUnits, bearing }, lens, geom) : null;
  const ringPx = drag ? livePx : playerPx;
  const docked = livePlacement === null;

  const axisEnd = geom ? (geom.orientation === "portrait"
    ? { x: geom.origin.x, y: geom.origin.y - geom.reachPx } : { x: geom.origin.x + geom.reachPx, y: geom.origin.y }) : null;
  // Portrait: figures sit just right of the axis, clear of the plaque in the top-left corner.
  const figureAt = (r: number) => geom && (geom.orientation === "portrait"
    ? { x: geom.origin.x + 8, y: geom.origin.y - r - 4, anchor: "start" as const }
    : { x: geom.origin.x + r, y: geom.origin.y + 16, anchor: "middle" as const });

  const spokeAngles = [-60, -30, 30, 60];
  const bandPath = geom && verdictOn && playerPx !== null && canonPx !== null && Math.abs(playerPx - canonPx) > 0.5
    ? annulusPath(geom.origin, Math.min(playerPx, canonPx), Math.max(playerPx, canonPx)) : null;

  return (
    <div data-testid="mig-rangefinder" data-mig-primitive="rangefinder" data-phase={phase}
      data-reveal-stage={stage ?? undefined} data-verdict={verdictOn ? reveal?.verdict : undefined}
      data-orientation={box?.orientation ?? undefined} data-lens={lens.id} data-reduced={reduced ? "true" : "false"}
      className="rf" style={maxHeight !== undefined ? { height: maxHeight, flex: "none" } : undefined}>
      <header data-part="head" data-testid="rangefinder-head" className="rf-head">
        <span className="rf-art">
          <SubjectArt media={content.subject.media} monogram={content.subject.monogram ?? content.subject.label} className="h-full w-full" />
          {content.subject.slot ? <span aria-hidden className="rf-art-slot">{content.subject.slot}</span> : null}
        </span>
        <div className="rf-head-text">
          <p className="rf-eyebrow">{content.measureLabel}</p>
          <h2 ref={promptRef} id={promptId} tabIndex={-1} className="rf-prompt" data-testid="rangefinder-prompt">{content.prompt}</h2>
          <p className="rf-subject" data-testid="rangefinder-subject">
            <b>{content.subject.label}</b>{content.subject.sublabel ? <> · {content.subject.sublabel}</> : null}
          </p>
        </div>
      </header>

      <div ref={fieldRef} data-part="field" data-testid="rangefinder-field" className="rf-field"
        role="slider" tabIndex={open ? 0 : -1}
        aria-labelledby={promptId} aria-describedby={fieldHintId}
        aria-valuemin={stops[0].units} aria-valuemax={stops[lastIndex].units}
        aria-valuenow={readingStop?.units ?? stops[0].units} aria-valuetext={valueText}
        aria-disabled={!open || undefined} aria-orientation={box?.orientation === "portrait" ? "vertical" : "horizontal"}
        data-focus-visible={focusVisible ? "true" : "false"}
        onKeyDown={onFieldKeyDown}
        onFocus={() => setFocusVisible(focusFrom.current === "keyboard")}
        onBlur={() => { setFocusVisible(false); focusFrom.current = "keyboard"; }}
        onPointerDown={onFieldPointerDown} onPointerMove={onFieldPointerMove}
        onPointerUp={(e) => endDrag(e, true)} onPointerCancel={(e) => endDrag(e, false)}>
        {geom && box && axisEnd ? (
          <svg className="rf-svg" viewBox={`0 0 ${box.width} ${box.height}`} aria-hidden>
            <defs>
              <radialGradient id="rf-reach-grad">
                <stop offset="0%" stopColor="rgba(127,214,239,0.04)" />
                <stop offset="78%" stopColor="rgba(127,214,239,0.10)" />
                <stop offset="100%" stopColor="rgba(127,214,239,0.22)" />
              </radialGradient>
              <radialGradient id="rf-canon-grad">
                <stop offset="0%" stopColor="rgba(240,215,140,0.02)" />
                <stop offset="85%" stopColor="rgba(240,215,140,0.06)" />
                <stop offset="100%" stopColor="rgba(240,215,140,0.20)" />
              </radialGradient>
              <pattern id="rf-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="rgba(217,130,90,0.16)" />
                <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(217,130,90,0.7)" strokeWidth="1.5" />
              </pattern>
            </defs>
            <g data-part="calibration">
              {spokeAngles.map((deg) => {
                const a = (deg * Math.PI) / 180;
                const L = geom.reachPx * 1.4;
                const end = geom.orientation === "portrait"
                  ? { x: geom.origin.x + Math.sin(a) * L, y: geom.origin.y - Math.cos(a) * L }
                  : { x: geom.origin.x + Math.cos(a) * L, y: geom.origin.y + Math.sin(a) * L };
                return <line key={deg} className="rf-spoke" x1={geom.origin.x} y1={geom.origin.y} x2={end.x} y2={end.y} />;
              })}
              <line className="rf-axis" x1={geom.origin.x} y1={geom.origin.y} x2={axisEnd.x} y2={axisEnd.y} />
              {rings.map((ring) => {
                const r = unitsToPx(ring.units, lens, geom);
                const f = ring.labelled ? figureAt(r) : null;
                return (
                  <g key={ring.units}>
                    <circle className="rf-ring" data-labelled={ring.labelled ? "true" : "false"} cx={geom.origin.x} cy={geom.origin.y} r={r} />
                    {f ? <text className="rf-figure" x={f.x} y={f.y} textAnchor={f.anchor}>{formatUnits(ring.units)}</text> : null}
                  </g>
                );
              })}
              {axisEnd ? (
                <text className="rf-figure rf-figure-unit"
                  x={geom.orientation === "portrait" ? box.width - 12 : axisEnd.x}
                  y={geom.orientation === "portrait" ? box.height - 12 : geom.origin.y + 28}
                  textAnchor="end">
                  {unitLabel.toUpperCase()}
                </text>
              ) : null}
            </g>
            {ringPx !== null ? (
              <g data-part="reach" data-testid="rangefinder-reach">
                <circle className="rf-reach-fill" cx={geom.origin.x} cy={geom.origin.y} r={ringPx} />
                <circle className="rf-reach-glow" cx={geom.origin.x} cy={geom.origin.y} r={ringPx} />
                <circle className="rf-reach-ring" cx={geom.origin.x} cy={geom.origin.y} r={ringPx} />
              </g>
            ) : null}
            {shownCanonPx !== null && shownCanonPx > 0 ? (
              <g data-part="canon" data-testid="rangefinder-canon">
                {bandPath ? <path className="rf-gap-band" data-testid="rangefinder-gap" d={bandPath} fillRule="evenodd" /> : null}
                <circle className="rf-canon-sweep" cx={geom.origin.x} cy={geom.origin.y} r={shownCanonPx} />
                <circle className="rf-canon-glow" cx={geom.origin.x} cy={geom.origin.y} r={shownCanonPx} />
                <circle className="rf-canon-ring" cx={geom.origin.x} cy={geom.origin.y} r={shownCanonPx} />
                {verdictOn && reveal?.verdict === "exact" ? (
                  <circle key={revealKey} className="rf-fuse" cx={geom.origin.x} cy={geom.origin.y} r={shownCanonPx} />
                ) : null}
              </g>
            ) : null}
          </svg>
        ) : null}
        <span aria-hidden className="rf-bezel" />
        <span aria-hidden className="rf-corner" data-at="tl" /><span aria-hidden className="rf-corner" data-at="tr" />
        <span aria-hidden className="rf-corner" data-at="bl" /><span aria-hidden className="rf-corner" data-at="br" />
        {/* The engraved reading plaque lives ON the board: the live reading while open, the fact plate once revealed. */}
        <div data-part="reading" data-testid="rangefinder-reading" className="rf-reading">
          <div className="rf-reading-layer rf-reading-live" data-testid="rangefinder-reading-live" data-shown={proofOn ? "false" : "true"} aria-hidden={proofOn || undefined}>
            <div className="rf-reading-row">
              <span className="rf-reading-label">{readingStop ? "Reach" : "Target"}</span>
              <span className="rf-reading-value" data-testid="rangefinder-reading-value">{readingStop ? formatUnits(readingStop.units) : "—"}</span>
              <span className="rf-reading-unit">{readingStop ? unitLabel : "unplaced"}</span>
            </div>
          </div>
          <div className="rf-reading-layer rf-reading-proof" data-part="proof" data-testid="rangefinder-proof" data-shown={proofOn ? "true" : "false"} aria-hidden={!proofOn || undefined}>
            <div className="rf-reading-row">
              <span className="rf-reading-label">{reveal?.measurement.label ?? content.measureLabel}</span>
              <span className="rf-reading-value" data-testid="rangefinder-proof-value">{reveal?.measurement.valueText ?? ""}</span>
              <span className="rf-reading-unit">{unitLabel}</span>
            </div>
            <p className="rf-reading-sub">
              Your mark <b>{reveal?.lockedText ?? ""}</b>{reveal?.deltaText ? <> · {reveal.deltaText}</> : null}
            </p>
          </div>
        </div>
        {geom ? (
          <>
            <span aria-hidden className="rf-origin-plinth" style={{ transform: `translate(${geom.origin.x}px, ${geom.origin.y}px)` }} />
            <span aria-hidden data-part="origin" data-testid="rangefinder-origin" className="rf-origin"
              style={{ transform: `translate(${geom.origin.x}px, ${geom.origin.y}px)` }}>
              <SubjectArt media={content.subject.originMedia} monogram={content.subject.monogram ?? content.subject.label} className="h-full w-full" />
            </span>
            {canonPoint ? (
              <span aria-hidden data-part="canon-mark" data-testid="rangefinder-canon-mark" className="rf-canon-mark"
                style={{ transform: `translate(${canonPoint.x}px, ${canonPoint.y}px)` }} />
            ) : null}
            {targetPoint ? (
              <span aria-hidden data-part="target" data-testid="rangefinder-target" className="rf-target"
                data-dragging={drag ? "true" : "false"} data-docked={docked ? "true" : "false"}
                style={{ transform: `translate(${targetPoint.x + (docked ? 30 : 0)}px, ${targetPoint.y}px)` }} />
            ) : null}
          </>
        ) : null}
      </div>

      <div data-part="plate" data-testid="rangefinder-plate" className="rf-plate">
        <button type="button" className="rf-btn rf-vernier" data-part="vernier-in" data-testid="rangefinder-nearer"
          onClick={() => nudge(-1)} disabled={!open || valueIndex === null || valueIndex <= 0}
          aria-label={`Nearer by ${stepUnits} ${unitLabel}`}>−{stepUnits}</button>
        <button type="button" className="rf-btn rf-vernier" data-part="vernier-out" data-testid="rangefinder-farther"
          onClick={() => nudge(1)} disabled={!open || (valueIndex ?? -1) >= lastIndex}
          aria-label={`Farther by ${stepUnits} ${unitLabel}`}>+{stepUnits}</button>
        <button type="button" className="rf-btn rf-lens" data-part="lens" data-testid="rangefinder-lens"
          onClick={cycleLens} disabled={!open || lenses.length < 2}
          aria-label={`Lens: ${lens.label}, field shows ${formatUnits(lens.maxUnits)} ${unitLabel}. Switch lens.`}>
          {lenses.map((l) => <span key={l.id} aria-hidden className="rf-lens-dot" data-on={l.id === lens.id ? "true" : "false"} />)}
          <span aria-hidden>{lens.label}</span>
        </button>
        <div className="rf-lockwrap" data-part="lock" data-testid="rangefinder-lockwrap">
          <button type="button" className="rf-lock" data-testid="rangefinder-lock" data-shown={open ? "true" : "false"}
            onClick={lock} disabled={!open || valueIndex === null} aria-describedby={fieldHintId}>
            <Lock aria-hidden /> Lock reach
          </button>
          <span className="rf-lockstate" data-testid="rangefinder-lockstate" data-shown={open ? "false" : "true"}
            data-verdict={verdictOn ? reveal?.verdict : undefined} aria-hidden={open || undefined}>
            {verdictOn ? verdictWord : <><Lock aria-hidden className="!size-3.5" /> Locked <span aria-hidden className="rf-dots"><i /><i /><i /></span></>}
          </span>
        </div>
      </div>

      <p data-part="status" data-testid="rangefinder-status" id={fieldHintId} className="rf-status">
        {statusLine}
      </p>
      <p role="status" aria-live="polite" data-testid="rangefinder-live" className="sr-only">
        {resultText || announcement}
      </p>
    </div>
  );
}

/** A ring between two radii as one even-odd path. */
function annulusPath(c: { x: number; y: number }, rIn: number, rOut: number): string {
  const circle = (r: number) =>
    `M ${c.x + r} ${c.y} A ${r} ${r} 0 1 0 ${c.x - r} ${c.y} A ${r} ${r} 0 1 0 ${c.x + r} ${c.y} Z`;
  return `${circle(rOut)} ${circle(rIn)}`;
}
