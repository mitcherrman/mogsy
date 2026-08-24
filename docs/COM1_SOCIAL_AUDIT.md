# COM1 — Social & Community audit

**Audited tree:** `origin/main` @ `f4492b73` ("feat(ranked): add admin bot matchmaking toggle")
**Method:** clean detached worktree from `origin/main`; the dirty primary checkout at
`/Users/macmoney/mogsy` (branch `auth1/quiz-write-token-guarantee`) was not touched.
Production Railway configuration was inspected for feature-flag presence only — no secret
value was read, recorded, or printed.
**Backend co-audited:** `/Users/macmoney/League_Combat_Simulator` (`master`), because a
material part of the social system does not live in Supabase at all.
**Date:** 2026-08-22
**Status:** audit only. No code, schema, or data was changed.

> **Update — COM1-1 (branch `com1/phase1-safety-fe` / `com1/phase1-safety-be`).**
> All four **P0** findings below are addressed; see
> [`COM1_PHASE1_SAFETY.md`](./COM1_PHASE1_SAFETY.md) for severity, root cause, contract
> changes, migrations and baseline evidence. The P0 table in this document is annotated
> accordingly. The two migrations COM1-1 authored are **not yet applied**.
>
> **Update — COM1-2 (branch `com1/phase2-community`).** Reachability and blocking. Closes
> **P1-1**, **P1-2**, **P1-4** and **P1-10**, and makes block+unfriend atomic. See
> [`COM1_PHASE2_COMMUNITY.md`](./COM1_PHASE2_COMMUNITY.md). Migration
> `20260823130000_com1_community_reachability.sql` is authored and **not yet applied** — it
> replaces the live `enforce_friendship_rules` trigger, so §C and §G below describe the
> system as it stands *today*, before that apply. Findings this phase closed are annotated
> inline. **P1-3, P1-5 … P1-9, P2 and P3 are untouched.**

---

## 0. Executive summary

Mogzy's social layer is **three disconnected systems wearing one word**:

| System | Store | Identity key | State |
| --- | --- | --- | --- |
| Friends / blocks / reports / notifications | Supabase Postgres | `profiles.id` | Hardened, live, **unreachable** |
| Stat Check private rooms + friend invites | FastAPI + SQLite (Railway) | Supabase auth `sub` ↔ `profiles.id` bridge | Well-built, **feature-flagged off by default** |
| Ranked duel | FastAPI + SQLite | Supabase auth `sub` | Live, **no profile linkage at all** |

The engineering quality of each piece is high. The **connective tissue is missing**, and the
result is a social product that a real user cannot actually enter:

- **There is no way to find another human.** Search was deliberately removed; the leaderboard
  route is redirect-gated; Ranked hands you a display name with no profile id. The only
  "Add Friend" button in the product lives on `/user/:profileId`, and nothing in the live
  League experience ever produces a `profileId` for someone you don't already know.
  **→ CLOSED by COM1-2** (`search_league_profiles` + the Find Players tab).
- **On mobile there is no way to open the friends drawer**, because the one entry point in
  the HUD is behind `!LEAGUE_ONLY_MODE`.
  **→ CLOSED by COM1-2** (the trigger is no longer `hidden sm:flex`, and the HUD gained a
  Community entry outside that guard).
- **A public profile shows nothing.** Another user's `/user/:id` renders avatar + name +
  join date. Every stat block is disabled for non-self viewers.
- **AUTH3 is live and correct.** `set_display_name`, `is_display_name_available` and the
  case-insensitive uniqueness backstop were verified in production. What is stale is the
  generated TypeScript — and one admin RPC that never went through AUTH3 (§B.4, §B.5).

Two genuine security findings and one identity-model conflict are detailed in §6 and §B.

---

## A. Inventory of every social surface

### A.1 User-facing, LIVE in production

| Surface | Route / component | Source of truth | Mutations | Reachable? |
| --- | --- | --- | --- | --- |
| Friends drawer (Friends / Requests / Sent / Blocked) | `src/components/FloatingFriendsButton.tsx`, mounted `src/components/Layout.tsx:169` | `friendships`, `user_blocks`, `get_league_profiles` | accept / decline / cancel / remove / unblock | **Desktop only.** Trigger is `hidden sm:flex` (`FloatingFriendsButton.tsx:130`). Suppressed entirely on Stat Check surfaces (`Layout.tsx:79`). |
| Public profile | `/user/:profileId` → `src/pages/UserProfile.tsx` (behind `ProtectedRoute`, `App.tsx:374`) | `get_league_profiles` RPC | add/accept/remove friend, save, block, report, invite to Stat Check | Reachable only if you already hold the target's `profiles.id`. |
| Own profile | `/profile` → `src/pages/Profile.tsx` | `profiles` (own row), `claimUsername` | display name, avatar, **age, location, status message, 6 social links**, photos | Yes |
| Notification panel (bell) | `src/components/hud/MogzyIdentityMenu.tsx` | `user_notifications` + `user_notification_reads` + Stat Check invite inbox | mark read, accept/decline Stat Check invite | Yes |
| Stat Check mode select | `/quiz/stat-check` → `StatCheckModeSelectPage.tsx` | — | — | Yes, from `/lol` hub (`LolHub.tsx:86`) |
| Stat Check private room | `/quiz/stat-check/private`, `/quiz/stat-check/room/:inviteCode` → `pages/dev/stat-check/online/StatCheckRoomPage.tsx` | FastAPI `sc_rooms` | create / join / ready / cancel | Yes (gated on `STAT_CHECK_MP_ENABLED`) |
| Stat Check friend invite (send) | `src/components/FriendActionMenu.tsx:102` | FastAPI `sc_friend_invites` | `POST /api/stat-check/invites` | Only from the Friends tab of the drawer, or a `/user/:id` where status is `friends` |
| Stat Check friend invite (receive) | `MogzyIdentityMenu` + `src/hooks/useStatCheckInvites.ts` | FastAPI inbox, polled 30 s | accept / accept-switch / decline | Yes |
| Invite & Play (Ranked challenge) | `src/components/quiz/play-scroll/InvitePlayView.tsx` | `useFriends` roster; `rankedInviteGateway` | **none — declared inert** | Yes, and honestly labelled unavailable |

### A.2 User-facing, present in code but DEAD in production

All of these are behind `leagueGate(...)` (`App.tsx:292`) with `LEAGUE_ONLY_MODE = true`
(`src/lib/site-config.ts:20`), so their routes `<Navigate>` to `/lol`.

| Surface | Component | Why dead |
| --- | --- | --- |
| Home friends strip | `src/components/HomeFriendsSection.tsx` ← `Home.tsx:946` | `/home` redirects |
| Leaderboard → profile | `src/pages/Leaderboard.tsx:340,349` | `/leaderboard/:leagueId` redirects |
| Swipe comments → profile | `src/components/SwipeComments.tsx:448,453` | `/swipe/preset/:leagueId` redirects |
| Referral / invite links (user side) | `src/pages/Referral.tsx` | `/referral` redirects |
| HUD footer "Friends" entry | `MogzyIdentityMenu.tsx:826-836` | wrapped in `{!LEAGUE_ONLY_MODE && …}` at line 809 |
| Legacy multiplayer lobby & 5 game modes | `src/components/multiplayer/*`, `src/pages/Multiplayer.tsx`, `MultiplayerGame.tsx` | `/multiplayer*` redirect (`App.tsx:436-437`); components deliberately not bound (`App.tsx:56-62`) |
| Top comments on profile | `src/components/ProfileTopComments.tsx` | referenced only by the `/admin/about` documentation page |
| Favorites / photos on public profile | `ProfileFavoriteCards`, `ProfilePhotoCircles` | rendered only in the `!LEAGUE_ONLY_MODE` branch of `UserProfile.tsx` |

### A.3 Admin-facing

| Surface | Component | Mount | Authorization | Note |
| --- | --- | --- | --- | --- |
| User directory (new) | `src/pages/admin/AdminUserDirectory.tsx` | `/admin/users` | `AdminRoute roles=["master_admin"]` + `AdminAuthGate` + `admin_list_profiles()` | The good one |
| Profile directory (legacy) | `src/components/admin/AdminProfileDirectory.tsx` | `/admin/legacy-dashboard` | `AdminRoute` | 500-row browser, duplicates the above |
| Bots | `src/components/admin/AdminBots.tsx` | `/moderator` **and** `/admin/legacy-dashboard` | Route allows `moderator`; RPCs require `is_master_admin` | **Mismatch — see F.4** |
| Add to My Friends | `src/components/admin/AddToMyFriendsButton.tsx` | inside the two directories | `admin_link_friendship` (master_admin) | Correct, audited |
| User reports | `src/components/admin/AdminUserReports.tsx` | `/admin/legacy-dashboard` | `AdminRoute` | Reads `user_reports` |
| Invite links | `src/components/admin/AdminInviteLinks.tsx` | `/moderator`, `/admin/legacy-dashboard` | `AdminRoute` | Role-granting referral codes — unrelated to social invites |
| Multiplayer admin | `src/components/admin/AdminMultiplayer.tsx` | `/admin/play`, `/admin/gaming` | `AdminRoute` | **Admin surface for a retired feature** |
| Platform policies | `src/pages/admin/AdminPlatformPolicies.tsx` | `/admin/platform-policies` | `AdminRoute` | Owns `show_bot_labels` |
| Notifications | `src/components/admin/AdminNotifications.tsx`, `AdminPushNotifications.tsx` | `/admin/legacy-dashboard` | `AdminRoute` | |

---

## B. Database / Supabase social model

### B.1 Core tables

| Table | PK | Identity FK | RLS summary |
| --- | --- | --- | --- |
| `profiles` | `id` | `user_id → auth.users` | SELECT owner-only + admin. `authenticated` holds table-level SELECT on **all 31 columns** — column REVOKEs in the repo are no-ops (documented in `20260730150000` header). Row policies are the only thing keeping other users' rows private. |
| `public_profiles` (view) | — | carries `user_id` | `security_invoker`, so it resolves to **zero rows cross-user**. Still `GRANT SELECT TO anon`. Effectively dead as a public boundary. |
| `friendships` | `id` | `requester_id`, `addressee_id` → `profiles.id` | Party-only SELECT; addressee-only UPDATE with `WITH CHECK` (M2). |
| `user_blocks` | `id` | `blocker_profile_id`, `blocked_profile_id` → `profiles.id` | Owner-only SELECT — you cannot see blocks against you. |
| `user_reports` | `id` | `reporter_profile_id`, `reported_profile_id` | Admin read |
| `user_notifications` | `id` | `profile_id` → `profiles.id`; `sent_by_user_id` is an **auth uid** | `target_type='all' OR has_role(admin) OR is_profile_owner(profile_id)` (`20260520093257`) |
| `user_notification_reads` | `id` | `user_id` → auth uid | own rows only |
| `admin_audit_log` | `id` | `actor_user_id`, `actor_profile_id`, `target_profile_id` | admin SELECT only (ADM2) |
| `saved_profiles`, `profile_favorites`, `profile_photos`, `profile_admin_notes`, `comments`, `comment_reactions`, `comment_reports`, `multiplayer_*`, `gifts` | — | mixed | legacy Mogsy; see §I |

**Identity-key consistency:** the Supabase social graph is uniformly keyed on `profiles.id`.
`user_notifications` is the one mixed table (`profile_id` = profile, `sent_by_user_id` = auth uid).
`user_notification_reads.user_id` is an auth uid, which is correct for a per-account receipt.

### B.2 SECURITY DEFINER functions

| Function | Migration | Grant | Purpose |
| --- | --- | --- | --- |
| `get_league_profiles(uuid[])` | `20260730150000`, re-created in `20260803120000` | `authenticated` | The ONE cross-user profile read. 9-column contract, **no `user_id`**, symmetric block filter, `LIMIT 200`. |
| `is_blocked_between(uuid,uuid)` | `20260730140000` | `authenticated` | Symmetric block test the invoker cannot compute |
| `enforce_friendship_rules()` | `20260730140000` / ADM2 | trigger only | status domain, no-self, block gate, rate limits, party immutability, legal transitions |
| `notify_on_friendship_change()` | `20260523081658` | trigger only | writes `friend_request` / `friend_accepted` |
| `is_bot_available(uuid)` | ADM2 | `authenticated` | bot enabled test |
| `admin_link_friendship(uuid)` | ADM2 | `authenticated` (raises unless master_admin) | admin-created accepted friendship + audit |
| `admin_create_bot_profile(...)` | ADM2 | `authenticated` (raises unless master_admin) | bot persona, **no auth.users row** |
| `admin_update_bot_profile(...)` | ADM2 | as above | edit / soft-disable |
| `set_display_name(text,bool)` | AUTH3 `20260822120000` | `authenticated` | **Live — verified in production.** The single write path for a public username |
| `is_display_name_available(text)` | AUTH3 | `authenticated` | **Live — verified in production.** Advisory precheck |
| `normalize_display_name`, `clean_display_name`, `display_name_problem`, `is_reserved_display_name`, `is_claimed_display_name` | AUTH3 | — | Live; `IMMUTABLE`, used by the backstop index |
| `enforce_display_name_uniqueness()` | AUTH3 | — | Live; **already ran — `profiles_display_name_unique_ci` is active** |

### B.3 Constraints and indexes on `friendships` (M2, `20260730140000`)

- `friendships_status_check` — `('pending','accepted','declined')`. `blocked` is deliberately
  **not** a status; `user_blocks` is the sole authority.
- `friendships_no_self`
- `friendships_unique_live_pair` — partial unique on `(least, greatest)` where status in
  `('pending','accepted')`. Closes crossed A→B / B→A.
- Rate limits in the trigger: 10 requests/hour, 20 outstanding. **Documented as evadable** in
  the migration itself: decline/cancel/remove all `DELETE`, so send→cancel→send never accumulates.

### B.4 Migration application status

**All Community and identity migrations are applied in production.** Verified two ways:
the generated `src/integrations/supabase/types.ts` (regenerated from the live database)
carries the M1/M2/M3 and ADM2 objects; AUTH3 was confirmed live against production
separately (owner-verified 2026-08-22 — `set_display_name` and
`is_display_name_available` both resolve, and the uniqueness backstop is installed).
Note that `types.ts` alone is NOT sufficient evidence: it lags the database (§B.4.1),
and reading it as authoritative is what produced the incorrect first draft of this section.

| Migration | Objects | Applied |
| --- | --- | --- |
| M1 `20260728130000` | `public_profiles` narrowed to the League contract | ✅ |
| M2 `20260730140000` | friendship constraints, `is_blocked_between`, `enforce_friendship_rules` | ✅ (`is_blocked_between` in types.ts) |
| M3 `20260730150000` | `get_league_profiles` | ✅ (in types.ts) |
| ADM2 `20260803120000` | `profiles.is_disabled`, `admin_audit_log`, `is_bot_available`, `admin_link_friendship`, `admin_create_bot_profile`, `admin_update_bot_profile`, `show_bot_labels` | ✅ (all in types.ts) |
| ADM2 `20260803121000` | `admin_notification_reads` | ✅ (in types.ts) |
| **AUTH3 `20260822120000`** | `set_display_name`, `is_display_name_available`, the normalisation helpers, `display_name_conflicts`, the rewritten `handle_new_user` | ✅ **verified live; the `profiles_display_name_unique_ci` backstop is ACTIVE** |

So, in production today:

- `display_name` **is** the one canonical public username and **is** case-insensitively
  unique for claimed identities, enforced both by `set_display_name()` in the same statement
  that writes and by the backstop index.
- `handle_new_user()` is the AUTH3 version: random 4-digit anonymous placeholders with a
  uid-derived fallback, and a signup's chosen name carried in from `raw_user_meta_data`.
  The pre-AUTH3 `'Anonymous' || (count+1)` collision-after-purge defect is **fixed**.

### B.4.1 What is actually stale — the generated types

`src/integrations/supabase/types.ts` has not been regenerated since AUTH3 landed. It is
missing `set_display_name`, `is_display_name_available`, `normalize_display_name`,
`enforce_display_name_uniqueness` and the `display_name_conflicts` view.

**Runtime impact: none.** Every AUTH3 call site already routes around the gap with an
explicit cast — `src/lib/identity/claim-username.ts:52-53` casts `supabase` to a local
`RpcClient` type, exactly as `src/lib/league-profiles.ts:55` already does for
`get_league_profiles`. The calls succeed; PostgREST does not consult the TypeScript.

**Real cost is correctness-of-record and future safety:**

1. Two `any`-shaped escape hatches now exist in the identity layer, so a signature change to
   `set_display_name` would not fail the build — it would fail at runtime, in the one path
   that owns public identity.
2. `types.ts` is the artefact this audit (and any future one) reads to answer "is it applied?".
   It currently reports AUTH3 as absent, which is wrong and is precisely the misreading this
   document had to correct.
3. `display_name_conflicts` is untyped, so the admin remediation view has no client binding.

Classification: **P3 cleanup**, not a P0 — regenerate the types and delete the casts.

### B.4.2 `legacyWrite()` is now dead code

`claim-username.ts:94-110` exists solely for the window in which the bundle shipped before
the SQL was applied (`isMissingFunction` → `PGRST202`/`42883`). That window has closed:
`set_display_name` exists, so the branch is **unreachable**.

It is a bare `profiles.update({ display_name })` with no uniqueness check. Left in place it
is a documented, dormant bypass of the entire AUTH3 authority — one accidental edit to the
error predicate away from being live again. Classification: **P3 cleanup — delete it.**

### B.5 Places that still assume `display_name` is non-unique / optional

| Site | Assumption | Impact **today** |
| --- | --- | --- |
| `admin_create_bot_profile` (ADM2 §8) | validates only `'' < len ≤ 60`; writes `profiles` **directly**, bypassing `display_name_problem` and `set_display_name` | 🔴 **LIVE DEFECT, not a future one.** ADM2 predates AUTH3 and was never revisited. Because the backstop index is already active, a bot name colliding with any claimed name raises a raw `unique_violation` **out of a function whose contract is "returns jsonb {ok, code}"** — `AdminBots` renders an unhandled Postgres error today. Separately, a bot may still claim a **reserved** name (`Moderator`, `Mogzy`, `Admin`) and a **25–60 character** name that AUTH3 forbids every human. |
| `legacyWrite()` fallback | no uniqueness | Now unreachable dead code — delete (§B.4.2) |
| `useFriends` / drawer / `LeagueProfile` | `display_name` may be `null` → `"Unknown"` / `"User"` | Fine; keep |
| `notify_on_friendship_change` | `COALESCE(_requester_name, 'Someone')` | Fine |

---

## C. Friendship state machine

### C.1 Model as actually implemented

**One directional row, requester/addressee pair, status field, client-mediated
(no RPC).** All writes are direct PostgREST from `src/hooks/useFriends.ts` and
`src/pages/UserProfile.tsx:141-186`.

```
                     insert(status='pending')          [trigger: block gate,
   (none) ───────────────────────────────────────►  pending      rate limit,
      ▲                                              │  │         must be 'pending']
      │  DELETE (cancel, by requester)               │  │
      ├──────────────────────────────────────────────┘  │
      │  DELETE (decline, by addressee)                  │
      ├──────────────────────────────────────────────────┤
      │                                                  │ update(status='accepted')
      │                                                  ▼
      │  DELETE (removeFriend, either party)          accepted
      └──────────────────────────────────────────────────┘

   'declined' is a LEGAL status the schema permits and NOTHING EVER WRITES.
   'blocked'  is NOT a status — derived from user_blocks in the client only.
```

### C.2 Scenario table

| Scenario | Actual behaviour | Verdict |
| --- | --- | --- |
| A → B request | `friendships` insert; trigger validates; `notify_on_friendship_change` writes `friend_request` | ✅ |
| A → B again | Blocked by pre-existing `UNIQUE(requester_id, addressee_id)`. Error **swallowed** — `useFriends.sendRequest` never inspects the result | ⚠️ silent |
| B → A while A→B pending (crossed) | Blocked by `friendships_unique_live_pair` (M2). Error **swallowed**; button just re-renders as "Add Friend" | ⚠️ silent |
| B accepts | `update status='accepted'`; trigger writes `friend_accepted` to A | ✅ |
| B declines | **row DELETEd** (`useFriends.ts:154`). The `friend_request` notification A/B saw **remains forever** | ⚠️ see §E |
| A cancels | row DELETEd (`useFriends.ts:165`) — identical statement to decline and remove | ✅ behaviourally |
| A removes B after acceptance | row DELETEd. **No confirmation dialog** — on `/user/:id` the "Friends ✓" button unfriends on a single click (`UserProfile.tsx:159-161`) | ⚠️ UX defect |
| B blocks A | `useBlocks.blockUser` inserts `user_blocks` **then separately** deletes the friendship — two statements, not atomic, both errors swallowed (`src/hooks/useBlocks.ts:38-55`) | ⚠️ |
| A blocks B while pending | Same path; pending row deleted | ✅ |
| A requests B who has blocked A | `useFriendStatus` only checks blocks **A created** (`useFriends.ts:206-211`), so the button reads "Add Friend". The trigger raises `check_violation`. The error is swallowed → **the button silently does nothing, forever** | 🔴 real bug |
| Account disabled (`is_disabled`) | Only meaningful for bots. `useFriends` hides rows where `is_bot && is_disabled` (`useFriends.ts:110-112`); the row survives | ✅ by design |
| Account deleted | `profiles.id` FK — cascade behaviour **not verified in this audit**; `get_league_profiles` would return nothing and the drawer renders `"Unknown"` | ❓ verify |
| Guest (anonymous) | Has a `profiles` row and can technically write `friendships`. No UI path (drawer requires `user`, which a guest has). Stat Check invites correctly 403 with `ACCOUNT_REQUIRED` | ⚠️ inconsistent |
| Bot involved | Only `admin_link_friendship` can create it. Bot can never accept or send: **no auth.users row** | 🔴 see §H |

### C.3 Ghost / divergence risks found

1. **Optimistic-vs-database divergence:** none in the friends drawer — every mutation calls
   `refresh()`. But because every mutation **discards its error**, a rejected write is
   indistinguishable from a successful no-op.
2. **`useFriendStatus` takes `rows[0]`** with no ordering (`useFriends.ts:225`). Safe today
   only because nothing ever writes `'declined'`; the moment decline-without-delete lands, a
   terminal row and a live row coexist and the status becomes non-deterministic.
3. **Blocked-but-still-friends is prevented but not enforced.** The unfriend is a second
   client statement; a failure there leaves an accepted friendship plus a block. Stat Check
   is safe (it re-checks `is_blocked_between` at create AND accept), but the drawer and
   friend count would disagree.
4. **`friend_request` count on the drawer badge** is client-derived from `pendingRequests`,
   which excludes profiles blocked by me — so a badge can show 0 while a row exists.

### C.4 Proposed canonical state machine

> **COM1-2 shipped part of this.** `block_profile` and `unblock_profile` exist and make
> block+unfriend atomic under a pair-scoped advisory lock; `get_relationship_state` is the
> canonical A↔B read; and the trigger now block-tests the `pending → accepted` transition, so
> C.3's risk 3 ("blocked-but-still-friends is prevented but not enforced") is closed.
> `friend_request` / `friend_respond` / `friend_remove` were **not** written: those three
> paths already report honestly through `SocialResult` after COM1-1, so an RPC would have
> bought a transaction nothing needs. Risk 2 (`rows[0]` with no ordering) is closed for
> `useFriendStatus`, which now reads the RPC's M2 pair predicate; the drawer's own list still
> reads `friendships` directly and is still safe only while nothing writes `'declined'` —
> P3-3 stands. `friend_request_events` is still unwritten and the rate limit is still
> evadable (P3-9). See `COM1_PHASE2_COMMUNITY.md` §7.

Keep the shape; move the writes server-side.

```
pending ──accept──► accepted ──remove──► (row deleted)
   │                    │
   │                    └──block──► (row deleted, user_blocks row created)  [one RPC]
   ├──decline──► (row deleted)
   └──cancel───► (row deleted)
```

- **Retain**: one row, requester/addressee, `pending|accepted`, `user_blocks` as the sole
  blocking authority, the M2 constraint set.
- **Drop**: `'declined'` from the status domain until something writes it. A permitted-but-unwritten
  value is a trap for `rows[0]` and for the plain `UNIQUE(requester_id, addressee_id)`.
- **Add**: four SECURITY DEFINER RPCs — `friend_request(target)`, `friend_respond(id, accept)`,
  `friend_remove(id)`, `block_profile(target)` — each returning the ADM2-style
  `jsonb {ok, code}` envelope so the client renders one sentence per outcome instead of
  swallowing everything. `block_profile` makes block+unfriend **atomic**.
- **Add**: a `friend_request_events` append-only log if the rate limit is ever meant to hold
  (the current one is self-documented as evadable).

---

## D. Invites & challenges — how many systems share the word

**Six**, three of which are unrelated to social play:

| # | Concept | Where | Store | Status |
| --- | --- | --- | --- | --- |
| 1 | **Stat Check friend invite** | `POST /api/stat-check/invites` | `sc_friend_invites` (SQLite) | Built, flag-gated OFF |
| 2 | **Stat Check room code** | 6-char code, manually shared | `sc_rooms.invite_code` | Built, flag-gated OFF |
| 3 | **Ranked "Invite & Play"** | `InvitePlayView` / `rankedInviteGateway` | none | **Deliberately inert** |
| 4 | **Invite links** (role-granting referral codes) | `AdminInviteLinks`, `redeem_invite_link` | `invite_links`, `invite_redemptions`, `user_invite_settings` | Live, admin-only |
| 5 | **Referral** | `/referral`, `get_my_referral_code` | same as #4 | Route redirect-gated → dead |
| 6 | **Legacy "Invite Friend"** in `MultiplayerLobby` | — | none — raised a toast, created nothing | Dead, explicitly unbound (`App.tsx:56-62`) |

**Verdict: yes, "invite" is overloaded.** #1/#2 are one system with two entry doors and should
keep the word. #4/#5 are *account provisioning*, not social — they should be renamed
(*referral code* / *access code*) before COM1 ships anything new called "invite".

### D.1 Stat Check invite trace

```
sender  FriendActionMenu "Invite to Stat Check"  (drawer Friends tab, or /user/:id when friends)
   └─► POST /api/stat-check/invites { recipient_profile_id }
         · JWT sub → profiles.id via community_identity.resolve_profile_id (Supabase REST)
         · are_accepted_friends()  +  is_blocked_between()   ← both fail CLOSED
         · expire timed-out invites for this sender
         · reuse a live invite for the same pair (idempotent)
         · cap 5 pending per sender
         · create-or-reuse the sender's ONE open room, in the same tx
         · insert sc_friend_invites, TTL 15 min
   └─► sender navigated to /quiz/stat-check/room/<their own code>

recipient  useStatCheckInvites polls GET /api/stat-check/invites every 30 s
   └─► rendered in the HUD notification panel (NOT a user_notifications row)
   └─► POST /invites/{token}/accept
         · re-resolve recipient profile, re-check friendship + blocks with the RECIPIENT's token
         · BEGIN IMMEDIATE under a per-room lock:
             claim invite (conditional UPDATE) → re-check TTL → verify room still open and
             still the sender's → seat recipient → retire all OTHER pending invites to that room
         · returns room_id, invite_code, seat, join_path
   └─► navigate(join_path) → StatCheckRoomPage joins by code
```

### D.2 Edge cases — traced against the implementation

| Case | Handling | Evidence |
| --- | --- | --- |
| Recipient already in another room | `join_room_tx` raises `SC_ACTIVE_ROOM_EXISTS`; enriched with **identifier-free** conflict details (`room_state`, `other_player_present`, `can_close`); client offers switch | `friend_invites.py:263-300`, `MogzyIdentityMenu.tsx:615-655` |
| Switch requested | `/accept-switch` — closes the caller's own room and joins, **one transaction**. Never auto-closes an ACTIVE room, never a room the caller didn't create, requires explicit confirm when a second player is seated | `friend_invites.py:424-460` |
| Sender leaves / room gone | `SC_INVITE_ROOM_GONE`; invite marked `expired(room_gone)` in its own tx | `friend_invites.py:365-372, 440-448` |
| Invite expires | 15 min TTL, checked pre-flight **and** re-checked inside the write lock | `INVITE_TTL`, `friend_invites.py:337-341, 358-361` |
| Accepted twice | Conditional claim; loser gets `_already_resolved` — idempotent for the rightful recipient, stable 409 otherwise | `friend_invites.py:349-356, 434-437` |
| Two invites received | Both listed; accepting one retires every other pending invite **to that room** (`resolve_room_invites`). Invites to *different* rooms stay live and will conflict at accept → handled by the switch flow | `friend_invites.py:390-393` |
| Both players invite each other simultaneously | Two rooms, two invites. Whoever accepts first wins; the other hits `SC_ACTIVE_ROOM_EXISTS` → switch dialog. **No deadlock, but no "you already invited them" copy either** | inferred from `_reject_other_live_room` |
| Recipient refreshes | `useStatCheckRoom` re-enters by `inviteCode` or `getActiveRoom()` | `useStatCheckRoom.ts:104-128` |
| Sender refreshes | Same; `getActiveRoom()` recovers their room | ibid |
| Stale room on one client | 30 s poll + exponential backoff; `isFatal` stops polling on `SC_NOT_A_PARTICIPANT`/404 | `client.ts:83-89` |
| Invited user is a bot | **Invite is created and can never be accepted.** `are_accepted_friends` passes (admin linked it); the bot has no session, so it never polls, never accepts. Invite dies at TTL | see §H |
| Notification already read | N/A — Stat Check invites are **not** `user_notifications` rows and have no read state |
| Invite row but no room | `SC_INVITE_ROOM_GONE` → invite retired | ✅ |
| Room but no invite | Ordinary code-join path, unaffected | ✅ |

### D.3 Stat Check invite gaps

1. **`cancelInvite` has zero UI.** Implemented on the backend (`POST /invites/{t}/cancel`) and
   in the client (`client.ts:200-206`), called from **nowhere**. A sender cannot see or
   withdraw an outstanding invitation.
2. **The sender is never told what happened.** No notification on accept, decline, or expiry.
   They sit in a lobby and either someone appears or they don't.
3. **The invite entry point is hidden on the Stat Check page itself** — `Layout.tsx:79`
   suppresses the friends drawer on `/quiz/stat-check*`, and the drawer is the only place the
   Friends tab exists.
4. **Production configuration — VERIFIED ENABLED (2026-08-22).** The feature needs three
   independent things on the Railway backend (project `sweet-analysis`, environment
   `production`); all three are satisfied:

   | Requirement | Code | Status |
   | --- | --- | --- |
   | `STAT_CHECK_MP_ENABLED` = `1` | `stat_check_public/rooms.py:38` | ✅ set, enabled |
   | `STAT_CHECK_FRIEND_INVITES_ENABLED` = `1` | `stat_check_public/friend_invites.py:67` | ✅ set, enabled |
   | `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` | `services/community_identity.py:53-59` | ✅ both present |

   `SUPABASE_ANON_KEY` is absent, which is fine — `_supabase_public_config()` accepts either
   key and prefers the publishable one. `SUPABASE_JWT_SECRET` is also absent, which is the
   *safer* configuration: token verification runs through JWKS at
   `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, and the symmetric HS256 branch — which
   could forge a token for any user id — stays disabled (`routes/supabase_auth.py:98-102`).

   **Conclusion: the two-client Stat Check friend-invite flow is enabled and runnable in
   production right now.** The §K matrix can be executed as written. No secret values were
   read or recorded during this check — presence only.
5. **No two-client test exists.** `test_stat_check_friend_invites.py` and
   `test_stat_check_invite_switch.py` are backend service tests; `e2e/` contains only
   `combat-battles.spec.ts`. The prior audit's warning still stands.

---

## E. Notifications ↔ social

### E.1 What actually writes a social notification

| Event | Type | Trigger | Payload | Link target | Verdict |
| --- | --- | --- | --- | --- | --- |
| Friend request sent | `friend_request` | `notify_on_friendship_change` INSERT branch | `metadata: {friendship_id, requester_profile_id}`, `sent_by_user_id` = **requester's auth uid** | `action_url` **NULL**; client opens the friends drawer (`MogzyIdentityMenu.tsx:594-598`) | ⚠️ |
| Friend request accepted | `friend_accepted` | UPDATE branch | `metadata: {friendship_id, addressee_profile_id}`, `sent_by_user_id` = **addressee's auth uid** | `action_url` NULL; client navigates `/user/{addressee_profile_id}` | ✅ |
| Stat Check invite received | — | **none** | — | polled inbox, rendered inline in the same panel | ⚠️ parallel system |
| Stat Check invite accepted / declined / expired | — | **none** | — | — | 🔴 sender gets nothing |
| Ranked match ready / result | — | **none** | — | — | — |
| `comment_reply`, `comment_reaction` | written by triggers | `20260523081658` | | suppressed by the client allowlist (`MogzyIdentityMenu.tsx:96-101`) | rows accumulate unread forever |

### E.2 Findings

1. **Notifications and friendship state can disagree, permanently.** Decline, cancel and
   remove all `DELETE` the `friendships` row. Nothing deletes the notification. A user's bell
   keeps `"X sent you a friend request"` after the request was withdrawn; clicking it opens a
   drawer with nothing in it. **This is exactly the divergence the brief asked about, and it
   is real.**
2. **No idempotency / dedup.** Request → cancel → request writes two identical
   `friend_request` rows. The trigger has no guard and the client has no collapse.
3. **`sent_by_user_id` leaks a cross-user auth uid.** The recipient may read the whole row
   under `is_profile_owner(profile_id)`, and the client does `select("*")`
   (`MogzyIdentityMenu.tsx:268`). So a friend request hands the recipient the requester's
   Supabase `auth.users.id` — the identifier `20260730150000` was written specifically to
   withhold. See §6.
4. **The 30-row window is applied before the recipient filter.** `loadNotifications` fetches
   `limit(30)` over all readable rows and *then* filters to `target_type='all' OR profile_id = me`.
   A burst of site-wide announcements can push a user's own friend request out of the window.
5. **Two notification systems in one panel.** `user_notifications` (realtime, read receipts,
   "Mark all read") and the Stat Check invite inbox (30 s poll, no read state, resolved by
   accepting/declining). The code handles the seam well — two separate counts, deliberately
   unmerged (`MogzyIdentityMenu.tsx:657-672`) — but it is still two systems.
6. **`comment_reply` / `comment_reaction` triggers still fire** into a type the client
   suppresses. Rows accumulate with no reader.

---

## F. Profile & privacy model

### F.1 What another user can actually see

`LEAGUE_ONLY_MODE = true` is a **hard-coded constant**, not an env var
(`src/lib/site-config.ts:20`), so the League branch is what production runs.

| Field | Signed-out | Guest (anon) | Authed user | Friend | Blocked | Admin | master_admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `display_name` | ✗ | ✓ | ✓ | ✓ | **✗** | ✓ | ✓ |
| `avatar_url`, `profile_frame` | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `is_pro`, `is_bot`, `is_anonymous`, `is_disabled` | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| `created_at` (join date) | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ |
| Quiz rank / category progress / achievements | ✗ | ✗ | **✗** | **✗** | ✗ | ✗ | ✗ |
| Ranked stats / match history | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `age`, `location`, `status_message`, `socials`, `custom_theme` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| `profile_photos` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (storage) | ✓ |
| Friend list / favourites / recent activity | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `admin_notes`, `is_flagged_underage`, `diamonds` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| `user_id` (auth uid) | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |

Enforced by: `get_league_profiles` (server), `targetUserId = LEAGUE_ONLY_MODE && isOwnProfile ? user.id : null`
(`UserProfile.tsx:535`), and `admin_list_profiles` (`has_role(admin)`).

**Signed-out sees nothing at all** — `/user/:profileId` is inside `ProtectedRoute`
(`App.tsx:374`) *and* `get_league_profiles` returns zero rows when `auth.uid() IS NULL`.
Defence in depth, correctly.

### F.2 The privacy model is coherent — and the profile is now empty

Age, location and photos genuinely do not reach a League surface, in the UI **or** the
database projection. That objective is met.

The cost: **a stranger's profile has nothing on it.** Avatar, name, join date, and four
buttons. The stat blocks are disabled for non-self viewers with an explicit comment saying a
profile-id-keyed public-stats endpoint would be needed (`UserProfile.tsx:526-534`). That
endpoint does not exist.

### F.3 `public_profiles` is no longer the public boundary

It is `security_invoker` over owner-only RLS, so cross-user it returns **zero rows**. It is
still `GRANT SELECT TO anon` and **still carries `user_id`**. It is dormant, not leaking — but
it is a loaded gun: the day anyone adds a permissive cross-user SELECT policy on `profiles`
(a natural "let's make profiles public" change), `public_profiles` immediately publishes every
account's auth uid to `anon`. **The correct public boundary today is `get_league_profiles`.**

~20 call sites still read `public_profiles`; all are legacy-gated or admin (§A.2, §I).

### F.4 Authorization mismatches

- `/moderator` admits `moderator | admin | master_admin` (`App.tsx:431`) and renders
  `AdminBots` unconditionally (`Moderator.tsx:130`). Every bot RPC raises
  `insufficient_privilege` unless `is_master_admin`. A moderator sees a full bot management
  UI in which nothing works.
- `admin_list_profiles()` requires only `has_role(admin)` yet returns `admin_notes`,
  `is_flagged_underage`, `age`, `location`, `socials` and `user_id` for every account. The
  page that consumes it is gated `master_admin`; the **RPC** is not.

---

## G. Profile navigation / social graph connectivity

| From | To profile? | Evidence |
| --- | --- | --- |
| Leaderboard player | ❌ code exists, route dead | `Leaderboard.tsx:340,349`; `/leaderboard/:leagueId` is `leagueGate`d |
| Ranked live opponent | ❌ | opponent is a `player_id` = **auth uid**, not a `profiles.id` (`useRankedMatch.ts:88,233`) |
| Ranked match history opponent | ❌ | contract carries `opponentDisplayName` only and **actively rejects** account ids (`contracts.ts:1245-1248`) |
| Friend (drawer) | ✅ | `FloatingFriendsButton.tsx:121` |
| Notification sender (`friend_accepted`) | ✅ | `MogzyIdentityMenu.tsx:599-605` |
| Notification sender (`friend_request`) | ⚠️ opens the drawer, not the profile | `MogzyIdentityMenu.tsx:594-598` |
| Stat Check opponent | ❌ | room/match views carry seats, not profile ids |
| Stat Check invite sender | ⚠️ name + avatar rendered from `get_league_profiles`, not linked | `useStatCheckInvites.ts:86-100` |
| Own profile → public preview | ✅ | `Profile.tsx:547` |
| Admin directory | ✅ | `admin-users.ts:181-183` |
| Blog `ProfileCardBlock` | ✅ but the block is legacy | `ProfileCardBlock.tsx:11` |
| Blocked user in drawer | ⚠️ links, but the list **renders empty** — `get_league_profiles` filters blocked profiles in both directions, which is exactly this set (`FloatingFriendsButton.tsx:56-64`) | acknowledged in-code |

**There is no discovery path.** No search (removed on purpose, `FloatingFriendsButton.tsx:9-14`),
no post-match "add friend", no leaderboard link that resolves. A user can only friend someone
whose `profiles.id` they already possess.

> **COM1-2: there is one now.** `public.search_league_profiles` searches the AUTH3 normalised
> `display_name`, and the drawer's Find Players tab is its entry point. The other rows of the
> table above are unchanged: Ranked still hands out a name with no profile id, and the
> leaderboard route is still redirect-gated. Search excludes bots (no `auth.users` row, so a
> request could never be accepted), disabled profiles, unclaimed placeholder names, and
> profiles that blocked the caller.

**Dead / self-only links:** `/user/:id` for another user renders an empty shell (§F.2).
~~the Blocked tab renders zero rows by construction~~ — **fixed by COM1-2**:
`get_blocked_profiles` is the block-aware read that `get_league_profiles` could never be.

---

## H. Bot accounts — four different things called "bot"

| # | Kind | Representation | `auth.users`? | `profiles`? | Friendable | Can send/accept challenge | In search | In leaderboards | Notifications | Label |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Admin bot persona** | `profiles.is_bot = true`, `user_id` = `gen_random_uuid()` **fabricated** | ❌ **No** | ✓ | ✓ via `admin_link_friendship` only | ❌ **impossible — no session, no JWT** | no search exists | would appear (`league_memberships`) | can neither send nor read | none |
| 2 | **Anonymous guest** | `profiles.is_anonymous = true`, real anon JWT | ✓ | ✓ | technically yes, no UI | Stat Check refuses (`ACCOUNT_REQUIRED`) | — | — | bell gated on `isAccount` | none |
| 3 | **Ranked synthetic opponent** | uid `bot::<match_id>` | ❌ | ❌ | n/a | n/a — created inside the match | n/a | excluded (`is_bot_match` never rated) | n/a | `opponentIsBot` flag, name "Playtest Bot" |
| 4 | **Stat Check practice bot** | pure client-side | ❌ | ❌ | n/a | n/a | n/a | n/a | n/a | route is literally `/quiz/stat-check/bot` |

### H.1 The central bot finding

> **`admin_create_bot_profile` creates no `auth.users` row, provisions no login and mints no
> token** (ADM2 §8 header, `20260803120000_...sql:577-591`).

Therefore the stated intent — *"admin-created bot accounts were intended to be friendable/invitable
for Stat Check testing"* — is **only half achievable**:

- ✅ Friendable: `admin_link_friendship` writes an `accepted` row directly.
- ✅ Invitable: `create_invite` passes, because `are_accepted_friends` returns true.
- 🔴 **Un-acceptable**: `accept_invite` requires a verified JWT whose `sub` maps to the bot's
  `profiles.id`. The bot has no session. The invitation sits in an inbox nobody polls and dies
  at the 15-minute TTL.

**A bot can be invited to Stat Check but can never join.** Any test plan that relies on
"invite the admin bot" will fail, and it will fail silently (the sender just waits).

### H.2 `show_bot_labels`

- Seeded `{"enabled": false}` in `app_settings` (ADM2 §10).
- Read into `PlatformPolicy.community.showBotLabels` (`policy.ts:172-174`).
- Toggleable at `/admin/platform-policies`.
- **Consumed by zero user-facing components.** `grep showBotLabels src` returns only the
  policy module and the admin toggle. The policy header states this plainly: *"There is no
  user-facing bot label anywhere in the app today."*

So the policy is correctly *plumbed* and entirely *unwired*. Turning it on today changes nothing.

### H.3 Soft vs destructive disable

Soft, and correctly so. `admin_update_bot_profile` sets `is_disabled`; there is no delete
control (`AdminBots.tsx:17-20`). `get_league_profiles` returns the row with
`is_disabled = true` rather than dropping it, precisely so the friends drawer can hide it
without falling through to an "Unknown" ghost (`useFriends.ts:104-112`). Well designed.

---

## I. Dead / legacy social code

| Item | Classification | Evidence |
| --- | --- | --- |
| `/multiplayer`, `/multiplayer/game/:id` | **compatibility-only** (redirects) | `App.tsx:436-437` |
| `src/components/multiplayer/*` (6 files), `pages/Multiplayer.tsx`, `pages/MultiplayerGame.tsx`, `hooks/useMultiplayerGame.ts` | **dead but harmless** — deliberately unbound with a written rationale | `App.tsx:56-62` |
| `multiplayer_*` tables + `create_multiplayer_game`, `join_multiplayer_game`, `submit_multiplayer_action`, `set_round_winner`, `finish_multiplayer_game`, `realtime_is_game_topic_player` | **dead but harmless** — preserved on purpose | types.ts |
| `AdminMultiplayer` mounted at `/admin/play`, `/admin/gaming` | **misleading/debt** — an admin console for a retired feature | `AdminPlay.tsx`, `AdminGaming.tsx` |
| `saved_profiles` + the Save button on `/user/:id` | **misleading/debt** — write-only. The drawer's "Saved" tab was removed; nothing reads the rows | `UserProfile.tsx:110-127`; `FloatingFriendsButton.tsx:8-10` |
| `public_profiles` view | **dangerous stale behaviour** — dormant today, publishes `user_id` to `anon` the moment profiles RLS is widened | §F.3 |
| Blocked-users list in the drawer | ~~**misleading/debt** — always renders empty~~ — **FIXED by COM1-2** (`get_blocked_profiles`) | `FloatingFriendsButton.tsx:56-64` |
| `comment_reply` / `comment_reaction` triggers | **misleading/debt** — write rows the client permanently suppresses | `MogzyIdentityMenu.tsx:83-101` |
| `'declined'` friendship status | **misleading/debt** — legal, never written; breaks `rows[0]` if used | `20260730140000` §1 |
| `legacyWrite()` in `claim-username.ts` | **dead but harmless today** — unreachable now that `set_display_name` exists; still an unguarded, uniqueness-free write one predicate change away from being live. Delete | §B.4.2 |
| Stale `src/integrations/supabase/types.ts` (missing every AUTH3 object) | **misleading/debt** — no runtime effect; forces `any` casts in the identity layer and makes the file lie about what is applied | §B.4.1 |
| `ProfileTopComments`, `ProfileFavoriteCards`, `ProfilePhotoCircles`, `RecentMatchups`, `FavoritesEditor` | **dead but harmless** (legacy-gated) | grep: only `AdminAbout` + `!LEAGUE_ONLY_MODE` branches |
| `HomeFriendsSection` | **dead** — `/home` redirects | `Home.tsx:946` |
| HUD footer "Friends" entry | **dead** — inside `!LEAGUE_ONLY_MODE` | `MogzyIdentityMenu.tsx:809` |
| `AdminProfileDirectory` vs `AdminUserDirectory` | **duplicate** — two profile browsers | §A.3 |
| `ProfileData.age/location/status_message/socials/custom_theme` in `UserProfile.tsx:31-48` | **misleading/debt** — declared, never populated (the RPC does not return them) | `league-profiles.ts:24-37` |
| `cancelInvite` (client + backend) | **active but unwired** | §D.3 |
| `gifts` table | **dead** — 0 frontend references | grep |
| `community/stat-check-friend-invites`, `community/stat-check-invite-switch` branches | **superseded** — the `integ/` twins are ancestors of `origin/main`; these are the pre-rebase versions | `git merge-base --is-ancestor` |

**Nothing was deleted.**

---

## J. Product coherence review

**What does "Friends" mean in Mogzy today?**
A private list you cannot add anyone to, shown in a drawer you cannot open on a phone.

**What can I do with a friend that I cannot do with a stranger?**
Exactly one thing: invite them to a Stat Check private room — and only when two backend
environment flags are set. Nothing else in the product distinguishes a friend.

**Why would I add someone?** No stated reason surfaces anywhere in the UI.

**Where do I see my friends?** Desktop-only floating button, bottom-left. Suppressed on the
one gameplay surface where friendship matters.

**How do I challenge someone?** Friends tab → ⋯ → "Invite to Stat Check". Not discoverable
from Stat Check, from Ranked, or from a match result.

**What happens after I challenge them?** You are dropped into your own empty lobby with no
feedback. They may or may not be online. You cannot cancel. You are never told what happened.

**Can I discover someone I just played?** No. Ranked history gives a display name and
deliberately withholds every id.

**Can I see who beat me?** A name, and nothing else.

**Can I rematch them?** No mechanism exists.

**What social information belongs on a profile?** Rank, Ranked record, quiz mastery,
achievements, recent matches, Academy tier. **None of it is currently shown to anyone but the
owner.**

**Are we making users maintain data with no purpose?**
**Yes, and it is the clearest product defect in the audit.** `/profile` still asks every Mogzy
player for **Age, Location, Status Message, Instagram, TikTok, YouTube, X, Twitch and Website**
(`Profile.tsx:756-950`), plus photo uploads (`Profile.tsx:334`). Every one of those fields is
excluded from `get_league_profiles` and therefore **can never be seen by another user**. The
product collects dating-profile data, stores it, validates it, warns about under-18 ages —
and shows it to nobody. This is a privacy liability and a coherence failure at once.

**Features whose product purpose is unclear:** Save/bookmark a profile; profile photos;
profile themes / frames on a profile nobody visits; `profile_favorites`; the `/moderator`
bot tab; invite links overlapping the word "invite".

---

## K. Live verification plan (design only — do not run yet)

### Preconditions
1. ✅ **Already satisfied.** Railway `sweet-analysis`/`production` carries
   `STAT_CHECK_MP_ENABLED=1`, `STAT_CHECK_FRIEND_INVITES_ENABLED=1`, `SUPABASE_URL` and
   `SUPABASE_PUBLISHABLE_KEY` (verified 2026-08-22, §D.3.4). The matrix is runnable as written.
2. ✅ **Already satisfied.** AUTH3 is live and the uniqueness backstop is active (§B.4).
   Expect duplicate usernames to be **refused**, not accepted.
3. Two browsers with **fully separate profiles** (not incognito tabs of one profile —
   Supabase sessions share storage per profile).

### Actors
- **A** — throwaway permanent account, desktop browser 1
- **B** — throwaway permanent account, desktop browser 2
- **M** — existing master_admin (no new account)
- **Bot** — admin-created persona, **only** to prove the negative in step 6

### Matrix

| # | Step | Actor | Expected | Watching for |
| --- | --- | --- | --- | --- |
| 1 | Sign up A and B; note both `profiles.id` from `/admin/users`. Deliberately try to give B the name A already took | M | two rows; B is refused the duplicate with `taken` | confirms AUTH3 uniqueness is live end to end |
| 2 | A visits `/user/<B.profileId>` typed by hand | A | profile renders: avatar, name, join date **and nothing else** | confirms §F.2 |
| 3 | A clicks "Add Friend" | A | B's bell shows `friend_request` | **also confirms §6.1** — inspect the row: does the client receive B's… i.e. A's `sent_by_user_id`? |
| 4 | B accepts from the drawer | B | A's bell shows `friend_accepted`; clicking navigates to `/user/<B>` | ✔ |
| 5 | B cancels/declines a **second** request cycle | both | the `friend_request` notification **remains in the bell** after the row is gone | confirms §E.1 |
| 6 | A opens the drawer → Friends → ⋯ → "Invite to Stat Check" | A | A lands in `/quiz/stat-check/room/<code>`; B's bell shows the invite within 30 s | ✔ |
| 7 | B accepts | B | B joins the same room; both see two seats | **the core two-client proof** |
| 8 | Repeat 6–7 but B first creates their **own** room | both | B gets the switch confirmation dialog, then joins | exercises `/accept-switch` |
| 9 | Repeat 6–7 but B has a **live match** in progress | both | B is told to finish first; never auto-closed | safety rule |
| 10 | Both refresh mid-lobby, then mid-match | both | both recover via `getActiveRoom()` / resume | reconnect |
| 11 | Play a match to completion | both | result screen; check `/lol/history` for the opponent entry | note: **name only, no link** |
| 12 | A tries to invite B again while an invite is live | A | idempotent reuse, no duplicate row | `load_live_invite_for_pair` |
| 13 | A attempts to cancel the invite | A | **no UI exists** | confirms §D.3.1 |
| 14 | M creates a bot with auto-friend, then M invites the bot to Stat Check | M | invite created; **never accepted; expires at 15 min** | confirms §H.1 |
| 14b | M creates a second bot whose name **collides** with an existing claimed name | M | expected: `{ok:false, code:...}`. **Actual: a raw Postgres `unique_violation`** | confirms §B.5 as a live defect |
| 15 | B blocks A | B | friendship gone both sides; A's `/user/<B>` shows "Blocked"; A's re-add silently no-ops | confirms §C.2 |
| 16 | A removes B (before the block) | A | single click, no confirmation | confirms §C.2 |
| 17 | Repeat 1–7 on a **phone-width viewport** | A | **the friends drawer cannot be opened** | confirms the mobile finding |

### Cleanup
- Delete the two throwaway `auth.users` rows (cascades `profiles`); verify no orphan
  `friendships`, `user_blocks`, `user_notifications`, `user_notification_reads`.
- Soft-disable the test bot; **do not delete** (ADM2 has no delete path by design).
- Backend SQLite: `sc_rooms`, `sc_room_seats`, `sc_friend_invites`, `sc_matches` rows for the
  test accounts. Rooms self-expire; invites self-expire. Removal is optional.
- Rows in `admin_audit_log` are permanent by design — leave them.
- **Safe to test on production data** because every write is scoped to the throwaway accounts.
  The only production-visible artefact is the audit log and the bot persona.

---

## Prioritised findings

### P0 — correctness / security

> Every row below is **FIXED on `com1/phase1-safety-*`**, pending migration apply and push.

| ID | Finding | Evidence | COM1-1 |
| --- | --- | --- | --- |
| P0-1 | **`user_notifications.sent_by_user_id` leaks a cross-user Supabase auth uid** to the recipient of every friend request/acceptance. This is the exact identifier `20260730150000` was written to withhold, and `REQUIRE_SUPABASE_AUTH` is **confirmed absent** on Railway, so the backend's `/api/quiz/{user_id}` reads still honour a foreign uid. | `20260523081658:226,240`; `MogzyIdentityMenu.tsx:268`; `20260520093257`; `supabase_auth.py:243-261`; Railway check §D.3.4 | ✅ migration `20260823120000` + column allow-list |
| P0-2 | **Ranked publishes the opponent's auth uid** as `player_id` in every live round view — while Ranked *history* explicitly rejects account ids. Two disciplines in one feature. | `useRankedMatch.ts:88,233`; `contracts.ts:1245-1248`; `migrate_add_ranked_public.py:61-62` | ✅ `ranked_public/identity_redaction.py`; opponents pseudonymised at the projection boundary |
| P0-3 | **Every Supabase social mutation swallows its error.** `sendRequest`, `acceptRequest`, `declineRequest`, `cancelRequest`, `removeFriend`, `blockUser`, `reportUser` never inspect `{ error }`. Block and report show a success toast unconditionally. | `useFriends.ts:136-171`; `useBlocks.ts:38-95`; `FriendActionMenu.tsx:66-88` | ✅ `lib/community/social-result.ts`; every mutation returns `SocialResult` |
| P0-4 | **`admin_create_bot_profile` bypasses AUTH3, and the backstop index is already live.** A colliding bot name raises a raw `unique_violation` out of a jsonb-contract function — a present-tense admin-facing break, not a latent one. Bots may also hold reserved and 25–60 character names AUTH3 forbids humans. | ADM2 `20260803120000:594-655` vs AUTH3 §4/§9; backstop confirmed active §B.4 | ✅ migration `20260823121000`; both bot RPCs routed through AUTH3 |

### P1 — broken user journeys

| ID | Finding | Evidence |
| --- | --- | --- |
| P1-1 | **No way to add a friend.** No search, no leaderboard link, no post-match affordance. `/user/:id` is the only "Add Friend" and nothing produces a stranger's `profiles.id`. **→ CLOSED by COM1-2.** | `FloatingFriendsButton.tsx:9-18`; `App.tsx:366` |
| P1-2 | **Friends drawer is unreachable on mobile.** Trigger is `hidden sm:flex`; the HUD entry is inside `!LEAGUE_ONLY_MODE`. **→ CLOSED by COM1-2** (both doors opened; verified at 375×812). | `FloatingFriendsButton.tsx:130`; `MogzyIdentityMenu.tsx:809-836` |
| P1-3 | **A stranger's profile is empty.** All stat blocks disabled for non-self viewers. **STILL OPEN — and now the next bottleneck**, since search delivers users to it. | `UserProfile.tsx:526-535`; `LeaguePublicProfile.tsx:122-136` |
| P1-4 | **A request to someone who blocked you fails silently forever.** **→ CLOSED.** COM1-1 made the refusal audible; COM1-2 moved the state read to `get_relationship_state`, so `useFriendStatus` no longer reports a state it cannot see. The block itself stays undisclosed by design. | `useFriends.ts:206-211` + trigger |
| P1-5 | **Notification state outlives social state.** Cancelled/declined requests keep their bell entry permanently. | §E.2.1 |
| P1-6 | **A bot can be invited to Stat Check and can never accept.** | §H.1 |
| P1-7 | **Invite sender gets no feedback and cannot cancel.** `cancelInvite` has zero UI; no accept/decline/expiry notification. | `client.ts:200-206`; grep |
| P1-8 | **The friends drawer is suppressed on Stat Check**, hiding the only invite entry point from the game it invites to. | `Layout.tsx:75-79` |
| P1-9 | **Unfriend is one unconfirmed click** on `/user/:id`. | `UserProfile.tsx:159-161` |
| P1-10 | **Blocked tab always renders empty.** **→ CLOSED by COM1-2** (`get_blocked_profiles`, a block-aware read that returns only the caller's own blocks). | `FloatingFriendsButton.tsx:56-64` |

### P2 — coherence / UX

| ID | Finding |
| --- | --- |
| P2-1 | `/profile` still collects age, location, status message and six social links that no one can ever see. Remove the fields from the form (columns stay). |
| P2-2 | Six unrelated concepts share the word "invite". Rename `invite_links` / `/referral` to *access code* / *referral*. |
| P2-3 | Two notification systems in one panel (Supabase rows vs polled Stat Check inbox), with different read semantics. |
| P2-4 | Ranked history shows a name you cannot click, friend, or rematch. |
| P2-5 | `/moderator` shows a full bot console to moderators; every action 403s. |
| P2-6 | Two admin profile directories (`AdminUserDirectory` vs `AdminProfileDirectory`). |
| P2-7 | `friend_request` notification opens a drawer instead of the requester's profile. |
| P2-8 | Save/bookmark a profile is write-only with no reader. |
| P2-9 | `show_bot_labels` is fully plumbed and consumed by nothing. |
| P2-10 | Notification `limit(30)` is applied before the recipient filter. |

### P3 — cleanup / future capability

| ID | Finding |
| --- | --- |
| P3-1 | Retire `public_profiles` or at minimum drop `user_id` from it and revoke the `anon` grant. |
| P3-2 | Unmount `AdminMultiplayer` from `/admin/play` and `/admin/gaming`. |
| P3-3 | Remove `'declined'` from the friendship status domain until something writes it. |
| P3-4 | Disable the `comment_reply` / `comment_reaction` triggers, or activate the feature. |
| P3-5 | Remove `age/location/status_message/socials/custom_theme` from `ProfileData` in `UserProfile.tsx`. |
| P3-6 | Delete the merged `community/stat-check-*` branches (the `integ/` twins are on `main`). |
| P3-7 | Add a real two-client Playwright spec — `e2e/` has one file and covers no social flow. |
| P3-8 | Verify FK delete/cascade behaviour for a deleted account across `friendships`, `user_blocks`, `user_notifications`. |
| P3-9 | Non-evadable friend-request rate limiting needs an append-only event log. |
| P3-10 | **Regenerate `src/integrations/supabase/types.ts`** so the AUTH3 objects are typed, then delete the `RpcClient` cast in `claim-username.ts:52-53` and the `as any` in `league-profiles.ts:55`. No runtime change; removes two untyped holes in the identity layer and stops the file misreporting what is applied. (§B.4.1) |
| P3-11 | **Delete `legacyWrite()`** from `claim-username.ts` and let a missing RPC fail loudly. It is unreachable now and is a dormant bypass of AUTH3 authority. (§B.4.2) |

---

## Recommended target social model

**Principle: friendship is the connective tissue of competition, not a social network.**

1. **One identity — already true, with one hole.** `profiles.display_name`,
   case-insensitively unique, is the public username, enforced live by `set_display_name()`
   and the backstop index. Do not add a second name field. The one hole is
   `admin_create_bot_profile`, which writes `profiles` directly; route it through
   `display_name_problem` so bot personas obey the same rules as people.

2. **One public profile boundary.** `get_league_profiles` stays the only cross-user profile
   read, widened once with a **League** payload: Ranked rating/tier, W-L, quiz mastery tier,
   achievement count, Academy tier. Retire `public_profiles`.

3. **One friendship state machine**, RPC-mediated, `pending | accepted`, with
   `block_profile` making block+unfriend atomic and every call returning `{ok, code}`.

4. **One discovery path.** Username search over the live `profiles_display_name_unique_ci`
   index AUTH3 already installed —
   exact/prefix match only, returning at most a handful of rows, `LIMIT`-capped and
   block-filtered exactly as `get_league_profiles` already is. This is the single unlock that
   makes every other social feature reachable.

5. **One challenge concept.** "Challenge" = "play a private match with a named friend."
   Today that means Stat Check. When the Ranked invite backend lands it uses the same word,
   the same UI, the same notification type — the `rankedInviteGateway` seam is already there.
   Rename `invite_links` out of the way first.

6. **One notification stream.** Move Stat Check invites into `user_notifications` as an
   actionable type, or move friend requests into a unified actionable inbox. Notification
   lifecycle must be tied to social state: resolving a request resolves its notification.

7. **Friendship must pay for itself.** Concretely: challenge to a private match, see their
   League profile, appear in each other's match history with a link, rematch. Nothing else.

8. **Delete the dating layer.** Remove age/location/status/socials/photos from the profile
   form. Keep the columns; stop collecting.

---

## Suggested implementation phases

| Phase | Scope | Gate |
| --- | --- | --- |
| **COM1-0** | **Partly absorbed into COM1-1.** The bot-name half is done (migration `20260823121000`). Still open: regenerate `types.ts` and delete `legacyWrite()` plus the two casts — neither has runtime effect. | P3-10, P3-11 |
| **COM1-1** | ✅ **DONE** (unpushed). `sent_by_user_id` no longer written or selected; Ranked opponents pseudonymised; `/api/quiz/{user_id}` is self-only. Absorbed COM1-0's bot-name item as P0-4. See `COM1_PHASE1_SAFETY.md`. | P0-1 … P0-4 |
| **COM1-2** | ✅ **DONE** (unpushed) — **and it is the reachability phase, not the "honest mutations" one.** COM1-1 had already made every mutation report through `SocialResult`, so the four friendship RPCs this row proposed would have bought nothing. What shipped instead: username search, the Find Players tab, mobile reachability, an admin Users entry point, `block_profile` / `unblock_profile` (atomic, pair-locked), `get_relationship_state`, `get_blocked_profiles`. **Still open from this row: the unfriend confirmation (P1-9).** See `COM1_PHASE2_COMMUNITY.md`. | P1-1, P1-2, P1-4, P1-10 |
| **COM1-3** | **Reachability — mostly absorbed by COM1-2.** Remaining: show the drawer on Stat Check, or put "Invite a friend" on the Stat Check lobby (P1-8). The phase is otherwise free for structured sending, which should consume `get_relationship_state` rather than re-derive the answer. | P1-8 |
| **COM1-4** | **Make the profile worth visiting.** Profile-id-keyed public League stats endpoint; render Ranked rating, record, mastery, achievements on `/user/:id`. Link Ranked history opponents to it. | P1-3, P2-4 |
| **COM1-5** | **Invite lifecycle.** Notifications for invite accepted / declined / expired. Cancel-invite UI. Unify the two notification streams and tie notification lifecycle to social state. | P1-5, P1-7, P2-3 |
| **COM1-6** | **Bots.** Decide: either give test bots real `auth.users` rows behind a master-admin-only provisioning path (so they can actually accept), or remove "invite a bot" from every test plan and say so. Wire `show_bot_labels` to a real badge. | P1-6, P2-9 |
| **COM1-7** | **Cleanup.** Retire `public_profiles`; unmount `AdminMultiplayer`; drop `'declined'`; remove the dating fields from `/profile`; rename `invite_links`; consolidate the two admin directories; add the two-client e2e spec. | P2/P3 |

Phases 0–2 are strictly ordered. 3–5 can run in parallel once 0–2 land. 6–7 are independent.

COM1-0 is now a short phase rather than a blocking database operation: the identity
foundation the brief describes is already in production. What remains is making the two
pre-AUTH3 stragglers — the admin bot RPC and the generated types — agree with it.
