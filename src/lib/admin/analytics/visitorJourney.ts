import type { AnalyticsDataset, AnalyticsEventRecord } from "./metrics";
import { inRange, type AnalyticsRange } from "./range";
import type { VisitorClassification } from "./traffic";

export type AccountKind = "guest" | "registered" | "unknown";
export interface JourneyProfile { user_id: string; is_anonymous?: boolean | null; display_name?: string | null }
export interface JourneyAction { at: string; title: string; where: string; evidence: string; event?: AnalyticsEventRecord; stage?: number }
export interface VisitorJourney {
  id: string; kind: AccountKind; accountLabel: string; human: boolean;
  firstAt: string | null; lastAt: string | null; landing: string; source: string;
  sessions: number; returning: boolean; games: number; actions: JourneyAction[];
}

/** Only explicit browser/session correlation. Never join a server row by account UID. */
export function correlatedVisitor(e: AnalyticsEventRecord, sessions: Map<string, string>): string | null {
  const visitor = e.visitor_id ?? (typeof e.metadata?.visitor_id === "string" ? e.metadata.visitor_id : null);
  const session = e.session_id ?? (typeof e.metadata?.session_id === "string" ? e.metadata.session_id : null);
  const owner = session ? sessions.get(session) : undefined;
  if (visitor && owner && visitor !== owner) return null;
  return visitor ?? owner ?? null;
}

export function accountStatus(events: AnalyticsEventRecord[], profiles: JourneyProfile[] | null): {kind: AccountKind; label: string} {
  const ids = new Set(events.map(e => e.user_id).filter((id): id is string => Boolean(id)));
  if (ids.size && profiles !== null) {
    const found = profiles.filter(p => ids.has(p.user_id));
    if (found.length !== ids.size) return { kind: "unknown", label: "Guest or account status unverified — no current profile found" };
    if (found.every(p => p.is_anonymous === false)) return { kind: "registered", label: "Registered — current profile evidence" };
    if (found.every(p => p.is_anonymous === true)) return { kind: "guest", label: "Guest — current anonymous profile evidence" };
    return { kind: "unknown", label: "Account status mixed or unverified" };
  }
  const latest = [...events].filter(e => e.source_system === "web" && e.is_guest !== null)
    .sort((a,b) => Date.parse(b.received_at) - Date.parse(a.received_at))[0];
  if (latest?.is_guest === true) return { kind: "guest", label: "Guest — browser reported; current account unverified" };
  if (latest?.is_guest === false) return { kind: "registered", label: "Registered — browser reported; current account unverified" };
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
};

export function describeJourneyEvent(e: AnalyticsEventRecord): JourneyAction {
  const server = e.source_system === "railway";
  const round = e.event_name === "ranked_started" || e.event_name === "ranked_completed";
  let title = labels[e.event_name] ?? "Recorded an activity (meaning unavailable)";
  let stage: number | undefined;
  if (round) {
    let mode = "mode unknown";
    if (server && e.source_entity_type === "ranked_participant" && e.source_entity_id) {
      const host = e.metadata?.host;
      if (host === "direct") mode = "Ranked";
      if (host === "bonus_game") mode = "More Challenges";
      if (host === "role_challenge") mode = "Role Challenge";
      if (host === "daily_challenge" && e.metadata?.parent_activity_type === "daily_challenge"
        && typeof e.metadata.parent_activity_id === "string" && e.metadata.parent_activity_id) {
        mode = "Daily Challenge child round";
        const index = e.metadata.parent_stage_index;
        if (typeof index === "number" && Number.isInteger(index) && index >= 0) stage = index + 1;
      }
    }
    title = `Game round ${e.event_name === "ranked_started" ? "started" : "completed"} — ${mode}${stage ? ` · stage ${stage}` : ""}`;
    if (!server) title = `Browser reported ${title.toLowerCase()} (unconfirmed)`;
  }
  if (server && e.source_entity_id && e.source_entity_type === "quiz_session") {
    if (e.event_name === "practice_quiz_started") title = "Practice Quiz started";
    if (e.event_name === "practice_quiz_completed") title = "Practice Quiz completed";
  }
  return { at: e.received_at, title, where: e.route || "Location unavailable",
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
    const active = history.filter(s => inRange(Date.parse(s.started_at),range));
    const v = first.get(id);
    if (!events.length && !active.length && !(v && inRange(Date.parse(v.first_seen_at),range))) continue;
    const actions: JourneyAction[] = active.map(s => ({ at:s.started_at, title:history.indexOf(s)>0 ? "Returned in a new browser session" : "Started a browser session", where:s.landing_path || "Location unavailable", evidence:"Browser session record" }));
    actions.push(...events.map(describeJourneyEvent));
    actions.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    const account = accountStatus(events,profiles);
    const games = new Set(events.filter(e=>e.source_system === "railway" && e.event_name === "ranked_started" && e.source_entity_type === "ranked_participant" && e.source_entity_id).map(e=>e.source_entity_id));
    let source = v?.first_utm_source || "Direct / source unknown";
    if (!v?.first_utm_source && v?.first_referrer) { try { source = new URL(v.first_referrer).hostname; } catch { source="Source unknown"; } }
    out.push({ id, kind:account.kind, accountLabel:account.label, human:cls === "human", firstAt:v?.first_seen_at ?? history[0]?.started_at ?? null,
      lastAt:actions[0]?.at ?? v?.first_seen_at ?? null, landing:v?.first_landing_path || "Landing unavailable", source,
      sessions:active.length, returning:active.some(s=>history.indexOf(s)>0), games:games.size, actions });
  }
  return out.sort((a,b)=>Date.parse(b.lastAt ?? "")-Date.parse(a.lastAt ?? ""));
}
