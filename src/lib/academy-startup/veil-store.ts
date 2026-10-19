/**
 * ACADEMY STARTUP RC2 — the entrance veil that survives the route change.
 *
 * The Landing's veil used to unmount with the Landing at `navigate()`, so the
 * visitor watched the Orrery mount, its art decode and its GPU warm up. Now the
 * Landing hands its veil to this store just before it navigates, an overlay
 * mounted ABOVE the router (`AcademyVeil` in `AppRouterRoot`) keeps painting
 * it, and the Orrery lifts it once its first screen is really ready
 * (`readiness.ts`) — or a hard cap lifts it anyway. A direct `/lol` visit holds
 * the flat startup surface the same way.
 *
 *   idle ──hold("entrance") at the Landing's navigate()──► held
 *   idle ──hold("direct") at boot on /lol─────────────────► held
 *   held ──Orrery mounted───► held (mountedAt; a direct visit's cap starts)
 *   held ──reveal(ready | degraded)──► revealing ──fade──► revealed
 *   held ──cap──────────────────────► revealing(timeout, pending=[…]) ──► revealed
 *   held | revealing ──cancel (left /lol, page unmounted)──► idle   (no fade)
 *
 * Caps (owner decision 2026-10-18): 1.6 s after the hand-off for the Landing
 * journey; 1.8 s after the Orrery mounts for a direct visit, and a 10 s safety
 * net for a direct visit whose page never mounts (the flat surface it holds is
 * what the shell would show anyway). There is never an infinite veil.
 *
 * A plain module store (no React context), read with useSyncExternalStore.
 */
import { readReducedMotionPreference } from "@/hooks/useReducedMotionPreference";

export type VeilSource = "entrance" | "direct";
export type VeilPhase = "idle" | "held" | "revealing" | "revealed";
export type RevealReason = "ready" | "degraded" | "timeout" | "cancelled";

export interface AcademyStartupState {
  phase: VeilPhase;
  source: VeilSource | null;
  /** performance.now() at the hold / the Orrery's mount / the reveal. */
  heldAt: number | null;
  mountedAt: number | null;
  revealedAt: number | null;
  reason: RevealReason | null;
  /** At the reveal: signals still pending (a timeout) and signals that failed. */
  pending: readonly string[];
  degraded: readonly string[];
}

export const ENTRANCE_CAP_MS = 1600;
export const DIRECT_CAP_AFTER_MOUNT_MS = 1800;
export const DIRECT_SAFETY_CAP_MS = 10_000;
/** The veil's fade into the Orrery (0 under reduced motion). */
export const REVEAL_FADE_MS = 300;

const IDLE: AcademyStartupState = {
  phase: "idle", source: null, heldAt: null, mountedAt: null, revealedAt: null, reason: null, pending: [], degraded: [],
};

let state: AcademyStartupState = IDLE;
let capTimer: ReturnType<typeof setTimeout> | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;
/** The latest readiness record, so a cap can say what it was still waiting for. */
let lastRecord: { pending: readonly string[]; degraded: readonly string[] } = { pending: ["stage"], degraded: [] };
const listeners = new Set<() => void>();
/** A direct visit is decided once per page load (AcademyVeil's boot check). */
let bootChecked = false;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function set(next: AcademyStartupState) {
  state = next;
  for (const l of [...listeners]) l();
}

function clearTimers() {
  if (capTimer !== null) clearTimeout(capTimer);
  if (fadeTimer !== null) clearTimeout(fadeTimer);
  capTimer = null;
  fadeTimer = null;
}

function armCap(ms: number) {
  if (capTimer !== null) clearTimeout(capTimer);
  capTimer = setTimeout(() => {
    capTimer = null;
    revealAcademy("timeout", { pending: lastRecord.pending, degraded: lastRecord.degraded });
  }, ms);
}

/** Take (or keep) the veil. A second hold while one is up is a no-op. */
export function holdAcademyVeil(source: VeilSource): void {
  if (state.phase === "held") return;
  clearTimers();
  lastRecord = { pending: ["stage"], degraded: [] };
  set({ ...IDLE, phase: "held", source, heldAt: now() });
  armCap(source === "entrance" ? ENTRANCE_CAP_MS : DIRECT_SAFETY_CAP_MS);
}

/** The Orrery has mounted. A direct visit's cap counts from here. */
export function noteAcademyMounted(): void {
  if (state.phase !== "held" || state.mountedAt != null) return;
  set({ ...state, mountedAt: now() });
  if (state.source === "direct") armCap(DIRECT_CAP_AFTER_MOUNT_MS);
}

/** The page's latest readiness record (used only if a cap ends the hold). */
export function reportAcademyReadiness(record: { pending: readonly string[]; degraded: readonly string[] }): void {
  lastRecord = record;
}

/** Lift the veil. Only from `held`; idempotent. */
export function revealAcademy(
  reason: Exclude<RevealReason, "cancelled">,
  detail: { pending?: readonly string[]; degraded?: readonly string[] } = {},
): void {
  if (state.phase !== "held") return;
  clearTimers();
  set({ ...state, phase: "revealing", revealedAt: now(), reason, pending: detail.pending ?? [], degraded: detail.degraded ?? [] });
  if (readReducedMotionPreference()) { set({ ...state, phase: "revealed" }); return; } // no fade at all
  fadeTimer = setTimeout(() => {
    fadeTimer = null;
    if (state.phase === "revealing") set({ ...state, phase: "revealed" });
  }, REVEAL_FADE_MS);
}

/** Drop the veil at once (the visitor left /lol, or the page went away). */
export function cancelAcademyVeil(): void {
  if (state.phase !== "held" && state.phase !== "revealing") return;
  clearTimers();
  set({ ...state, phase: "idle", reason: state.phase === "held" ? "cancelled" : state.reason });
}

/** True the first time it is asked in this page load, false after. */
export function claimAcademyBootCheck(): boolean {
  if (bootChecked) return false;
  bootChecked = true;
  return true;
}

export function getAcademyStartup(): AcademyStartupState {
  return state;
}

export function subscribeAcademyStartup(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Test seam. */
export function __resetAcademyStartupForTests(): void {
  clearTimers();
  lastRecord = { pending: ["stage"], degraded: [] };
  state = IDLE;
  bootChecked = false;
  listeners.clear();
}
