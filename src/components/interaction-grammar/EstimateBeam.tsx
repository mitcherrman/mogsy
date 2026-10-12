/**
 * MIG — ESTIMATE BEAM (ESTIMATE).
 *
 * An Academy balance beam. Two engraved brass beams sit on a stone board:
 * the COARSE beam, notched every `coarseStep` from zero to the far end, and
 * the FINE beam beneath it, ticked one unit at a time across a single coarse
 * notch. The player slides a brass POISE along each; the estimate is where
 * the two poises stand, read on the engraved plaque. That is how a physician's
 * balance is read — a heavy poise for the hundreds, a light one for the
 * ones — and it is why a thumb can land on a single point of damage on a
 * phone without sub-pixel dragging.
 *
 * NOTHING HERE GRADES. `content` has no field that could hold an answer, and
 * the true value reaches this component only through `reveal`, which it
 * draws: a gold TRUTH POINTER descends onto the coarse beam by the same
 * linear map that placed the player's READING MARK (the hairline where the
 * coarse notch plus the fine offset lands), the band between them fills,
 * the BALANCE NEEDLE swings over or under, and the plaque turns over to the
 * fact. An exact lock puts the pointer on the mark and they flare as one.
 * Before a reveal every value on the beam is identical — the same notches,
 * the same detent, the same poise.
 *
 * INPUT. Each beam is a pointer target (mouse, touch, pen): press anywhere on
 * it and the poise is there; drag and it follows; release and it settles on
 * the nearest notch (coarse) or unit (fine). The instrument is ONE
 * `role="slider"`: arrows step a unit, Shift-arrows ten, Page keys a coarse
 * notch, Home / End the ends. The vernier keys (−10 −1 +1 +10) step the same.
 *
 * CONTINUITY. Head, board, plate, ledger and status are reserved boxes; the
 * poises and the pointer move by transform; the plaque's live reading and
 * the proof are stacked layers that swap by opacity; the ledger's prelude and
 * the host's breakdown are stacked layers that swap by opacity.
 */
import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref,
} from "react";
import { Lock } from "lucide-react";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { EstimatePublic, EstimateResponse, EstimateReveal, EstimateValue } from "@/lib/interaction-grammar/types";
import {
  assertEstimateContent, beamFigures, clampEstimate, coarseFromFraction, composeEstimate, estimateCeiling,
  fineFigures, fineFraction, fineFromFraction, formatEstimate, fractionOf, needleAngle, planEstimateReveal,
  showsLedger, showsTruth, showsVerdict, splitEstimate, stageAt, stepForKey,
  type EstimatePlan, type EstimateStage,
} from "@/lib/interaction-grammar/estimate";
import "./estimateBeam.css";

export type EstimateCue = "detent" | "lock" | "descend" | "settle" | "resolve";

export interface EstimateBeamProps {
  content: EstimatePublic;
  phase: "open" | "locked" | "revealed";
  /** The host-owned estimate. */
  value: EstimateValue;
  onChange: (value: number) => void;
  onLock: (response: EstimateResponse) => void;
  reveal?: EstimateReveal | null;
  /** Fires once per reveal, when the choreography (or, reduced, the first frame) is done. */
  onRevealComplete?: () => void;
  /** Scales the reveal choreography. Default 1800ms. */
  revealBudgetMs?: number;
  onCue?: (cue: EstimateCue) => void;
  promptRef?: Ref<HTMLHeadingElement>;
  /**
   * A definite height for the whole instrument, from a host that measured its
   * stage. The ledger absorbs it. Absent: natural height.
   */
  maxHeight?: number;
  /** What the ledger box shows BEFORE the reveal (the host's definition / assumptions). */
  prelude?: ReactNode;
  /** What the ledger box shows AT the reveal (the host's authoritative working). Rendered only when revealed. */
  breakdown?: ReactNode;
}

/**
 * The reveal clock: one `setTimeout` per stage boundary (never a rAF loop,
 * which stalls in a hidden pane), with the tweens themselves in CSS.
 */
function useStageClock(plan: EstimatePlan, active: boolean, key: string): EstimateStage | null {
  const [state, setState] = useState<{ key: string; stage: EstimateStage } | null>(null);
  useEffect(() => {
    if (!active) { setState(null); return; }
    if (plan.instant) { setState({ key, stage: "done" }); return; }
    setState({ key, stage: stageAt(plan, 0) });
    const timers = plan.stages.slice(1).map((s) => window.setTimeout(() => setState({ key, stage: s.stage }), s.start));
    timers.push(window.setTimeout(() => setState({ key, stage: "done" }), plan.totalMs));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [active, plan, key]);
  return state && state.key === key ? state.stage : null;
}

/** A beam's rail width, kept current by a ResizeObserver. */
function useRailWidth(ref: React.RefObject<HTMLDivElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w) setWidth((cur) => (cur === w ? cur : w));
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

type Beam = "coarse" | "fine";
interface Drag { pointerId: number; beam: Beam; fraction: number }

export function EstimateBeam({
  content, phase, value, onChange, onLock, reveal = null, onRevealComplete, revealBudgetMs, onCue, promptRef,
  maxHeight, prelude = null, breakdown = null,
}: EstimateBeamProps) {
  assertEstimateContent(content);
  const reduced = useReducedMotionPreference();
  const promptId = useId();
  const hintId = useId();
  const open = phase === "open";
  const { scale, unitLabel } = content;

  // ---- ephemeral UI state (never graded, never submitted)
  const sliderRef = useRef<HTMLDivElement>(null);
  const coarseRef = useRef<HTMLDivElement>(null);
  const fineRef = useRef<HTMLDivElement>(null);
  const coarseWidth = useRailWidth(coarseRef);
  const fineWidth = useRailWidth(fineRef);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const focusFrom = useRef<"pointer" | "keyboard">("keyboard");
  const [announcement, setAnnouncement] = useState("");
  const lastDetent = useRef<number | null>(null);

  // ---- reveal
  const revealed = phase === "revealed" && reveal !== null;
  const plan = useMemo(() => planEstimateReveal({ reduced, budgetMs: revealBudgetMs }), [reduced, revealBudgetMs]);
  const revealKey = revealed ? `${reveal.lockedValue}>${reveal.truth.value}:${reveal.verdict}` : "";
  const stage = useStageClock(plan, revealed, revealKey);

  const completedFor = useRef("");
  useEffect(() => {
    if (!revealed) { completedFor.current = ""; return; }
    if (stage === "done" && completedFor.current !== revealKey) {
      completedFor.current = revealKey;
      onRevealComplete?.();
    }
  }, [revealed, stage, revealKey, onRevealComplete]);

  const cuedStage = useRef<EstimateStage | null>(null);
  useEffect(() => {
    if (!revealed || !stage || cuedStage.current === stage) return;
    cuedStage.current = stage;
    if (stage === "descend") onCue?.("descend");
    else if (stage === "band") onCue?.("settle");
    else if (stage === "ledger") onCue?.("resolve");
  }, [revealed, stage, onCue]);
  useEffect(() => { if (!revealed) cuedStage.current = null; }, [revealed]);

  // A drag never survives the instrument closing.
  useEffect(() => { if (!open) { dragRef.current = null; setDrag(null); } }, [open]);

  // ---- the one value the instrument reads from
  const committed = value === null ? null : clampEstimate(value, scale);
  const lockedValue = revealed ? reveal.lockedValue : committed;
  const split = splitEstimate(lockedValue ?? 0, scale);
  // While a beam is being dragged, that beam's live reading replaces its committed part.
  const liveCoarse = drag?.beam === "coarse" ? coarseFromFraction(drag.fraction, scale) : split.coarse;
  const liveFine = drag?.beam === "fine" ? fineFromFraction(drag.fraction, scale) : split.fine;
  const reading = lockedValue === null && !drag ? null : composeEstimate(liveCoarse, liveFine, scale);

  // The detent "click": the reading changed under a moving poise.
  useEffect(() => {
    if (drag && lastDetent.current !== null && lastDetent.current !== reading) onCue?.("detent");
    lastDetent.current = reading;
  }, [reading, drag, onCue]);

  // ---- actions: every input path commits here
  const commit = useCallback((next: number, how: "pointer" | "key") => {
    if (!open) return;
    const v = clampEstimate(next, scale);
    if (v !== committed) onChange(v);
    if (how === "key") setAnnouncement(`${formatEstimate(v)} ${unitLabel}.`);
  }, [open, scale, committed, onChange, unitLabel]);

  const lock = () => {
    if (!open || committed === null) return;
    onCue?.("lock");
    setAnnouncement(`Locked at ${formatEstimate(committed)} ${unitLabel}.`);
    onLock({ estimate: committed });
  };

  // ---- pointer (mouse, touch, pen): each beam's rail
  const fractionAt = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return r.width > 0 ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
  };
  const onBeamPointerDown = (beam: Beam) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!open || (e.pointerType === "mouse" && e.button !== 0)) return;
    const d: Drag = { pointerId: e.pointerId, beam, fraction: fractionAt(e) };
    dragRef.current = d;
    setDrag(d);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* jsdom / released */ }
    focusFrom.current = "pointer";
    setFocusVisible(false);
    sliderRef.current?.focus({ preventScroll: true });
    e.preventDefault();
  };
  const onBeamPointerMove = (beam: Beam) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || d.beam !== beam) return;
    const next = { ...d, fraction: fractionAt(e) };
    dragRef.current = next;
    setDrag(next);
  };
  const endDrag = (beam: Beam, settle: boolean) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || d.beam !== beam) return;
    dragRef.current = null;
    setDrag(null);
    if (!settle) return;
    const coarse = beam === "coarse" ? coarseFromFraction(d.fraction, scale) : split.coarse;
    const fine = beam === "fine" ? fineFromFraction(d.fraction, scale) : split.fine;
    commit(composeEstimate(coarse, fine, scale), "pointer");
  };

  // ---- keyboard: the instrument owns its keys
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    const to = stepForKey(e.key, e.shiftKey, committed ?? 0, scale);
    if (to === null) return;
    e.preventDefault();
    focusFrom.current = "keyboard";
    setFocusVisible(true);
    commit(to, "key");
  };
  const nudge = (delta: number) => {
    if (!open) return;
    commit((committed ?? 0) + delta, "key");
  };

  // ---- derived display
  const top = estimateCeiling(scale);
  const truthOn = revealed && stage !== null && showsTruth(stage);
  const verdictOn = revealed && stage !== null && showsVerdict(stage);
  const ledgerOn = revealed && stage !== null && showsLedger(stage);
  const truthValue = revealed ? reveal.truth.value : null;
  const needle = verdictOn ? needleAngle(reveal.verdict, reveal.error.relative) : 0;
  const verdictWord = !revealed ? "" : reveal.verdict === "exact" ? "Exact"
    : reveal.verdict === "under" ? `Under by ${reveal.error.absoluteText}` : `Over by ${reveal.error.absoluteText}`;

  // Once revealed the status line is the comparison in one sentence; locked, it is the host's footnote.
  const statusLine = revealed
    ? [verdictWord, reveal.verdict !== "exact" ? reveal.error.relativeText : null,
      `${reveal.truth.label} ${reveal.truth.valueText}${reveal.truth.exactText ? ` (${reveal.truth.exactText} exact)` : ""}`]
      .filter(Boolean).join(" · ")
    : !open ? (content.footnote ?? "")
    : committed === null ? "Slide the heavy poise for the hundreds and the light poise for the ones, or press the beam where the hit lands."
    : `Reading ${formatEstimate(reading ?? committed)} ${unitLabel}. Arrows step 1, Shift for 10, Page keys a notch. Lock it in when you're sure.`;
  const valueText = reading !== null ? `${formatEstimate(reading)} ${unitLabel}` : "no estimate";
  const resultText = revealed
    ? [`${verdictWord}.`, `${reveal.truth.label} is ${reveal.truth.valueText} ${unitLabel}.`,
      reveal.error.relativeText ? `${reveal.error.relativeText}.` : "", reveal.note ?? ""].filter(Boolean).join(" ")
    : phase === "locked" && lockedValue !== null ? `Locked at ${formatEstimate(lockedValue)} ${unitLabel}. Waiting for the reveal.` : "";

  // ---- geometry
  const coarseFigures = useMemo(() => beamFigures(scale), [scale]);
  const fineTicks = useMemo(() => fineFigures(scale), [scale]);
  const poiseX = (lockedValue !== null || drag) ? fractionOf(liveCoarse, scale) * coarseWidth : 0;
  const fineX = fineFraction(liveFine, scale) * fineWidth;
  const truthX = truthValue !== null ? fractionOf(truthValue, scale) * coarseWidth : null;
  const lockedX = lockedValue !== null ? fractionOf(lockedValue, scale) * coarseWidth : null;
  // The READING MARK: the whole estimate (coarse notch + fine offset) as a hairline on the coarse beam. It is where
  // the band starts and where the truth pointer lands on an exact lock; the poise alone shows only the notch.
  const markX = reading !== null ? fractionOf(reading, scale) * coarseWidth : null;
  // The band spans the LOCKED estimate (coarse + fine, exactly) to the truth.
  const band = verdictOn && truthX !== null && lockedX !== null && Math.abs(truthX - lockedX) > 0.5
    ? { left: Math.min(truthX, lockedX), width: Math.abs(truthX - lockedX) } : null;
  const docked = lockedValue === null && !drag;

  return (
    <div data-testid="mig-estimate" data-mig-primitive="estimate" data-phase={phase}
      data-reveal-stage={stage ?? undefined} data-verdict={verdictOn ? reveal?.verdict : undefined}
      data-reduced={reduced ? "true" : "false"} data-certification={content.certification.kind}
      className="eb" style={maxHeight !== undefined ? { height: maxHeight, flex: "none" } : undefined}>
      <header data-part="head" data-testid="estimate-head" className="eb-head">
        <div className="eb-head-text">
          <p className="eb-eyebrow">
            <span>{content.measureLabel}</span>
            <span aria-hidden className="eb-eyebrow-dot">·</span>
            <span data-testid="estimate-certification" data-kind={content.certification.kind} className="eb-cert">{content.certification.label}</span>
          </p>
          <h2 ref={promptRef} id={promptId} tabIndex={-1} className="eb-prompt" data-testid="estimate-prompt">{content.prompt}</h2>
        </div>
      </header>

      {/* THE BOARD: the plaque row, the coarse beam and the fine beam. One slider. */}
      <div ref={sliderRef} data-part="board" data-testid="estimate-board" className="eb-board"
        role="slider" tabIndex={open ? 0 : -1}
        aria-labelledby={promptId} aria-describedby={hintId}
        aria-valuemin={0} aria-valuemax={top} aria-valuenow={reading ?? 0} aria-valuetext={valueText}
        aria-disabled={!open || undefined} aria-orientation="horizontal"
        data-focus-visible={focusVisible ? "true" : "false"}
        onKeyDown={onKeyDown}
        onFocus={() => setFocusVisible(focusFrom.current === "keyboard")}
        onBlur={() => { setFocusVisible(false); focusFrom.current = "keyboard"; }}>
        <span aria-hidden className="eb-bezel" />
        <span aria-hidden className="eb-corner" data-at="tl" /><span aria-hidden className="eb-corner" data-at="tr" />
        <span aria-hidden className="eb-corner" data-at="bl" /><span aria-hidden className="eb-corner" data-at="br" />

        {/* The plaque row: the reading, the balance needle, the fact. */}
        <div data-part="plaque" data-testid="estimate-plaque" className="eb-plaque">
          <div className="eb-reading" data-testid="estimate-reading">
            <span className="eb-reading-label">{revealed ? "Your estimate" : phase === "locked" ? "Locked" : "Estimate"}</span>
            <span className="eb-reading-value" data-testid="estimate-reading-value">{reading !== null ? formatEstimate(reading) : "—"}</span>
            <span className="eb-reading-unit">{unitLabel}</span>
          </div>
          <div className="eb-needle-well" data-testid="estimate-needle-well" aria-hidden>
            <span className="eb-needle-arc" />
            <span className="eb-needle-mark" data-side="under">Under</span>
            <span className="eb-needle-mark" data-side="over">Over</span>
            <span className="eb-needle" data-testid="estimate-needle" style={{ transform: `rotate(${needle}deg)` }} />
            <span className="eb-needle-pivot" />
          </div>
          <div className="eb-fact" data-testid="estimate-fact" data-shown={verdictOn ? "true" : "false"} aria-hidden={!verdictOn || undefined}>
            <span className="eb-reading-label">{reveal?.truth.label ?? "Actual"}</span>
            <span className="eb-reading-value eb-reading-value--truth" data-testid="estimate-truth-value">{verdictOn ? reveal?.truth.valueText : "—"}</span>
            <span className="eb-reading-unit">{unitLabel}</span>
          </div>
        </div>

        {/* The coarse beam. */}
        <div data-part="coarse" data-testid="estimate-coarse" className="eb-beam eb-beam--coarse" data-dragging={drag?.beam === "coarse" ? "true" : "false"}>
          <span className="eb-beam-label">Coarse</span>
          <div ref={coarseRef} className="eb-rail" data-testid="estimate-coarse-rail"
            onPointerDown={onBeamPointerDown("coarse")} onPointerMove={onBeamPointerMove("coarse")}
            onPointerUp={endDrag("coarse", true)} onPointerCancel={endDrag("coarse", false)}>
            <span aria-hidden className="eb-rail-bar" />
            {coarseWidth > 0 ? (
              <>
                {coarseFigures.map((f) => (
                  <span key={f.value} aria-hidden className="eb-tick" data-labelled={f.labelled ? "true" : "false"}
                    data-edge={f.value === 0 ? "start" : f.value === scale.max ? "end" : undefined}
                    style={{ transform: `translateX(${fractionOf(f.value, scale) * coarseWidth}px)` }}>
                    {f.labelled ? <span className="eb-figure">{formatEstimate(f.value)}</span> : null}
                  </span>
                ))}
                {band ? (
                  <span aria-hidden data-part="band" data-testid="estimate-band" className="eb-band"
                    style={{ transform: `translateX(${band.left}px)`, width: band.width }} />
                ) : null}
                {markX !== null ? (
                  <span aria-hidden data-part="mark" data-testid="estimate-mark" className="eb-mark"
                    data-dragging={drag ? "true" : "false"} style={{ transform: `translateX(${markX}px)` }} />
                ) : null}
                {truthX !== null ? (
                  <span aria-hidden data-part="truth" data-testid="estimate-truth" className="eb-truth" data-on={truthOn ? "true" : "false"}
                    style={{ transform: `translateX(${truthX}px)` }} />
                ) : null}
                <span aria-hidden data-part="poise" data-testid="estimate-poise" className="eb-poise eb-poise--coarse"
                  data-dragging={drag?.beam === "coarse" ? "true" : "false"} data-docked={docked ? "true" : "false"}
                  style={{ transform: `translateX(${poiseX}px)` }} />
              </>
            ) : null}
          </div>
        </div>

        {/* The fine beam. */}
        <div data-part="fine" data-testid="estimate-fine" className="eb-beam eb-beam--fine" data-dragging={drag?.beam === "fine" ? "true" : "false"}>
          <span className="eb-beam-label">Fine</span>
          <div ref={fineRef} className="eb-rail" data-testid="estimate-fine-rail"
            onPointerDown={onBeamPointerDown("fine")} onPointerMove={onBeamPointerMove("fine")}
            onPointerUp={endDrag("fine", true)} onPointerCancel={endDrag("fine", false)}>
            <span aria-hidden className="eb-rail-bar" />
            {fineWidth > 0 ? (
              <>
                {fineTicks.map((f) => (
                  <span key={f.value} aria-hidden className="eb-tick eb-tick--fine" data-labelled={f.labelled ? "true" : "false"}
                    data-edge={f.value === 0 ? "start" : undefined}
                    style={{ transform: `translateX(${fineFraction(f.value, scale) * fineWidth}px)` }}>
                    {f.labelled ? <span className="eb-figure">+{f.value}</span> : null}
                  </span>
                ))}
                <span aria-hidden data-part="fine-poise" data-testid="estimate-fine-poise" className="eb-poise eb-poise--fine"
                  data-dragging={drag?.beam === "fine" ? "true" : "false"} data-docked={docked ? "true" : "false"}
                  style={{ transform: `translateX(${fineX}px)` }} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* THE PLATE: the vernier keys and the Lock. */}
      <div data-part="plate" data-testid="estimate-plate" className="eb-plate">
        <div className="eb-vernier" role="group" aria-label="Fine adjustment">
          <button type="button" className="eb-btn" data-testid="estimate-minus-10" onClick={() => nudge(-10)}
            disabled={!open || committed === null || committed <= 0} aria-label={`Less by 10 ${unitLabel}`}>−10</button>
          <button type="button" className="eb-btn" data-testid="estimate-minus-1" onClick={() => nudge(-1)}
            disabled={!open || committed === null || committed <= 0} aria-label={`Less by 1 ${unitLabel}`}>−1</button>
          <button type="button" className="eb-btn" data-testid="estimate-plus-1" onClick={() => nudge(1)}
            disabled={!open || (committed ?? -1) >= top} aria-label={`More by 1 ${unitLabel}`}>+1</button>
          <button type="button" className="eb-btn" data-testid="estimate-plus-10" onClick={() => nudge(10)}
            disabled={!open || (committed ?? -1) >= top} aria-label={`More by 10 ${unitLabel}`}>+10</button>
        </div>
        <div className="eb-lockwrap" data-part="lock" data-testid="estimate-lockwrap">
          <button type="button" className="eb-lock" data-testid="estimate-lock" data-shown={open ? "true" : "false"}
            onClick={lock} disabled={!open || committed === null} aria-describedby={hintId}>
            <Lock aria-hidden /> Lock estimate
          </button>
          <span className="eb-lockstate" data-testid="estimate-lockstate" data-shown={open ? "false" : "true"}
            data-verdict={verdictOn ? reveal?.verdict : undefined} aria-hidden={open || undefined}>
            {verdictOn ? (
              <>
                <b data-testid="estimate-verdict">{verdictWord}</b>
                {reveal?.error.relativeText && reveal.verdict !== "exact" ? <span className="eb-lockstate-rel">· {reveal.error.relativeText}</span> : null}
              </>
            ) : <><Lock aria-hidden className="!size-3.5" /> Locked <span aria-hidden className="eb-dots"><i /><i /><i /></span></>}
          </span>
        </div>
      </div>

      {/* THE LEDGER: a reserved box. The prelude before the reveal; the host's working at it. */}
      <div data-part="ledger" data-testid="estimate-ledger" className="eb-ledger" data-on={ledgerOn ? "true" : "false"}>
        <div className="eb-ledger-layer eb-ledger-prelude" data-testid="estimate-prelude" data-shown={ledgerOn ? "false" : "true"} aria-hidden={ledgerOn || undefined}>
          {prelude}
        </div>
        <div className="eb-ledger-layer eb-ledger-breakdown" data-testid="estimate-breakdown" data-shown={ledgerOn ? "true" : "false"} aria-hidden={!ledgerOn || undefined}>
          {revealed ? breakdown : null}
        </div>
      </div>

      <p data-part="status" data-testid="estimate-status" id={hintId} className="eb-status">
        {statusLine}
      </p>
      <p role="status" aria-live="polite" data-testid="estimate-live" className="sr-only">
        {resultText || announcement}
      </p>
    </div>
  );
}
