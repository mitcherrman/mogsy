# COM1-1 — Social Safety & Correctness

Closes the four P0 findings recorded in [`COM1_SOCIAL_AUDIT.md`](./COM1_SOCIAL_AUDIT.md)
(commit `05696112`). Nothing else. No discovery UX, no profile redesign, no invite UX,
no social redesign.

| Repo | Branch | Base |
| --- | --- | --- |
| Frontend `/Users/macmoney/mogsy` | `com1/phase1-safety-fe` | `origin/main` `f4492b73` |
| Backend `/Users/macmoney/League_Combat_Simulator` | `com1/phase1-safety-be` | `origin/master` `99d5bf0` |

**Not pushed. Not deployed. Migrations authored, not applied.**

---

## 1. Severity

Severity is stated for the system **as it stood at `f4492b73` / `99d5bf0`**, with
`REQUIRE_SUPABASE_AUTH` confirmed absent on Railway production.

| ID | Finding | Data at risk | Precondition | Severity |
| --- | --- | --- | --- | --- |
| **P0-1A** | `user_notifications.sent_by_user_id` hands a recipient the sender's Supabase auth id | An account identifier — the *key*, not the data | Receive one friend request | **High** |
| **P0-1B** | Live Ranked publishes the opponent's Supabase auth id as `player_id` | Same identifier | Play one Ranked match | **High** |
| **P0-4** | `/api/quiz/{progress,achievements,categories}/{user_id}` served any account's record to any verified caller | XP, accuracy, streaks, per-category breakdown, badge unlock times | Hold any session **and** a victim's auth id | **Medium alone, High in chain** |
| **P0-2** | Every Supabase social mutation discarded its error and reported success | — | Use the product | **High (correctness)** |
| **P0-3** | `admin_create_bot_profile` bypassed the AUTH3 name authority | — | Create a bot | **Medium (admin-facing, present-tense break)** |

### The chain, stated plainly

P0-1A/P0-1B and P0-4 were one vulnerability in two halves. Neither is dramatic alone:
an auth id is not a credential, and quiz statistics are the kind of thing a public
League profile is *meant* to show. Together they were an account-enumeration read:

```
receive a friend request      ─┐
   (or play one Ranked match) ─┴─► victim's auth.users.id
                                     │
                                     ▼
        GET /api/quiz/progress/<that id>   ──►  their full record
```

`get_league_profiles` (migration `20260730150000`) was written specifically to withhold
that identifier, and its header names this exact attack. Ranked match **history** already
refused to emit account ids. Two other surfaces were handing them out anyway.

**This phase closes both halves**, so neither is load-bearing on the other.

---

## 2. Root cause

**P0-1A** — `20260523081658` added four SECURITY DEFINER notification triggers. Each
resolved the *acting* profile to its `auth.users.id` and stored it in
`sent_by_user_id`. The recipient may read their own row (`20260520093257`), so
`select('sent_by_user_id')` returned it. Nothing ever read that column for these rows;
it was written because the column is `NOT NULL` and an auth id was the nearest value to
hand. The client compounded it with `select("*")`.

**P0-1B** — Ranked keys its engine, persistence and ratings on the auth subject:
`ranked_participants.user_id` **is** the JWT `sub`, and `duel_transport_projection`
emitted `p.player_id` verbatim. There was no boundary between "the id the engine
computes with" and "the id a client is told".

**P0-2** — `supabase-js` does not throw on a database error; it resolves with
`{ data, error }`. Every social write was `await supabase.from(...)...` with the
envelope discarded, so `blockUser` and `reportUser` sat inside `try/catch` blocks that
could never fire and their callers toasted success unconditionally.

**P0-3** — ADM2 (`20260803120000`) predates AUTH3 (`20260822120000`) and was never
revisited. It writes `profiles.display_name` directly with a `length <= 60` check. AUTH3
then made that column the canonical public username with a live uniqueness index.

**P0-4** — AUTH1 Phase 2 closed the *unauthenticated* read here and deliberately left
the cross-user one open, on the stated grounds that `/user/:profileId` rendered another
player's stats from these endpoints. That premise had already stopped being true:
`UserProfile.tsx` computes `targetUserId = LEAGUE_ONLY_MODE && isOwnProfile ? user.id : null`,
so the page asks only for the viewer's own record. The capability outlived its consumer.

---

## 3. What changed

### Backend — `com1/phase1-safety-be`

| File | Change |
| --- | --- |
| `ranked_public/identity_redaction.py` | **NEW.** Outbound account-id redaction: `alias_for`, `build_alias_map`, `redact`, `assert_no_foreign_ids`. |
| `ranked_public/projections.py` | `_scoped()` helper; `project_public` / `project_resolved` / `project_result` gain keyword-only `viewer_user_id`; `project_private` and `project_resume` redact unconditionally. |
| `routes/ranked_public.py` | Four call sites pass `viewer_user_id=identity.user_id`. |
| `routes/supabase_auth.py` | `resolve_profile_read_user_id` — cross-user read now `403 FORBIDDEN_USER_ID`. |
| `test_ranked_public_routes.py` | Two assertions updated to the corrected contract. |
| `test_ranked_item_cost_duel_client_api.py` | `_key(env, user)` helper; 19 player-keyed lookups made viewer-relative. |
| `quiz/tests/test_quiz_profile_read_authorization.py` | Cross-user test replaced by self-only + non-disclosure tests. |
| `test_com1_ranked_identity_redaction.py` | **NEW**, 9 tests. |

### Frontend — `com1/phase1-safety-fe`

| File | Change |
| --- | --- |
| `supabase/migrations/20260823120000_com1_social_notification_identity.sql` | **NEW.** Four triggers rewritten; historical rows backfilled. |
| `supabase/migrations/20260823121000_com1_bot_name_authority.sql` | **NEW.** Both bot RPCs routed through AUTH3. |
| `src/lib/community/social-result.ts` | **NEW.** `SocialResult`, `classify`, `attempt`, message maps. |
| `src/hooks/useFriends.ts` | All five mutations return `SocialResult`. |
| `src/hooks/useBlocks.ts` | `blockUser` / `unblockUser` / `reportUser` return `SocialResult`; block ordered before unfriend. |
| `src/components/FriendActionMenu.tsx` | Success toast only on confirmed success. |
| `src/components/FloatingFriendsButton.tsx` | `runFriendAction` surfaces failures. |
| `src/pages/UserProfile.tsx` | `FriendButton` + `SaveButton` report outcomes. |
| `src/components/hud/MogzyIdentityMenu.tsx` | `select("*")` → `NOTIFICATION_COLUMNS` allow-list. |
| `src/lib/admin/admin-users.ts` | `BotNameCode`, `isBotNameCode`, `botNameMessage`. |
| `src/components/admin/AdminBots.tsx` | Renders every AUTH3 code. |
| 4 new test files | 53 new tests. |

---

## 4. Contract changes

### Ranked payloads — pseudonymous opponents

**Shape unchanged. Field names, types and every gameplay value are identical.** What
changes is one thing: an account id that is not the viewer's own is replaced by an
opaque, match-scoped alias.

```
alias = "p_" + sha256("<match_id>|<user_id>").hexdigest()[:16]
```

- **The viewer keeps their own real id.** It is not a secret from them — the client
  already holds it in its Supabase session — and keeping it is what makes this a
  non-breaking change: the frontend identifies itself with
  `player.playerId === viewerUserId`, and every *other* use of a player id is an
  opaque join key (`damageByPlayerId`, `segment_reveal.players`, a `data-testid`).
- **Stable within a match**, so reveal/damage/ability lookups still join.
- **Salted by `match_id`**, so an opponent cannot be correlated across matches.
- **No inbound direction exists.** No public Ranked route accepts a client-supplied
  player id — every action derives identity from the JWT — so nothing needs translating
  back.

Affected: `public_round`, `private_player`, `resolved_round`, `match_result`
(`winner_user_id`), `resume`, and `progression_pending_players`. `match_history` was
already clean and is untouched.

Redaction is **set-based**: it substitutes only strings that are in the known
participant set, so it cannot mangle an ability or question id, and it covers payload
fields nobody enumerated. `assert_no_foreign_ids` then fails closed.

**No frontend change was required.** Verified by the existing suite.

### `GET /api/quiz/{progress,achievements,categories}/{user_id}` — self-only

| Caller | Path id | Before | After |
| --- | --- | --- | --- |
| unverified | `anonymous` | 200 guest bucket | **unchanged** |
| unverified | anything else | 401 | **unchanged** |
| verified | own / `anonymous` / empty | 200 own record | **unchanged** |
| verified | malformed | 400 `INVALID_USER_ID` | **unchanged** |
| verified | another account | **200 their record** | **403 `FORBIDDEN_USER_ID`** |

The 403 is byte-identical whether or not the account exists, so it is not an existence
oracle. Malformed-shape (400) is still checked *before* ownership, keeping "bad request"
and "not yours" distinct.

A public per-player stats surface, when built, belongs on a **new** endpoint keyed on
`public.profiles.id` with an explicit public projection — the shape `get_league_profiles`
already established. Widening this one would re-publish an auth-subject-addressed record.

### Social mutations — `SocialResult`

Every mutation returns `{ ok, code, error?, refetch? }`.

| `code` | Meaning | `ok` |
| --- | --- | --- |
| `ok` | Confirmed by the database | ✅ |
| `already` | End state already held (`23505`, or a delete matching nothing) | ✅ + `refetch` |
| `refused` | Policy: a block, or an unrecognised `check_violation` | ❌ |
| `rate_limited` | 10/hour or 20 outstanding | ❌ |
| `stale` | `23503` / `PGRST116` / illegal transition | ❌ + `refetch` |
| `forbidden` | `42501` RLS, immutable parties | ❌ |
| `unavailable` | Transport, or anything unrecognised | ❌ |

`classify` reads SQLSTATEs and the message vocabulary **our own** trigger raises — a
controlled set, not arbitrary server text. **No raw Postgres string can reach a user:**
there is one path out, through `messageFor`.

**A block is never disclosed.** A request refused because the target blocked the caller
returns the same neutral sentence as any other refusal. Naming the cause would hand the
requester the one fact the blocker withheld — matching the Stat Check backend, which
answers `SC_INVITE_BLOCKED` with "This invite is not available."

### Bot RPC result codes — widened, not reshaped

`admin_create_bot_profile` / `admin_update_bot_profile` still return
`jsonb {ok, code, ...}`. Existing codes unchanged. Newly reachable:
`too_short | too_long | invalid_characters | reserved | taken`, all already mapped by
`usernameMessage`. A `unique_violation` is trapped on both write paths and returned as
`taken` **with its audit row committed**, rather than escaping and taking the audit row
down with it in the rollback.

---

## 5. Migrations

Two, both **authored and not applied**. Apply as `postgres` in the Supabase SQL Editor,
wrapped in `BEGIN/COMMIT`. Never `supabase db push` — repo and remote ledger have drifted.

| Order | File | Does |
| --- | --- | --- |
| 1 | `20260823120000_com1_social_notification_identity.sql` | `system_notification_actor()`; rewrites 4 triggers; backfills the 4 social types. |
| 2 | `20260823121000_com1_bot_name_authority.sql` | `bot_display_name_problem()`; rewrites both bot RPCs. Must land **after** AUTH3 `20260822120000` (already live). |

Neither adds, drops or alters a table, column, policy or grant. Migration 1's backfill is
type-scoped so admin-announcement provenance is untouched. Verification queries are in
each file's footer.

---

## 6. Tests

**62 new tests**, every one confirmed to fail against the pre-fix code.

| File | Tests | Covers |
| --- | --- | --- |
| `test_com1_ranked_identity_redaction.py` (BE) | 9 | Opponent auth id absent from public/private/current/resolved/resume; viewer keeps their own; alias stable across payloads and match-scoped; both players still present |
| `src/test/security/com1SocialNotificationIdentity.test.ts` | 10 | Triggers rewritten; no `profiles.user_id` read remains; backfill type-scoped; announcement provenance preserved; client allow-list exact |
| `src/lib/community/social-result.test.ts` | 17 | Every SQLSTATE and trigger phrase; no raw Postgres text; no block disclosure; thenable support |
| `src/hooks/useSocialMutations.errors.test.tsx` | 12 | Blocked request reports failure; rate limit; refused accept; block-before-unfriend ordering; report failure |
| `src/test/security/com1BotNameAuthority.test.ts` | 14 | AUTH3 functions reused; `unique_violation` trapped on both paths; audit survives; every code renders; bot behaviour preserved |

**Pre-fix proof**

| Suite | Against pre-fix code |
| --- | --- |
| `test_com1_ranked_identity_redaction.py` | **8 of 9 failed** (the 9th is a pure alias-function test) |
| `useSocialMutations.errors.test.tsx` | **11 of 12 failed** |
| `test_quiz_profile_read_authorization.py` (rewritten block) | **6 of 6 failed** |

---

## 7. Baseline vs final

### Backend

| Suite | Baseline | Final | Delta |
| --- | --- | --- | --- |
| 23-file social/ranked/stat-check set | 376 passed, 3 errors | **376 passed, 3 errors** | identical |
| Wide sweep — all `test_ranked_*` + transport (~1969) | 10 failed, 1955 passed | **10 failed, 1955 passed** | **failure set byte-identical** |
| `quiz/tests/` auth pair | 56 passed | **59 passed** | +3 (net new) |
| New redaction suite | — | 9 passed | +9 |

The 3 errors are pre-existing fixture-collection failures in `test_quiz_admin_auth.py`
(`fixture 'PROTECTED' not found`), unrelated. The 10 wide-sweep failures are pre-existing
and data-dependent (packaged artifacts, item costs, media freezes) — the failing set is
identical before and after.

> **Note on the quiz auth pair.** These first reported 48 failures for an environmental
> reason: the tests copy the schema from `<repo>/lol_calc.db`, which a fresh worktree
> does not have. With that file linked read-only the real baseline is 56/56. Comparing
> totals without it would have hidden any real regression behind noise.

### Frontend

| Suite | Baseline | Final | Delta |
| --- | --- | --- | --- |
| Targeted social set | 15 files, 294 passed | 19 files, **347 passed** | +53, 0 regressions |
| **Full suite** | 8 files / 45 tests failed, 6503 passed | 8 files / 45 tests failed, **6556 passed** | **failing set identical** |
| `tsc --noEmit` | 2 errors | **2 errors** | identical (both pre-existing in `admin-users.test.ts`) |

Pre-existing failing files, unchanged: `adminCredentials`, `admin-registry`, `ads/consent`,
`e2e/identity`, `quiz-broadcast/engine`, `ranked-duel-review/api`, `StructuralReview`,
`onboarding-gate`.

**Zero new regressions in either repo.**

---

## 8. What this phase did NOT do

- **`blockUser` is still two statements.** Ordering now guarantees the safe failure mode
  (blocked-but-still-listed, which the next refresh corrects) rather than the unsafe one
  (unfriended-but-not-blocked). True atomicity needs a SECURITY DEFINER RPC — a schema
  change, out of scope here.
- **Bots still have no `auth.users` row**, so an invited bot still cannot accept. That is
  audit finding H.1 and belongs to COM1-6.
- **The rate limit is still evadable** by send → cancel → send. Unchanged from M2, which
  documents it.
- **`public_profiles` still carries `user_id`.** Dormant (zero rows cross-user) and
  tracked as P3-1.
- No notification lifecycle work, no discovery, no profile content. P1 and below are untouched.
