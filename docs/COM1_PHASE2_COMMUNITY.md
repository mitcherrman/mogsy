# COM1-2 — Community Reachability & User Management

Closes the audit's **P1-1** (no way to add a friend), **P1-2** (drawer unreachable on
mobile), **P1-4** (a request across a block fails silently), **P1-10** (the Blocked tab
renders empty), and makes blocking atomic so COM1-3 has something it can depend on.

| Repo | Branch | Base | Worktree |
| --- | --- | --- | --- |
| Frontend `/Users/macmoney/mogsy` | `com1/phase2-community` | `origin/main` `93db3218` | `/Users/macmoney/mogsy-worktrees/com1-phase2` |

**Not pushed. Not deployed. Migration authored, NOT applied.**

No backend (`League_Combat_Simulator`) change. Nothing in this phase touches Stat Check,
Ranked or the FastAPI service.

> **Scope discipline.** No DMs, no free-text messaging, no forums, no activity carousel, no
> quiz sending, no gifts, no new challenge system. No parallel friendship, admin or profile
> implementation — every privileged action on the new admin tab is an existing RPC reached
> through an existing component.

---

## 1. Existing components reused

Nothing in this phase reimplements a capability that already had an owner.

| Reused | Where it came from | Used for |
| --- | --- | --- |
| `SocialResult` / `attempt` / `classify` (`lib/community/social-result.ts`) | COM1-1 | Every new mutation returns the same envelope; the block RPCs map onto the same `SocialCode` vocabulary |
| `useFriends().sendRequest / acceptRequest` | pre-existing | Find Players **calls these** — it has no friendship writes of its own |
| `useBlocks()` | pre-existing | Kept as the hook; its two write paths now call one RPC each |
| `notifyFriendsChanged` / `subscribeFriendsChanged` | ADM2 | Admin-created friendship refreshes the drawer immediately |
| `fetchAdminDirectory()`, `toDirectoryProfile`, `applyDirectoryView`, `DIRECTORY_FILTERS`, `formatDirectoryCount`, `cappedSlice` (`lib/admin/admin-users.ts`) | ADM2 / Admin Users | The whole Community · Users data path, allow-list included |
| `AdminUserCard` | ADM2 | The selected-user inspector — same card, same tags, same fields |
| `AddToMyFriendsButton` → `admin_link_friendship` | ADM2 | Admin friend linking, with its existing confirmation dialog and audit row |
| `BotStateToggle` → `admin_update_bot_profile` | ADM2 | Bot enable / disable |
| `useAdminRoles()` | pre-existing | Whether to mount the Users tab (presentation only — see §4) |
| `FriendActionMenu` | pre-existing | Unchanged; block/report/unfriend/invite on the Friends tab |
| `UserAvatar`, `Tabs`, `Sheet`, `Input`, `Button` | design system | No new visual language |
| `normalize_display_name`, `is_claimed_display_name` (AUTH3) | AUTH3 | Search normalises through the **same** functions the uniqueness index is built on |
| `is_blocked_between` (M2) | M2 | Re-used by the rewritten trigger, not replaced |
| `/user/:profileId` | pre-existing | Clicking a search result opens it. The profile is **not** redesigned in this phase |
| `/admin/people?section=users` | Admin reorg | The one full user-management surface; the new tab links into it |

---

## 2. New components added

| File | Kind | What it is |
| --- | --- | --- |
| `supabase/migrations/20260823130000_com1_community_reachability.sql` | migration | 7 functions — see §8 |
| `src/lib/community/relationship.ts` | pure | The one relationship vocabulary and its presentation map |
| `src/lib/community/discovery.ts` | client | Thin wrappers over the new RPCs: narrowing, envelope → `SocialResult` |
| `src/components/community/FindPlayersTab.tsx` | UI | Username search, debounced, relationship-derived controls |
| `src/components/community/CommunityUsersTab.tsx` | UI | Admin entry point into the existing user management |

**Modified:** `FloatingFriendsButton.tsx` (tabs, mobile trigger, block-aware Blocked tab),
`hooks/useBlocks.ts` (two RPCs), `hooks/useFriends.ts` (`useFriendStatus` reads the
canonical RPC), `hud/MogzyIdentityMenu.tsx` (Community entry outside the League guard),
`admin/AdminUsers.tsx` (`?user=` deep-link adapter, ~20 lines).

---

## 3. Normal-user discovery flow

```
Community button (bottom-left, EVERY width)  ──┐
HUD ▸ Community  ── open-friends-panel event ──┴─► Community drawer
                                                    │
                                        Find Players tab
                                                    │
                        type ≥2 chars ─ 300ms debounce ─► search_league_profiles(query, 10)
                                                    │
                                     server returns ≤20 rows, each carrying
                                     its own `relationship` and `friendship_id`
                                                    │
      ┌──────────────┬──────────────┬──────────────┼──────────────┬──────────────┐
   none          outgoing        incoming        friends        blocked      unavailable
 [Add Friend]   "Requested"     [Accept]        "Friends"      [Unblock]    "Unavailable"
      │                             │                              │
 sendRequest()              acceptRequest(friendshipId)      unblockProfile()
      └─────────────── result decides the message ───────────────┘
                            then RE-SEARCH — the new state comes from the server
```

Clicking the player opens `/user/:profileId`.

**Ranking.** Exact normalised match first (`match_rank 0` — AUTH3 guarantees at most one),
then prefix, then substring; ties break on the normalised name then the id, so the order is
stable. The client does **no** re-sorting.

**Who is findable.** Anyone whose `display_name` is *claimed* — the AUTH3 predicate the
uniqueness index uses. A guest who chose a real name is findable; a guest still carrying its
generated `Anonymous4821` placeholder is not.

**Who is not, and why:**

- **Bots.** `admin_create_bot_profile` provisions no `auth.users` row (ADM2 §8), so a bot has
  no session and can never accept a request. Listing one offers an action that cannot
  complete. Admins still see every bot in Community · Users and still link them with
  `admin_link_friendship`.
- **Disabled profiles.** Same reasoning.
- **Yourself.**
- **Anyone who blocked you** — absent, not badged. See §7.

**Enumeration.** Two normalised characters minimum; `LIMIT LEAST(GREATEST(limit,1),20)`, so a
client asking for 5000 gets 20. `admin_list_profiles()` remains the only full enumeration and
still requires `has_role(admin)`.

**No optimistic success.** Every action reports only what its `SocialResult` says and then
re-reads. A refused request shows the refusal and the row keeps its old state.

---

## 4. Admin Users flow

```
Community drawer ─► Users tab   (mounted only when isMasterAdmin === true)
   │
   ├─ fetchAdminDirectory()      ← admin_list_profiles(), the ADM2 allow-list projection
   ├─ search + 7 filters         ← applyDirectoryView(), identical to /admin/users
   └─ select a row
        └─ AdminUserCard         ← tags: Pro / Bot / Enabled|Disabled / Anonymous / roles
             ├─ Profile link     → /user/:profileId
             ├─ AddToMyFriends   → admin_link_friendship  (master_admin + audit, confirmed)
             ├─ BotStateToggle   → admin_update_bot_profile (bots only)
             └─ "Manage in Admin · People"
                   → /admin/people?section=users&user=<profileId>
                        └─ AdminUsers preselects that account (COM1-2 adapter)
```

**Authorization.** The tab is not the boundary and does not pretend to be.
`admin_list_profiles()` raises unless `has_role(admin)`; every mutation re-checks
`is_master_admin` server-side and writes its own `admin_audit_log` row. What the gate buys is
that an ordinary user's client **never issues** the privileged read — mounting is conditional
on a resolved master-admin role, the fetch lives inside the component, and Radix unmounts
inactive `TabsContent`, so the directory is not even fetched until an admin opens the tab.
All three properties are asserted in
`src/components/FloatingFriendsButton.community.test.tsx`.

The tab implements **no** deletion, **no** role editing and **no** ban control. That is the
point: those live in exactly one place and the drawer is a second door, not a second system.

---

## 5. Requested admin capabilities that already existed

Classification per the brief: **A** implemented and reusable, **B** partial or
context-specific, **C** does not exist.

| Capability | Class | Where it lives | In this phase |
| --- | --- | --- | --- |
| View profile | **A** | `/user/:profileId`, `profileHref()` | ✅ reused |
| Add / remove friend (admin) | **A** | `admin_link_friendship` + `AddToMyFriendsButton` | ✅ reused. *Remove* is the ordinary drawer action — the admin RPC only creates |
| Account / profile state (joined, last seen, onboarding) | **A** | `AdminDirectoryProfile` | ✅ reused |
| Guest vs registered | **A** | `profiles.is_anonymous` | ✅ shown explicitly |
| Bot state, enable / disable | **A** | `admin_update_bot_profile`, `BotStateToggle` | ✅ reused |
| Roles (read) | **A** | `user_roles` join in `fetchAdminDirectory` | ✅ shown as tags |
| Pro presentation (read) | **A** | `profiles.is_pro` | ✅ tag |
| Find / list users | **A** | `admin_list_profiles` + `applyDirectoryView` | ✅ reused |
| Audit trail (write) | **A** | `admin_audit_log`, written by every admin RPC | ✅ inherited — no UI to read it |
| Deep link to full management | *new, tiny* | `?user=` on `AdminUsers` | ✅ ~20-line adapter |

### Not implemented here (correctly)

| Capability | Class | Where it lives today | Why not in this phase |
| --- | --- | --- | --- |
| Ban / unban | **B** | `admin-user-actions` edge function, in `AdminUsers` | Exists, but only on the full page. Porting it would duplicate admin business logic — the brief forbids that. Linked to instead |
| Suspend / restrict | **C** | — | `profiles.is_disabled` is **bot-only**: `admin_update_bot_profile` raises `not_a_bot` for a human. There is no human suspension primitive |
| Restore / re-enable | **B** | bots: yes (`BotStateToggle`, reused). Humans: unban only | Same as above |
| Admin notes | **B** | `profile_admin_notes`, in `AdminUsers` | Full CRUD already exists on one page. Linked to |
| Role editing | **B** | direct `user_roles` writes in `AdminUsers` | Exists; read-only here. Note this is a *client-side table write*, not an RPC — hardening it is separate work |
| Reports | **B** | `AdminUserReports` at `/admin/people?section=moderation` | Global queue, not per-user. A per-user view needs a new query |
| Notification sending | **B** | `AdminNotifications` / `AdminPushNotifications` | Admin→user system notifications exist and are reusable. Not surfaced here |
| Password reset / verification / email confirm | **B** | `admin-user-actions` | Exists on the full page |
| Delete user | **B** | `AdminUsers`, confirmation-gated | Deliberately absent from a drawer |
| Pro management (write) | **C** | `is_pro` is editable in `AdminUsers`'s edit form | Read-only here |
| **invite** | **C** | Six unrelated things share the word (audit §D). `invite_links` is *account provisioning*, not social | **Not invented.** Rename `invite_links` before anything new is called "invite" |
| **move** | **C** | No referent exists in the codebase | **Not invented.** Needs the owner to say what is being moved |
| **review** | **B/C** | `AdminUserReports` is the closest referent; there is no per-user review workflow | **Not invented** |
| **control** | **C** | Too broad to map | **Not invented** |

---

## 6. Future work

1. **Say what `invite`, `move`, `review` and `control` mean.** Three of the four have no
   referent in the code; the fourth (`invite`) has six, and they conflict. Nothing was guessed.
2. **A human suspension primitive.** `is_disabled` is bot-only. Today the only human-facing
   lever is ban/unban through the edge function.
3. **Per-user reports and admin notes in the drawer**, if the owner wants them there rather
   than one click away.
4. **Harden role editing.** `AdminUsers` writes `user_roles` directly from the client. It is
   RLS-gated, but it is the one privileged action in the admin area that is not an RPC.
5. **A profile worth visiting** (audit P1-3 / COM1-4). Search now delivers users to
   `/user/:id`, which still shows avatar, name and join date. This is the next bottleneck.
6. **The drawer is still suppressed on Stat Check** (`Layout.tsx:79`, audit P1-8) — hiding the
   only invite entry point from the game it invites to. Out of scope here.
7. **Rate limiting is still evadable** — decline/cancel/remove all DELETE, so send→cancel→send
   never accumulates. Needs an append-only event log (audit P3-9).
8. **Regenerate `types.ts`** and delete the `as any` RPC casts, now four rather than two
   (audit P3-10).
9. **The global recent-user-activity carousel is NOT built.** Before it is started, **ask the
   owner where they want it placed.**

---

## 7. Final blocking state machine

`user_blocks` remains the sole blocking authority. `friendships.status` still has no
`'blocked'` value.

```
                    ┌──────────── block_profile(target) ────────────┐
                    │   ONE transaction, under pair_lock_key(a,b)   │
                    │                                              │
   any state ──────►│  1. INSERT user_blocks ON CONFLICT DO NOTHING│──► BLOCKED
   (none / pending  │  2. DELETE every friendships row for the pair│
    either way /    │     — direction-agnostic, status-agnostic    │
    accepted)       └──────────────────────────────────────────────┘
                                        │
                                        │ unblock_profile(target)
                                        │   DELETE the block row. NOTHING else.
                                        ▼
                                  none  (NOT friends — the friendship is not restored)
                                        │
                                        │ ordinary friend request by either party
                                        ▼
                                     pending → accepted
```

### The guarantees, and how each is enforced

| Requirement | Enforcement |
| --- | --- |
| Existing friendship removed | The `DELETE` inside `block_profile`, same transaction as the block |
| Pending requests cannot remain actionable | Same `DELETE` (status-agnostic) **plus** a new block test on the `pending → accepted` transition in `enforce_friendship_rules` |
| New requests cannot be created across a block | The M2 `INSERT` block gate, unchanged — now taken **under the pair lock** |
| Unblock restores eligibility, not friendship | `unblock_profile` touches `user_blocks` only. Asserted by a test that the word `friendships` does not appear in its body |
| Blocked user is not told | See below |
| Neutral wording | Both trigger branches raise the *same* message; the client maps it to `refused` → "That friend request could not be sent." No cause is named |
| Self-block impossible | `_target_profile_id = _me → {ok:false, code:'self'}`; the UI never offers the control on your own profile |
| Idempotent | `ON CONFLICT DO NOTHING` → `already`, reported as **success**. Unblocking someone not blocked → `already`, also success |

### Non-disclosure, precisely

| Surface | A blocked B | B blocked A (A is looking) |
| --- | --- | --- |
| `search_league_profiles` | B appears, `relationship = 'blocked'`, offering **Unblock** | B is **absent**. Not badged, not greyed — absent. Absence carries no information |
| `get_relationship_state` | `'blocked'` | `'none'`, `can_request: true` — indistinguishable from a stranger |
| Sending the request anyway | n/a | Trigger refuses → "That friend request could not be sent." Same sentence as a rate limit, a stale row, or an RLS refusal |

A block the caller created is the caller's own knowledge and is named. A block created
against them is never revealed, at read or at write. This is the discipline the Stat Check
backend already uses (`SC_INVITE_BLOCKED` → "This invite is not available").

### The races, and what closes each

The pair `{A,B}` is a logical object with no single row to lock, so a transaction advisory
lock keyed on `least(a,b) || ':' || greatest(a,b)` stands in for one. Both writers take it
**first**, before any row lock, so the acquisition order is identical and the pair cannot
deadlock against itself.

| Race | Before | Now |
| --- | --- | --- |
| Request and block cross | Trigger reads `user_blocks` before the block commits → passes; the block's `DELETE` cannot see the uncommitted friendship → **block + live friendship coexist** | Serialised by the pair lock. Whichever commits first is fully visible to the other |
| Block an existing friend | Two client statements, no transaction → "blocked but still a friend" reachable | One transaction |
| Block a pending requester | Same | Same, plus the accept transition is now block-tested |
| Accept while a block lands | Row-level lock made the accept a no-op *if* the delete won; nothing enforced it if it did not | Row lock **and** an explicit block test on `pending → accepted` |
| Unblock then request | Worked | Unchanged. Eligibility returns; the friendship does not |
| Duplicate block | `23505`, classified `already` by the client | `ON CONFLICT DO NOTHING` server-side, `already`, and the unfriend sweep **re-runs** — so a retry repairs a half-completed older attempt |
| Simultaneous reciprocal blocks | Two independent rows, no interaction | Serialised on the same lock; both rows are created (the unique key is `(blocker, blocked)`, so both directions coexist by design) |

### What COM1-3 should consume

`public.get_relationship_state(target) → {relationship, friendship_id, can_request}`, wrapped
as `fetchRelationshipState()`. It is the canonical A↔B check and it fails **closed**: a
transport error resolves to `unavailable`, which offers no action, never to `none`, which
offers "Add Friend".

`can_request` is an **eligibility hint, not an authorization**. It stays `true` when the other
party has blocked the caller, deliberately. The database decides at the write.

---

## 8. Schema / RPC changes

One migration: `supabase/migrations/20260823130000_com1_community_reachability.sql`.

**No table, no column, no RLS policy.** `public.profiles` stays owner-only. Every cross-user
read is a `SECURITY DEFINER` function with an explicit column list, exactly as
`20260730150000` established. Asserted by a test that the migration contains no
`CREATE POLICY`, `ALTER TABLE` or `CREATE TABLE`.

| # | Function | Kind | Purpose |
| --- | --- | --- | --- |
| 1 | `pair_lock_key(uuid, uuid) → bigint` | IMMUTABLE | Order-independent advisory-lock key for a profile pair |
| 2 | `enforce_friendship_rules()` | **rewritten** trigger | Every M2 rule preserved verbatim; **adds** the pair lock on INSERT (taken before the block test) and a block test on `pending → accepted` |
| 3 | `search_league_profiles(text, int)` | STABLE, DEFINER | Username discovery. ≥2 chars, ≤20 rows, block-filtered, no `user_id` |
| 4 | `get_relationship_state(uuid) → jsonb` | STABLE, DEFINER | The canonical A↔B check |
| 5 | `get_blocked_profiles()` | STABLE, DEFINER | Only the caller's own blocks — fixes the empty Blocked tab |
| 6 | `block_profile(uuid) → jsonb` | VOLATILE, DEFINER | Atomic block + unfriend |
| 7 | `unblock_profile(uuid) → jsonb` | VOLATILE, DEFINER | Idempotent; restores nothing |

Grants follow the project convention: `REVOKE ALL … FROM PUBLIC, anon;
GRANT EXECUTE … TO authenticated;` on all five caller-facing functions. The trigger function
is revoked from `authenticated` too, so it has no direct-call surface.

**No function returns `profiles.user_id`.** Every occurrence of the column in executable SQL
is `<alias>.user_id = auth.uid()` — resolving the *caller*. A test counts them and fails if
the two numbers ever diverge.

### Pre-push review of the trigger replacement — a defect was found and fixed

`enforce_friendship_rules` is the only **replacement** in this migration; the other six
functions are new (verified: zero prior `FUNCTION public.<name>(` definitions, and none
present in the generated types).

**The defect.** The replacement was originally written against the **M2** text
(`20260730140000` §6). But **ADM2 (`20260803120000` §4) had already re-created the
function**, and ADM2 is what is live. The draft therefore silently dropped ADM2's
`_admin_self_link` exemption:

```
-  _admin_self_link boolean;
-  _admin_self_link := NEW.status = 'accepted'
-    AND public.is_master_admin(auth.uid())
-    AND NEW.requester_id = (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid());
-  IF NEW.status IS DISTINCT FROM 'pending' AND NOT _admin_self_link THEN
+  IF NEW.status IS DISTINCT FROM 'pending' THEN
       RAISE EXCEPTION 'a new friendship must start as pending' …
```

**Impact had it been applied:** `admin_link_friendship` inserts
`(actor, target, 'accepted')` directly, so the INSERT branch would have raised
`check_violation` on **every** call. "Add to My Friends" would have broken outright —
including the copy of that button on this phase's own Community · Users tab — along with
`admin_create_bot_profile(_add_to_my_friends => true)`. The rate-limit skip for admin
self-links was lost too.

**Root cause worth remembering:** the audit's §B.2 function table cites this function as
`20260730140000 / ADM2`. M2 is listed first and is the obvious thing to diff against. It is
not the live definition. *Always diff against the newest prior definition, not the first.*

**The fix.** Section 2 is now a line-for-line copy of the **ADM2** body plus the two COM1-2
additions. Comments stripped, the diff against the live definition is **two insertions,
zero deletions, zero modifications**:

```diff
--- ADM2 20260803120000 (LIVE)
+++ COM1-2 20260823130000 (replacement)
@@ INSERT branch, after the status check, before the block gate
+    PERFORM pg_advisory_xact_lock(
+      public.pair_lock_key(NEW.requester_id, NEW.addressee_id)
+    );
@@ UPDATE branch, after the legal-transition guard
+    IF NEW.status = 'accepted'
+       AND OLD.status = 'pending'
+       AND public.is_blocked_between(NEW.requester_id, NEW.addressee_id) THEN
+      RAISE EXCEPTION 'friend request refused: a block exists between these profiles'
+        USING ERRCODE = 'check_violation';
+    END IF;
```

**Every pre-existing rule, and where it is preserved:**

| Pre-existing rule | Owner | Status in the replacement |
| --- | --- | --- |
| No self-friendship | `friendships_no_self` **table CHECK** | Untouched — never lived in the trigger |
| Requester/addressee semantics | `friendships_*_fkey` + RLS INSERT policy | Untouched |
| Duplicate / live-pair protection | `UNIQUE(requester_id, addressee_id)` + `friendships_unique_live_pair` **partial index** | Untouched — table constraints, not trigger logic. The lock is taken *before* the insert, so the index still adjudicates and still raises `23505` → client `already` |
| Status domain | `friendships_status_check` **table CHECK** | Untouched |
| "must start as pending" | trigger | Preserved verbatim, **including `AND NOT _admin_self_link`** |
| ADM2 master-admin self-link exemption (all 3 conditions) | trigger | Preserved verbatim |
| Block gate | trigger | Preserved verbatim, and still **unconditional** — the admin path is not exempt |
| 10/hour + 20-outstanding rate limits | trigger | Preserved verbatim, still skipped for an admin self-link |
| Party immutability | trigger | Preserved verbatim |
| Legal transitions incl. `'declined'` | trigger | Preserved verbatim |
| Exception vocabulary + ERRCODEs | trigger | **Unchanged.** The one added `RAISE` re-uses an existing message, so the set of distinct messages is identical — which matters because `TRIGGER_VOCABULARY` in `lib/community/social-result.ts` matches on that exact text |

**What COM1-2 adds, exhaustively:**

| Addition | Where | Effect |
| --- | --- | --- |
| Pair advisory lock | INSERT, after the status check, before `is_blocked_between` | Serialises against `block_profile` on the same pair. Taken on **every** insert path including the admin self-link, because the block gate applies there too |
| Accept-transition block test | UPDATE, after the transition guard | `pending → accepted` across a block now refuses instead of relying on the row already having been deleted |
| Ordering change | none | The lock is *inserted between* two existing steps; no existing step moved relative to another |
| Exception behaviour change | none | Same messages, same `check_violation` ERRCODE, same client classification |
| Transaction semantics change | none for this function | It is a `BEFORE` trigger and stays one. The advisory lock is transaction-scoped and released at commit/rollback like any other. `block_profile` is where the multi-statement atomicity lives |

**Deadlock analysis.** Both writers take the pair lock as their first lock, and the key is
order-independent (`least || ':' || greatest`), so two transactions touching `{A,B}` acquire
the same lock in the same order. `admin_link_friendship` holds no conflicting lock before
its INSERT (its pre-checks are plain `SELECT`s), so it cannot invert the order either.

**Regression cover.** `src/test/security/com1CommunityReachability.test.ts` gained 9 tests
that do not hard-code a baseline: they enumerate every migration defining the function,
assert this one is newest, assert **more than one prior definition exists** (the trap), and
prove by subsequence walk that every executable line of the *live* definition survives in
order with only the two known additions. Mutation-checked: re-injecting the original defect
fails 3 of them; restoring passes 38/38.

### Applying it

Not applied. It is idempotent (`CREATE OR REPLACE` throughout) and safe to re-run.

⚠️ **Section 2 replaces a live trigger function.** Applying the migration changes friendship
INSERT/UPDATE behaviour for every user immediately. It is strictly additive in what it
refuses — the **ADM2** body is line-for-line identical — but it is the one part that is not
new surface. See the pre-push review above.

Until it is applied, the three new read RPCs return PostgREST `404`. The UI degrades
honestly: Find Players shows "Search is unavailable right now." and the Blocked tab shows
"No blocked users". **Verified live in the dev server against production Supabase** — see §9.

---

## 9. Tests and baseline comparison

### Baseline

Captured on the untouched worktree at `origin/main` `93db3218` **before any edit**:

```
Test Files  10 failed | 445 passed (456)   [11 reported; one file fails to collect]
     Tests  48 failed | 6881 passed | 4 skipped
```

### Final

```
Test Files  10 failed | 454 passed (464)
     Tests  47 failed | 7010 passed | 4 skipped
```

**The failing test set is byte-identical to the baseline** (`diff` of the sorted, unique
`FAIL` lines: empty). All ten are the known cross-file pollution suites —
`quiz-broadcast/engine`, `onboarding-gate`, `StructuralReview`, `e2e/identity`,
`ranked-duel-review/api`, `adminCredentials`, `admin-registry`, `ads/consent`,
`LeaguecraftWorkspace`, `Quiz.rankedRole` — none of which this phase touches. Totals are
compared only after the sets match, per standing practice.

`tsc --noEmit -p tsconfig.app.json` reports **no new errors**; the four that remain
(`AdminBots.tsx` ×2, `LeaguecraftWorkspace.test.tsx`, `admin-users.test.ts` ×2,
`social-result.test.ts`) are all pre-existing on `origin/main`.

### New coverage — 85 tests across 8 files

| File | Tests | Covers |
| --- | --- | --- |
| `src/test/security/com1CommunityReachability.test.ts` | 38 | The migration contract: no `user_id`, min length, hard row cap, LIKE-metacharacter escaping, one-directional block hiding, pair lock ordering, atomic block, unblock touches nothing else, every M2 rule preserved, no RLS widening |
| `src/lib/community/discovery.test.ts` | 25 | Row narrowing (decoy `user_id` and `admin_notes` proven absent), unknown relationship → `unavailable`, short query never sent, envelope → `SocialResult`, no server text leaks |
| `src/lib/community/relationship.test.ts` | 11 | The state → presentation map; `unavailable` explains nothing |
| `src/components/community/FindPlayersTab.test.tsx` | 17 | Exact / case-insensitive / partial search, debounce, out-of-order response discarded, every relationship's control, refused mutation shows no success and names no block |
| `src/components/community/CommunityUsersTab.test.tsx` | 14 | Canonical RPC, bot/guest/registered distinction, selection, deep link, no auth uid or dating field in the DOM, existing authorization path, no delete/ban/role control |
| `src/components/FloatingFriendsButton.community.test.tsx` | 11 | Trigger has no `hidden` class, both open paths, Users tab absent for an ordinary user, **no `admin_*` RPC issued for a non-admin**, absent while the role resolves, not fetched until opened |
| `src/components/hud/MogzyIdentityMenu.community.test.tsx` | 5 | HUD Community entry renders in League mode and dispatches `open-friends-panel` |
| `src/hooks/useBlocks.community.test.tsx` | 11 | Block is one call, unblock recreates nothing, idempotence, `useFriendStatus` reads the canonical RPC |

### Existing tests updated (3 files)

| File | Change | Why |
| --- | --- | --- |
| `FloatingFriendsButton.test.tsx` | "exactly four tabs" → five; the "no Find tab" assertion removed | It encoded the *old* decision. The legacy Find tab searched `public_profiles` and returned nothing; discovery now goes through a DEFINER RPC. **"Saved" stays gone and that assertion is unchanged** |
| `useSocialMutations.errors.test.tsx` | The `block` section rewritten | It asserted "blocks BEFORE unfriending, so a partial failure still protects the user" — the best available mitigation for a gap COM1-1 could only make visible. There is no partial failure any more, so the ordering test is replaced by a stronger one: **there is only one write** |
| `AdminUsers.phase1.test.tsx` | Renders wrapped in `MemoryRouter`; 3 deep-link tests added | `useSearchParams` needs a router. The component only ever mounts inside one in production |

### Live verification

Dev server `com1-phase2-fe` (port 5563) against **production Supabase**, viewport 375×812:

- The Community trigger renders at 375px with `display: flex`, a 30×30 hit box fully inside
  the viewport, and `elementFromPoint` at its centre resolving to the button — nothing is
  painted over it. `FloatingScrollButton`, which shares the coordinates, computes to
  `display: none` at that width.
- Tapping it opens the drawer, titled **Community**, with exactly
  `Friends (0) · Requests · Sent · Find Players · Blocked` wrapping onto two rows. **No Users
  tab** — the session is an anonymous guest.
- Find Players renders its input and the "Type at least 2 characters" hint.
- Searching `ashe` against the **unapplied** migration produced exactly
  `"Search is unavailable right now."` — and `PGRST`, `does not exist` and `schema cache`
  appear nowhere in the document. The honest-degradation path is confirmed against a real
  404, not a mock.
- No new console errors. The `fetchPriority` React warning is pre-existing in `LolHub.tsx`.

---

## 10–12

| | |
| --- | --- |
| **Commit** | `5bab8274` — `feat(com1): make players findable and blocking atomic (COM1-2)` |
| **Branch** | `com1/phase2-community` |
| **Worktree** | `/Users/macmoney/mogsy-worktrees/com1-phase2` (clean, created from `origin/main` `93db3218`; no existing worktree touched) |
| **Push / deploy** | **Not pushed. Not deployed. Migration not applied.** Awaiting approval |
