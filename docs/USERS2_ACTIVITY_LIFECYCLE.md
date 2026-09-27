# USERS2.3A — canonical activity lifecycle contract

Date: 2026-09-26
Base: `origin/main` at `61673c53683f16fff859a42c15f83b9406411b92`

## Contract

An **activity** is bounded, intentional product work with a participation boundary, an entity that can be correlated from start to terminal state, and a product-defined result. Hubs, reference pages, history, dashboards, open-ended Pro Play data exploration, admin tooling, and individual child questions are surfaces or subordinate facts, not separate activities. Practice Builder is a Practice configuration path; Daily Challenge stages are children of one Daily run.

| State | Meaning |
|---|---|
| `opened` | User reached or intentionally opened the activity surface. It is reach/intent, never participation. |
| `started` | User crossed the activity's meaningful participation boundary and an activity entity exists. |
| `completed` | The authoritative successful terminal state. A loss or wrong answers may still be a successful completion. |
| `abandoned` | A started activity ended because the participant stopped before completion. This requires an explicit authoritative transition or is labelled inferred. |
| `expired` | The authoritative activity entity became invalid because its time/state lifetime elapsed. |
| `failed` | A technical/system condition terminally prevented the activity from continuing. Retryable request errors are not terminal failures. |
| `cancelled` | An explicit user/system cancellation or invalidation where the product permits it. |

Exactly one terminal outcome may win per activity entity. Delivery failure is not an activity outcome. A missing completion event is unknown, not abandonment.

## Registry

The typed source of truth is `src/lib/analytics/activityLifecycle.ts`. It is descriptive only: it imports no product code, emits no event, and duplicates no state machine.

| `activity_id` / human name | Opened authority | Started authority | Terminal authority | Entity grain / id | Valid terminals | Ownership | Current events | Migration / retirement |
|---|---|---|---|---|---|---|---|---|
| `daily_challenge` — Daily Challenge | Browser: intentional Daily entry/run surface | Server: `POST /api/daily-run/today` creates/resumes today's parent (verified identity; a verified anonymous guest session is admitted) | Server: parent `DailyRun.status=completed` | Account's dated parent run / `run_id` (`plan_date` uniqueness context); stages are children, each launching one canonical Ranked child | completed, abandoned, expired, failed | Server lifecycle; browser reach | none | Add Daily lifecycle (USERS2.3D). Never use DSA names or child Ranked completion. Run and stage carry frozen browser correlation since USERS2.3C-Daily. |
| `practice_quiz` — Practice / Study Hall | Browser: live set/category chosen and runner shown | Server: `POST /api/quiz/sessions` creates session | Server: completion endpoint persists `completed_at` | Quiz session across standard/category/builder/missed paths / `quiz_sessions.id` | completed, abandoned, expired, failed, cancelled | Shared reach; server start/terminal | `practice_quiz_opened`, Railway `practice_quiz_started/completed`; diagnostics `quiz_completed`, `practice_missed_started`, `practice_builder_set_run` | Railway events are lifecycle truth. Retire `quiz_completed` from lifecycle use. |
| `ranked_match` — Ranked | Browser: public lobby/queue reached (direct Ranked) | Server: human participant attached to a created canonical match — direct or nested under a host; queue join is intent | Server: combat, forfeit, or no-contest settlement | Human participant-match, direct or nested / `match_id:user_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | `ranked_opened`, Railway `ranked_started/completed` | Combat is completed even on loss; explicit forfeit maps to abandoned; no-contest/invalidation to cancelled; server lifetime expiry to expired. Queue cancellation is pre-start. Host/parent provenance distinguishes wrappers (see below). |
| `champion_mastery` — Champion Mastery (legacy standalone sessions) | Browser: standalone Mastery session surface reached | Server: `POST /api/mastery/sessions` returns a persisted legacy session | Server: session `completed` plus summary | Legacy mastery-set session / `session_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | `mastery_opened`, Railway `mastery_started/completed` | Legacy/compatibility instrumentation, preserved. Not the current primary Mastery product: that is the Mastery Journey, which has no registered activity yet (identity gap below). |
| `meta_reflex_round` — Meta Reflex | Browser: specific game route, not picker hub | Browser: matchup dealt with `client_submission_id` | Server: `recordSwipeResult` accepts/deduplicates id and returns canonical result | One dealt attempt / `client_submission_id` | completed, abandoned, failed, cancelled | Browser start; server result | `meta_reflex_opened` currently means picker-hub reach | Current event is too broad. Reserved `meta_reflex_started/completed` has no producer and should be retired unless redefined at round grain. |
| `leaguecraft_matchup_study` — Leaguecraft Matchup Study | Browser: valid two-champion route rendered | Server: matchup session POST creates frozen study | Server: session `complete=true` after final graded answer | Matchup session / `session_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | none | Add a distinct lifecycle; do not mix with Practice `quiz_sessions`. |
| `pro_play_quiz` — Pro Play Quiz | Browser: quiz route reached | Server: Pro Play session POST creates frozen ten-question session | Server: session `complete=true` after final answer | Pro Play session / `session_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | none | Add correlated server lifecycle; auto-start on route does not collapse opened into started. |
| `stat_check_bot_match` — Stat Check Bot Match | Browser: public board mounted | Browser: first committed gameplay decision after item choice | Browser local engine reaches match over; Restart explicitly replaces a started match | Local match / missing browser-generated instance id | completed, abandoned, failed, cancelled | Browser | none | Add stable match instance id. Unload can only produce inferred abandonment after timeout. |
| `stat_check_private_match` — Stat Check Private Match | Browser: room reached by create/invite | Server: both players accepted and match enters play | Server: terminal winner/draw/cancellation state | Private match / server match id; invite code is only room identity | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | none | Instrument match id. Room expiry before start is not an expired activity. Define disconnect adjudication before emitting abandonment. |
| `onboarding` — Academy Welcome | Browser: live `/welcome` introduction rendered | Browser: visitor intentionally advances beyond the arrival chapter | Browser: `markAcademyWelcomeHandled` persists `explored` or `signed-in` before navigation | One Academy contract version per browser visitor / `visitor_id + v1` | completed, abandoned, cancelled | Browser | none | `explored` maps to completed; sign-in handoff maps to cancelled. The legacy profile `OnboardingFlow` is Admin-preview-only and `profiles.onboarding_completed` is not current lifecycle authority. |

## Canonical Ranked across hosts (USERS2.3C-Daily clarification)

- Canonical Ranked matches can be **direct** (human-v-human queue, direct bot lane) or **nested** under another product host: a Daily Challenge stage, a Study Hall drill, the Playtest preset family, and future wrappers.
- Nested matches remain measurable `ranked_match` entities at the same `ranked_participant = match_id:user_id` grain, with the same `ranked_started` / `ranked_completed` events. Bots emit nothing. Public availability of a path today is not the same thing as analytics coverage.
- A child match's completion never substitutes for its parent activity's completion. A Daily stage's Ranked child completing does not complete the Daily run for analytics purposes; the parent's own server state does.
- Host/parent provenance distinguishes direct Ranked from Daily/Study Hall/Playtest wrappers. It is frozen on the match at creation and emitted identically on start and completion: `host` (`direct` | `daily_challenge` | `study_hall` | `playtest`), `session_preset` (preset wrappers only), `parent_activity_type` / `parent_activity_id` / `parent_stage_index` / `parent_stage_kind` (only where a server-owned parent instance exists — today the Daily run and stage), plus `opponent_type` (`bot` | `human`), `is_bot_match`, `creation_source`, `format_id` / `format_version`. No parent id is invented for direct Ranked, Playtest or Study Hall.
- Bot-ness is an opponent/rating distinction, not another engine. Rating eligibility is unchanged: every bot-opponent match, including every Daily child, is unrated.

Consumers that read `ranked_started` as "public Ranked play" must filter on `metadata.host`: Daily children were suppressed before USERS2.3C-Daily and are now counted with `host=daily_challenge`.

## Mastery Journey identity gap (audit; no activity registered)

The current Mastery product is the Mastery Journey (Journey Slice), served as one `mastery_slice` segment inside canonical Ranked formats — Daily Standard (one five-child Journey) and Daily Survival (a three-child Journey at recurring positions). It is not the legacy `/api/mastery/sessions` flow, whose `mastery_*` events are preserved for compatibility only.

- **No durable Journey instance id exists.** One served Journey is identified today by `ranked_rounds (match_id, round_number)`; one player's play-through adds `user_id`. Both participants of a match share the one frozen Journey.
- **Recipe id/version and `journey_seed` are persisted only inside JSON**: the match's frozen `format_snapshot_json` segment `module_config`, the round's `segment_config_json`, and the round's payload/private JSON. `journey_seed` derives from the day seed, catalog digest and recipe, independent of match and player: it names content, not an instance.
- **Round number is persisted** (`ranked_rounds.round_number`; `analytics_tag` such as `daily_standard_v1:10:journey_slice`).
- **Reconstructable after the fact:** the served Journey, from its frozen round payload; its reached child questions per player, from `ranked_segment_child_results (match_id, round_number, user_id, challenge_index)`, whose rows link to the Journey only by match and round.
- **Lifecycle boundaries are partial.** The round row insert is a de facto start (lazy segment opening) and `status='resolved'` plus child results is a de facto end. A forfeit or disconnect mid-Journey ends the match without resolving the round. Stopping early (Survival strikes, pooled clock) is only inferable from the reached-child count.
- **Required for a future `mastery_journey` lifecycle:** a server-owned per-participant entity, e.g. `mastery_journey = match_id:round_number:user_id` (the outbox source tuple needs the per-player form, as Ranked's does), started in the segment-opening transaction when the round is a served Journey, terminal in the segment-resolution transaction with reached/correct counts and end reason, and an explicit terminal when the match ends by forfeit/no-contest while a Journey is open. Recipe id/version, plan, `journey_seed`, host and parent provenance ride as metadata. Until then no `mastery_journey_*` event is emitted.

## Abandonment authority

Authoritative abandonment is possible only when the activity owner observes a conclusive transition:

- Ranked can authoritatively record a participant forfeit/disconnect adjudication against the participant-match entity.
- A server session may authoritatively mark abandonment when an explicit “leave/end” request succeeds, or when a documented server lease expires and policy defines that transition as abandonment rather than expiry.
- A browser-only activity can authoritatively record an explicit Restart/End action before replacing its local instance.

Navigation away, backgrounding, loss of connection, process crash, browser close, and absence of a completion event are not exact abandonment signals. Later instrumentation may infer abandonment only after a declared observation window, with `authority=inferred`, an inference rule/version, and the last authoritative state. `beforeunload`/`sendBeacon` may improve evidence but cannot make delivery or intent certain. Server TTL should normally produce `expired`, not `abandoned`.

## USERS2.2 conflict resolutions

### `quiz_completed` versus `practice_quiz_completed`

`quiz_completed` is a browser results transition and is not lifecycle authority. `practice_quiz_completed` from Railway, keyed to `quiz_session`, is canonical completion. New lifecycle consumers must ignore the browser diagnostic. Retire it once any non-lifecycle diagnostic use has migrated.

### DSA legacy names

Standalone Daily Score Attack / Time Trial is retired. Remove `dsa_opened`, `dsa_started`, `dsa_completed` and all `dsa_*` product names from future canonical contracts after compatibility consumers are verified. They do not describe the current Daily Challenge. No DSA activity is registered.

### Meta Reflex authority gap

`meta_reflex_opened` fires at the picker hub, not a particular game/round. The live durable fact is `league_swipe_results`, keyed by `client_submission_id`, written only when a choice is submitted. The contract therefore uses one dealt round as the activity grain, browser deal as start, and accepted server result as completion. A future opened event must mean the specific game surface. The existing reserved start/completion names have no authority and are retirement candidates until implemented at this grain.

### `*_opened` semantics

Opened is surface reach/intent only. It is never a fallback start and never proves an entity exists. Existing surface events are once per analytics session, so they measure visitors/sessions reaching a surface, not activity instances. Practice's action-emitted `practice_quiz_opened` is also misnamed: it is closer to user intent, but still cannot replace server session creation.

### Railway completion authority

For Practice, Ranked and Mastery, Railway-backed state and its idempotent outbox events remain completion authority. The browser may render a result, but cannot authoritatively complete those entities. Daily, Matchup Study and Pro Play Quiz already expose server completion state but do not yet publish canonical analytics. This work does not modify Railway or claim events that do not exist.

## Exclusions and follow-up rules

- Pro Play Graph Explorer, search, dossiers, live/archive viewing, Leaguecraft history/trends, Combat Lab configuration, reference/docs, and hubs are open-ended exploration or reading surfaces. Track meaningful actions separately; do not manufacture “completed” solely to fit this lifecycle.
- The live onboarding activity is Academy Welcome. The older profile/category `OnboardingFlow` is reachable only as an Admin preview on this base and must not be restored to production merely because `profiles.onboarding_completed` still exists.
- Practice Builder is configuration and hands off to `practice_quiz`; its build/save diagnostics are not a second learning activity.
- Daily stages and Ranked rounds/questions are child facts. The Daily parent run and Ranked participant-match remain the activity grains.
- Technical API errors are non-terminal while retry/resume remains possible. Emit `failed` only when the authoritative entity is terminally unusable.
- Future canonical events should use a common lifecycle shape (`activity_id`, lifecycle state/outcome, entity type/id, authority, occurred time, contract version) rather than adding another family of mode-specific names. This document does not authorize schema or emission changes.

## Implementation order for later work

1. Add browser/session/request correlation to server-created entities.
2. Publish existing authoritative starts/completions for uncovered server sessions.
3. Add explicit terminal state transitions in business authority before analytics emission.
4. Add inference jobs/views only for activities whose abandonment cannot be observed directly; keep inferred and authoritative outcomes separate.
5. Migrate readers, then retire misleading/unused legacy names.
