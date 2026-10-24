// ---------------------------------------------------------------------------
// ADMIN CONVERSION V2 (CV2) — ordered conversion and drop-off.
//
// computeFunnel (metrics.ts) answers "how many browsers reached each surface"
// with independent sets. This module answers the other question: of the units
// that reached step N, how many reached step N+1 AFTER it, inside a window
// measured from that unit's own anchor. The two are different numbers and are
// presented side by side, never substituted for each other.
//
// THREE PROJECTIONS, TWO UNITS, NEVER SUMMED
//
//   Browser conversion  unit = visitor_id, anchor = first seen (new browsers
//                       only), steps ordered, 7-day window.
//   Signup form         unit = visitor_id, anchor = first signup_viewed,
//                       24-hour window.
//   Account activation  unit = registered user_id, anchor = its first
//                       signup_completed (the same anchor as Retention V2's
//                       account lens, pinned by a parity test).
//
// RULES (docs/handoffs/ADMIN_CONVERSION_V2_HANDOFF.md §5)
//
//  · Clock = received_at. A step counts as after the previous one when its
//    time is >= the previous step's time; equal timestamps count, because one
//    browser tick can write two rows.
//  · Each step is the unit's FIRST occurrence at or after the previous step.
//    A unit that has a later step without the earlier one is "entered later" at
//    that step: reported, never dropped silently and never back-filled.
//  · A unit whose window has not fully elapsed is tooRecent and is outside
//    every denominator. Never "dropped".
//  · A browser is linked to a server row only by explicit correlation
//    (visitorJourney.correlatedVisitor). A Railway row is never fanned out to
//    every browser that once carried its user_id.
//  · Duplicate rows and repeated sessions never multiply a unit.
//  · Gameplay counts only from source_system = 'railway' rows.
//
// The dataset is whatever the caller filtered (traffic population); nothing
// here re-includes excluded traffic.
// ---------------------------------------------------------------------------

import {
  AUTHORITATIVE_START_EVENTS,
  MODE_OPEN_EVENTS,
  firstSeenByVisitor,
  indexSessions,
  type AnalyticsDataset,
  type AnalyticsEventRecord,
  type Rate,
} from "./metrics";
import { DAY_MS } from "./range";
import { attributeRound, isServerRound } from "./roundAttribution";
import { correlatedVisitor } from "./visitorJourney";
import { DAILY_ENTRY_CLICKED } from "@/lib/analytics/dailyEntry";

const ts = (iso: string) => Date.parse(iso);

/** Anchors in [start, end). `start === null` is unbounded. */
export interface ConversionBounds {
  start: number | null;
  end: number;
}

const within = (t: number, b: ConversionBounds) => (b.start === null || t >= b.start) && t < b.end;

export const BROWSER_CONVERSION_WINDOW_MS = 7 * DAY_MS;
export const SIGNUP_FORM_WINDOW_MS = DAY_MS;
export const ACTIVATION_WINDOW_MS = 7 * DAY_MS;
/** "Played again": a server-confirmed start 24h–8d after signup, half-open. */
export const PLAYED_AGAIN_FROM_MS = DAY_MS;
export const PLAYED_AGAIN_TO_MS = 8 * DAY_MS;

export interface TruncationFlags {
  events: boolean;
  sessions: boolean;
  visitors: boolean;
}

/** A conversion read on a capped dataset is not a sample; it is unavailable. */
function truncationReason(t: TruncationFlags | undefined): string | undefined {
  if (!t) return undefined;
  const hit = (["events", "sessions", "visitors"] as const).filter((k) => t[k]);
  return hit.length
    ? `Unavailable: the ${hit.join(", ")} read reached the row cap, so ordered conversion would be computed on part of the history.`
    : undefined;
}

const rate = (numerator: number, denominator: number): Rate => ({ numerator, denominator });

// --- Browser conversion -----------------------------------------------------

export type BrowserStepId =
  | "entered"
  | "leaguecraft"
  | "intent"
  | "server_play"
  | "signup_viewed"
  | "account_created";

export interface BrowserStepDef {
  id: BrowserStepId;
  label: string;
  definition: string;
}

export const BROWSER_STEPS: readonly BrowserStepDef[] = [
  { id: "entered", label: "Entered", definition: "New browser: first seen inside the cohort window. Every cohort browser is here." },
  { id: "leaguecraft", label: "Reached Leaguecraft", definition: "leaguecraft_opened (/quiz), after first seen." },
  { id: "intent", label: "Chose a game", definition: "A mode-open event or a Daily Challenge entry click, after reaching Leaguecraft." },
  {
    id: "server_play",
    label: "Server-confirmed play",
    definition:
      "A Railway gameplay start explicitly correlated to this browser (its visitor or session id), after choosing a game. Received time is delivery time.",
  },
  { id: "signup_viewed", label: "Viewed signup", definition: "signup_viewed (the /auth signup screen), after the play." },
  { id: "account_created", label: "Created an account", definition: "signup_completed recorded by this browser, after viewing signup." },
];

export interface ConversionStep {
  id: BrowserStepId;
  label: string;
  definition: string;
  /** Eligible units that reached this step in order. */
  reached: Set<string>;
  /** Eligible units with this step in their window, but not in order. */
  enteredLater: Set<string>;
  /** Eligible units that reached this step and not the next one (empty for the last step). */
  dropped: Set<string>;
  /** reached / previous step's reached; null for the first step. */
  stepRate: Rate | null;
  /** reached / entered. */
  cumulativeRate: Rate;
}

export interface BrowserConversionReport {
  windowMs: number;
  /** Every browser first seen in bounds, eligible or not. */
  cohort: Set<string>;
  eligible: Set<string>;
  tooRecent: Set<string>;
  steps: ConversionStep[];
  /** Eligible browsers by the furthest step reached in order. Sums to eligible. Excluded steps are absent. */
  furthest: Partial<Record<BrowserStepId, Set<string>>>;
  /** Steps left out of the ordered chain (see options.excludeServerPlay). */
  excludedSteps: BrowserStepId[];
  /**
   * Railway starts in the dataset that correlate to some browser, out of all
   * Railway starts. Low coverage means server_play under-reads; the caller
   * decides when to call the step unavailable (owner decision D-6).
   */
  serverPlayCoverage: { correlated: number; total: number };
  /** Eligible browsers with a correlated Daily stage start / Standard-stage completion in window. */
  daily: { started: Rate; standardCompleted: Rate };
  unavailableReason?: string;
}

const INTENT_EVENTS = new Set<string>([...MODE_OPEN_EVENTS, DAILY_ENTRY_CLICKED]);
const SERVER_STARTS = new Set<string>(AUTHORITATIVE_START_EVENTS);

function webStep(e: AnalyticsEventRecord): BrowserStepId | null {
  if (e.source_system !== "web") return null;
  if (e.event_name === "leaguecraft_opened") return "leaguecraft";
  if (INTENT_EVENTS.has(e.event_name)) return "intent";
  if (e.event_name === "signup_viewed") return "signup_viewed";
  if (e.event_name === "signup_completed") return "account_created";
  return null;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function computeBrowserConversion(
  ds: AnalyticsDataset,
  bounds: ConversionBounds,
  now: number,
  options: {
    windowMs?: number;
    truncated?: TruncationFlags;
    /**
     * D-6: leave server_play out of the chain, so later steps are not gated on
     * a correlation whose coverage is unestablished. Coverage is still reported.
     */
    excludeServerPlay?: boolean;
  } = {},
): BrowserConversionReport {
  const windowMs = options.windowMs ?? BROWSER_CONVERSION_WINDOW_MS;
  const excludedSteps: BrowserStepId[] = options.excludeServerPlay ? ["server_play"] : [];
  const defs = BROWSER_STEPS.filter((d) => !excludedSteps.includes(d.id));
  const firstSeen = firstSeenByVisitor(ds, indexSessions(ds));
  const sessionOwners = new Map(ds.sessions.map((s) => [s.session_id, s.visitor_id]));

  // Occurrence times per browser per step, from browser rows and correlated server rows.
  const occ = new Map<string, Map<BrowserStepId, number[]>>();
  const dailyStart = new Map<string, number[]>();
  const dailyStandard = new Map<string, number[]>();
  let correlated = 0;
  let total = 0;
  const add = (v: string, step: BrowserStepId, t: number) => {
    let m = occ.get(v);
    if (!m) occ.set(v, (m = new Map()));
    push(m, step, t);
  };

  for (const e of ds.events) {
    const t = ts(e.received_at);
    const step = webStep(e);
    if (step && e.visitor_id) {
      add(e.visitor_id, step, t);
      continue;
    }
    if (e.source_system !== "railway") continue;
    const isStart = SERVER_STARTS.has(e.event_name);
    const round = isServerRound(e) ? attributeRound(e) : null;
    const isDaily = round?.category === "daily_stage";
    if (!isStart && !isDaily) continue;
    const v = correlatedVisitor(e, sessionOwners);
    if (isStart) {
      total += 1;
      if (v) correlated += 1;
    }
    if (!v) continue;
    if (isStart) add(v, "server_play", t);
    if (isDaily && e.event_name === "ranked_started") push(dailyStart, v, t);
    if (isDaily && e.event_name === "ranked_completed" && round?.stageKind === "standard") push(dailyStandard, v, t);
  }

  const cohort = new Set<string>();
  const eligible = new Set<string>();
  const tooRecent = new Set<string>();
  const reached = defs.map(() => new Set<string>());
  const later = defs.map(() => new Set<string>());
  let dailyStarted = 0;
  let dailyStandardDone = 0;

  for (const [v, anchor] of firstSeen) {
    if (!within(anchor, bounds)) continue;
    cohort.add(v);
    if (anchor + windowMs > now) {
      tooRecent.add(v);
      continue;
    }
    eligible.add(v);
    const end = anchor + windowMs;
    const inWindow = (t: number) => t >= anchor && t < end;
    const steps = occ.get(v);

    reached[0].add(v);
    let prev = anchor;
    let inOrder = true;
    for (let k = 1; k < defs.length; k++) {
      const times = (steps?.get(defs[k].id) ?? []).filter(inWindow);
      if (inOrder) {
        const next = times.filter((t) => t >= prev).sort((a, b) => a - b)[0];
        if (next !== undefined) {
          reached[k].add(v);
          prev = next;
          continue;
        }
        inOrder = false;
      }
      if (times.length) later[k].add(v);
    }

    if ((dailyStart.get(v) ?? []).some(inWindow)) dailyStarted += 1;
    if ((dailyStandard.get(v) ?? []).some(inWindow)) dailyStandardDone += 1;
  }

  const steps: ConversionStep[] = defs.map((def, k) => {
    const next = reached[k + 1];
    const dropped = new Set([...reached[k]].filter((v) => !next || !next.has(v)));
    return {
      ...def,
      reached: reached[k],
      enteredLater: later[k],
      dropped: next ? dropped : new Set<string>(),
      stepRate: k === 0 ? null : rate(reached[k].size, reached[k - 1].size),
      cumulativeRate: rate(reached[k].size, eligible.size),
    };
  });

  const furthest = Object.fromEntries(
    steps.map((s, k) => [s.id, k === steps.length - 1 ? s.reached : s.dropped]),
  ) as Partial<Record<BrowserStepId, Set<string>>>;

  return {
    windowMs,
    cohort,
    eligible,
    tooRecent,
    steps,
    furthest,
    excludedSteps,
    serverPlayCoverage: { correlated, total },
    daily: { started: rate(dailyStarted, eligible.size), standardCompleted: rate(dailyStandardDone, eligible.size) },
    unavailableReason: truncationReason(options.truncated),
  };
}

// --- Signup form --------------------------------------------------------------

export interface SignupSurfaceRow {
  /** metadata.entry_surface of the anchoring signup_viewed; "(unrecorded)" when absent. */
  entrySurface: string;
  viewed: number;
  submitted: number;
  created: number;
}

export interface SignupFormReport {
  windowMs: number;
  /** Browsers whose first signup_viewed is in bounds. */
  cohort: Set<string>;
  eligible: Set<string>;
  tooRecent: Set<string>;
  submitted: Set<string>;
  created: Set<string>;
  viewToSubmit: Rate;
  submitToCreate: Rate;
  viewToCreate: Rate;
  /** Of `created`: by the completion row's upgraded_from_guest. */
  createdFromGuest: number;
  createdDirect: number;
  createdUnknownOrigin: number;
  bySurface: SignupSurfaceRow[];
  /**
   * Browsers with a signup_completed in bounds and no earlier signup_viewed in
   * this browser, e.g. a guest upgrade from a panel outside /auth. Not a rate.
   */
  completedWithoutView: Set<string>;
  unavailableReason?: string;
}

export function computeSignupForm(
  ds: AnalyticsDataset,
  bounds: ConversionBounds,
  now: number,
  options: { windowMs?: number; truncated?: TruncationFlags } = {},
): SignupFormReport {
  const windowMs = options.windowMs ?? SIGNUP_FORM_WINDOW_MS;
  const views = new Map<string, AnalyticsEventRecord[]>();
  const starts = new Map<string, number[]>();
  const completes = new Map<string, AnalyticsEventRecord[]>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || !e.visitor_id) continue;
    if (e.event_name === "signup_viewed") push(views, e.visitor_id, e);
    else if (e.event_name === "signup_started") push(starts, e.visitor_id, ts(e.received_at));
    else if (e.event_name === "signup_completed") push(completes, e.visitor_id, e);
  }
  const byTime = (a: AnalyticsEventRecord, b: AnalyticsEventRecord) => ts(a.received_at) - ts(b.received_at);

  const cohort = new Set<string>();
  const eligible = new Set<string>();
  const tooRecent = new Set<string>();
  const submitted = new Set<string>();
  const created = new Set<string>();
  const surfaces = new Map<string, SignupSurfaceRow>();
  let fromGuest = 0;
  let direct = 0;

  for (const [v, list] of views) {
    const first = [...list].sort(byTime)[0];
    const anchor = ts(first.received_at);
    if (!within(anchor, bounds)) continue;
    cohort.add(v);
    if (anchor + windowMs > now) {
      tooRecent.add(v);
      continue;
    }
    eligible.add(v);
    const end = anchor + windowMs;
    const surfaceRaw = first.metadata?.entry_surface;
    const surface = typeof surfaceRaw === "string" && surfaceRaw ? surfaceRaw : "(unrecorded)";
    const row = surfaces.get(surface) ?? { entrySurface: surface, viewed: 0, submitted: 0, created: 0 };
    row.viewed += 1;
    surfaces.set(surface, row);

    const submit = (starts.get(v) ?? []).filter((t) => t >= anchor && t < end).sort((a, b) => a - b)[0];
    if (submit === undefined) continue;
    submitted.add(v);
    row.submitted += 1;
    const done = (completes.get(v) ?? [])
      .filter((e) => ts(e.received_at) >= submit && ts(e.received_at) < end)
      .sort(byTime)[0];
    if (!done) continue;
    created.add(v);
    row.created += 1;
    if (done.metadata?.upgraded_from_guest === true) fromGuest += 1;
    else if (done.metadata?.upgraded_from_guest === false) direct += 1;
  }

  const completedWithoutView = new Set<string>();
  for (const [v, list] of completes) {
    const firstDone = ts([...list].sort(byTime)[0].received_at);
    if (!within(firstDone, bounds)) continue;
    const viewedBefore = (views.get(v) ?? []).some((e) => ts(e.received_at) <= firstDone);
    if (!viewedBefore) completedWithoutView.add(v);
  }

  return {
    windowMs,
    cohort,
    eligible,
    tooRecent,
    submitted,
    created,
    viewToSubmit: rate(submitted.size, eligible.size),
    submitToCreate: rate(created.size, submitted.size),
    viewToCreate: rate(created.size, eligible.size),
    createdFromGuest: fromGuest,
    createdDirect: direct,
    createdUnknownOrigin: created.size - fromGuest - direct,
    bySurface: [...surfaces.values()].sort((a, b) => b.viewed - a.viewed || a.entrySurface.localeCompare(b.entrySurface)),
    completedWithoutView,
    unavailableReason: truncationReason(options.truncated),
  };
}

// --- Account activation -------------------------------------------------------

export type SignupOrigin = "guest_upgrade" | "direct" | "unknown";

/**
 * Each registered account's signup anchor: its earliest browser
 * signup_completed row carrying a user_id. Identical to Retention V2's account
 * anchor (cohorts.ts accountUnits); a parity test keeps them identical.
 */
export function accountSignupAnchors(ds: AnalyticsDataset): Map<string, { at: number; origin: SignupOrigin }> {
  const out = new Map<string, { at: number; origin: SignupOrigin }>();
  for (const e of ds.events) {
    if (e.source_system !== "web" || e.event_name !== "signup_completed" || !e.user_id) continue;
    const at = ts(e.received_at);
    const cur = out.get(e.user_id);
    if (cur !== undefined && cur.at <= at) continue;
    const flag = e.metadata?.upgraded_from_guest;
    out.set(e.user_id, { at, origin: flag === true ? "guest_upgrade" : flag === false ? "direct" : "unknown" });
  }
  return out;
}

export const EMAIL_CONFIRMATION_NOT_APPLICABLE =
  "Not applicable: email confirmation is off in production (auto-confirm), so every account is confirmed at signup. Measuring it would repeat the signup count.";

export interface AccountActivationReport {
  /** Accounts whose signup anchor is in bounds. */
  cohort: Set<string>;
  guestUpgrades: Set<string>;
  /**
   * Guest-upgrade accounts with a server-confirmed guest start (is_guest = true)
   * received before signup. Only history inside the loaded range is visible,
   * so this is a floor. Direct signups have no guest history and are excluded.
   */
  playedBeforeSignup: Set<string>;
  playedBeforeSignupRate: Rate;
  /** Server-confirmed signed-in start in [signup, signup + 7d). */
  activated: Set<string>;
  activatedRate: Rate;
  activationTooRecent: Set<string>;
  /** Server-confirmed signed-in start in [signup + 24h, signup + 8d). */
  playedAgain: Set<string>;
  playedAgainRate: Rate;
  playedAgainTooRecent: Set<string>;
  emailConfirmation: { available: false; reason: string };
  unavailableReason?: string;
}

export function computeAccountActivation(
  ds: AnalyticsDataset,
  bounds: ConversionBounds,
  now: number,
  options: { truncated?: TruncationFlags } = {},
): AccountActivationReport {
  const anchors = accountSignupAnchors(ds);
  const guestStarts = new Map<string, number[]>();
  const signedInStarts = new Map<string, number[]>();
  for (const e of ds.events) {
    if (e.source_system !== "railway" || !e.user_id || !SERVER_STARTS.has(e.event_name)) continue;
    if (!anchors.has(e.user_id)) continue;
    if (e.is_guest === true) push(guestStarts, e.user_id, ts(e.received_at));
    else if (e.is_guest === false) push(signedInStarts, e.user_id, ts(e.received_at));
  }

  const cohort = new Set<string>();
  const guestUpgrades = new Set<string>();
  const playedBeforeSignup = new Set<string>();
  const activated = new Set<string>();
  const playedAgain = new Set<string>();
  const activationTooRecent = new Set<string>();
  const playedAgainTooRecent = new Set<string>();
  let activationEligible = 0;
  let playedAgainEligible = 0;

  for (const [u, { at, origin }] of anchors) {
    if (!within(at, bounds)) continue;
    cohort.add(u);
    if (origin === "guest_upgrade") {
      guestUpgrades.add(u);
      if ((guestStarts.get(u) ?? []).some((t) => t < at)) playedBeforeSignup.add(u);
    }
    const starts = signedInStarts.get(u) ?? [];
    if (at + ACTIVATION_WINDOW_MS > now) activationTooRecent.add(u);
    else {
      activationEligible += 1;
      if (starts.some((t) => t >= at && t < at + ACTIVATION_WINDOW_MS)) activated.add(u);
    }
    if (at + PLAYED_AGAIN_TO_MS > now) playedAgainTooRecent.add(u);
    else {
      playedAgainEligible += 1;
      if (starts.some((t) => t >= at + PLAYED_AGAIN_FROM_MS && t < at + PLAYED_AGAIN_TO_MS)) playedAgain.add(u);
    }
  }

  return {
    cohort,
    guestUpgrades,
    playedBeforeSignup,
    playedBeforeSignupRate: rate(playedBeforeSignup.size, guestUpgrades.size),
    activated,
    activatedRate: rate(activated.size, activationEligible),
    activationTooRecent,
    playedAgain,
    playedAgainRate: rate(playedAgain.size, playedAgainEligible),
    playedAgainTooRecent,
    emailConfirmation: { available: false, reason: EMAIL_CONFIRMATION_NOT_APPLICABLE },
    unavailableReason: truncationReason(options.truncated),
  };
}
