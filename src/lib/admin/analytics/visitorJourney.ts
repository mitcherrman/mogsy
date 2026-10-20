import type { AnalyticsDataset, AnalyticsEventRecord } from "./metrics";
import { inRange, type AnalyticsRange } from "./range";
import type { VisitorClassification } from "./traffic";
import { attributeRound, isServerRound } from "./roundAttribution";
import { PUBLIC_MODE_TITLES, isPublicModeId } from "@/lib/public-modes/contracts";
import { DAILY_ENTRY_CONTROLS, type DailyEntryControl } from "@/lib/analytics/dailyEntry";

export type AccountKind = "guest" | "registered" | "unknown";
export interface JourneyProfile { user_id: string; is_anonymous?: boolean | null; display_name?: string | null }
/**
 * What KIND of observation an action is, so a page view, a button press, a
 * game start and a finished stage are never read as one another.
 *  - page_view   a page/screen was opened (browser)
 *  - click       a control was pressed (browser)
 *  - game_start  the server created a participant round / practice session
 *  - stage_end   the server recorded a Daily stage's match as completed
 *  - game_end    the server recorded another game as completed
 *  - session     the browser session record, not an in-page action
 *  - other       anything else recorded
 * A finished WHOLE Daily Challenge is deliberately absent: no event records it.
 */
export type ActionKind = "page_view" | "click" | "game_start" | "stage_end" | "game_end" | "session" | "other";
export const ACTION_KIND_LABELS: Readonly<Record<ActionKind, string>> = {
  page_view: "Page view", click: "Button click", game_start: "Game start",
  stage_end: "Stage completed", game_end: "Game completed", session: "Session", other: "Recorded signal",
};
export interface JourneyAction { at: string; title: string; where: string; evidence: string; kind?: ActionKind; event?: AnalyticsEventRecord; stage?: number; category?: string }
export interface VisitorJourney {
  id: string; kind: AccountKind; accountLabel: string; human: boolean;
  firstAt: string | null; lastAt: string | null; landing: string; source: string;
  sessions: number; returning: boolean; games: number; actions: JourneyAction[];
}

/** Only explicit browser/session correlation. Never join a server row by account UID. */
export function correlatedVisitor(e: AnalyticsEventRecord, sessions: Map<string, string>): string | null {
  if (e.visitor_id && typeof e.metadata?.visitor_id === "string" && e.visitor_id !== e.metadata.visitor_id) return null;
  if (e.session_id && typeof e.metadata?.session_id === "string" && e.session_id !== e.metadata.session_id) return null;
  const visitor = e.visitor_id ?? (typeof e.metadata?.visitor_id === "string" ? e.metadata.visitor_id : null);
  const session = e.session_id ?? (typeof e.metadata?.session_id === "string" ? e.metadata.session_id : null);
  const owner = session ? sessions.get(session) : undefined;
  if (visitor && owner && visitor !== owner) return null;
  return visitor ?? owner ?? null;
}

export function accountStatus(events: AnalyticsEventRecord[], profiles: JourneyProfile[] | null): {kind: AccountKind; label: string} {
  // Current status follows the latest observed identity, not every identity
  // this shared browser has ever used. It is never a signup chronology.
  const latestIdentity = [...events].filter(e => e.user_id)
    .sort((a,b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0];
  const ids = new Set(latestIdentity?.user_id ? [latestIdentity.user_id] : []);
  if (ids.size && profiles !== null) {
    const found = profiles.filter(p => ids.has(p.user_id));
    if (found.length !== ids.size) return { kind: "unknown", label: "Guest or account status unverified — no current profile found" };
    if (found.every(p => p.is_anonymous === false)) return { kind: "registered", label: "Registered — current profile evidence" };
    if (found.every(p => p.is_anonymous === true)) return { kind: "guest", label: "Guest — current anonymous profile evidence" };
    return { kind: "unknown", label: "Account status mixed or unverified" };
  }
  if (ids.size) return { kind: "unknown", label: "Guest or account status unverified — current profile lookup unavailable" };
  const latest = [...events].filter(e => e.source_system === "web" && typeof e.is_guest === "boolean")
    .sort((a,b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0];
  if (latest?.is_guest === true) return { kind: "guest", label: "Guest — browser reported; current account unverified" };
  return { kind: "unknown", label: "Guest or account status unverified" };
}

const labels: Record<string,string> = {
  landing_viewed: "Viewed the entrance", hub_entered: "Opened Academy", leaguecraft_opened: "Opened the games hub",
  ranked_opened: "Opened Ranked", practice_quiz_opened: "Opened Practice Quiz",
  more_challenges_viewed: "Viewed More Challenges", more_challenges_mode_selected: "Selected a More Challenges mode",
  signup_viewed: "Viewed signup", signup_started: "Started filling in signup", signup_completed: "Browser reported signup completion",
  signup_offer_shown: "Saw a signup invitation", signup_offer_clicked: "Clicked a signup invitation", signup_offer_dismissed: "Dismissed a signup invitation",
  quiz_question_answered: "Answered a quiz question", quiz_completed: "Browser reported quiz results",
  quiz_guest_continue_clicked: "Chose to continue as guest", playtest_scene_viewed: "Viewed a playtest scene",
  leaguecraft_cta_clicked: "Selected a game entry", signup_failed: "Browser reported signup failure",
  login_completed: "Browser reported sign-in", quiz_question_viewed: "Viewed a quiz question",
};

const KIND_BY_EVENT: Record<string, ActionKind> = {
  landing_viewed: "page_view", hub_entered: "page_view", leaguecraft_opened: "page_view", ranked_opened: "page_view",
  practice_quiz_opened: "page_view", more_challenges_viewed: "page_view", signup_viewed: "page_view",
  playtest_scene_viewed: "page_view", quiz_question_viewed: "page_view",
  more_challenges_mode_selected: "click", signup_offer_clicked: "click", signup_offer_dismissed: "click",
  quiz_guest_continue_clicked: "click", leaguecraft_cta_clicked: "click", daily_challenge_entry_clicked: "click",
};

/** Route names are location evidence, never proof of a game's host. */
export function journeyLocation(route: string | null | undefined): string {
  const path = route?.split(/[?#]/)[0];
  if (!path) return "Location unavailable";
  if (path === "/") return "Entrance";
  if (path === "/lol") return "Academy";
  if (path === "/quiz") return "Games hub";
  if (path.startsWith("/quiz/daily-challenge")) return "Daily Challenge page";
  if (path.startsWith("/quiz/role-challenge")) return "Role Challenge page";
  if (path.startsWith("/quiz/ranked")) return "Ranked game page";
  if (path.startsWith("/quiz/")) return "Game page";
  if (path.startsWith("/lol/pro-play")) return "Pro Play page";
  if (path.startsWith("/combat-lab")) return "Combat Lab";
  if (path.startsWith("/auth")) return "Account page";
  return "Website page";
}

const DAILY_ENTRY_TITLES: Record<DailyEntryControl, string> = {
  academy_core_daily_button: "Pressed the Daily Challenge button on the Home Hub (Academy)",
  play_seal_ranked_closed: "Pressed PLAY in Leaguecraft while Ranked was not open (it opened the Daily Challenge)",
  play_scroll_daily_clause: "Chose Daily Challenge on the Leaguecraft match-entry record",
  play_scroll_resume_optional: "Pressed continue-optional-stages on the Leaguecraft record (Daily Challenge)",
  centre_stage_daily_panel: "Pressed the Daily Challenge panel in the Leaguecraft lobby",
};

function moreChallengesSelected(e: AnalyticsEventRecord): string {
  const id = e.metadata?.game_mode_id;
  const action = e.metadata?.action;
  const mode = typeof id === "string" && isPublicModeId(id) ? PUBLIC_MODE_TITLES[id] : null;
  if (!mode) return labels.more_challenges_mode_selected;
  return action === "rules" ? `Opened the rules for ${mode} in More Challenges`
    : action === "play" ? `Pressed Play on ${mode} in More Challenges` : `Selected ${mode} in More Challenges`;
}

export function describeJourneyEvent(e: AnalyticsEventRecord): JourneyAction {
  const server = e.source_system === "railway";
  const round = e.event_name === "ranked_started" || e.event_name === "ranked_completed";
  let title = labels[e.event_name] ?? "Recorded an activity (meaning unavailable)";
  let kind: ActionKind = KIND_BY_EVENT[e.event_name] ?? "other";
  let stage: number | undefined;
  let category: string | undefined;
  if (e.event_name === "daily_challenge_entry_clicked") {
    const control = e.metadata?.control;
    title = typeof control === "string" && control in DAILY_ENTRY_CONTROLS
      ? DAILY_ENTRY_TITLES[control as DailyEntryControl]
      : "Pressed a Daily Challenge button (which one is not recognised)";
  }
  if (e.event_name === "more_challenges_mode_selected") title = moreChallengesSelected(e);
  if (round) {
    const started = e.event_name === "ranked_started";
    const attribution = attributeRound(e);
    category = attribution.category;
    stage = attribution.stage;
    if (isServerRound(e)) {
      title = `${attribution.label} ${started ? "started" : "completed"}`;
      kind = started ? "game_start" : attribution.category === "daily_stage" ? "stage_end" : "game_end";
    } else {
      title = `Browser reported a game round ${started ? "started" : "completed"} (unconfirmed)`;
      kind = started ? "game_start" : "game_end";
    }
  }
  if (server && e.source_entity_id && e.source_entity_type === "quiz_session") {
    if (e.event_name === "practice_quiz_started") { title = "Practice Quiz started"; kind = "game_start"; category = "practice_quiz"; }
    if (e.event_name === "practice_quiz_completed") { title = "Practice Quiz completed"; kind = "game_end"; }
  }
  return { at: e.received_at, title, where: journeyLocation(e.route), kind, category,
    evidence: server && e.source_entity_id ? "Server record · received timestamp" : e.source_system === "web" ? "Browser observation · received timestamp" : "Recorded signal · authority unverified", event: e, stage };
}

export function buildVisitorJourneys(ds: AnalyticsDataset, range: AnalyticsRange, classes: Map<string, VisitorClassification>, profiles: JourneyProfile[] | null): VisitorJourney[] {
  const sessionOwners = new Map(ds.sessions.map(s => [s.session_id, s.visitor_id]));
  const indexed = new Map<string, AnalyticsEventRecord[]>();
  for (const e of ds.events) {
    if (!inRange(Date.parse(e.received_at), range)) continue;
    const id = correlatedVisitor(e, sessionOwners);
    if (!id) continue;
    const list = indexed.get(id) ?? []; list.push(e); indexed.set(id,list);
  }
  const visits = new Map<string, typeof ds.sessions>();
  for (const s of ds.sessions) { const list=visits.get(s.visitor_id) ?? []; list.push(s); visits.set(s.visitor_id,list); }
  const first = new Map(ds.visitors.map(v => [v.visitor_id,v]));
  const ids = new Set([...first.keys(), ...visits.keys(), ...indexed.keys()]);
  const out: VisitorJourney[] = [];
  for (const id of ids) {
    const cls = classes.get(id)?.trafficClass ?? "unknown";
    if (cls !== "human" && cls !== "unknown") continue;
    const events = indexed.get(id) ?? [];
    const history = [...(visits.get(id) ?? [])].filter(s => Date.parse(s.started_at) <= range.end).sort((a,b)=>Date.parse(a.started_at)-Date.parse(b.started_at));
    const eventSessions = new Set(events.map(e => e.session_id ?? e.metadata?.session_id));
    const active = history.filter(s => inRange(Date.parse(s.started_at),range) || eventSessions.has(s.session_id));
    const v = first.get(id);
    if (!events.length && !active.length && !(v && inRange(Date.parse(v.first_seen_at),range))) continue;
    const actions: JourneyAction[] = active.filter(s => inRange(Date.parse(s.started_at),range)).map(s => ({ at:s.started_at, title:history.indexOf(s)>0 ? "Returned in a new browser session" : "Started a browser session", where:journeyLocation(s.landing_path), evidence:"Browser session record", kind:"session" as ActionKind }));
    actions.push(...events.map(describeJourneyEvent));
    actions.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const account = accountStatus(events,profiles);
    const games = new Set(events.filter(e=>e.source_system === "railway" && e.event_name === "ranked_started" && e.source_entity_type === "ranked_participant" && e.source_entity_id).map(e=>e.source_entity_id));
    let source = v?.first_utm_source || "Direct / source unknown";
    if (!v?.first_utm_source && v?.first_referrer) { try { source = new URL(v.first_referrer).hostname; } catch { source="Source unknown"; } }
    out.push({ id, kind:account.kind, accountLabel:account.label, human:cls === "human", firstAt:v?.first_seen_at ?? history[0]?.started_at ?? null,
      lastAt:actions[0]?.at ?? v?.first_seen_at ?? null, landing:journeyLocation(v?.first_landing_path), source,
      sessions:active.length, returning:active.some(s=>history.indexOf(s)>0), games:games.size, actions });
  }
  return out.sort((a,b)=>Date.parse(b.lastAt ?? "")-Date.parse(a.lastAt ?? ""));
}
