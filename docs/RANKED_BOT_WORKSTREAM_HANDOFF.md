# Ranked Bot workstream — handoff

Status: **RB1, RB2, RB2.1 and RB3 complete** (backend + frontend, tested, not published, not deployed).

## Objective

Bot Ranked is **canonical Ranked against a server-controlled opponent**. It is
not a mode, not a product, and not a second implementation. Access is:

```
admin (operator override)  OR  account whose CURRENT effective entitlement is Premium
```

The entitlement is read live rather than copied into a tag, so a temporary
Premium grant handed out by another workstream automatically confers bot
access, and its lapse automatically removes it again. Nothing here has to know
either happened.

## Invariants

* **No separate bot renderer.** A match id enters the same Ranked host and the
  same arena/question/result UI whether its opponent is human or a bot.
* Same Ranked match creation and lifecycle, question generation, renderers,
  Mastery/Matchup/Combat slices, scoring, arena and result pipeline.
* **Unrated**, and skipped at the authoritative rating-eligibility layer — not
  by the caller's intention. No Elo, no ladder effect.
* **Server-authorized.** `match_with_bot` in the request body is a *request*.
  The frontend capability is visibility only.
* Fails closed. An entitlement that cannot be resolved never authorizes — and
  is reported as an outage, not as a Free account.

## Current implementation

### Backend (`League_Combat_Simulator`)

| File | Role |
| --- | --- |
| `routes/ranked_public.py` | `POST /api/ranked/queue`; `_authorize_ranked_bot()` is the gate; `is_request_admin()` is the override; `_create_admin_bot_match()` builds the match |
| `services/entitlement.py` | `Capability.can_play_ranked_bot`, `require_ranked_bot()`, `resolve_capability()` |
| `services/pro_status.py` | PT1.4 effective Pro (`stripe_pro OR valid grant`) via the self-scoped `my_pro_entitlement()` RPC; raises `ProLookupError` on an indeterminate answer |
| `schemas/ranked_public_schemas.py` | `QueueJoinIn.match_with_bot` (`extra="forbid"`) |
| `ranked_public/service.py` | `create_bot_match`, `drive_bot_match` — unchanged |

Wire codes:

* `RANKED_BOT_NOT_AUTHORIZED` → **403**, the caller is understood and refused.
* `RANKED_ENTITLEMENT_UNAVAILABLE` → **503**, entitlement indeterminate. Access
  is still withheld; a 403 here would tell a paying customer they never paid.

### Frontend (`mogsy`)

| File | Role |
| --- | --- |
| `src/hooks/useRankedBotAccess.ts` | Resolves `canPlayRankedBot` from `useAdminRoles` + `fetchProEntitlement`. Fails closed on loading, signed-out and unresolved |
| `src/components/quiz/play-scroll/RankedPlayScroll.tsx` | The wired boundary; holds the capability so the view stays pure |
| `src/components/quiz/play-scroll/PlayScrollRecord.tsx` | Passes `canPlayRankedBot` straight through |
| `src/components/quiz/play-scroll/RankedQueueView.tsx` | The one switch, its copy, and the modified join |
| `src/lib/ranked-public/client.ts` | `joinQueue(classId, signal, { matchWithBot })` — the only creation call |
| `src/pages/quiz-ranked/useRankedQueue.ts` | `joinWithoutClass({ matchWithBot })`; `matched` → the existing handoff |
| `src/pages/dev/play-scroll/PlayScrollPreviewPage.tsx` | `Bot access` chip stands in for the capability |

The view is never told which tier the viewer is in — only whether they may use
Bot Ranked — so a future rule that opens the switch some other way changes
nothing below the boundary.

## Completed in RB1

1. Backend authorization widened from admin-only to **admin OR effective
   Premium**, consuming the existing PT1.4 resolver rather than a new tag.
2. `RANKED_ENTITLEMENT_UNAVAILABLE` (503) added so an outage is fail-closed
   *and* honest.
3. Frontend: finished a partial prior change (`canPlayRankedBot` was already
   being passed to a view that still declared `isAdmin`, which did not
   typecheck), renamed the prop through `RankedQueueView` and the dev preview.
4. Copy: `"Admin test: a bot opponent…"` → `"A bot opponent, starting
   immediately. Ordinary Ranked, unrated."`, and the control now reads
   `Match with Bot · Starts immediately · Unrated`. It says neither "admin" nor
   "Premium": Premium is the entitlement, not the name of the match.
5. Parity safeguard: a structural + behavioural regression test that a bot
   match id enters the same Ranked host, and that the host holds no bot branch.
6. Stale docstrings describing Bot Ranked as "admin-only testing" updated in
   the route, the schema and the client.

UI shape is unchanged: one switch under the Ranked entry, OFF on every open, no
difficulty, no bot class, no bot identity, no response-speed setting, no
separate card, no new route. The human queue stays the primary action.

## Tests

Backend (`/Users/macmoney/League_Combat_Simulator/.venv/bin/python`, from the
repo root):

```bash
.venv/bin/python -m pytest test_ranked_bot_premium_access.py -q
```

15 passed — admin preserved (and needing no entitlement lookup), Premium
non-admin succeeds on the same creation path with an identical match row, Free
gets a typed 403 and is not quietly queued, forged headers/body change nothing,
an unresolvable entitlement is 503 and never 403, and the ordinary human join
is unchanged for both tiers and never asks about entitlement at all.

Regression, compared as failure **sets** against a clean `origin/master`:

```bash
.venv/bin/python -m pytest test_ranked_admin_bot_match.py test_ranked_public_queue.py \
  test_ranked_public_queue_routes.py test_ranked_launch_readiness.py test_ranked_prototype.py \
  test_rg1_match_lifecycle.py test_rg1_role_end_to_end.py test_ranked_admin_bot_display_name.py \
  quiz/tests/test_practice_builder.py quiz/tests/test_personal_analytics.py \
  quiz/tests/test_free_snapshot_projection.py quiz/tests/test_pro_status.py \
  engine_tests/test_combat1_playtest_entitlement_bridge.py -q
```

99 failures before, the **same** 99 after. They are the repo's known
environment baseline (the modern format's shared-bank pools are not seedable
from these fixtures), not RB1's.

Frontend:

```bash
npx vitest run --no-file-parallelism src/components/quiz/play-scroll src/pages/quiz-ranked \
  src/lib/ranked-public src/hooks/useRankedBotAccess.test.ts
npx tsc --noEmit -p tsconfig.app.json
```

`tsc` goes from 17 pre-existing errors to 15: RB1 **removed** the two the
partial prior change had left and introduced none.

> Run vitest **serially** (`--no-file-parallelism`). Parallel runs in this repo
> fabricate failures.

---

# RB2 — Ranked vs Bot parity audit and correction pass

## The architecture, both flows

```
HUMAN                                 BOT
PLAY record → Ranked                  PLAY record → Ranked, switch ON
POST /api/ranked/queue {}             POST /api/ranked/queue {match_with_bot}
  queue entry → pairing pass            _authorize_ranked_bot → create_bot_match
  status: waiting → matched             status: matched (no queue entry)
        ↓                                       ↓
        └──────────── same handoff ─────────────┘
                          ↓
        /quiz/ranked with state.matchId   (QuizRankedPage)
                          ↓
                   QuizRankedMatch          ← ONE host, no bot branch
                          ↓
                   CanonicalArena           ← ONE arena
        same modules · same renderers · same timers · same submission
        same scoring · same Meta Reflex · same settlement · same reveal
                          ↓
                   phase "match_over"
                          ↓
                   MatchOverFrame           ← ONE end screen
                          ↓
        Play Again → /quiz?play=1  ·  Back to Leaguecraft → /quiz
```

Creation is the only fork, and it converges on the match id. After that there
is no bot-specific component anywhere.

## Every bot-specific branch that exists

| Where | Branch | Verdict |
| --- | --- | --- |
| `QuizRankedMatch` live header | `playtest.isBotMatch` → `"Ranked Duel · vs Bot"` | **Required** — the player must be able to see who they are fighting |
| `QuizRankedMatch` terminal eyebrow | `isBotMatch` → `"Match Complete · Unrated"` | **Required** (added by RB2) |
| `rankedViews.opponentLabelFor` | `isBotMatch` → `"Bot"` not `"Opponent"` | **Required** (added by RB2) |
| `roleIdentity` / `projectCombatants` | role-less participant gets the neutral `Duelist` label and crest | **Required** — a bot has no League role and the backend refuses to invent one |
| `RankedMatchHistory.opponentLabel` | `opponentIsBot` → literal `"Bot"` | **Accidental drift**, left alone — see open items |
| ~~`service.create_bot_match`~~ | ~~format resolves against the `admin_bot` config target~~ | **Removed in RB2.1** — both lanes resolve `public` |
| `discovery.is_discoverable_user` | `bot::` uids build no library | **Required** — the *human* in a bot match still does |
| `rating.evaluate_eligibility` | bot flag / `bot::` participant / `bot_playtest` provenance → skipped | **Required** |
| `useRankedQueue.reconnectMatch.isBotMatch` | carried, never read | Dead field, harmless, left alone |

## What RB2 changed

1. **The end screen says `Unrated`.** One word in the eyebrow the frame already
   draws. There was no misleading Elo to remove — the frame carries no rating
   figure for *any* match — but there was also nothing telling a player the
   ladder had not moved. No banner, no explanation, no second layout.
2. **The opponent is called `Bot`, not `Opponent`.** `"Opponent"` is not merely
   anonymous when there is no other player; it is inaccurate, and it was the
   one human-only field leaking into a bot match. Applied through
   `projectCombatants`, so the live arena, the duelist columns, the reveal
   panel and the end screen agree.
3. **The end screen is no longer a dead end.** It offered one button,
   `Back to Quiz`, which returned the player to the hub with the record closed.
   `ArenaTerminalView` now exposes `secondaryAction` (which `MatchOverFrame`
   has always rendered), and Ranked fills both slots:
   **Play Again** → `/quiz?play=1` (the lobby with the match-entry record
   already open — the existing `PLAY_RETURN_PARAM` arrival, one navigation
   removed) and **Back to Leaguecraft** → `/quiz`. Identical for both flows;
   no rematch endpoint, no second creation call. RB1 made this urgent, because
   a Premium player using Bot Ranked as their Ranked substitute paid the whole
   navigation cost on every match.
4. The dev arena inspector gained the two bot end-screen states beside the
   human ones, and its actions now come from one constant so it cannot drift
   from the product it previews.

Deliberately NOT done: bot personalities, difficulties, classes, selectable
identities, fake profiles, fake Elo, fake rank. Nothing was redesigned.

## End-screen state

```
MATCH COMPLETE · UNRATED      (bot)   /   MATCH COMPLETE   (human)
VICTORY | DEFEAT | DRAW
You  [role · Lv · HP · XP]     Bot  [Duelist · Lv · HP · XP]
(discovery ceremony, when the match added questions)
[ Play Again ]
[ Back to Leaguecraft ]
```

Verified at 1280×900 and 375×812. No horizontal overflow at mobile
(`scrollWidth === innerWidth`); panels and actions stack; the hierarchy above
holds at both widths.

## Shared Ranked issues found — NOT fixed here

These are symmetric between the two flows, so fixing them with bot-specific
code would be exactly the drift RB2 exists to remove.

* **Neither duelist has a name in the live views.** Participant display names
  are stored and reach match HISTORY, but `ranked_public/identity_redaction.py`
  redacts identity from every live projection by design, so the arena has
  always read `You` / `Opponent`. Giving Ranked real names is a product +
  privacy decision, not a parity correction.
* **`RankedMatchHistory` prints a literal `"Bot"`** and discards
  `opponent_display_name`, which the backend *does* populate for bots
  (`ranked_public/bot.BOT_DISPLAY_NAMES`). Showing the name would remove the
  unambiguous bot marker from a compact row, and two of the five stored names
  read as human. Left as-is; the data is pinned by a test so a future reader
  has it.
* **`playtestNote: "Playtest · Placeholder"`** still renders
  `ranked-playtest-label` in the arena header. It is gated on the placeholder
  question bank, not on bot-ness, and is off in production — but it is the last
  piece of testing vocabulary a player could see.
* `BOT_DISPLAY_NAMES` contains `"Test Summoner"`. Never rendered today. RB3 may
  actually want it.

## ⚠ The one real hazard RB1 created — CLOSED by RB2.1, kept here for history

`service.create_bot_match` resolves its format against the **`admin_bot`**
configuration target; the public queue uses **`public`**. There is no
cross-target fallback, deliberately. That was correct when the bot lane was a
staff staging area for a format before it was promoted to `public`.

**It is no longer staff-only.** An operator who saves an `admin_bot` config is
now shipping a different Ranked to every Premium player, silently.

With no saved config — every normal deployment — both targets fall through to
the same ladder and the two lanes are identical; that is pinned by
`test_ranked_bot_result_parity.py`. **Resolved by owner decision in RB2.1 — see below.** The operator invariant
this section used to state no longer applies: saving an `admin_bot` config
now changes nothing a player can reach.

## Files changed (RB2)

Frontend:

* `src/pages/quiz-ranked/QuizRankedMatch.tsx` — `isBotMatch`, the `Unrated`
  eyebrow, both end-screen actions, `revealNames` label
* `src/pages/quiz-ranked/rankedViews.ts` — `opponentLabelFor`
* `src/lib/ranked-core/arenaView.ts` — `ArenaTerminalView.secondaryAction`
* `src/components/ranked-arena/CanonicalArena.tsx` — forwards it
* `src/pages/dev/ranked-arena-inspector/RankedArenaInspector.tsx` — bot states
* `src/pages/quiz-ranked/QuizRankedMatch.botParity.test.tsx` (new)
* `src/pages/quiz-ranked/QuizRankedMatch.discovery.test.tsx` — action assertion

Backend: `test_ranked_bot_result_parity.py` (new). **No backend production code
changed in RB2** — the result contract was already right.

## Tests (RB2)

```bash
# frontend, serial
npx vitest run --no-file-parallelism src/pages/quiz-ranked src/components/ranked-arena \
  src/lib/ranked-core src/components/quiz/play-scroll src/lib/ranked-public \
  src/hooks/useRankedBotAccess.test.ts src/pages/dev
npx tsc --noEmit -p tsconfig.app.json
```

**2736 passed, 4 skipped, 1 failed** — the one failure is
`LobbyPreviewPage.test.tsx > is imported by the preview page ALONE`, which
fails identically on a stashed tree (a `pt14EntitlementSources` test mentions
`lobbyPreviewFixtures`). `tsc` output is byte-identical to the RB1 baseline.

```bash
.venv/bin/python -m pytest test_ranked_bot_result_parity.py -q          # 12 passed
```

Backend regression over the RB1 file set plus both new modules:
**255 passed, 87 failed** — the same 87 as RB1's baseline (the modern format's
shared-bank pools are not seedable from these fixtures). Zero new failures.

---

# RB2.1 — one base Ranked format, both opponents

## The decision

Owner decision, taken after RB2 surfaced the fork:

```
                    ┌─ human opponent → rated
Base Ranked format ─┤
                    └─ bot opponent   → unrated
```

**not**

```
public format    → Human Ranked
admin_bot format → Bot Ranked
```

Bot-ness is an **opponent and rating** distinction, never a quiz-format one.
Ranked is the canonical gameplay engine; Bot, Review, Custom, Playtest and
eventually Tournament are configurations and orchestration *around* it. Session
configuration (which questions a Playtest curates, which interstitials it
inserts) is a separate concern from the base Ranked format, and must not be
confused with it.

## What `admin_bot` actually was

A **saved-configuration target**, one of two in `ranked_format_configs`
(`migrate_add_ranked_format_configs.CONFIG_TARGETS = ("admin_bot", "public")`).
Each target stores the format an admin last saved for that lane; the two are
fully independent with no cross-target fallback. Its purpose was to let staff
stage a Ranked format on the bot lane before promoting it to `public`.

Inspection of every reference:

| Question | Answer |
| --- | --- |
| Only used by `create_bot_match`? | As a *format target*, **yes** — one call site, `service.py`. (`_create_admin_bot_match` in `routes/ranked_public.py` is a function *name*, not the target.) |
| Exposed in admin tooling? | **Yes** — `GET`/`PUT /api/ranked/admin/format-config/{target}` accepts it, and `format_config` stores revisions/history for it |
| Tests relying on it? | **Yes** — `test_ranked_format_config.py` (store-level revisions/history), `test_ranked_format_config_consumption.py` (lane independence), `test_ranked_mastery_on_demand.py` (an internal fixture creating against it via `create_match_rows(config_target=...)`) |
| Persisted config in schema? | **Yes** — declared in `CONFIG_TARGETS`, rows may exist in `ranked_format_configs` |
| Would deleting it break unrelated infrastructure? | **Yes** — the store, the admin routes and the mastery fixture all address it |

So it is **retained as dormant legacy infrastructure**, not deleted. It keeps
its schema row, its admin routes, its store tests and its fixture use. What it
lost is its product path.

## The change

One argument, in `ranked_public/service.create_bot_match`:

```diff
-                p1_role=resolved_role, p2_role=resolved_bot_role,
-                config_target=CONFIG_TARGET_ADMIN_BOT)
+                p1_role=resolved_role, p2_role=resolved_bot_role)
```

`create_match_rows` defaults `config_target` to `CONFIG_TARGET_PUBLIC`, which
is exactly what the queue passes. Both entry points now reach the *same*
existing helper — `service.format_for_creation(..., target="public", cur=cur)`
— through the same argument list. No new resolver, no extraction, no override
system. The invariant is structural: there is no argument left for a bot match
to differ by.

Docstrings updated in `service.py`, `format_config.py`,
`migrate_add_ranked_format_configs.py` and the admin route to say `admin_bot`
is dormant.

**No frontend change.** RB2 already proved both paths converge on
`QuizRankedMatch → CanonicalArena → MatchOverFrame`; the format target is
purely a creation-time backend concern.

## Proof

`test_ranked_format_config_consumption.py` — six cases rewritten from "the two
lanes are independent" to the inverted invariant:

* no saved config → human and bot freeze the identical ladder format;
* saved `public` → **governs the bot match too**;
* saved `admin_bot` → **ignored by ordinary Bot Ranked**, which stays on
  `public`/ladder (the regression that stops the fork returning);
* both saved at once → bot and human matches freeze the *same* snapshot, and
  it is `public`'s;
* a *corrupt* dormant `admin_bot` row now breaks neither lane, because nothing
  reads it;
* source-level: `create_bot_match` passes no `config_target` at all, while the
  queue still names `public` explicitly.

The resolver-level rule is unchanged and still pinned: the two targets never
borrow from each other.

`test_ranked_bot_result_parity.py` gained the required-differences case — a bot
match still has a synthetic `bot::` opponent, no queue entry,
`creation_source='bot_playtest'`, no frozen difficulty, and settles to
`rating_skip_reason='bot_match'` — plus the human control proving rating still
applies.

## Tests (RB2.1)

```bash
.venv/bin/python -m pytest test_ranked_format_config_consumption.py -q   # 32 passed
.venv/bin/python -m pytest test_ranked_bot_result_parity.py -q           # 14 passed
```

Ranked regression over 13 modules: **183 passed, 77 failed** — the same 77 as
the stashed-tree baseline (the known fixture limitation: the modern format's
shared-bank pools are not seedable). Zero new failures.

## Final invariant

> Human and Bot Ranked share the same canonical base Ranked format and the same
> renderer. Bot differs only where required by opponent orchestration and
> rating policy: a server-controlled opponent, immediate creation with no queue
> entry, and an unrated result.

---

# RB3 — the guided Playtest preset

```
Playtest  ──►  configured Bot Ranked session  ──►  canonical Ranked
                                                   questions + renderer
```

## Playtest identity

**No new mechanism.** `profiles.pro_grant_kind` already carries the value, the
production CHECK constraint already restricts it to
`manual | playtest | promo | gift`, and PT1.4's composition function already
nulls it for a grant that has lapsed. RB3 only stopped throwing it away.

| Layer | Before RB3 | After |
| --- | --- | --- |
| Supabase RPC `my_pro_entitlement()` | already returned `grant_kind` | unchanged |
| `services/pro_status.py` | read `effective_pro`, discarded the rest | one `_resolve()` returns `(effective_pro, grant_kind)`, one cache entry, one round trip; `get_pro_status()` keeps its boolean contract and `get_grant_kind()` is new |
| `services/entitlement.py` | `Capability` | gained `is_playtester` |
| Frontend `lib/pro/entitlement.ts` | **already exposed `grantKind`** | unchanged |
| Frontend hook | — | `useRankedPlaytestAccess` |

The two questions are deliberately separate and tested against each other:

```
useRankedBotAccess       may this account use Bot Ranked?   any Premium
useRankedPlaytestAccess  is this account a playtester?      a playtest grant
```

An ordinary Premium subscriber passes the first and fails the second. Admin is
the operator override on both.

**Failure direction:** an unreadable *grant kind* does not fail the whole
capability — the Pro answer already succeeded, and paywalling a subscriber over
a sub-field would be worse than reading them as "not a playtester". Unknown is
the closed direction for the one bit it gates.

## Session/preset representation

**Gameplay is a `RankedFormat`.** The existing one. `guided_playtest_format()`
in `ranked_formats/schema.py` is a seven-slot `segment_pattern` of existing
module specs, frozen into the match at creation like every other format.

**Narration is a frontend preset.** `src/lib/playtest/preset.ts` — the intro,
the between-segment pages and the outro. Not gameplay, which is the only reason
it is allowed to be playtest-specific at all.

Reached by `POST /api/ranked/queue { match_with_bot: true, preset: "playtest" }`.
There is **no playtest endpoint**: the preset rides the one join, and
`service.PRESET_FORMATS` is the (one-entry) seam a later Review or Custom
preset joins without touching match creation again.

## Why this does not fork Ranked

* Every gameplay segment names a module the frontend registry **already** has
  (`quiz`, `item_cost_duel`, `mastery_slice`). `registeredModuleIds()` contains
  nothing matching `/playtest/i`, and a test holds that.
* `QuizRankedMatch` gained three **optional** props — `paused`,
  `onSessionComplete`, `onProgress` — all absent for every ordinary match.
  Nothing else in it moved.
* The result screen is RB2's `MatchOverFrame`, unreplaced. The outro is what
  its primary action leads *to*.
* RB2.1 is intact: a bot match with **no preset named** still freezes `public`.
  Nothing about *being a bot* reaches the preset; only *asking for one* does.

## Interstitials

`PlaytestInterstitialView` — one panel, eyebrow/heading/body/one action, drawn
with the Ranked shell's own `ranked-panel` / `ranked-eyebrow` / `ranked-title`
classes so a page between two segments reads as part of the same match. It
renders no question, holds no timer and submits nothing.

The arena stays **mounted** underneath (`hidden`), so the settlement ledger,
timeline and mascots are not rebuilt on the far side of a page.

## Timers

An interstitial spends **no answer time**, and not by hiding a clock — by
stopping it:

> Ranked advances **lazily**. `ranked_public.service._advance` opens the next
> round only when a participant's own request drives it, and the background
> sweep is off by default. While the client does not poll, no round opens, no
> question clock starts, and the bot does not act.

`useRankedMatch({ paused })` holds the poll loop's re-arm and clears any
pending timer. The **presence heartbeat runs on its own interval and is never
held** — `service.heartbeat` deliberately does not call `_advance` — so a held
match is not an absent player and cannot be forfeited for one.

## Persistence / reconnect

Position in the guided sequence is **derived, never stored**:

| Fact | Source | Survives a refresh? |
| --- | --- | --- |
| which session this match is | the match's **frozen format snapshot**, projected as `playtest.session_preset` | yes — it is a property of the match |
| how far the match has got | the server's `completed_rounds` | yes |
| which pages this viewer has read | `sessionStorage`, keyed by match id | best-effort |

Only the third can be lost, and its worst case is bounded: the player reads one
page they have seen before. It cannot lose their position, because their
position is the server's segment count.

`advance()` writes into a **set** keyed by page id, so a double click adds the
same id twice — the same set. There is no cursor to run past the end of and no
way to skip a page that was never on screen. `Begin` is guarded by a **ref**
(not state), so two clicks in one frame create one match.

## Question sourcing

**Nothing was authored for the playtest.** Every slot names an existing
authority:

| # | Module | Source |
| --- | --- | --- |
| 1 | `quiz` | shared-bank pool `easy_item_cost` |
| 2 | `quiz` | shared-bank pool `easy_game_knowledge` |
| 3 | `quiz` | shared-bank pool `medium_item_stats` |
| 4 | `item_cost_duel.v4` ×5 | the shipped Meta Reflex block |
| 5 | `mastery_slice` ×3 | `playtest.champion.ahri` |
| 6 | `mastery_slice` ×3 | `playtest.matchup.ahri.syndra` |
| 7 | `mastery_slice` ×2 | `chain.jarvan.physical_penetration` |

The three Mastery sets are the three already registered in
`COMPATIBLE_MASTERY_SETS`. Timers and damage are the production constants — a
playtester is meant to feel Ranked, not a tuned-down demo. Readiness is checked
at creation (`assert_format_servable`): a deployment that cannot generate a set
is refused **loudly at creation**, never mid-match.

## How to edit the playtest

Two files, two halves, neither of them Ranked:

* **Gameplay** — `ranked_formats/schema.py`,
  `_guided_playtest_segment_pattern()` (backend). Which content, in what order,
  with which timers and damage.
* **Narration** — `src/lib/playtest/preset.ts` (frontend). Move a page by
  changing its `afterSegments`; add one by adding an entry; change the copy by
  changing the copy.

`afterSegments` is a count of **settled segments**, which is why it survives a
reload — it is compared against the server's own number, not an index into
client memory.

## Entry point

`/quiz/playtest`, a **separate route**. Nothing in canonical Ranked knows it
exists, so the whole playtest is removed afterwards by deleting one route and
`src/components/playtest/`. Pressing **Match with Bot** in the PLAY record
still starts an *ordinary* bot match — it sends no preset — so no Ranked click
is hijacked and no Premium user is walked into a demonstration.

Client-side gating is visibility only; `_authorize_preset` re-decides on the
join, so typing the URL as a non-playtester is refused by the server.

## Files

**Backend** (`League_Combat_Simulator`)

* `ranked_formats/schema.py` — `GUIDED_PLAYTEST_FORMAT_ID`,
  `guided_playtest_format()`, `_guided_playtest_segment_pattern()`,
  `_guided_mastery()`
* `ranked_formats/__init__.py` — exports
* `ranked_public/service.py` — `PRESET_FORMATS`, `preset_format()`,
  `create_bot_match(preset=…)`, `create_match_rows(format_override=…)`
* `ranked_public/projections.py` — `playtest.session_preset` from the snapshot
* `routes/ranked_public.py` — `_authorize_preset`, three typed codes
* `schemas/ranked_public_schemas.py` — `QueueJoinIn.preset`
* `services/pro_status.py` — `_resolve`, `get_grant_kind`
* `services/entitlement.py` — `Capability.is_playtester`, `GRANT_KIND_PLAYTEST`
* `test_ranked_playtest_preset.py` (new)

**Frontend** (`mogsy`)

* `src/lib/playtest/preset.ts`, `usePlaytestSession.ts` (+ test)
* `src/components/playtest/PlaytestInterstitial.tsx`,
  `PlaytestMatchHost.tsx` (+ test)
* `src/hooks/useRankedPlaytestAccess.ts` (+ test)
* `src/pages/quiz-ranked/QuizPlaytestPage.tsx`, `src/App.tsx` — the route
* `src/pages/quiz-ranked/useRankedMatch.ts` — `{ paused }`
* `src/pages/quiz-ranked/QuizRankedMatch.tsx` — three optional props
* `src/lib/ranked-public/contracts.ts`, `client.ts`,
  `src/pages/quiz-ranked/useRankedQueue.ts` — `preset` / `sessionPreset`

## Tests

```bash
# backend
.venv/bin/python -m pytest test_ranked_playtest_preset.py -q          # 19 passed

# frontend, serial
npx vitest run --no-file-parallelism src/pages/quiz-ranked src/components/ranked-arena \
  src/lib/ranked-core src/lib/ranked-public src/lib/playtest src/components/playtest \
  src/components/quiz/play-scroll src/hooks
```

* Backend RB3 suite: **19 passed**.
* Backend Ranked+entitlement regression over 19 modules: **99 failures, the
  same 99 as the stashed-tree baseline.** Zero new.
* Frontend targeted sweep: **112 files / 1534 tests, all passing** — includes
  RB3's 40 new tests (17 session, 15 host, 8 access).
* `tsc` output identical to the RB2 baseline; `vite build` succeeds.
* Full frontend suite has 53 pre-existing failures (`onboarding-gate`,
  `LolHub.background`) that fail identically on a stashed tree.

## Owner decisions before the actual playtest

1. **Copy.** Every string in `preset.ts` is a placeholder. RB3 is the
   architecture; the wording is a string edit.
2. **The outro's offer and feedback CTA.** `PlaytestInterstitialView` takes a
   `children` slot for exactly this. Nothing is in it yet — no Premium offer
   component and no feedback link were invented.
3. **Match length.** A Ranked match ends on **HP**, not on running out of
   pattern, so a long match cycles back into segment 1 after the seventh. The
   guided sequence covers the opening. If the playtest should instead be
   length-bounded, that is a Ranked-engine change and is *not* a preset
   concern — flag it before deciding.
4. **How playtesters are told the route exists.** Today `/quiz/playtest` is
   reachable but unlinked. A link on the PLAY record for playtesters only is a
   small addition; auto-launching on their first Bot Ranked click is not
   recommended (it is exactly the hijack RB3 avoided).
5. **Resuming a live playtest.** Navigating to `/quiz/playtest` with a match
   already running starts a new one and is refused with
   `RANKED_ACTIVE_MATCH_EXISTS`, shown as an honest error. Wiring the route to
   `getActiveMatch` and resuming into the session would remove that; it needs a
   decision on whether a playtester may abandon a guided match.
6. **Granting the tag.** Playtesters need `pro_grant_kind='playtest'` set. The
   admin grant UI already exists (see the ADMIN1 notes); no new tooling was
   built.

## Next task

**RB4 — playtest content and copy pass**, once the owner decisions above land:
fill the real copy, wire the outro's offer/feedback slot, and walk the sequence
end to end on a deployment that can actually generate the three Mastery sets.

---

# RB3.1 — the lost admin access point, and the RB1–RB3 integration

Status: **fixed, integrated and pushed to both canonical branches.** RB4 is
next. Frontend `main` **f5c96fbe**, backend `master` **fe936fe7**.

## The regression

The owner reported that admin no longer had any way to launch Bot Ranked: the
access point that existed before this workstream was simply gone from the app.

**It was live on `origin/main` the whole time, and no RB commit caused it** —
every RB commit was still unpushed. The cause was the *partial earlier change*
RB1's notes already described, sitting in production:

| Layer, as deployed | What it did |
| --- | --- |
| `useRankedBotAccess` | resolved `canPlayRankedBot` correctly |
| `RankedPlayScroll` | passed `canPlayRankedBot` to `PlayScrollRecord` |
| `PlayScrollRecord` | passed `canPlayRankedBot` to `RankedQueueView` |
| `RankedQueueView` | **still declared `isAdmin = false`** and gated on it |

The boundary had been renamed everywhere except in the one component that
reads it. `showBotToggle = isAdmin && idle` therefore evaluated `false` for
every viewer — admin, Premium and Free alike — because nothing passed
`isAdmin` any more. The switch was not hidden from admin; it was unreachable
for everybody, and `extra` props being silently ignored in React is why it
failed in complete silence.

Confirmed **in the deployed bundle**, not only in source. From
`https://mogzy.lol/assets/PlayScrollRecord-iEgB_bau.js`:

```js
function ma({queue:a,role:s,onJoin:l,onBack:n,isAdmin:o=!1})   // RankedQueueView
  ..., _=o&&b,                                                 // showBotToggle
function Fa({..., canPlayRankedBot:_=!1, ...})                 // PlayScrollRecord
  ... e.jsx(ma,{queue:..., canPlayRankedBot:_, ...})            // ignored by ma
```

And reproduced under test: restoring `origin/main`'s `RankedQueueView` into
this branch fails **9** of `RankedPlayScroll.test.tsx`'s cases, including both
admin ones. Putting RB1's version back passes all of them.

**The backend never regressed.** `origin/master`'s
`POST /api/ranked/queue` still ran `if body.match_with_bot: if not
is_request_admin(...)`, so an admin bot queue was authorized in production
throughout. This was a **frontend-only visibility regression**.

## The fix

Two parts, smallest first.

1. **The root cause is RB1**, already written and now landed: `RankedQueueView`
   takes `canPlayRankedBot` and gates on it. Nothing else was needed to give
   admin the access point back.
2. **RB3.1 closed the second, independent way to lose it** —
   `useRankedBotAccess` made admin depend on the Premium answer it does not
   need:
   * `loading` was the union of both answers, so admin *waited* on an
     entitlement round trip before the control could be drawn; and
   * a `fetchProEntitlement()` that **rejected** never called `setPremium`, so
     `premium` stayed `null` forever, `loading` never ended and the control was
     hidden from admin **by an outage in the billing half of the system** —
     exactly the case the operator override exists for.

   Admin and Premium are now two independent routes to yes: a known admin role
   ends the wait on its own, and a thrown lookup lands as the same closed
   unknown a `null` one does so it can never strand the hook. Nothing opened
   for anyone else — an unresolved, failed or Free entitlement still withholds
   the control, and an unresolved **role** still withholds it from a would-be
   admin, so nothing is drawn optimistically and nothing flashes.

Entitlement architecture was **not** touched. The trace did not call for it.

### Files changed (RB3.1)

* `src/hooks/useRankedBotAccess.ts` — the admin short-circuit and the `catch`
* `src/hooks/useRankedBotAccess.test.ts` — five cases: offered before the
  lookup answers at all, survives a lookup that throws, survives a flat Free,
  a non-admin whose lookup throws is still refused, and the role answer is
  still waited on
* `src/components/quiz/play-scroll/RankedPlayScroll.test.tsx` — the same
  invariant at the surface the owner actually looks at: an admin whose
  entitlement never resolves still sees the control, through the real
  component chain

## Integration

Both RB chains were rebased onto the current canonical tips rather than merged
over them, and every concurrent workstream that had moved the same files was
preserved by hand.

| Conflict | Concurrent work | Resolution |
| --- | --- | --- |
| `QuizRankedMatch.tsx` imports | RP1 points feedback / scoreline | both import lists merged; `opponentLabelFor` kept |
| `QuizRankedMatch.tsx` terminal view | RP1's `scoreline`, `withFinalScore`, `result` | RP1's block kept **whole**, RB2's `eyebrow` added beside it |
| `RankedArenaInspector.tsx` | RP1's nine points-settlement previews | both entry sets kept; RP1's now-removed `"Back to Quiz"` action converted to RB2's `END_ACTIONS`, which is the only end-screen action the product still has |
| `ranked_formats/schema.py` | RP1's `ranked_points_v2_format` | both formats kept, each closing its own `RankedFormat(...)` |
| `ranked_public/service.py` | RP1 resolving the format before the engine | RB3's `format_override` folded **into** RP1's earlier resolution point, not around it |

Nothing was overwritten and nothing was dropped. Ranked scoring (RP1), Ranked
visuals, Pro Play, Premium and Welcome work all came through untouched, and no
unrelated dirty worktree was disturbed.

## Verification

**Backend** (`.venv/bin/python`, from `/Users/macmoney/lcs-wt-rb1`)

```bash
.venv/bin/python -m pytest test_ranked_bot_premium_access.py \
  test_ranked_bot_result_parity.py test_ranked_format_config_consumption.py \
  test_ranked_playtest_preset.py -q          # 80 passed
```

Every required proof is a named passing test: `test_admin_still_gets_a_bot_
match_immediately`, `test_admin_access_never_depends_on_the_entitlement_
service`, `test_a_premium_non_admin_gets_the_same_bot_match`, `test_a_free_
account_is_refused_and_is_not_quietly_queued`, `test_forging_the_request_does_
not_bypass_the_gate`, `test_an_unresolvable_entitlement_never_authorizes`,
`test_an_outage_is_not_reported_as_a_free_account`, `test_the_ordinary_join_
never_asks_about_entitlement`, the `rating_skip_reason='bot_match'` parity
case, the dormant-`admin_bot` cases, and RB3's canonical-bot-match creation.

Regression, 12 Ranked/entitlement modules, compared as failure **sets** against
a freshly built `origin/master` worktree rather than a remembered number:

```
rebased branch : 87 failed, 186 passed, 43 skipped   (99 FAILED/ERROR lines)
origin/master  : 87 failed, 186 passed, 43 skipped   (99 FAILED/ERROR lines)
diff of the two failure sets: EMPTY, both directions
```

The 99 are the repo's known fixture baseline (the modern format's shared-bank
pools are not seedable here). **Zero new, zero fixed.**

**Frontend** (`/Users/macmoney/mogsy-wt-rb3`)

```bash
npx vitest run --no-file-parallelism src/pages/quiz-ranked src/components/ranked-arena \
  src/lib/ranked-core src/lib/ranked-public src/lib/playtest src/components/playtest \
  src/components/quiz/play-scroll src/hooks
# 123 files / 1635 tests, ALL PASSING
npx tsc --noEmit -p tsconfig.app.json   # 12 errors, none in any RB-touched file
npx vite build                          # ✓ built in 59.77s
```

`tsc`'s 12 errors are all pre-existing and live in `AdminBots`, `admin-users`,
`team-sim`, `LeaguecraftWorkspace`, `social-result`, `diagnostics`,
`ComboPlanner` and a `pglite` import — the RB diff intersects none of them.

## Deployment

> Push is not deploy. Both of these were checked against the running
> deployments, not inferred from a successful push.

**Backend — Railway.** `/api/health` 200. Rollout of `fe936fe7` is verified by
reading the deployed schema rather than a version string (`/api/version`
returns a hand-set literal and proves nothing): RB3 adds `preset` to
`QueueJoinIn`, so

```bash
curl -s https://web-production-83e53.up.railway.app/openapi.json \
  | python3 -c "import json,sys;print(list(json.load(sys.stdin)['components']['schemas']['QueueJoinIn']['properties']))"
```

printing `['class_id','queue_version','match_with_bot','preset']` is the
deployment consuming this commit. Before the push it printed the same list
**without** `preset`.

**Frontend — Lovable. NOT LIVE, and the owner must press Publish.** A push to
`main` does not deploy mogzy.lol. The bundle serving production is pre-RB
throughout — its end screen still says `"Back to Quiz"` (which RB2 removed),
carries no `"Play Again"`, no `"Back to Leaguecraft"` and no `"Unrated"`, and
its `RankedQueueView` still reads the dead `isAdmin` prop. **Until Publish is
pressed, admin still has no Bot Ranked access point in production.** That is
the one remaining action on this regression, and it is owner-only.

## Known issues left open

* **Lovable Publish is outstanding** (above). It also carries the Pro Play and
  RP1 work already merged to `main` by other workstreams.
* The primary frontend checkout `/Users/macmoney/mogsy` still has local `main`
  pointing at the **pre-rebase** RB1/RB2/RB2.1 commits and holds another
  workstream's uncommitted Pro Play changes. It was deliberately left alone.
  Its owner should commit or stash that work and then reset `main` to
  `origin/main`; the three local commits are superseded by the rebased ones.
* Everything RB2 recorded as shared-Ranked and NOT fixed here still stands:
  live views have no participant names, `RankedMatchHistory` prints a literal
  `"Bot"`, and `playtestNote` is the last testing vocabulary a player could
  meet.
* HP-based match completion is untouched — another Ranked workstream owns it.

## Next task

**RB4 — the playtest content and copy pass**, unchanged: the six owner
decisions above it, then the real copy, the outro's offer/feedback slot, and a
walk of the sequence on a deployment that can generate the three Mastery sets.

---

# RB3.2 — entry is not recovery, and global Premium reaches Bot Ranked

Status: **fixed and pushed.** Frontend `main` **5f903f40**, backend `master`
**b8329c0c**. Backend deployed; frontend needs a Lovable Publish. RB4 next.

## The report

As admin: the Bot Ranked access point appears (RB3.1 shipped), pressing it
creates the match — and then the UI sits on **`Recovering match`** for an
unreasonable time before entering.

## Root cause — why a brand-new match "recovered"

Nothing was being recovered. `POST /api/ranked/queue { match_with_bot: true }`
creates the match inside that request and answers `matched` **with its id**, so
the client arrives knowing exactly which match it wants. Measured against the
real API, the whole server side of a fresh entry is two fast calls:

```
JOIN   → 200 {"status":"matched","match_id":"rkb_…"}
RESUME → 200 in ~10ms, already carrying round 1: two players, an
         active_round with its deadline, and the question
```

Three separate layers nevertheless treated that arrival as a rediscovery.

| Layer | What it did on a fresh entry | Why it is wrong |
| --- | --- | --- |
| `QuizRankedPage.RankedMatchHost` | called `getActiveMatch` on **every** mount, including when the scroll had just handed it an id | discovery answers "does this account have a match?" — already answered. It never blocked the render, but it spent a request and a Supabase session read on the entry path of every match |
| `useRankedMatch` mount effect | made the **recovery round trip** (`POST /resume`) on every mount | resume exists to rebuild a settlement, a reveal, a segment transcript, a finished result and the damage ledger. A one-second-old match has none of those, so it asked the server to reconstruct nothing |
| `QuizRankedMatch` placeholder | rendered `"Recovering match…"` whenever `!publicRound` | **this is the string the owner saw.** It is not a recovery state at all — it is the ordinary pre-first-snapshot placeholder, and it was the only sentence the player got |

So the arena announced a salvage operation while making three concurrent
requests — discovery, resume, snapshot — each behind its own
`supabase.auth.getSession()` in `getBackendAuthHeaders`, for a match one
snapshot would have painted.

**Human Ranked hit the identical path**, because none of the three is
bot-specific: pairing hands over an id exactly as the bot join does. Bot
Ranked only made it conspicuous, by removing the matchmaking wait that used
to hide it.

## Every circumstance that produced `Recovering match`, classified

There is exactly one producer — `CanonicalArena` with `view === null`, from
`QuizRankedMatch`'s `!m.publicRound || !combatants`.

| Circumstance | Class | Now |
| --- | --- | --- |
| Fresh bot match from the PLAY record | **ordinary init mislabelled** | `Entering the arena…`, no discovery, no resume |
| Freshly paired human match | **ordinary init mislabelled** | identical to the above |
| RB3 playtest match (host creates it) | **ordinary init mislabelled** | `entry="fresh"` |
| Page refresh / cold load into a live match | **legitimate recovery** | unchanged: discovery, then resume |
| Back-navigation into a match that has moved on | **legitimate recovery** | recovered on the server's own round count, not the caller's claim |
| Between-round gap, snapshot in flight | never reached — `publicRound` is sticky once set | unchanged |
| Contract error / fatal | own branches, above this one | unchanged |

The queue's own `"recovering"` state (`useRankedQueue`) is a **different
thing** and was not touched: it is the pre-first-poll state of the match-entry
record and renders as *"Opening the queue…"*. It never says "Recovering match".

## The change

One new prop, carried by the only layer that knows the answer:

```
entry: "fresh" | "recovered"      // default "recovered"
```

* **Route.** `getActiveMatch` is skipped entirely when the scroll handed over
  an id, and the route tells the arena which kind of arrival this is —
  `"fresh"` for a handoff, `"recovered"` for a discovered id.
* **Controller.** A fresh entry makes **no** resume call; the ordinary snapshot
  is the first and only request, and it is what paints the arena. Recovery is
  extracted into one idempotent `recover()`.
* **Arena.** The placeholder says `Entering the arena…` on a fresh entry and
  keeps `Recovering match…` for a real one.

**It is an optimism, never an authority.** The first snapshot re-decides from
`pub.completedRounds`: a match that has already played rounds recovers its
transcript immediately — once — from the server's count rather than the
client's claim. No server authority was removed, no match validation bypassed,
and nothing on the entry path can create, queue or pair anything (pinned).

Requests on a fresh entry: **3 → 1.** No new mechanism, no bot-specific entry
code, no second renderer.

## Performance

The measured server cost of a fresh entry was never the problem — join and
resume are milliseconds. What the entry path spent was **client** cost:
three concurrent authenticated requests where one was needed, each awaiting
`supabase.auth.getSession()`, which refreshes the token over the network when
it has expired. Removing two of the three removes two of those session reads
from the moment the player is staring at the placeholder.

Genuine recovery is *not* slower: the snapshot and the resume still both run,
and the arena still paints on whichever lands first. The 800ms
"opponent found" beat in `PlayScrollRecord` is deliberate, sits before
navigation and was left alone — it is a legible transition, not a wait.

Honest limit: the exact production millisecond attribution was **not**
measured. There is no authenticated production session available here.

## Global Premium → Bot Ranked (Task 4) — a real defect, found and fixed

* **Present in canonical code?** Yes. `app_settings.global_premium_access`,
  composed in `services/pro_status._resolve` **above** the per-user cache:
  `effective_access = global_premium_access OR (stripe_pro OR valid_grant)`.
* **Live?** **Yes** — read from production Supabase (the row is publicly
  readable by RLS): `{"key":"global_premium_access","value":{"enabled":true}}`.
* **Does an ordinary non-admin therefore resolve `canPlayRankedBot = true`?**
  **Now yes. Before this pass it raised.**

RB3 gave `_resolve` a `(effective_pro, grant_kind)` contract. The global
override branch, landed concurrently by the Premium workstream and written
against the older bool-returning version, kept `return True`. Every caller
subscripts the result:

```
get_pro_status()  →  _resolve(...)[0]  →  TypeError: 'bool' object is not subscriptable
```

With the window **open** — which is production's current state — that broke
*every* effective-Pro lookup in the backend, not only Bot Ranked: the Builder,
quiz history and Combat credits read the same resolver. Admin was unaffected
throughout, because `_authorize_ranked_bot` short-circuits on
`is_request_admin` before entitlement is consulted, which is exactly why the
owner could still start bot matches.

Neither commit is wrong alone; they are only wrong together. Bisected:

```
3bb15733 (RB2.1)  quiz/tests/test_global_premium_access.py  17 passed
fe936fe7 (RB3)    quiz/tests/test_global_premium_access.py   8 failed, 9 passed
```

> **Correction to the RB3.1 record.** That pass reported "zero new failures"
> against a freshly built `origin/master`. That was true of the 12 Ranked
> modules it compared and **false of the repository**: this file was outside
> the set, and it had been failing since `fe936fe7` landed. The comparison was
> too narrow, and the defect it missed reached production.

Fix: `return (True, None)`. `None` is deliberate — global access is a window
an admin opened, not a grant the account owns, and this branch short-circuits
above the cache precisely so it still answers while Supabase is unreachable.
The one consequence is that a playtest **grant** is invisible while the window
is open, which is the closed direction for the single bit it gates.

## Verification, by tier — do not conflate these

**Code-path verification**
* Deployed production bundle re-read: `RankedQueueView` now destructures
  `canPlayRankedBot:o=!1` and gates `_=o&&b`. RB1's fix **is live**, and
  `"Admin test"` is gone in favour of `"Ordinary Ranked, unrated"`.
* Production `app_settings` read directly: the global window is open.

**Automated integration proof**
* Backend `test_ranked_bot_premium_access.py` — **19 passed**, including four
  new cases that drive the whole chain with **no stub** between the override
  and the gate: an ordinary Free account with the window open receives the
  same canonical bot match; the tuple shape is pinned at `_resolve` itself;
  closing the window takes access back without writing to the account; admin
  needs neither the window nor a lookup. Reverting the one-line fix fails two
  of them, so they are not vacuous.
* `quiz/tests/test_global_premium_access.py` — 8 failed → **17 passed**.
* Frontend — **124 files / 1646 tests passing**, including 8 new entry cases.
  Reverting the entry gate fails "never makes the recovery round trip".
* Backend regression over 13 modules vs a freshly built `origin/master`:
  **99 failures on both, zero new, 8 fixed** (the global-Premium file).
* `tsc` byte-identical to the RB3.1 baseline (12 pre-existing, none in a
  touched file). `vite build` succeeds.
* The `activeMatch.test.ts` unhandled rejection (jsdom `storage.getItem`) is
  pre-existing: it reproduces with that file run alone.

**Actual production E2E — NOT performed.** Starting a bot match as a Premium
non-admin needs an authenticated ordinary-user session, which is not available
here. The Premium half is proved by code path and by automated integration
only. **This is the one claim not to make on my behalf.**

## Deployment

* **Backend — deployed.** `/api/health` 200. The rollout that completed after
  the push serves `/api/pro-play/research/contract`, which bounds it at
  ≥ `d71a334f`; `b8329c0c` itself changes **no wire surface**, so it cannot be
  fingerprinted from outside. Railway deploys `master` HEAD and this was the
  most recent push, but treat the specific commit as *consistent with* rather
  than *proved by* the probe.
* **Frontend — NOT live.** The deployed `QuizRankedMatch` chunk still contains
  `"Recovering match"` and no `"Entering the arena"`. **RB3.2's frontend half
  needs a Lovable Publish**; RB1/RB2/RB2.1/RB3 are already live.

## Files changed

Frontend: `QuizRankedPage.tsx`, `QuizRankedMatch.tsx`, `useRankedMatch.ts`,
`PlaytestMatchHost.tsx`, `QuizRankedPage.host.test.tsx`,
`QuizRankedMatch.entry.test.tsx` (new).
Backend: `services/pro_status.py`, `test_ranked_bot_premium_access.py`.

## Commits

* frontend `5f903f40` — fix(rb3.2): entering a Ranked match is not recovering one
* backend `b8329c0c` — fix(rb3.2): global Premium reaches Bot Ranked instead of raising

## Still open

* **Lovable Publish** for the frontend half.
* HP-based match completion is untouched — another Ranked workstream owns it.
* Everything RB2 listed as shared-Ranked and not fixed here still stands.
* The primary `/Users/macmoney/mogsy` checkout still holds another
  workstream's uncommitted Pro Play work and a stale local `main`.

## Next task

**RB4 — the playtest content and copy pass.**

---

# RB4A — the guided Playtest is a TEMPORARY exhaustive content audit

> **THIS IS NOT THE FINAL PLAYTEST SEQUENCE.** The owner will play the
> exhaustive version and prune it during **RB4B**, which is the next task in
> this workstream. Nothing below is a content-quality judgement; it is a
> census.

## Objective

RB3 shipped a seven-slot demonstration tuned to ten to fifteen minutes. The
owner replaced that objective for one pass: before any of it is polished, they
want to personally play **two to four questions of every currently servable
production question family, every currently published Ranked-compatible static
Mastery set, and every distinct playable module type**, and prune from there.

Session length was deliberately NOT optimised. One pass is 43 segments and
**63 gameplay answers**.

## The governing architecture is unchanged

`guided orchestration → canonical Bot Ranked`. Every question is an existing
module, at a shipped version, resolving an existing production source through
the renderer Ranked already has. There is no Playtest question bank, no
Playtest question, no Playtest renderer, no second quiz engine, no copied
payload and no parallel Mastery implementation.

## The authorities, and what they actually say

| Question | Authority (current source) | Answer |
| --- | --- | --- |
| Which quiz families may Ranked serve? | `ranked_public.shared_bank.POOLS` | 8 pools, **16 distinct families** |
| Which are reachable from a SHIPPED format? | `modern_ranked_format` + `ranked_points_v2_format` | **14** |
| Which Meta Reflex cards exist? | `ranked_formats.schema._PLAYTEST_META_REFLEX_FAMILIES` | **18** candidate families |
| Which Mastery sets may `mastery_slice` name? | `mastery.publication_gate.ranked_catalog.COMPATIBLE_MASTERY_SETS` | **3** |
| Which modules can Ranked render? | `ranked_modules.registry` + `src/lib/ranked-core/modules/registry.ts` | **3** module ids |

### The 14 vs 16 reconciliation

The recent audit's "14 production families" is **correct and is a different
count from 16**, not a contradiction:

* **16** = every family named by the eight pools in `POOLS`;
* **14** = the families reachable from a pool that a SHIPPED production format
  actually names.

The gap is exactly `hard_item_graph` (`item_missing_component_v2`,
`item_final_from_components_v2`) — a declared, contract-valid, `validate_pools`
-clean pool that **no shipped format names**. It is reachable Ranked
*configuration*, not reachable Ranked *gameplay*. RB4A audits it deliberately
(it is precisely a thing the owner should decide about) and flags it as such,
rather than folding it in with the seven pools ordinary Ranked plays.

`combat_cooldown` is the other reason a family count and a source count differ:
it backs both `hard_cooldowns` (tier 3, recall) and `scenario_cooldowns`
(tiers 4-5, worked under pressure). Those are materially different question
shapes on different clocks, so RB4A audits them as **two entries**, giving that
one family 4 questions across 2 prunable entries. 16 families → **17 audited
quiz sources**.

## Inclusion / exclusion rules

**INCLUDE** — a quiz family named by any pool in `POOLS`. That registry IS the
Ranked serving authority, and `validate_pools` has already proved every member
is RANKED-declared, in `SERVEABLE`, and not recognition-only.

**EXCLUDE**, with the reason recorded rather than the family silently dropped:

| Class | Count | Why |
| --- | --- | --- |
| RETIRED | 4 | `casts_before_oom`, `champion_ability_cooldown_max`, `champion_ability_cooldown_rank1`, `summoner_spell_cooldown_exact` — withdrawn; `WITHHELD_FROM_SERVING` |
| HOLD | 2 | `esports_pick_vs_ban`, `esports_top_role` — paused with a named blocker |
| LEGACY, not served | 5 | `builder`, `item_builds_into`, `item_component`, `item_final_from_components`, `item_missing_component` — superseded by the `_v2` families the pools now name |
| Recognition-only | 1 | `ability_recognition` — `RECOGNITION_ONLY_FAMILIES` bans it from every quiz pool by product rule; it IS audited, as a Meta Reflex card |
| **Serveable but in NO pool** | **21** | technically generated, **not currently Ranked-reachable** |

That last row is the prompt's fourth classification and the one real judgement
call. The families are `ability_cooldown_compare/flat/haste/rank`,
`champion_highest_base_stat`, `champion_stat_compare`, `champion_stat_level`,
`combat_scenario`, `item_effect_cooldown`, `minion_xp_level_breakpoint`, the
three `pro_*_comparison` families and the nine `takedown_*` families. Existing
policy settles it: a pool is "checked-in configuration" and "a deliberate
content choice", so making one of these Ranked-reachable means **adding a pool
to the production registry** — which is normal Ranked content selection (out of
scope this pass) and would also leak into the Format/Practice Builder catalog,
which enumerates `POOLS`. They are recorded here as the RB4B/RB5 candidate
list, not smuggled in.

Also excluded: `quiz.v2` and `item_cost_duel.v5` — not superseded but the
**points** (Ranked v2) versions of the same two modules. RB4A is an HP-scored
format, so it uses `quiz.v1` and `item_cost_duel.v4`. `item_cost_duel.v1-v3`
are superseded and render through a different frontend renderer that no
production format reaches.

## The seam that makes coverage enforceable

A quiz segment could previously name only a POOL. Pointing two segments at a
six-family pool and hoping the permutation covers it is not an audit, and
`SegmentSpec` had no way to say "this slot, that family".

RB4A adds the **generic narrowing** `module_config.families` — the same
spelling `item_cost_duel.v4` has always used for its candidate list:

```python
SegmentSpec(module_id="quiz", module_version=1, challenge_count=1,
            module_config={"pool": "easy_game_knowledge",
                           "families": ["camp_respawn"]})
```

It can only ever **narrow**: the value must be a non-empty, non-repeating
SUBSET of the families the named pool already declares, and a family the pool
does not declare is refused rather than ignored. Because it subsets an
already-validated pool, every rule `validate_pools` enforces holds for the
narrowed view **by construction** — there is no path here to a retired,
withheld or recognition-only family, and none to content no pool already
cleared. Absent means the whole pool, which is what every format saved before
this key existed means and must keep meaning.

No pool was added, no question row was duplicated, and the Builder catalog
still offers only `module_config.pool`.

### Three corrections the narrowing forced

1. **Readiness iterates SOURCES, not pool ids.** A pool holding thousands of
   rows can still leave one narrowed segment with nothing to serve;
   a pool-level size check would have passed that format and then killed the
   match mid-session with `RANKED_MODULE_DATA_UNAVAILABLE`.
   `assert_format_servable` now refuses at creation and **names the exact
   family**. (`required_pool_sources`, `source_label`.)
2. **`pool_serve_ordinal` counts sources too.** Two segments narrowing one pool
   differently walk two providers, and one shared counter would have stepped
   each past questions it had never served. An unnarrowed format is unaffected:
   its source is `(pool, ())` for every segment.
3. **The provider cache keys on the narrowing**, for exactly the reason it
   already keys on the mode.

## Why the owner is guaranteed to reach the end

A Ranked match ends on **HP**, not on running out of pattern. At production
damage (10-22 a losing exchange against a 150 HP start) a 43-segment sequence
would settle around a quarter of the way through and the audit would silently
have shown a quarter of the catalog.

Every zero-sum RB4A segment therefore deals **2 / 1** (`_RB4A_DAMAGE`) — the
smallest pair that keeps the HP bar a real, visible, auditable thing.
`_rb4a_worst_case_damage()` states the arithmetic: every exchange lost AND
every Meta Reflex block conceded perfectly is **115 HP**, against a minimum
starting HP of **150**. A test pins that inequality, so the guarantee cannot
rot as entries are pruned in RB4B.

The pattern still cycles; the match settles somewhere in the second pass, after
the audit is complete.

Timers are the production numbers per tier (easy 20s, medium 25s, hard 35s,
scenario 40s, Meta Reflex card 6s). Nothing else was softened.

## The exact sequence

**43 segments · 63 answers · every tag unique and `rb4a_`-namespaced**

### 1-34 — ordinary production quiz families, grouped by pool (34 answers)

Two questions each, one segment per question, in `POOLS` declaration order.

| Pool | Families audited | Qs | Tag prefix |
| --- | --- | --- | --- |
| `easy_item_cost` | `item_cost` | 2 | `rb4a_q_easy_item_cost_*` |
| `easy_game_knowledge` | `objective_spawn`, `objective_baron_spawn`, `objective_first_dragon_spawn`, `camp_respawn`, `environment_mechanic`, `summoner_spell_cooldown` | 12 | `rb4a_q_easy_game_knowledge_*` |
| `medium_item_stats` | `item_exact_stat`, `item_multi_stat`, `item_three_unique_stats` | 6 | `rb4a_q_medium_item_stats_*` |
| `medium_item_graph` | `item_builds_into_v2`, `item_component_v2` | 4 | `rb4a_q_medium_item_graph_*` |
| `medium_ability_costs` | `ability_cost_rank` | 2 | `rb4a_q_medium_ability_costs_*` |
| `hard_item_graph` ⚠ | `item_missing_component_v2`, `item_final_from_components_v2` | 4 | `rb4a_q_hard_item_graph_*` |
| `hard_cooldowns` | `combat_cooldown` | 2 | `rb4a_q_hard_cooldowns_*` |
| `scenario_cooldowns` | `combat_cooldown` | 2 | `rb4a_q_scenario_cooldowns_*` |

⚠ = declared pool that no shipped format names (see the 14/16 reconciliation).
Full tag is `rb4a_q_<pool>_<family>_<1|2>`; the pool is in the tag because
`combat_cooldown` is audited from two of them.

### 35-38 — Meta Reflex, one block per card group (19 cards)

| Tag | Cards | Candidate families |
| --- | --- | --- |
| `rb4a_reflex_item_cost` | 2 | `item_cost` |
| `rb4a_reflex_champion_stat` | 5 | `champion_stat:` hp, ad, armor, move-speed, attack-range |
| `rb4a_reflex_item_stat` | 5 | `item_stat:` ad, ap, armor, mr, hp |
| `rb4a_reflex_recognition` | 7 | `recognition:` champion, item, ability · `attack_type:` melee, ranged · `resource:` mana, energy |

The four groups are exactly `meta_reflex.family_group()`'s four, and together
exactly the production block's 18 candidates. **Why one group per block:**
`choose_families` deals round-robin across the groups a candidate list spans
and cycles within a group, so a single-group block degenerates to a plain cycle
— `challenge_count == len(families)` therefore deals every declared family
**exactly once, for every seed**. That is measured over 480 draws in the test
suite, not assumed. A mixed 5-card block's family set is decided by a seed,
which is the right production behaviour and the wrong audit instrument; the
mixed composition is what ordinary Ranked already shows the owner.

### 39-43 — the three published Mastery sets (10 answers)

| Tag | Set | Variant | Qs |
| --- | --- | --- | --- |
| `rb4a_mastery_champion_fundamentals` | `playtest.champion.ahri` | `fundamentals` | 2 |
| `rb4a_mastery_champion_progression` | `playtest.champion.ahri` | `progression` | 2 |
| `rb4a_mastery_matchup_recall` | `playtest.matchup.ahri.syndra` | `atomic_recall` | 2 |
| `rb4a_mastery_matchup_comparisons` | `playtest.matchup.ahri.syndra` | `harder_comparisons` | 2 |
| `rb4a_mastery_combat_chain` | `chain.jarvan.physical_penetration` | (whole set) | 2 |

Real `mastery_set_id`s through the canonical `mastery_slice.v1` module — never
an on-demand recipe standing in for a published set. `allowed_variants` is the
EXISTING generation filter, and it is what makes a 2-question sample show a
shape worth judging: a manifest set's steps are taken in curriculum order, so
without a filter every sample of every set is its first beat. `reinforcement`
is deliberately never sampled — both manifest sets declare it as "repeat recall
on the earlier material", so by its own declaration it is not a distinct shape.
The chain is unfiltered because its whole set is two steps, one per penetration
scenario, and a variant filter could only take one of them (and would fall
under `MIN_CHALLENGE_COUNT = 2` doing it).

The generic on-demand Champion/Matchup synthesis system is **out of scope by
the owner's own rule**: those are recipes over the same gameplay shape, not a
finite static content catalog.

## Counts

| | |
| --- | --- |
| Included production quiz families (distinct ids) | **16** |
| Included quiz sources (pool × family entries) | **17** |
| Included Meta Reflex candidate families | **18** |
| Included static Ranked-compatible Mastery sets | **3** |
| Distinct module types | **3** (`quiz`, `item_cost_duel`, `mastery_slice`) |
| Segments in one pass | **43** |
| **Gameplay answers in one complete pass** | **63** |
| Worst-case HP lost in one pass (min start 150) | **115** |

## Files changed

Backend (`League_Combat_Simulator`), master `97e40ef9`:

| File | Change |
| --- | --- |
| `ranked_formats/schema.py` | `CONFIG_POOL_FAMILIES`; `_validate_pool_families`; `segment_pool_families` / `segment_pool_source`; `pool_serve_ordinal` keyed on the source; `_RB4A_DAMAGE`, `_rb4a_quiz`, `_rb4a_quiz_pair`, `_RB4A_REFLEX_BLOCKS`, `_rb4a_meta_reflex`, `_rb4a_mastery`, `_rb4a_mastery_whole`, `_rb4a_worst_case_damage`; the rewritten `_guided_playtest_segment_pattern` |
| `ranked_public/shared_bank.py` | `narrowed_spec`; `families=` on `_load` / `load_pool` / `load_pool_rows` / `pool_provider`; the narrowing in the provider cache key and the provider label |
| `ranked_public/readiness.py` | `required_pool_sources`, `source_label`; `format_readiness_report` checks narrowed providers |
| `ranked_public/service.py` | passes the segment's `families` through to `_question_pool_provider` |
| `scripts/rb4a_playtest_readiness.py` | **new** — read-only operator report of what a given database can serve for this sequence, per source |
| `test_rb4a_exhaustive_playtest.py` | **new**, 25 cases |
| `test_ranked_playtest_preset.py` | RB3's seven-slot pin replaced by a shape assertion; content is pinned against the live registries in the new module |

**Frontend: no change.** The sequence uses the three module ids
`src/lib/ranked-core/modules/registry.ts` already registers, and nothing in the
frontend is coupled to the sequence's shape. **No Lovable Publish is required
for RB4A.**

## Tests

```bash
.venv/bin/python -m pytest test_rb4a_exhaustive_playtest.py -q          # 25 passed
.venv/bin/python -m pytest test_ranked_playtest_preset.py -q            # 19 passed
```

The coverage cases derive from the LIVE registries — `POOLS`,
`_PLAYTEST_META_REFLEX_FAMILIES`, `COMPATIBLE_MASTERY_SETS`,
`ranked_modules.registry` — never from a second hand-maintained list. **Adding
a production family or a Ranked-compatible slice later FAILS RB4A coverage
until someone deliberately places it in the sequence.** What they prove:

1. every servable Ranked quiz family is audited, and only those;
2. no retired/HOLD/withheld/recognition-only family is reachable from it;
3. every compatible static Mastery set is audited;
4. every distinct production module type is represented, at a registered version;
5. every included family gets 2-4 questions, and so does every included slice;
6. every segment tag is unique and `rb4a_`-namespaced;
7. `guided_playtest_format().validate()` passes;
8. `assert_format_servable` passes when every source holds rows, and names the
   **exact empty family** when one does not — proved against a real bank read
   through the real loader, mode gate and override join;
9. the narrowing can never widen a pool, and refuses an empty/duplicated list
   and a narrowing with no pool;
10. both production formats are structurally unchanged and carry no narrowing;
11. an unnarrowed format's pool ordinals are byte-identical to before;
12. no Playtest-specific source or renderer exists — every source the sequence
    names is one production already declares.

Ranked regression over 19 modules, compared as failure **SETS** against a clean
`origin/master` worktree: **84 failed / 548 passed before, the identical 84
after.** Zero new failures. (They are the repo's known environment baseline —
the modern format's shared-bank pools are not seedable from these fixtures.)

## ⚠ Open item for the owner — production bank coverage

`assert_format_servable` fails the **whole** match on the first unservable
source. That is correct and was kept, but it means a family holding **zero rows
in production** blocks the entire audit session rather than one segment.

This could not be verified from the development machine: the local
`lol_calc.db` is stale enough that the **ordinary production format** is also
unservable against it (`medium_item_graph` and `medium_ability_costs` both read
0), so it says nothing about production. Run the new script against the
production database before the first session:

```bash
.venv/bin/python scripts/rb4a_playtest_readiness.py /path/to/lol_calc.db
```

It prints one line per source and exits non-zero if the sequence is
unservable. If a family comes back EMPTY, that is itself an RB4B finding — the
family is nominally production content that Ranked cannot actually deal — and
the fix is to prune that entry, not to weaken the gate.

Related, and benign: `objective_baron_spawn` and `objective_first_dragon_spawn`
hold very few rows. A provider with one row serves the same question for both
of that family's two slots. That is existing provider behaviour, it still shows
the owner the family, and it is not worked around here.

## How the owner starts the session

Unchanged from RB3 and deliberately out of RB4A's scope (Playtest
discovery/entry redesign is excluded):

```
POST /api/ranked/queue   {"match_with_bot": true, "preset": "playtest"}
```

from an account holding a playtest grant. Nothing about pressing **Match with
Bot** in the UI reaches this sequence.

## Preserved

Human Ranked, Bot Ranked **without** a preset, Daily, Practice and Mastery
sessions are untouched — pinned by tests 10 and 11 above and by
`test_ranked_playtest_preset.py`'s existing routing cases. RB2.1's invariant
still holds: the OPPONENT never chooses the format; an explicitly requested,
explicitly authorized SESSION does.

## Current state

* Backend: **committed and pushed to `master`.** Deploys automatically.
* Frontend: **no change, no Publish.**
* Next task: **RB4B — owner content review and pruning.** The table above is
  the RB4A baseline it prunes from; every entry is named by a unique tag so
  "remove that one" is unambiguous.

---

# MC1 — the static-content retirement, and what it changed about RB4A

> Read this before RB4B. The Mastery third of the RB4A sequence above is
> **superseded**: the three named sets it audited no longer exist.

## The architecture rule, now enforced

> If a question, challenge, Mastery set, matchup, combat/applied chain or other
> content artifact can be derived from canonical structured data through a
> current production generator, it must be generated at runtime and must NOT
> also remain as a separate static production content source.

Full audit, deletion matrix and persisted-data treatment:
`League_Combat_Simulator/docs/workstreams/MC1_STATIC_CONTENT_RETIREMENT.md`.

## What was removed, and why it was reachable

`mastery.publication_gate.ranked_catalog.COMPATIBLE_MASTERY_SETS` — the closed
catalog RB4A read as the Mastery census — named three artifacts:

| Retired set | What it actually was | Generator that already produced that shape |
| --- | --- | --- |
| `playtest.champion.ahri` | a hand-written manifest over one champion's facts | `mastery.synthesis.synthesize_champion_mastery` |
| `playtest.matchup.ahri.syndra` | the same, for one pair | `mastery.synthesis.synthesize_matchup_mastery` |
| `chain.jarvan.physical_penetration` | the certified penetration calculation at fixed champions, ability, levels and two named items | `mastery.synthesis.applied_chain` (new seam, built from the already-deployed chain/capsule/renderer) |

Each was a hardcoded parameterization of a generator production already
exposes. The catalog, the two static recipe modules and the static chain module
are **deleted**, along with the two dev Mastery routes and the
`MASTERY_GENERATED_PLAYTEST` flag that registered the recipes.

`mastery_slice.v1` itself is **unchanged and kept**: it is the runtime carrier,
and the distinction now reads `generated content → mastery_slice → canonical
Ranked renderer`, never `static named set → mastery_slice`.

## RB4A's corrected sequence

The quiz-family (1–34) and Meta Reflex (35–38) sections are **unchanged**. The
Mastery section is now one sample per materially distinct GENERATED shape:

| Tag | Generator | Qs | Subject |
| --- | --- | --- | --- |
| `rb4a_mastery_champion` | Champion Mastery synthesis | 2 | derived from the Mastery identity registry |
| `rb4a_mastery_matchup` | Matchup Mastery composition | 2 | derived, the first two identities |
| `rb4a_mastery_applied_chain` | certified applied combat chain | 2 | derived from the certified penetration abilities |

No champion is named in the sequence: `rb4a_mastery_subjects()` asks the live
registries what they can currently generate. Against the production database
those resolve to `champion:aatrox`, `matchup:aatrox:ahri` and
`applied_chain:jarvan:Q:ahri`, all servable.

**One pass is now 41 segments / 59 answers** (was 43 / 63). Worst case is 107
HP against a 150 HP floor, and the "the owner reaches the end" test still pins
that inequality. Coverage is derived from `SELECTABLE_MODES`, so adding a
fourth Mastery generator fails RB4A until someone places it in the sequence —
the same guard the set census had, pointed at the authority that exists.

Start the session exactly as before:

```
POST /api/ranked/queue   {"match_with_bot": true, "preset": "playtest"}
```

## What an admin sees in Quiz Admin

The Mastery Slice slot's third source is now **Applied combat chain**
(Attacker → Ability → Target) instead of **Runtime Mastery Set**. The set
dropdown and the per-set “Scenario variants” control are gone with the catalog
they read. The preview button now appears on **every** Mastery slot, not only
on a slot with a static set chosen.

A format saved before this change keeps working: a stored `mastery_set_id` is
decoded on read to the generator it was a parameterization of
(`ranked_formats.retired_mastery_sets`), so the lane runs and the builder shows
what it will actually run. Saving that id again is refused.

## Frontend changes (this repo)

* `src/lib/admin/rankedFormatApi.ts` — `mastery_sets` and its capability types removed
* `src/pages/admin/ranked/GenerationPolicyPanel.tsx` — describes a generated SLOT, not a selected set
* `src/pages/admin/ranked/ModuleConfigFields.tsx` — a dependent `enum` now resolves its options (the applied chain's ability list depends on the attacker; only `multi_enum` was dependent before)
* `src/pages/admin/ranked/SegmentRow.tsx`, `RankedFormatBuilder.tsx`, `rankedFormatEditing.ts` — the per-set clamp removed
* `src/lib/admin/__fixtures__/masterySliceCatalogEntry.json` — recaptured from the live backend catalog
* tests updated to the new contract

**Lovable Publish IS required** for the Quiz Admin change to reach mogzy.lol.

## RB4B

The baseline to prune from is the table above plus RB4A's unchanged quiz/Meta
Reflex sections. The Mastery entries are now prunable as SHAPES ("drop the
applied chain"), not as named artifacts.
