import { describe, expect, it } from "vitest";
import type { AnalyticsDataset, AnalyticsEventRecord, AnalyticsSessionRecord } from "./metrics";
import { resolveRange } from "./range";
import { classifyVisitors } from "./traffic";
import { accountStatus, buildVisitorJourneys, correlatedVisitor, describeJourneyEvent } from "./visitorJourney";

const now = Date.parse("2026-10-20T01:29:00Z");
const range = resolveRange("7d", now);
const at = "2026-10-19T12:00:00Z";
const event = (patch: Partial<AnalyticsEventRecord> = {}): AnalyticsEventRecord => ({
  event_name: "landing_viewed", received_at: at, visitor_id: "v1", session_id: "s1", user_id: null,
  is_guest: true, source_system: "web", source_entity_type: null, source_entity_id: null,
  verification_type: null, metadata: null, route: "/", ...patch,
});
const session = (patch: Partial<AnalyticsSessionRecord> = {}): AnalyticsSessionRecord => ({
  session_id: "s1", visitor_id: "v1", started_at: at, landing_path: "/", referrer: null,
  utm_source: null, utm_medium: null, utm_campaign: null, traffic_class: "human", ...patch,
});
const dataset = (events: AnalyticsEventRecord[], sessions = [session()]): AnalyticsDataset => ({ events, sessions, visitors: [] });
const project = (ds: AnalyticsDataset) => buildVisitorJourneys(ds, range, classifyVisitors(ds), []);
const round = (metadata: Record<string, unknown> | null = null) => event({ event_name: "ranked_completed", source_system: "railway", source_entity_type: "ranked_participant", source_entity_id: "participant-1", metadata });

describe("visitor identity evidence", () => {
  it("missing profile never proves guest, deletion or purge", () => {
    expect(accountStatus([event({ user_id: "missing", is_guest: false })], [])).toEqual({ kind: "unknown", label: "Guest or account status unverified — no current profile found" });
  });
  it("successful current profiles distinguish registered and anonymous accounts", () => {
    const events = [event({ user_id: "u1" })];
    expect(accountStatus(events, [{ user_id: "u1", is_anonymous: false }]).kind).toBe("registered");
    expect(accountStatus(events, [{ user_id: "u1", is_anonymous: true }]).kind).toBe("guest");
  });
  it("failed profile lookup and signed-in browser claims cannot establish registration", () => {
    expect(accountStatus([event({ user_id: "u1", is_guest: false })], null).kind).toBe("unknown");
    expect(accountStatus([event({ is_guest: false })], []).kind).toBe("unknown");
  });
  it("guest browser signal is labeled as reported evidence", () => {
    expect(accountStatus([event()], []).kind).toBe("guest");
    expect(accountStatus([event()], []).label).toContain("browser reported");
  });
  it("latest identity can be registered after an anonymous identity without inventing signup", () => {
    expect(accountStatus([event({ user_id: "old" }), event({ user_id: "new", received_at: "2026-10-19T13:00:00Z" })], [{ user_id: "new", is_anonymous: false }]).kind).toBe("registered");
  });
});

describe("round provenance", () => {
  it("route and ranked engine name cannot turn a round into Daily", () => {
    const action = describeJourneyEvent({ ...round(), route: "/quiz/daily-challenge" });
    expect(action.title).toBe("game round (host not recorded) completed");
    expect(action.stage).toBeUndefined();
    expect(action.where).toBe("Daily Challenge page");
  });
  it("Daily requires canonical server host plus parent; child completion is not parent completion", () => {
    const action = describeJourneyEvent(round({ host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "run1", parent_stage_index: 2 }));
    expect(action.title).toBe("Daily Challenge stage 3 completed");
    expect(action.kind).toBe("stage_end");
    expect(describeJourneyEvent(round({ host: "daily_challenge" })).title).toBe("game round (Daily host without a Daily run id) completed");
  });
  it("names the Daily stage kind only from the recorded parent kind", () => {
    const meta = { host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "run1", parent_stage_index: 1 };
    expect(describeJourneyEvent(round({ ...meta, parent_stage_kind: "time_trial" })).title).toBe("Daily Challenge stage 2 (Time Trial) completed");
    expect(describeJourneyEvent(round({ ...meta, parent_stage_kind: "made_up" })).title).toBe("Daily Challenge stage 2 completed");
  });
  it("Role and More Challenges labels require canonical host evidence", () => {
    expect(describeJourneyEvent(round({ host: "role_challenge" })).title).toBe("Role Challenge completed");
    expect(describeJourneyEvent(round({ host: "bonus_game" })).title).toBe("More Challenges (mode not recorded) completed");
    expect(describeJourneyEvent(round({ host: "bonus_game", session_preset: "bonus.survival" })).title).toBe("More Challenges · Survival completed");
    expect(describeJourneyEvent(round({ host: "bonus_game", session_preset: "bonus.not_a_mode" })).title).toBe("More Challenges (mode not recorded) completed");
    const web = describeJourneyEvent({ ...round({ host: "bonus_game" }), source_system: "web" });
    expect(web.title).toBe("Browser reported a game round completed (unconfirmed)");
    expect(web.category).toBe("unknown");
  });
  it("direct Ranked is a bot or a player only when both opponent facts are recorded", () => {
    expect(describeJourneyEvent(round({ host: "direct" })).title).toBe("Ranked-engine match (opponent type not recorded) completed");
    expect(describeJourneyEvent(round({ host: "direct", opponent_type: "bot" })).category).toBe("unknown");
    expect(describeJourneyEvent(round({ host: "direct", opponent_type: "bot", is_bot_match: true })).title).toBe("Ranked match against a bot (unrated) completed");
    expect(describeJourneyEvent(round({ host: "direct", opponent_type: "human", is_bot_match: false })).title).toBe("Ranked match against another player completed");
    // Contradictory provenance is not resolved in either direction.
    expect(describeJourneyEvent(round({ host: "direct", opponent_type: "human", is_bot_match: true })).category).toBe("unknown");
    expect(describeJourneyEvent(round({ host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "r1" })).stage).toBeUndefined();
  });
  it("a Daily child round recorded with a bot opponent is a Daily stage, never Ranked", () => {
    const action = describeJourneyEvent(round({ host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "r1", parent_stage_index: 0, opponent_type: "bot", is_bot_match: true }));
    expect(action.category).toBe("daily_stage");
    expect(action.title).not.toContain("Ranked");
  });
  it("other hosts keep their own names", () => {
    expect(describeJourneyEvent(round({ host: "playtest" })).category).toBe("playtest");
    expect(describeJourneyEvent(round({ host: "journey_library" })).category).toBe("journey_library");
    expect(describeJourneyEvent(round({ host: "study_hall" })).category).toBe("study_hall");
  });
});

describe("action kinds and Daily entry", () => {
  it("separates page view, click, game start and stage completion", () => {
    expect(describeJourneyEvent(event({ event_name: "hub_entered" })).kind).toBe("page_view");
    expect(describeJourneyEvent(event({ event_name: "leaguecraft_cta_clicked" })).kind).toBe("click");
    const meta = { host: "daily_challenge", parent_activity_type: "daily_challenge", parent_activity_id: "r1", parent_stage_index: 0 };
    expect(describeJourneyEvent({ ...round(meta), event_name: "ranked_started" }).kind).toBe("game_start");
    expect(describeJourneyEvent(round(meta)).kind).toBe("stage_end");
    expect(describeJourneyEvent(round({ host: "role_challenge" })).kind).toBe("game_end");
    expect(describeJourneyEvent(event({ event_name: "something_new" })).kind).toBe("other");
  });
  it("names the Daily button from the recorded control and nothing more", () => {
    const click = (control: unknown) => describeJourneyEvent(event({ event_name: "daily_challenge_entry_clicked", metadata: { entry_surface: "home_hub", control } }));
    expect(click("academy_core_daily_button").title).toBe("Pressed the Daily Challenge button on the Home Hub (Academy)");
    expect(click("play_seal_ranked_closed").title).toContain("while Ranked was not open");
    expect(click("totally_new").title).toBe("Pressed a Daily Challenge button (which one is not recognised)");
    expect(click(undefined).kind).toBe("click");
  });
  it("names the More Challenges mode that was pressed", () => {
    const sel = (metadata: Record<string, unknown>) => describeJourneyEvent(event({ event_name: "more_challenges_mode_selected", metadata })).title;
    expect(sel({ game_mode_id: "time_trial", action: "play", source: "hub" })).toBe("Pressed Play on Time Trial in More Challenges");
    expect(sel({ game_mode_id: "time_trial", action: "rules" })).toBe("Opened the rules for Time Trial in More Challenges");
    expect(sel({ game_mode_id: "nope", action: "play" })).toBe("Selected a More Challenges mode");
  });
});

describe("bounded browser chronology", () => {
  it("never links account-only gameplay to a browser", () => {
    const ds = dataset([event({ user_id: "u1" }), { ...round(), visitor_id: null, session_id: null, user_id: "u1" }]);
    expect(project(ds)[0]?.actions).toHaveLength(2);
  });
  it("rejects conflicting explicit browser/session evidence", () => {
    expect(correlatedVisitor(event({ visitor_id: "other" }), new Map([["s1", "v1"]]))).toBeNull();
    expect(correlatedVisitor(event({ metadata: { visitor_id: "other" } }), new Map())).toBeNull();
    expect(correlatedVisitor(event({ metadata: { session_id: "other" } }), new Map())).toBeNull();
  });
  it("last observed activity is the received timestamp, never an exit", () => {
    const journeys = project(dataset([event({ received_at: "2026-10-19T13:00:00Z" })]));
    expect(journeys[0]?.lastAt).toBe("2026-10-19T13:00:00Z");
    expect(journeys[0]?.actions.map(a => a.title)).toEqual(["Viewed the entrance", "Started a browser session"]);
    expect(journeys[0]).not.toHaveProperty("exitAt");
  });
  it("earlier recorded sessions establish a return but are not in-range actions", () => {
    const journeys = project(dataset([event()], [session({ session_id: "old", started_at: "2026-10-01T00:00:00Z" }), session()]));
    expect(journeys[0]?.returning).toBe(true);
    expect(journeys[0]?.sessions).toBe(1);
    expect(journeys[0]?.actions.some(a => a.title === "Returned in a new browser session")).toBe(true);
  });
  it("an active pre-range session counts without inventing a new session start", () => {
    const journeys = project(dataset([event()], [session({ started_at: "2026-10-12T00:00:00Z" })]));
    expect(journeys[0]?.sessions).toBe(1);
    expect(journeys[0]?.actions).toHaveLength(1);
  });
  it("zero activity is empty and internal traffic is not audience", () => {
    expect(project(dataset([], []))).toEqual([]);
    expect(project(dataset([event()], [session({ traffic_class: "internal" })]))).toEqual([]);
  });
  it("signup completion remains a browser report, not an auth creation milestone", () => {
    expect(describeJourneyEvent(event({ event_name: "signup_completed" })).title).toBe("Browser reported signup completion");
  });
});