/**
 * USERS2.3A — governed activity lifecycle vocabulary.
 *
 * This registry describes existing product authority; it does not emit events
 * or decide business state. Instrumentation may consume it later, but product
 * code remains the source of every transition named below.
 */

export const ACTIVITY_TERMINAL_OUTCOMES = [
  "completed",
  "abandoned",
  "expired",
  "failed",
  "cancelled",
] as const;

export type ActivityTerminalOutcome = (typeof ACTIVITY_TERMINAL_OUTCOMES)[number];
export type ActivityOwner = "browser" | "server" | "browser_and_server";
export type ActivityAuthority = {
  owner: ActivityOwner;
  boundary: string;
};

export type ActivityLifecycleDefinition = {
  activityId: string;
  humanName: string;
  opened: ActivityAuthority;
  started: ActivityAuthority;
  terminal: ActivityAuthority;
  entityGrain: string;
  entityId: string;
  validTerminalOutcomes: readonly ActivityTerminalOutcome[];
  currentEvents: readonly string[];
  migrationNotes: string;
};

const activity = <const T extends ActivityLifecycleDefinition>(definition: T): T => definition;

/**
 * Bounded, user-meaningful product work only. Hubs, reference pages, history,
 * analytics/exploration views, admin tools and individual child questions are
 * not separate activities. See docs/USERS2_ACTIVITY_LIFECYCLE.md for scope and
 * the authority gaps hidden by today's event names.
 */
export const ACTIVITY_LIFECYCLE_REGISTRY = [
  activity({
    activityId: "daily_challenge",
    humanName: "Daily Challenge",
    opened: { owner: "browser", boundary: "Daily Challenge entry/run surface is intentionally shown." },
    started: { owner: "server", boundary: "POST /api/daily-challenge/today creates or resumes today's parent run." },
    terminal: { owner: "server", boundary: "Parent DailyRun reaches status=completed; child Ranked stages are not separate activity terminals." },
    entityGrain: "one account's dated Daily Challenge parent run",
    entityId: "daily run_id (with plan_date as the natural uniqueness context)",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed"],
    currentEvents: [],
    migrationNotes: "Add a daily_challenge lifecycle; never reuse retired DSA names or count child Ranked milestones as Daily completion.",
  }),
  activity({
    activityId: "practice_quiz",
    humanName: "Practice / Study Hall",
    opened: { owner: "browser", boundary: "A user chooses a live Practice set/category and the runner is shown." },
    started: { owner: "server", boundary: "Quiz session is created by POST /api/quiz/sessions." },
    terminal: { owner: "server", boundary: "The quiz session completion endpoint persists completed_at." },
    entityGrain: "one quiz session, regardless of standard/category/builder/missed entry path",
    entityId: "quiz_sessions.id / quiz_session source entity id",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed", "cancelled"],
    currentEvents: ["practice_quiz_opened", "practice_quiz_started", "practice_quiz_completed", "quiz_completed", "practice_missed_started", "practice_builder_set_run"],
    migrationNotes: "Railway practice_quiz_* is authoritative. Retire quiz_completed as a lifecycle event; keep it only as a temporary UI diagnostic until consumers migrate.",
  }),
  activity({
    activityId: "ranked_match",
    humanName: "Ranked",
    opened: { owner: "browser", boundary: "The public Ranked lobby/queue surface is reached." },
    started: { owner: "server", boundary: "A participant is attached to a created match; queue join alone is pre-start intent." },
    terminal: { owner: "server", boundary: "Backend match settlement records combat, forfeit, or no-contest outcome." },
    entityGrain: "one participant in one Ranked match",
    entityId: "ranked_participant = match_id:user_id",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed", "cancelled"],
    currentEvents: ["ranked_opened", "ranked_started", "ranked_completed"],
    migrationNotes: "Map combat settlement to completed, explicit pre-settlement forfeit to abandoned, no-contest/invalidated matches to cancelled, and server timeout/expiry only to expired. Queue cancellation is not a terminal match.",
  }),
  activity({
    activityId: "champion_mastery",
    humanName: "Champion Mastery",
    opened: { owner: "browser", boundary: "Authenticated user reaches the Mastery journeys surface." },
    started: { owner: "server", boundary: "POST /api/mastery/sessions returns a persisted mastery session." },
    terminal: { owner: "server", boundary: "Mastery session reports completed and exposes its server summary." },
    entityGrain: "one mastery session for one mastery set",
    entityId: "mastery session_id",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed", "cancelled"],
    currentEvents: ["mastery_opened", "mastery_started", "mastery_completed"],
    migrationNotes: "Keep Railway mastery_* authority; add only missing explicit terminal outcomes against the same session id.",
  }),
  activity({
    activityId: "meta_reflex_round",
    humanName: "Meta Reflex",
    opened: { owner: "browser", boundary: "A specific live Meta Reflex game surface is reached, not merely the picker hub." },
    started: { owner: "browser", boundary: "A matchup is dealt and assigned a client_submission_id." },
    terminal: { owner: "server", boundary: "recordSwipeResult accepts/deduplicates that client_submission_id and returns the canonical round result." },
    entityGrain: "one dealt Meta Reflex matchup/attempt, not an unbounded visit",
    entityId: "client_submission_id",
    validTerminalOutcomes: ["completed", "abandoned", "failed", "cancelled"],
    currentEvents: ["meta_reflex_opened"],
    migrationNotes: "Existing opened event is hub reach and must not stand in for a round open/start. Retire unused meta_reflex_started/completed reserved names unless they are redefined at this round grain.",
  }),
  activity({
    activityId: "leaguecraft_matchup_study",
    humanName: "Leaguecraft Matchup Study",
    opened: { owner: "browser", boundary: "The two-champion Matchup Study route renders with a valid requested pair." },
    started: { owner: "server", boundary: "POST /api/quiz/matchup/sessions creates the frozen study session." },
    terminal: { owner: "server", boundary: "The returned session state reaches complete=true after its final graded answer." },
    entityGrain: "one server-frozen matchup study session",
    entityId: "matchup session_id",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed", "cancelled"],
    currentEvents: [],
    migrationNotes: "Add lifecycle events at session grain; do not fold these sessions into Practice quiz_sessions.",
  }),
  activity({
    activityId: "pro_play_quiz",
    humanName: "Pro Play Quiz",
    opened: { owner: "browser", boundary: "The Pro Play Quiz route is intentionally reached." },
    started: { owner: "server", boundary: "POST /api/pro-play/quiz/sessions creates the frozen ten-question session." },
    terminal: { owner: "server", boundary: "The returned session state reaches complete=true after its final graded answer." },
    entityGrain: "one Pro Play quiz session",
    entityId: "pro play session_id",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed", "cancelled"],
    currentEvents: [],
    migrationNotes: "Add server-correlated lifecycle events; route load and successful session creation are different boundaries.",
  }),
  activity({
    activityId: "stat_check_bot_match",
    humanName: "Stat Check — Bot Match",
    opened: { owner: "browser", boundary: "The public bot match board is mounted." },
    started: { owner: "browser", boundary: "The player commits the first gameplay decision after the opening item choice." },
    terminal: { owner: "browser", boundary: "The local engine reaches match over, or Restart explicitly replaces a started match." },
    entityGrain: "one local Stat Check match",
    entityId: "new browser-generated match instance id required",
    validTerminalOutcomes: ["completed", "abandoned", "failed", "cancelled"],
    currentEvents: [],
    migrationNotes: "No durable authority or stable instance id exists. Browser close can only support inferred abandonment after a declared timeout.",
  }),
  activity({
    activityId: "stat_check_private_match",
    humanName: "Stat Check — Private Match",
    opened: { owner: "browser", boundary: "A private room surface is reached by create or invite." },
    started: { owner: "server", boundary: "Room/match authority accepts both players and transitions the match into play." },
    terminal: { owner: "server", boundary: "Authoritative online match state reaches its terminal winner/draw/cancellation state." },
    entityGrain: "one private Stat Check match",
    entityId: "server match id (invite code identifies the room, not the match)",
    validTerminalOutcomes: ["completed", "abandoned", "expired", "failed", "cancelled"],
    currentEvents: [],
    migrationNotes: "Instrument the server match id. Room expiry before match start is not an expired activity; disconnect adjudication after start may be abandoned or cancelled by policy.",
  }),
  activity({
    activityId: "onboarding",
    humanName: "Academy Welcome",
    opened: { owner: "browser", boundary: "The live /welcome Academy introduction is rendered." },
    started: { owner: "browser", boundary: "The visitor intentionally advances beyond the arrival chapter." },
    terminal: { owner: "browser", boundary: "markAcademyWelcomeHandled persists explored (completed) or signed-in (cancelled) for v1 before navigation." },
    entityGrain: "one Academy introduction contract version per browser visitor",
    entityId: "analytics visitor_id + academy welcome version (v1 storage contract)",
    validTerminalOutcomes: ["completed", "abandoned", "cancelled"],
    currentEvents: [],
    migrationNotes: "Instrument the live browser-local Academy flow. The legacy profiles.onboarding_completed / OnboardingFlow is Admin-preview-only and must not be revived as lifecycle authority.",
  }),
] as const satisfies readonly ActivityLifecycleDefinition[];

export type ActivityId = (typeof ACTIVITY_LIFECYCLE_REGISTRY)[number]["activityId"];

export const ACTIVITY_LIFECYCLE_BY_ID: Readonly<Record<ActivityId, (typeof ACTIVITY_LIFECYCLE_REGISTRY)[number]>> =
  Object.fromEntries(ACTIVITY_LIFECYCLE_REGISTRY.map((entry) => [entry.activityId, entry])) as
    Record<ActivityId, (typeof ACTIVITY_LIFECYCLE_REGISTRY)[number]>;
