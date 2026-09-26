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
| `daily_challenge` — Daily Challenge | Browser: intentional Daily entry/run surface | Server: `POST /api/daily-challenge/today` creates/resumes today's parent | Server: parent `DailyRun.status=completed` | Account's dated parent run / `run_id` (`plan_date` uniqueness context) | completed, abandoned, expired, failed | Server lifecycle; browser reach | none | Add Daily lifecycle. Never use DSA names or child Ranked completion. |
| `practice_quiz` — Practice / Study Hall | Browser: live set/category chosen and runner shown | Server: `POST /api/quiz/sessions` creates session | Server: completion endpoint persists `completed_at` | Quiz session across standard/category/builder/missed paths / `quiz_sessions.id` | completed, abandoned, expired, failed, cancelled | Shared reach; server start/terminal | `practice_quiz_opened`, Railway `practice_quiz_started/completed`; diagnostics `quiz_completed`, `practice_missed_started`, `practice_builder_set_run` | Railway events are lifecycle truth. Retire `quiz_completed` from lifecycle use. |
| `ranked_match` — Ranked | Browser: public lobby/queue reached | Server: participant attached to created match; queue join is intent | Server: combat, forfeit, or no-contest settlement | Participant-match / `match_id:user_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | `ranked_opened`, Railway `ranked_started/completed` | Combat is completed even on loss; explicit forfeit maps to abandoned; no-contest/invalidation to cancelled; server lifetime expiry to expired. Queue cancellation is pre-start. |
| `champion_mastery` — Champion Mastery | Browser: authenticated journeys reached | Server: mastery session POST returns persisted session | Server: session `completed` plus summary | Mastery-set session / `session_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | `mastery_opened`, Railway `mastery_started/completed` | Preserve Railway authority and add future terminals at the same grain. |
| `meta_reflex_round` — Meta Reflex | Browser: specific game route, not picker hub | Browser: matchup dealt with `client_submission_id` | Server: `recordSwipeResult` accepts/deduplicates id and returns canonical result | One dealt attempt / `client_submission_id` | completed, abandoned, failed, cancelled | Browser start; server result | `meta_reflex_opened` currently means picker-hub reach | Current event is too broad. Reserved `meta_reflex_started/completed` has no producer and should be retired unless redefined at round grain. |
| `leaguecraft_matchup_study` — Leaguecraft Matchup Study | Browser: valid two-champion route rendered | Server: matchup session POST creates frozen study | Server: session `complete=true` after final graded answer | Matchup session / `session_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | none | Add a distinct lifecycle; do not mix with Practice `quiz_sessions`. |
| `pro_play_quiz` — Pro Play Quiz | Browser: quiz route reached | Server: Pro Play session POST creates frozen ten-question session | Server: session `complete=true` after final answer | Pro Play session / `session_id` | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | none | Add correlated server lifecycle; auto-start on route does not collapse opened into started. |
| `stat_check_bot_match` — Stat Check Bot Match | Browser: public board mounted | Browser: first committed gameplay decision after item choice | Browser local engine reaches match over; Restart explicitly replaces a started match | Local match / missing browser-generated instance id | completed, abandoned, failed, cancelled | Browser | none | Add stable match instance id. Unload can only produce inferred abandonment after timeout. |
| `stat_check_private_match` — Stat Check Private Match | Browser: room reached by create/invite | Server: both players accepted and match enters play | Server: terminal winner/draw/cancellation state | Private match / server match id; invite code is only room identity | completed, abandoned, expired, failed, cancelled | Shared reach; server lifecycle | none | Instrument match id. Room expiry before start is not an expired activity. Define disconnect adjudication before emitting abandonment. |
| `onboarding` — Academy Welcome | Browser: live `/welcome` introduction rendered | Browser: visitor intentionally advances beyond the arrival chapter | Browser: `markAcademyWelcomeHandled` persists `explored` or `signed-in` before navigation | One Academy contract version per browser visitor / `visitor_id + v1` | completed, abandoned, cancelled | Browser | none | `explored` maps to completed; sign-in handoff maps to cancelled. The legacy profile `OnboardingFlow` is Admin-preview-only and `profiles.onboarding_completed` is not current lifecycle authority. |

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
