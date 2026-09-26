# USERS2.2 — Current analytics capability and instrumentation audit

Date: 2026-09-26  
Audit base: `users1-accounts-consolidation` (`953ea536`)  
Scope: frontend instrumentation, Supabase schema/functions, Railway gameplay delivery and records, and Admin › Users analytics calculations. This is a read-only capability audit; it implements no event or product changes.

## Executive conclusion

Mogzy has a sound foundation for browser-level audience, acquisition, sessions, selected funnel surfaces, account conversion, and D1/D7 browser retention. It also has a least-privilege, idempotent Railway-to-Supabase path for eight authoritative gameplay start/completion events. The current Admin surface correctly separates browser intent from Railway-confirmed outcomes and filters internal/automation traffic.

It does **not** yet have a complete behavioral analytics model. There is no active-time measurement, session end/leave event, visibility/idle heartbeat, general error/failure event, build/device context on analytics rows, explicit abandonment state, onboarding lifecycle event, or comprehensive activity vocabulary. Railway events usually carry `user_id` but no `visitor_id` or `session_id`, so they join to a browser journey only indirectly through another web event with the same user id. Anonymous Railway facts with `user_id = null` cannot be joined at all.

The status totals in this audit are:

| Status | Questions |
|---|---:|
| COMPLETE | 7 |
| PARTIAL | 15 |
| NOT CAPTURED | 3 |

`COMPLETE` means the current stores and calculations answer the stated question at their declared identity grain. It does not mean cross-device identity or perfect traffic detection.

## Current data architecture

### Canonical Supabase analytics

- `analytics_visitors`: one browser-local visitor UUID, immutable first touch (`first_seen_at`, landing path, referrer, UTM fields).
- `analytics_sessions`: one 30-minute-inactivity browser session, current touch and USERS1 traffic classification. It has `started_at` only—no last activity, end, active duration, page visibility, device, build, or account id.
- `analytics_events`: append-only event ledger with database `received_at`, emitter `occurred_at`, route, visitor/session/user identity, guest snapshot, source system/entity id, event version, verification type and free-form metadata.
- `analytics_traffic_overrides`: admin correction to derived visitor traffic class.
- Public clients may insert only `source_system = web`; Railway reaches the ledger through `railway-analytics-ingest`, which forces `source_system = railway` and an allow-listed contract.

### Browser identity and attribution

- Visitor id: `mogzy.analytics.visitor.v1` in localStorage; survives auth transitions and browser restarts, but not cleared storage, another browser/device, or some restricted/private contexts.
- Session id: `mogzy.analytics.session.v1` in localStorage; rolls after 30 minutes without a tracked event or when a different UTM campaign arrives. Navigation itself does not split a session.
- First touch: visitor table. Current touch: session table. Captured fields are full referrer, landing path, and `utm_source|medium|campaign|content|term`.
- No IP, geolocation, UA, browser, OS, viewport, screen size, locale, timezone, release, build, or commit is stored in canonical analytics.
- Human classification is promotion after trusted pointer/key input. This is traffic-quality evidence, not active engagement measurement.

### Railway delivery and richer gameplay records

Railway records authoritative transitions transactionally into SQLite `analytics_outbox`, drains them to the Supabase Edge Function, and relies on the unique key `(source_system,event_name,source_entity_type,source_entity_id)` for exactly-once storage. Outbox health exposes total, unsent, abandoned, dead-lettered, last sent, oldest unsent age, configuration, auth failures, and drainer liveness. Those are delivery-pipeline aggregates, not visitor/session failures.

Supabase receives only:

- `practice_quiz_started|completed` — `quiz_session/<session_id>`;
- `ranked_started|completed` — `ranked_participant/<match_id>:<user_id>`;
- `mastery_started|completed` — `mastery_session/<session_id>`;
- `dsa_started|completed` — reserved/allowed by the delivery contract, but the audited Railway integration branch contains no production DSA enqueue callsite. The standalone DSA frontend surface is retired; current Daily-hosted stages deliberately do not emit Ranked milestones.

Railway itself retains richer, siloed records. In particular, `quiz_attempts` and `quiz_sessions` support correctness, category, difficulty, question snapshots, start/completion and wall-clock `duration_seconds`; personal trends compare Practice/Time Trial periods with sample floors. Ranked, Daily Challenge and Mastery keep separate stores and are explicitly excluded from those personal trend calculations.

### Current Admin calculations

Admin loads events in the selected range by `received_at`, but loads sessions and visitors all-time so new/returning and retention can be derived. Aggregation is client-side and hard-capped at 50,000 rows per table; beyond the cap the UI reports truncation.

- Visitors: distinct visitor ids with a session start or browser event in range.
- Sessions: session start in range, plus sessions with browser events in range.
- New: first-ever visitor/session timestamp in range.
- Returning: an in-range session other than that visitor's first.
- Engaged session: at least one mode-open web event.
- Engaged visitor: a mode-open web event, or a Railway authoritative start joined through `user_id` to a browser visitor.
- Completion rate: count of Railway completion rows divided by Railway start rows, at each mode's documented entity grain. It is not a matched-start cohort calculation.
- Retention: rolling D1 `[+24h,+48h)` and D7 `[+7d,+8d)` windows, with too-recent visitors excluded.
- Acquisition: first-touch and session-touch source/medium/campaign/referrer breakdowns. No source-by-retention calculation exists.
- Timeline: visitor browser events plus Railway events lacking visitor id when their `user_id` is already known from browser events; sorted by database `received_at`.

## The 25 questions

### 1. Who comes?

```yaml
status: PARTIAL
current source: Supabase canonical analytics plus USERS1 traffic classification and optional profile linkage.
relevant event/table/field: analytics_visitors.visitor_id; analytics_sessions.traffic_class/traffic_source; analytics_events.user_id/is_guest; profiles when a uid is observed.
calculation currently used: Admin counts distinct visitor ids active in range and derives a visitor class by override, then internal > automation > human > unknown.
limitations: Identifies browsers, not people. No device, geography, demographics, browser/OS or cross-device identity. Unknown traffic is included by default. A visitor with no analytics event cannot link to an account.
exact missing instrumentation: Stable privacy-safe device/context fields and an explicit account-link observation; cross-device identity is impossible before sign-in by design.
recommended change: Keep visitor as the anonymous grain; add a versioned context snapshot and explicit identity_linked event when an authenticated uid becomes observable.
```

### 2. When do they come?

```yaml
status: COMPLETE
current source: Supabase visitors, sessions and events.
relevant event/table/field: analytics_visitors.first_seen_at; analytics_sessions.started_at; analytics_events.received_at/occurred_at.
calculation currently used: Admin uses UTC database/session timestamps and offers Today, 7d, 30d and all-time ranges plus UTC daily rows.
limitations: Admin groups events by received_at and sessions by started_at; no timezone/local-time dimension and emitter clock skew is not surfaced.
exact missing instrumentation: None required for arrival time; timezone is an optional segmentation enhancement.
recommended change: Add client timezone/locale context at session start if local-hour analysis becomes necessary.
```

### 3. New vs returning?

```yaml
status: COMPLETE
current source: analytics_visitors and all-time analytics_sessions, with event fallback.
relevant event/table/field: visitor_id; first_seen_at; session_id; started_at.
calculation currently used: New means earliest known first-seen is in range; returning means an active session is not the visitor's first-ever session. A person can be both within a wide range.
limitations: Browser-local only. Clearing storage or changing browser/device creates a new visitor; unavailable localStorage may inflate new visitors.
exact missing instrumentation: None at browser-visitor grain; authenticated cross-device cohorting would require an account-grain retention view.
recommended change: Preserve this browser metric and add a separately labelled account-level new/returning metric after sufficient signed-in volume.
```

### 4. Where did they come from?

```yaml
status: COMPLETE
current source: Immutable visitor first touch and per-session current touch.
relevant event/table/field: first_referrer/referrer and first_utm_*/utm_* on analytics_visitors/analytics_sessions.
calculation currently used: Admin normalizes source from UTM source first, then external referrer host, internal, or direct; it also breaks down medium, campaign and referrer.
limitations: Direct includes typed/bookmarked and referrer-stripped traffic. No click ids, ad platform ids or modeled attribution. UTM content/term are stored but not loaded into current Admin calculations.
exact missing instrumentation: Optional click-id fields and Admin exposure of utm_content/utm_term.
recommended change: Keep raw capture authoritative; add a versioned channel-classification layer and expose all stored UTM dimensions.
```

### 5. What landing page did they enter through?

```yaml
status: COMPLETE
current source: Visitor and session attribution rows.
relevant event/table/field: analytics_visitors.first_landing_path; analytics_sessions.landing_path.
calculation currently used: Captured from window.location.pathname at first touch/session start; visitor detail displays first landing path.
limitations: Query string is intentionally omitted, route aliases are not normalized, and Admin has no aggregate landing-page report.
exact missing instrumentation: No capture gap; only a landing-path aggregation/report is missing.
recommended change: Add first-touch and session-touch landing-path breakdowns using the existing fields.
```

### 6. Did they reach the Hub?

```yaml
status: COMPLETE
current source: Canonical web surface event.
relevant event/table/field: analytics_events.event_name = hub_entered, visitor_id, session_id, route.
calculation currently used: Once per session on /lol; Admin counts distinct visitors in range and offers drill-down.
limitations: Repeated Hub visits inside one session are deliberately deduplicated; a render that never reaches the enabled surface is not counted.
exact missing instrumentation: None for reach; raw revisit frequency would be a different metric.
recommended change: Retain the current surface semantic and document it as reach, not pageviews.
```

### 7. Did they start a meaningful activity?

```yaml
status: PARTIAL
current source: Browser mode-open events and Railway authoritative starts.
relevant event/table/field: *_opened web events; practice_quiz_started, ranked_started, mastery_started and contract-only dsa_started railway events.
calculation currently used: Engaged session = mode open. Engaged visitor = mode open or joinable Railway start.
limitations: Opening is intent, not start. Meta Reflex has no authoritative start. DSA has no audited production enqueue callsite. Many current product activities have no mode event. Anonymous Railway starts may have no joinable visitor.
exact missing instrumentation: Authoritative starts for every meaningful activity, carrying a browser correlation context where available.
recommended change: Define a product-wide activity registry and instrument one authoritative start boundary per activity; do not treat opens as starts.
```

### 8. What activities did they use?

```yaml
status: PARTIAL
current source: Canonical macro/product events, Railway milestones and mode-specific stores.
relevant event/table/field: mode-open events; builder/trends/DSA diagnostic names; Railway source_entity_type; route and metadata.
calculation currently used: Admin Activity reports five configured modes and visitor detail lists opened modes/server starts.
limitations: Vocabulary covers only selected Leaguecraft modes and diagnostics; Combat Lab, Stat Check, Pro Play, archives, patch reports, community and other surfaces are absent or only inferable from route. Some DSA names are legacy residue with no live producer.
exact missing instrumentation: Canonical activity_started/activity_completed coverage or an explicit registry mapping all current activities to existing events.
recommended change: Inventory current product capabilities and add only business-level lifecycle events, with activity_id as a governed dimension.
```

### 9. In what sequence?

```yaml
status: PARTIAL
current source: Ordered analytics_events within visitor/session plus Railway entity milestones.
relevant event/table/field: visitor_id, session_id, user_id, received_at, occurred_at, event_name, route, source_entity_id.
calculation currently used: Visitor detail sorts matching events newest-first by received_at.
limitations: Surface events are once-per-session, most UI transitions are absent, Railway events usually lack visitor/session ids, Admin does not load occurred_at, and received order may differ from action order after delivery delay.
exact missing instrumentation: A per-session monotonic sequence number or client event id, session correlation on backend calls, and lifecycle coverage for meaningful transitions.
recommended change: Propagate visitor_id/session_id plus a generated interaction/request correlation id to Railway; retain occurred_at in Admin reads and order with documented tie-breaking.
```

### 10. How long were they actively engaged?

```yaml
status: NOT CAPTURED
current source: None for active time. Railway quiz_sessions.duration_seconds is completion wall-clock for one mode only.
relevant event/table/field: analytics_sessions.started_at only; localStorage lastActivityAt is client-local and never persisted.
calculation currently used: No Admin duration calculation.
limitations: A 30-minute session boundary is not duration. No visibility state, focus, idle timeout, heartbeat, end timestamp or accumulated active milliseconds. Quiz duration includes inactive/background time.
exact missing instrumentation: Session activity heartbeat with visibility/focus/idle rules, accumulated active_ms, last_active_at and session_end reason.
recommended change: Add low-frequency active-time accumulation at session grain; never derive engagement from first-to-last wall clock alone.
```

### 11. What did they complete?

```yaml
status: PARTIAL
current source: Railway authoritative completions, web quiz_completed diagnostic, and mode-specific stores.
relevant event/table/field: practice_quiz_completed, ranked_completed, mastery_completed, dsa_completed; source entity keys and metadata.
calculation currently used: Admin counts Railway completion rows and unique users; completion rate is total completion rows / total start rows at each mode grain.
limitations: Meta Reflex and most non-gameplay activities lack completion. DSA delivery is not wired in the audited backend integration. Aggregate division does not match each completion to an in-range start cohort.
exact missing instrumentation: Authoritative completion/terminal outcome for uncovered activities and matched entity-cohort reporting.
recommended change: Add explicit terminal states (`completed`, `abandoned`, `expired`, `failed`) and calculate completion from matched entities, not independent totals.
```

### 12. Where did they abandon?

```yaml
status: PARTIAL
current source: Sparse event timelines and Railway mode stores.
relevant event/table/field: start without completion by source entity; incomplete quiz_sessions/mastery sessions; last web event in a session.
calculation currently used: No Admin abandonment calculation. Operators can manually infer some unmatched starts.
limitations: No session end or abandon event, no timeout taxonomy, no reliable exit moment, missing transitions, and unmatched delivery can look like abandonment.
exact missing instrumentation: Activity terminal event with reason and last_step/state; session_end/visibility context; delivery health linkage.
recommended change: Emit server-authoritative terminal outcomes where the server owns state and a client abandonment timeout only where no server terminal state exists.
```

### 13. What was the last meaningful state before leaving?

```yaml
status: PARTIAL
current source: Last recorded browser event and mode-specific persisted state.
relevant event/table/field: analytics_events event_name/route/metadata/received_at; Railway session/run phase tables.
calculation currently used: Visitor timeline shows the newest recorded event; no leaving calculation exists.
limitations: Last event is not necessarily last state, surface dedupe suppresses revisits, many state changes are uninstrumented, and leaving/background/crash is invisible.
exact missing instrumentation: Governed activity_state_changed checkpoints plus session_end/pagehide/visibility and terminal reason.
recommended change: Capture only meaningful checkpoints (activity id, entity id, step, phase, progress, recoverability), then snapshot the latest per session.
```

### 14. Did they create an account?

```yaml
status: COMPLETE
current source: Canonical signup lifecycle plus account/profile store.
relevant event/table/field: signup_viewed, signup_started, signup_completed; metadata.upgraded_from_guest/method/entry_surface; events.user_id/is_guest.
calculation currently used: Signup completion is one event per uid, either observed guest-to-registered transition or explicit direct signup; Admin reports counts and viewed-to-completed conversion.
limitations: Local dedupe is browser-local and analytics delivery can fail; profiles are a validation source but are not used by analytics metrics.
exact missing instrumentation: No conceptual event gap; a server-side durable signup event would eliminate client-delivery/dedupe risk.
recommended change: Move or mirror signup_completed to a Supabase auth/profile server boundary with an idempotent uid key, preserving visitor/session correlation supplied by the client.
```

### 15. Did they complete onboarding?

```yaml
status: PARTIAL
current source: profiles.onboarding_completed for registered accounts; separate device-local Academy registration state.
relevant event/table/field: profiles.onboarding_completed; legacy onboarding settings/stores; no canonical analytics event.
calculation currently used: Account/Admin UI displays current boolean only. Analytics does not calculate onboarding conversion.
limitations: No completion timestamp, start/step events, visitor/session/source join, or single authoritative definition across the three live onboarding configurations. Anonymous/device-local Academy registration is separate.
exact missing instrumentation: Authoritative onboarding_started, onboarding_step_completed and onboarding_completed with onboarding_version, flow_id, step_id, user/visitor/session and timestamp.
recommended change: First choose one onboarding definition/authority; then emit its lifecycle from the authoritative write and join completion to signup/acquisition.
```

### 16. Did they return same-day / D1 / D3 / D7 / D14 / D30?

```yaml
status: PARTIAL
current source: All-time browser sessions grouped by visitor.
relevant event/table/field: visitor_id and analytics_sessions.started_at.
calculation currently used: Admin implements rolling D1 and D7 only, with eligibility windows and too-recent exclusion.
limitations: Same-day, D3, D14 and D30 are not calculated; browser-local identity fragments cross-device/account returns; current ranges are rolling 24-hour windows rather than calendar-day cohorts.
exact missing instrumentation: No new browser event is required; missing calculations and a parallel account-grain cohort model are needed.
recommended change: Generalize tested day-N calculation to requested windows, label rolling versus calendar retention, and show browser and signed-in account retention separately.
```

### 17. Which acquisition sources produce retained users?

```yaml
status: PARTIAL
current source: First-touch attribution and subsequent sessions share visitor_id.
relevant event/table/field: analytics_visitors.first_utm_*/first_referrer plus analytics_sessions.started_at.
calculation currently used: Admin computes sources and retention independently; it does not cross-tab them.
limitations: No source-cohort report, no sample/confidence guard, browser-only retention, and direct/referrer loss remains ambiguous.
exact missing instrumentation: No essential capture gap for browser cohorts; account-source linkage and campaign normalization are missing for account cohorts.
recommended change: Add source × eligible cohort × D1/D3/D7/D14/D30 retained tables with minimum sample disclosure and first-touch/session-touch toggles.
```

### 18. Which first-session behaviors correlate with returning?

```yaml
status: PARTIAL
current source: Session-scoped web events and later sessions by visitor.
relevant event/table/field: first session_id, event_name/route/metadata, later analytics_sessions.started_at.
calculation currently used: None in Admin; the raw join can compare captured first-session events with return status.
limitations: Sparse/uneven event coverage, no active time or ordered state, Railway starts often lack session linkage, no confounder controls, and correlation must not be presented as causation.
exact missing instrumentation: Standard first-session feature set, backend session correlation, active time and reliable terminal states.
recommended change: Build a declared observational feature table from governed events, publish sample sizes/base rates, and keep causal language out of the report.
```

### 19. Which content/question families produce poor accuracy, slow answers, repetition or abandonment?

```yaml
status: PARTIAL
current source: Railway quiz_attempts/quiz_sessions and separate mode stores; question feedback report_context.
relevant event/table/field: question id/key snapshots, category, difficulty, is_correct, created_at, session_id, session duration; feedback question_type/reason.
calculation currently used: Personal analytics reports attempts/correct/accuracy by category and mode, with sample floors and previous-period comparisons. No platform Admin content diagnostic uses these rows.
limitations: No per-answer response duration in Practice, no unified question-family field across modes, no repetition/abandonment calculation, and Ranked/Daily Challenge/Mastery are excluded from the existing trend reader.
exact missing instrumentation: question_presented_at, answer_submitted_at/response_ms, stable content_family/version, attempt ordinal/replay origin, terminal/abandon state, and common ids across modes.
recommended change: Define a privacy-safe learning-attempt fact at question grain in Railway and expose admin aggregates, not raw answers, with minimum sample thresholds.
```

### 20. Can we measure learning improvement validly over time?

```yaml
status: PARTIAL
current source: Railway quiz_attempts plus personal_analytics period comparisons.
relevant event/table/field: user_id, created_at, is_correct, category, mode, difficulty and question snapshots.
calculation currently used: Current vs immediately previous equal-length 7/30/90-day periods; at least 10 attempts overall and 5 per category; 5-point category movement threshold. Free uses last 50 answers without a trend claim.
limitations: Covers Practice and Time Trial only; no item/question difficulty calibration, stable form/equating, first-attempt normalization across all modes, exposure control, confidence intervals or selection-bias adjustment. Accuracy movement is descriptive, not a validated learning estimate.
exact missing instrumentation: Stable content/version/difficulty model, first-exposure and attempt ordinal, response time, comparable skill constructs and sufficient repeated observations.
recommended change: Treat current trends as descriptive performance. Before claiming learning, define constructs and use difficulty-adjusted longitudinal estimates with explicit validity/sample rules.
```

### 21. Which sessions experienced technical failures?

```yaml
status: NOT CAPTURED
current source: Browser analytics diagnostics exist only in memory; Railway outbox health is aggregate; feedback is user-submitted and separate.
relevant event/table/field: runtime diagnostics.failureCount/failures; outbox last_error/dead_letter/attempts; feedback.client_meta/report_context.
calculation currently used: Admin shows pipeline health and aggregate outbox failures, not affected sessions.
limitations: No durable technical_error event, error taxonomy, stack/fingerprint, request correlation, session linkage, build context or affected activity state.
exact missing instrumentation: Durable client_error/api_failure/activity_failure events with session/visitor/user, build, route/activity/entity, error_code/fingerprint, recoverability and request correlation id.
recommended change: Add a bounded, privacy-reviewed failure stream and central error boundary/network instrumentation; sample noisy errors and exclude user content/secrets.
```

### 22. Can failures be correlated with abandonment?

```yaml
status: NOT CAPTURED
current source: None at a common session/activity grain.
relevant event/table/field: Aggregate outbox failures and in-memory client diagnostics cannot join to sessions; abandonment itself is not explicit.
calculation currently used: None.
limitations: Both sides of the relationship are missing or unjoinable; delivery failure can also masquerade as missing completion.
exact missing instrumentation: Session/activity-correlated failure events plus explicit terminal/abandon outcome and delivery-status separation.
recommended change: Introduce request/activity correlation ids, durable failure facts and authoritative terminal outcomes before building any failure-abandonment report.
```

### 23. Can we reconstruct an individual visitor/account session timeline?

```yaml
status: PARTIAL
current source: Admin visitor detail over analytics events/sessions plus profile lookup.
relevant event/table/field: visitor_id, session_id, user_id, received_at, route, event_name, source_system/entity and metadata.
calculation currently used: Browser events for visitor plus Railway rows matched by known user ids, newest-first; sessions shown separately.
limitations: Timeline is sparse, Railway rows lack direct session ids, anonymous backend facts are unjoinable, occurred_at is not loaded, and many product stores/events are absent. The 50k global row cap can truncate older history.
exact missing instrumentation: Backend correlation ids/session context, complete lifecycle vocabulary, occurred_at in Admin, pagination/query-by-record rather than full client-side load.
recommended change: Propagate correlation context and build a server-side per-visitor/account timeline query with explicit source and ordering semantics.
```

### 24. Can visitor activity be joined to a registered account after signup?

```yaml
status: COMPLETE
current source: Persistent visitor id across auth transitions plus analytics event user_id snapshots.
relevant event/table/field: analytics_events.visitor_id/user_id/is_guest; signup_completed; in-place guest upgrade preserves Supabase uid.
calculation currently used: Admin maps user_id to visitor ids from browser events and joins Railway rows/profile data deterministically; pre-signup activity remains on the same visitor record.
limitations: Same-browser only until a uid is observed. No fingerprinting or cross-device guessing; accounts used on multiple browsers map to multiple visitor records. A failed post-signup event can prevent linkage.
exact missing instrumentation: A durable idempotent identity_linked observation would harden the join; cross-device pre-signup linkage is intentionally unavailable.
recommended change: Record visitor_id ↔ user_id at successful signup/sign-in server exchange, with first/last observed timestamps, without merging anonymous visitors heuristically.
```

### 25. What contextual information would be required for a future feedback system?

```yaml
status: PARTIAL
current source: The existing feedback system already captures route, UA, viewport, app_version, screenshot/evidence and structured page/question context.
relevant event/table/field: feedback.page_url, client_meta, report_context, category, entry_intent, severity, reproducibility, expected/actual result; question key/id/type/mode/match/round/prompt/options.
calculation currently used: Admin renders report origin, structured context and client diagnostics; it is not joined to canonical analytics sessions.
limitations: No analytics visitor/session id, canonical activity/entity correlation, recent event trail, feature/config flags, backend request id, deployment commit guarantee, experiment assignment, network status or automatic error fingerprint.
exact missing instrumentation: Consent-aware visitor/session/activity ids; build/commit; feature/config versions; request/error correlation; last meaningful state; compact recent-event breadcrumb; content version; connectivity and timezone/locale where useful.
recommended change: Extend the existing feedback contract rather than create a second system. Snapshot only allow-listed context at submit time, show it to the reporter, and avoid secrets, query strings, answers not already visible, IP/geolocation and unbounded logs.
```

## Event vocabulary inventory

### Canonical macro vocabulary

| Family | Events | Current producer state |
|---|---|---|
| Acquisition | `landing_viewed`, `hub_entered`, `leaguecraft_opened` | Live web surface events, once per session |
| Mode intent | `practice_quiz_opened`, `ranked_opened`, `meta_reflex_opened`, `mastery_opened`, `dsa_opened` | First four live; `dsa_opened` retained in contract but standalone surface retired |
| Gameplay outcome | `practice_quiz_started/completed`, `ranked_started/completed`, `meta_reflex_started/completed`, `mastery_started/completed`, `dsa_started/completed` | Practice/Ranked/Mastery delivered by Railway; Meta Reflex has no authoritative emitter; DSA allowed but no audited production callsite |
| Conversion | `signup_viewed`, `signup_started`, `signup_completed` | Live |
| Verification | `verification_started/completed/failed` | Contract/helper only; `VERIFICATION_EMITTERS_LIVE = false` |

### Product/diagnostic vocabulary

- Navigation/conversion diagnostics: `leaguecraft_cta_clicked`, `quiz_signup_gate_shown`, `quiz_signup_clicked`, `quiz_guest_continue_clicked`, `hud_signup_chip_clicked`, `hud_signup_menu_clicked`.
- Practice: `quiz_question_answered`, `quiz_completed`, `practice_missed_started`.
- Builder: `practice_builder_pool_selected`, `practice_builder_filters_changed`, `practice_builder_build_attempted`, `practice_builder_build_succeeded`, `practice_builder_insufficient_pool`, `practice_builder_entitlement_refused`, `practice_builder_set_created`, `practice_builder_set_run`.
- Trends: `trends_opened`, `trends_window_changed`, `trends_practice_weakness_clicked`. `trends_opened` is in the contract but no live callsite was found.
- Ads: `ad_slot_eligible`, `ad_slot_rendered`, `ad_slot_suppressed`, `ad_slot_error`, `house_ad_clicked` in canonical analytics. A separate legacy `ad_events` table/path also exists.
- DSA legacy/diagnostic names: `dsa_entry_viewed`, `dsa_official_cta_clicked`, `dsa_signin_gate_shown`, `dsa_official_started`, `dsa_official_resumed`, `dsa_practice_started`, `dsa_answer_resolved`, `dsa_run_expired`, `dsa_run_completed`, `dsa_results_viewed`, `dsa_practice_replay_clicked`, `dsa_legacy_fallback`. No live producers were found on the audited frontend base after standalone Time Trial retirement.

### Duplicate or overlapping concepts

- `quiz_completed` (web diagnostic) overlaps `practice_quiz_completed` (Railway authority). Only the Railway row is used for Admin completion.
- `quiz_question_answered` overlaps Railway `quiz_attempts`, but the web event has coarse metadata and the durable attempt store is the learning truth.
- `dsa_run_completed` overlaps canonical `dsa_completed`; `dsa_official_started`/`dsa_practice_started` overlap `dsa_started`. They belong to different generations and currently have no clear live ownership.
- Canonical ad lifecycle events overlap the separate legacy `ad_events` ledger.
- Profile/account activity timestamps, mode-specific histories, and canonical events are overlapping sources with different grains; Admin analytics deliberately reads only the canonical store.

### Inconsistent naming

- The canonical names use `practice_quiz_*`; several product diagnostics use bare `quiz_*`.
- DSA is also called Time Trial and Daily Score Attack, while Daily Challenge is a different product. The vocabulary contains `dsa_*`, `dsa_official_*`, `dsa_practice_*`, and historical UI language.
- `*_opened` means reached/intent, while `practice_builder_*_selected/attempted/run` mix UI action and activity semantics.
- `quiz_completed` is a client results transition; `*_completed` macro events are server terminal transitions.
- `source_system = supabase` is allowed by schema/types but has no audited producer.

### Unclear field semantics

- Free-form `metadata` lacks per-event schemas in code; `event_version` is present but nearly everything is version 1.
- `is_guest` is a snapshot at emission. On Railway practice completion it deliberately reflects session start, not completion; this differs from a reader assuming current auth state.
- `received_at` is the Admin range/order clock, while `occurred_at` is retained but not loaded in Admin. Delivery lag can therefore move gameplay into a later report range.
- `traffic_source` means classification provenance (`codex`, `playwright`, etc.), not acquisition source.
- `quiz_completed` versus `practice_quiz_completed` and DSA's multiple terminal names require source/authority knowledge to interpret correctly.
- `duration_seconds` in Railway quiz sessions is start-to-complete wall clock, not active time.

### Missing lifecycle events

- Session active/end/background/foreground/idle.
- Account sign-in/sign-out and durable visitor-account link.
- Onboarding start/step/completion/version.
- Activity terminal outcomes: abandoned, expired, failed, cancelled, disconnected.
- Technical failure/recovery with request/activity correlation.
- Meta Reflex authoritative start/completion and current DSA/Daily lifecycle ownership.
- A governed lifecycle for major non-Leaguecraft activities.

### Joinability assessment

- Web events form a coherent same-browser journey through `visitor_id + session_id`.
- Signup continues that journey because visitor/session ids survive auth and later events carry `user_id`.
- Railway events do not accept/store visitor or session id. Registered activity can be joined indirectly through `user_id`; anonymous/bot/sentinel facts become `user_id = null` and are not joinable.
- Mode-specific Railway tables use account ids and local entity ids, not analytics visitor/session ids.
- Feedback uses profile id and context but no analytics visitor/session id.
- Legacy `ad_events` uses its own identity/ledger and cannot be assumed to join to canonical events.

### Active time versus wall clock

No current source measures active time. `analytics_sessions.started_at` plus last event would be a sparse wall-clock span, not activity. The local session's `lastActivityAt` is only touched by analytics emissions and is never persisted to Supabase. Railway quiz `duration_seconds` includes background/idle time. Human traffic promotion proves one trusted input occurred; it says nothing about duration.

### Version/build/commit context

- Canonical analytics has `event_version`, which versions an event payload contract, not the deployed application.
- No canonical visitor/session/event carries frontend build, commit, backend deployment, feature/config version or content version as a common field.
- Feedback `client_meta.app_version` attempts build context, but it is isolated to submitted feedback and depends on the configured Vite value.
- Some Railway metadata carries content-specific revisions (for example Mastery display revision), inconsistently and only per mode.

### Device, referrer and UTM context

- Referrer and all five standard UTM fields are captured at first and session touch.
- Canonical analytics intentionally captures no device context or fingerprinting data.
- UA is read only for traffic automation classification and is not stored. Feedback stores allow-listed UA and viewport.
- No browser/OS/device class, locale, timezone, viewport, network type or screen attributes are available for analytics segmentation.

### Anonymous → registered continuity

Continuity is strong on the same browser: visitor and session ids are independent of auth, guest upgrade preserves the Supabase uid, `is_guest` snapshots the transition, and Admin joins uid-bearing events to profiles/Railway. It is not durable enough to survive a missing post-signup event, and it deliberately does not merge browsers/devices or fingerprint users.

## Prioritized proposed instrumentation backlog

### P0 = required to understand core product success

1. **Activity lifecycle registry:** enumerate every current meaningful activity and its authoritative `opened`, `started`, `completed`, `abandoned/expired/failed` ownership and entity grain. Retire contract-only residue.
2. **Backend correlation context:** propagate `visitor_id`, `session_id` and a generated interaction/request id from browser start requests to Railway authoritative events; validate rather than trust identity fields.
3. **Active-time session model:** visibility/focus/idle-aware accumulated `active_ms`, `last_active_at`, low-frequency heartbeat and terminal reason.
4. **Authoritative terminal outcomes:** matched entity states for completion, abandonment, expiration and failure; Admin completion must join starts to terminals.
5. **Durable identity link:** idempotent visitor-to-user observation at successful signup/sign-in, with same-browser provenance and no heuristic merging.
6. **Onboarding authority and lifecycle:** choose one onboarding definition/version and record start, steps and completion with visitor/session/user context.
7. **Core retention/source reports:** same-day, D1/D3/D7/D14/D30 at browser and account grain; acquisition source × eligible retained cohorts.
8. **Release context:** common frontend build/commit and backend deployment/version on sessions/events so regressions can be isolated.

### P1 = high-value diagnosis

1. **Technical failure facts:** bounded client/API/activity failures with error code/fingerprint, recoverability, correlation id, build and last meaningful state.
2. **Question-attempt analytical fact:** stable content family/id/version, first exposure/replay ordinal, presented/submitted timestamps, response ms, correctness, difficulty and terminal state across modes.
3. **First-session behavior model:** governed features and transparent return correlation with sample/base-rate disclosure.
4. **Device/context snapshot:** privacy-reviewed browser/OS/device class, viewport bucket, locale/timezone and connection state at session grain; avoid fingerprinting.
5. **Server-side timeline/query path:** paginated per visitor/account/session instead of loading a globally capped 50k dataset into the client.
6. **Feedback correlation:** allow-listed analytics/session/activity/request/build ids and compact recent-state breadcrumb in the existing feedback system.
7. **Pipeline/session distinction:** expose delivery delay and failed delivery separately so missing terminal events are never labelled abandonment.

### P2 = optimization / later sophistication

1. Versioned marketing channel grouping, click-id support and multi-touch attribution views.
2. Difficulty-adjusted longitudinal learning estimates, comparable constructs/forms and uncertainty reporting after data volume supports them.
3. Experiment/feature-flag assignment context and outcome analysis.
4. Automated anomaly detection for event volume, schema/version drift, clock skew and source-specific freshness.
5. Session replay/breadcrumb sophistication only after privacy, retention and access policy are explicitly approved; do not default to full replay.
6. Warehouse/server-side rollups once the 50,000-row client aggregation ceiling becomes material.

## Audit boundary and USERS2.1 conflict check

`USERS2_HANDOFF.md` did not exist in the checkout, any local worktree, or reachable Git history at audit start. This audit therefore does not update it and makes no assumption about USERS2.1-owned code. The only added file is this document; no product, migration, function, event, calculation or Railway code changed.
