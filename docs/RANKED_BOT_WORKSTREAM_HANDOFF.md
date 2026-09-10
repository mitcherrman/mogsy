# Ranked Bot workstream — handoff

Status: **RB1, RB2 and RB2.1 complete** (backend + frontend, tested, not published, not deployed).

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

## Next task — RB3: Playtest layer on Bot Ranked

Add the playtest entitlement/tag/preset **on top of** the bot architecture:
the curated playtest sequence, and optional interstitial/content screens.

Constraints carried forward:

* **Do not fork the Ranked renderer.** A playtest match is a bot match is a
  Ranked match. Interstitials layer around the arena; they never replace it.
* `pro_grant_kind='playtest'` already resolves as effective Premium, so a
  playtester already has bot access — RB3 needs no new access mechanism.
* If RB3 wants a distinguishable playtest lane, `admin_bot` is the existing
  seam — and the hazard above says what has to be settled before using it.
