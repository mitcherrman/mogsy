/**
 * MIG — RANGEFINDER (PLACE): the pure parts of the instrument.
 *
 * Projection, clamping, snapping, pointer and keyboard arithmetic, and the
 * reveal clock. No React, no DOM, no domain: a "stop" is a distance on a field
 * and nothing here knows what the field measures or which stop is right.
 * Grading lives with the host's authority and is never done here (a source
 * test pins that nothing in this file reads a reveal).
 *
 * THE SCALE IS HONEST. `unitsToPx` is one linear map per lens: zero at the
 * origin, `lens.maxUnits` at the field's far edge. Two distances therefore keep
 * their ratio on screen whatever the lens, and the ring the reveal projects is
 * drawn by the same map as the ring the player drew.
 */
import type { RangefinderField, RangefinderLens, RangefinderPublic, RangefinderStop } from "./types";

export const RANGEFINDER_MIN_STOPS = 2;

export function assertRangefinderContent(content: RangefinderPublic): void {
  const { stops, lenses } = content.field;
  if (stops.length < RANGEFINDER_MIN_STOPS) {
    throw new Error(`Rangefinder: needs at least ${RANGEFINDER_MIN_STOPS} stops, got ${stops.length}`);
  }
  const tokens = new Set<string>();
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    if (tokens.has(s.token)) throw new Error("Rangefinder: stop tokens must be distinct");
    tokens.add(s.token);
    if (!Number.isFinite(s.units) || s.units <= 0) throw new Error(`Rangefinder: stop ${i} has no positive distance`);
    if (i > 0 && s.units <= stops[i - 1].units) throw new Error("Rangefinder: stops must ascend by distance");
  }
  if (lenses.length < 1) throw new Error("Rangefinder: needs at least one lens");
  for (const lens of lenses) {
    if (!(lens.maxUnits > 0)) throw new Error(`Rangefinder: lens ${lens.id} reaches nowhere`);
    if (!(lens.ringEveryUnits > 0) || lens.labelEveryUnits % lens.ringEveryUnits !== 0) {
      throw new Error(`Rangefinder: lens ${lens.id} calibration is not a lattice`);
    }
  }
  const last = stops[stops.length - 1].units;
  if (!lenses.some((l) => l.maxUnits >= last)) throw new Error("Rangefinder: no lens reaches the farthest stop");
}

// ------------------------------------------------------------------ geometry

/** Which way the field points: the origin sits on the left (landscape) or at the bottom (portrait). */
export type FieldOrientation = "landscape" | "portrait";

export interface FieldBox {
  width: number;
  height: number;
  orientation: FieldOrientation;
}

/** How far the origin piece sits in from its edge, and how much room the target keeps at the far edge. */
export const ORIGIN_INSET_PX = 60;
export const FAR_MARGIN_PX = 26;
/** The target never comes closer to the field's side edges than this. */
export const SIDE_MARGIN_PX = 26;

export interface FieldGeometry {
  origin: { x: number; y: number };
  /** Pixels from the origin to where `lens.maxUnits` lands. */
  reachPx: number;
  orientation: FieldOrientation;
  /** Half-extent available to the target perpendicular to the axis. */
  halfBreadthPx: number;
}

export function fieldGeometry(box: FieldBox): FieldGeometry {
  if (box.orientation === "portrait") {
    return {
      origin: { x: box.width / 2, y: box.height - ORIGIN_INSET_PX },
      reachPx: Math.max(1, box.height - ORIGIN_INSET_PX - FAR_MARGIN_PX),
      orientation: "portrait",
      halfBreadthPx: Math.max(0, box.width / 2 - SIDE_MARGIN_PX),
    };
  }
  return {
    origin: { x: ORIGIN_INSET_PX, y: box.height / 2 },
    reachPx: Math.max(1, box.width - ORIGIN_INSET_PX - FAR_MARGIN_PX),
    orientation: "landscape",
    halfBreadthPx: Math.max(0, box.height / 2 - SIDE_MARGIN_PX),
  };
}

/** The one linear map from distance to pixels for a lens on a field. */
export function unitsToPx(units: number, lens: RangefinderLens, geom: FieldGeometry): number {
  return (units / lens.maxUnits) * geom.reachPx;
}
export function pxToUnits(px: number, lens: RangefinderLens, geom: FieldGeometry): number {
  return (px / geom.reachPx) * lens.maxUnits;
}

/** A placement on the field: a distance and a bearing off the axis, in radians, positive = clockwise on screen. */
export interface Placement {
  units: number;
  bearing: number;
}

/** The widest bearing the target may take at `radiusPx` and still sit inside the field. */
export function maxBearingAt(radiusPx: number, geom: FieldGeometry): number {
  const CAP = Math.PI * 0.45; // never behind the origin, never flat along the near edge
  if (radiusPx <= 0) return CAP;
  const ratio = geom.halfBreadthPx / radiusPx;
  if (ratio >= 1) return CAP;
  return Math.min(CAP, Math.asin(ratio));
}

export function clampBearing(bearing: number, radiusPx: number, geom: FieldGeometry): number {
  const m = maxBearingAt(radiusPx, geom);
  return Math.max(-m, Math.min(m, bearing));
}

/** Where a placement is drawn. */
export function placementPoint(p: Placement, lens: RangefinderLens, geom: FieldGeometry): { x: number; y: number } {
  const r = unitsToPx(p.units, lens, geom);
  const b = clampBearing(p.bearing, r, geom);
  if (geom.orientation === "portrait") {
    return { x: geom.origin.x + Math.sin(b) * r, y: geom.origin.y - Math.cos(b) * r };
  }
  return { x: geom.origin.x + Math.cos(b) * r, y: geom.origin.y + Math.sin(b) * r };
}

/**
 * A pointer position (field-local pixels) → the continuous placement under it,
 * clamped to the field's reach and breadth and to the stops' span. The angle
 * is kept as the player set it; only the distance is ever submitted.
 */
export function placementFromPointer(
  x: number, y: number, lens: RangefinderLens, geom: FieldGeometry, field: RangefinderField,
): Placement {
  const dx = x - geom.origin.x;
  const dy = y - geom.origin.y;
  let along: number;
  let across: number;
  if (geom.orientation === "portrait") { along = -dy; across = dx; } else { along = dx; across = dy; }
  // Behind the origin there is no reach: the target sits at the nearest stop.
  const r = along <= 0 ? 0 : Math.hypot(along, across);
  let bearing = r === 0 ? 0 : Math.atan2(across, Math.max(along, 1e-6));
  const minUnits = field.stops[0].units;
  const maxUnits = Math.min(lens.maxUnits, field.stops[field.stops.length - 1].units);
  const units = Math.max(minUnits, Math.min(maxUnits, pxToUnits(r, lens, geom)));
  bearing = clampBearing(bearing, unitsToPx(units, lens, geom), geom);
  return { units, bearing };
}

// --------------------------------------------------------------------- stops

/** The index of the stop nearest a distance (ties go to the nearer stop by index order: the lower). */
export function nearestStopIndex(units: number, stops: readonly RangefinderStop[]): number {
  let lo = 0;
  let hi = stops.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stops[mid].units < units) lo = mid + 1; else hi = mid;
  }
  // `lo` is the first stop with units >= target; compare with its predecessor.
  if (lo > 0 && Math.abs(stops[lo - 1].units - units) <= Math.abs(stops[lo].units - units)) return lo - 1;
  return lo;
}

export function stopIndexOf(token: string | null, stops: readonly RangefinderStop[]): number | null {
  if (token === null) return null;
  const i = stops.findIndex((s) => s.token === token);
  return i === -1 ? null : i;
}

/** The last stop a lens can show. */
export function lastVisibleStopIndex(lens: RangefinderLens, stops: readonly RangefinderStop[]): number {
  let i = stops.length - 1;
  while (i > 0 && stops[i].units > lens.maxUnits) i--;
  return i;
}

/** The first lens that shows a distance, or the widest lens when none does. */
export function lensShowing(units: number, lenses: readonly RangefinderLens[]): RangefinderLens {
  return lenses.find((l) => l.maxUnits >= units) ?? lenses[lenses.length - 1];
}

// ------------------------------------------------------------------ keyboard

/**
 * The stop a key moves the target to, or null for a key the field does not
 * own. Arrows step one stop (Right / Up out, Left / Down in); with Shift, or
 * as PageUp / PageDown, they step `coarse` stops; Home / End jump to the ends
 * of what the lens shows.
 */
export function stepStopForKey(
  key: string, shift: boolean, index: number, lastIndex: number, coarse: number,
): number | null {
  const fine = shift ? coarse : 1;
  switch (key) {
    case "ArrowRight": case "ArrowUp": return Math.min(lastIndex, index + fine);
    case "ArrowLeft": case "ArrowDown": return Math.max(0, index - fine);
    case "PageUp": return Math.min(lastIndex, index + coarse);
    case "PageDown": return Math.max(0, index - coarse);
    case "Home": return 0;
    case "End": return lastIndex;
    default: return null;
  }
}

// --------------------------------------------------------------- calibration

export interface CalibrationRing {
  units: number;
  labelled: boolean;
}

/** The engraved rings a lens shows: every `ringEveryUnits` up to the lens' reach, figures on every `labelEveryUnits`. */
export function calibrationRings(lens: RangefinderLens): CalibrationRing[] {
  const rings: CalibrationRing[] = [];
  for (let u = lens.ringEveryUnits; u <= lens.maxUnits + 1e-9; u += lens.ringEveryUnits) {
    rings.push({ units: u, labelled: u % lens.labelEveryUnits === 0 });
  }
  return rings;
}

// --------------------------------------------------------------- reveal clock

/**
 * The reveal is a bounded choreography on ONE clock:
 *
 *   charge   the locked ring hardens, the instrument powers;
 *   project  the canonical ring grows out of the origin to its true reach;
 *   settle   right: the rings fuse and flare. Wrong: the band between them
 *            is shaded;
 *   proof    the reading plate becomes the fact plate.
 *
 * `budgetMs` scales every stage (1500 for the lab; a Ranked host passes its
 * hold). Reduced motion has no clock: the first frame is the settled frame.
 */
export type RangefinderStage = "charge" | "project" | "settle" | "proof" | "done";

export interface RangefinderPlan {
  instant: boolean;
  stages: readonly { stage: Exclude<RangefinderStage, "done">; start: number; end: number }[];
  totalMs: number;
}

export const RANGEFINDER_BUDGET_MS = 1500;
const SHARE = { charge: 0.14, project: 0.42, settle: 0.22, proof: 0.22 } as const;

export function planRangefinderReveal({ reduced, budgetMs = RANGEFINDER_BUDGET_MS }: { reduced: boolean; budgetMs?: number }): RangefinderPlan {
  if (reduced) return { instant: true, stages: [], totalMs: 0 };
  const budget = Math.max(300, budgetMs);
  const stages: { stage: Exclude<RangefinderStage, "done">; start: number; end: number }[] = [];
  let at = 0;
  for (const stage of ["charge", "project", "settle", "proof"] as const) {
    const ms = Math.round(budget * SHARE[stage]);
    stages.push({ stage, start: at, end: at + ms });
    at += ms;
  }
  return { instant: false, stages, totalMs: at };
}

export function stageAt(plan: RangefinderPlan, elapsedMs: number): RangefinderStage {
  if (plan.instant || elapsedMs >= plan.totalMs) return "done";
  const active = plan.stages.find((s) => elapsedMs >= s.start && elapsedMs < s.end);
  return active ? active.stage : "done";
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** How far the canonical ring has grown, 0..1, `elapsedMs` into the reveal. */
export function projectionProgress(plan: RangefinderPlan, elapsedMs: number): number {
  if (plan.instant) return 1;
  const w = plan.stages.find((s) => s.stage === "project");
  if (!w) return 1;
  if (elapsedMs <= w.start) return 0;
  if (elapsedMs >= w.end) return 1;
  return easeOutCubic((elapsedMs - w.start) / (w.end - w.start));
}

export const showsVerdict = (stage: RangefinderStage) => stage === "settle" || stage === "proof" || stage === "done";
export const showsProof = (stage: RangefinderStage) => stage === "proof" || stage === "done";

/** A distance for the engraved reading: thousands grouped with a narrow no-break space. */
export function formatUnits(units: number): string {
  const n = Math.round(units);
  return n >= 1000 ? `${Math.floor(n / 1000)}\u202f${String(n % 1000).padStart(3, "0")}` : String(n);
}
