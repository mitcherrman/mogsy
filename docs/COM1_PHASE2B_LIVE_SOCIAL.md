# COM1-2B — Live Social Sync, Community Badge, Legacy Scroll-Control Cleanup

Closes the four live-state defects reported against the shipped COM1-2 build, gives the
permanent Community button an actionable badge, and deletes the legacy floating scroll
control that was covering it.

| Repo | Branch | Base | Worktree |
| --- | --- | --- | --- |
| Frontend `/Users/macmoney/mogsy` | `com1/phase2b-live-social` | `origin/main` `40baef10` | `/Users/macmoney/mogsy-worktrees/com1-phase2b` |

**Not pushed. Not deployed. Migration authored, NOT applied.**

No backend (`League_Combat_Simulator`) change. Nothing here touches Stat Check, Ranked or
the FastAPI service.

> **Scope discipline.** No quiz sending, no Pro/free entitlement, no activity carousel, no
> forums, no messaging. Before any future activity-carousel work, the owner is to be asked
> where it should live.

---

## 1. Root cause of stale Friends state

Two independent causes. Both had to be fixed; either alone leaves half the reported
symptoms.

### 1a. `useFriends` is a per-instance hook, not a shared cache

`useFriends()` holds `friends` / `pendingRequests` / `sentRequests` in local `useState`.
It is instantiated **four** times, and `useBlocks()` a fifth and sixth:

| Instance | File |
| --- | --- |
| Community drawer | [`FloatingFriendsButton.tsx`](../src/components/FloatingFriendsButton.tsx) |
| Home friends rail | [`HomeFriendsSection.tsx`](../src/components/HomeFriendsSection.tsx) |
| Ranked invite view | [`InvitePlayView.tsx`](../src/components/quiz/play-scroll/InvitePlayView.tsx) |
| Multiplayer lobby | [`MultiplayerLobby.tsx`](../src/components/multiplayer/MultiplayerLobby.tsx) |
| `useBlocks` (block/report menu) | [`FriendActionMenu.tsx`](../src/components/FriendActionMenu.tsx) |
| `useBlocks` (drawer unblock) | [`FloatingFriendsButton.tsx`](../src/components/FloatingFriendsButton.tsx) |

Every mutation called `await refresh()` — **its own** `refresh`. So a mutation was correct
only in the component that issued it.

This is the whole of reported defect **1**. Blocking is offered in two places:

* Community drawer ▸ Friends ▸ ⋯ ▸ Block — `onBlocked` refreshed the drawer, so this path
  looked fine, and
* `/user/:profileId` ▸ ⋯ ▸ Block — `onBlocked={refreshFriend}`, which refreshes
  `useFriendStatus` for **that one profile only**.

The drawer's `useFriends` is mounted the whole time (it lives in `Layout`), so after
blocking from a profile page its `friends` array still held the accepted friendship.
Reloading the page rebuilt it, which is exactly the reported behaviour.

### 1b. Nothing in the social stack was live at all

`public.friendships` and `public.user_blocks` are **not members of the `supabase_realtime`
publication**, and no client subscribed to them. There was no mechanism by which one
session could learn about another session's write. That is reported defect **2**, and the
remote half of defect **1**.

`public.user_notifications` **has** been published since `20260225115950`, which is why the
notification bell was the only social surface that ever updated live — and why a friend
request produced a live toast while the Friends list behind it did not move.

One further gap, found while auditing that bell: its channel called `.subscribe()` with no
status callback. Supabase Realtime does not replay events from while a socket was down, so
anything that arrived during a network flap or a suspended tab stayed invisible until a
full reload.

---

## 2. Sync strategy chosen

**One invalidation signal; every view re-reads its own canonical query.** Realtime is a
signal, never an authority.

```
 Supabase Realtime frame ─┐
 local mutation ──────────┤
 admin action ────────────┼──► notifyFriendsChanged() ──► every subscriber re-reads
 return-to-tab ───────────┤                               from the server ──► rerender
 drawer opened ───────────┘
```

The row payload is **discarded**. Each subscriber re-reads through the source that already
owned that question:

| Subscriber | Re-reads |
| --- | --- |
| `useFriends` | `friendships` + `user_blocks` (its existing query) |
| `useFriendStatus` | `get_relationship_state` RPC |
| `useBlocks` | `user_blocks` |
| Blocked tab | `get_blocked_profiles` RPC |
| Find Players | `search_league_profiles` RPC, same query string |

So a frame may be late, duplicated or dropped without ever producing a wrong relationship.
The worst case is a stale view, which the next signal, the next drawer open or the next tab
focus repairs. No relationship state is duplicated into a second store — the reason
`notifyFriendsChanged` carries no data is that it then cannot desynchronise anything.

### Reused, not reimplemented

| Reused | From | Used for |
| --- | --- | --- |
| `notifyFriendsChanged` / `subscribeFriendsChanged` | ADM2 → COM1-2 | The one invalidation bus. Extended to return a promise; no new bus. |
| `get_relationship_state`, `get_blocked_profiles`, `search_league_profiles`, `block_profile`, `unblock_profile` | COM1-2 | Every canonical re-read. No new RPC in this phase. |
| `SocialResult` / `attempt` | COM1-1 | Mutation outcomes, unchanged. |
| `user_notifications` realtime channel | 20260225115950 | Pre-existing; now also the pre-migration fallback path. |
| HUD bell badge grammar (`99+`, `aria-hidden`, absolute, `pointer-events-none`) | AUTH1 | The Community badge, so both badges read the same way. |

### Three additions, and why each one exists

1. **Realtime (primary).** [`src/lib/community/social-realtime.ts`](../src/lib/community/social-realtime.ts).
2. **Return-to-tab (net).** A sleeping, offline or throttled tab misses frames outright, and
   the socket resubscribes without replay. One re-read on `visibilitychange`/`focus`,
   throttled to 5s. [`src/hooks/useSocialSync.ts`](../src/hooks/useSocialSync.ts).
3. **Drawer-open re-read + 20s interval while open.** The only polling in this phase, and
   deliberately narrow: it runs *only* while the Community drawer is on screen and stops
   when it closes. It exists for the case neither of the above covers — two windows visible
   side by side with a wedged socket, i.e. the two-browser acceptance test itself — and it
   is what keeps the phase's guarantee true even before the migration below is applied.

---

## 3. Realtime channels and tables used

One channel per signed-in profile, reference-counted so repeated mounts share a single
websocket topic. Mounted once from `Layout` (the only shell component always present — the
drawer is suppressed on Stat Check surfaces, the bell renders only for full accounts).

**Topic:** `social:<profileId>`

| Table | Event | Filter | Why this filter |
| --- | --- | --- | --- |
| `friendships` | `*` | `requester_id=eq.<me>` | postgres_changes takes one filter per listener, so "I am a party" needs two |
| `friendships` | `*` | `addressee_id=eq.<me>` | ″ |
| `user_blocks` | `*` | `blocker_profile_id=eq.<me>` | RLS shows a caller only their own blocks; the filter says it twice |
| `user_notifications` | `INSERT` | `profile_id=eq.<me>` | Already-published table — the path that works *before* the migration |

`event: "*"` is load-bearing: unfriend, decline, cancel and block are all **DELETEs**.

### Authorisation

Realtime evaluates each table's RLS SELECT policy against the subscriber before delivering
a frame, so a subscription can only ever deliver rows that subscriber could already
`SELECT` over PostgREST. Both policies are pre-existing and **unchanged by this phase**:

```
friendships  "Users can view own friendships"
               is_friendship_party(requester_id) OR is_friendship_party(addressee_id)

user_blocks  "Users can view own blocks"
               is_profile_owner(blocker_profile_id)
```

The blocked party is deliberately **not** told about the block row — that would disclose the
block. They converge anyway: `block_profile` deletes the friendship rows in the same
transaction, and a friendship DELETE is visible to both parties.

### The migration

`supabase/migrations/20260824120000_com1_live_social_realtime.sql`

* `REPLICA IDENTITY FULL` on both tables, set **before** publication membership.
* Both tables added to `supabase_realtime`, each `ALTER` guarded on catalogue state.
* Nothing else: no table, column, policy, function, trigger, grant or row is touched.

`REPLICA IDENTITY FULL` is required, not cosmetic. Under the default identity a DELETE
writes only the primary key to the WAL; realtime then has no `requester_id`/`addressee_id`
to test the policy or the filter against, so unfriend / decline / cancel / block — the very
cases this phase exists to fix — would never arrive. Cost is a wider WAL record for UPDATE
and DELETE on two narrow, low-write tables.

Apply as `postgres` in the Supabase SQL Editor, wrapped in `BEGIN`/`COMMIT`. **Do not use
`supabase db push`** — repo and remote ledger have drifted versions and a push would replay
them. (Same instruction as `20260823120000`.) Verification queries are in §3 of the
migration file.

### Lifecycle

* Reference-counted: two mounts share one topic; the channel is removed on the last release.
* Released on unmount, on logout, and on account switch (a different profile id is a
  different key, so the old channel is torn down before the new one opens).
* Release is idempotent — a double cleanup cannot free a channel a later mount holds.
* No channel is opened for a signed-out visitor or an account with no profile row.

---

## 4. Block reconciliation behaviour

`block_profile` remains the authority. Nothing about blocking is reimplemented in the
client; what changed is who is told.

**Immediately, for the user who clicks Block** — `useBlocks.blockUser` now signals
`notifyFriendsChanged()` instead of refreshing itself, and awaits it. On resolve:

* every `useFriends` instance has re-read `friendships` **and** `user_blocks`,
* `useFriendStatus` has re-read `get_relationship_state`,
* the Blocked tab has re-read `get_blocked_profiles`,
* Find Players has re-run its search.

This holds wherever Block was pressed — the drawer, `/user/:profileId`, or anywhere
`FriendActionMenu` is rendered in future.

**Remotely, for the other session** — `block_profile` deletes the friendship rows, and that
DELETE reaches the blocked party's `friendships` subscription. They lose the friend without
learning a block exists.

**The Friends renderer cannot show an accepted friendship across a known block.**
`useFriends.refresh` reads `user_blocks` first and filters the friendship rows against it in
the same pass, so the two are always self-consistent even if a friendship row somehow
survived. Covered by a test that plants exactly that inconsistency.

**Unblock** restores eligibility and nothing else — the friendship is not recreated. That is
COM1-2's rule and is unchanged; a new request has to be sent deliberately.

---

## 5. Notification behaviour

### What already existed and was verified, not rebuilt

`notify_on_friendship_change` (rewritten by COM1-1 in `20260823120000`) writes:

| Trigger condition | Row |
| --- | --- |
| INSERT, `status = 'pending'` | `friend_request` to `addressee_id`, title `"<requester> sent you a friend request"` |
| UPDATE to `status = 'accepted'` | `friend_accepted` to `requester_id`, title `"<addressee> accepted your friend request"` |

* **No raw auth UID.** `sent_by_user_id` is `public.system_notification_actor()`, the
  all-zero sentinel. Identity travels as `metadata.requester_profile_id` /
  `metadata.addressee_profile_id`, which are `public.profiles.id`.
* **Clicking resolves through public profile identity.** `friend_accepted` navigates to
  `/user/<metadata.addressee_profile_id>`. `friend_request` opens the Community drawer.
* **Incoming requests still work** — same trigger, same type, same allow-list entry.

### What this phase changed

The bell's realtime channel now re-reads on every `SUBSCRIBED` transition. Realtime does not
replay events from while a socket was down, so a notification that arrived during a flap
stayed invisible until reload. Re-reading on reconnect closes that.

It **cannot duplicate**: `loadNotifications` replaces the list from a server read (it does
not append), and the streaming handler keys on `notif.id`. Read state comes from
`user_notification_reads` in the same load, so a reconnect cannot resurrect a cleared badge.
All four properties are pinned by tests.

Social notifications also now feed the friends invalidation signal, via the
`user_notifications` listener on the social channel. That is the path that makes friend
request / acceptance sync work **before** the publication migration is applied.

### Not verified by this session

The trigger's behaviour in the **production** database. The migration that fixed the auth-id
leak (`20260823120000`) is recorded as authored; this session has only the anon key and
cannot read `pg_proc` or `pg_publication_tables`. §3(d) of the new migration file carries the
query that confirms it, and the manual matrix in §8 exercises it end to end.

---

## 6. Community badge definition

[`src/lib/community/community-badge.ts`](../src/lib/community/community-badge.ts) — pure, and
in `lib` rather than beside the component because "what is actionable" is a product decision
COM1-3 will extend.

**Counted:** incoming pending friend requests. The only social item in this phase resolved
by a *decision* rather than by reading.

**Not counted, deliberately:**

| Excluded | Why |
| --- | --- |
| Accepted friends | A total, not a task |
| Outgoing requests | The other person's move |
| Read/unread notifications | The HUD bell's semantics |
| Blocked users | Already resolved |
| Stat Check invites | Genuinely actionable — but the only count available is `useStatCheckInvites`, which **polls** a flag-gated backend route every 30s. The HUD bell already mounts it; mounting it again here would be a second poller for one number. Left for COM1-3, which can hoist that hook once and share it. The bell keeps showing them meanwhile, so nothing is unreachable today. |

Bell and Community are **not** the same number and are not meant to be: the bell says *there
is something to read*, Community says *there is something to decide*.

**Behaviour**

| Requirement | How |
| --- | --- |
| Hidden at 0 | `communityBadge(0)` returns `null` — no element rendered |
| 1..99 | Rendered as-is |
| 99+ | `> 99` renders `"99+"`; the accessible label keeps the true number |
| Updates live | Derived from `pendingRequests`, which is on the invalidation bus |
| Accessible label includes the count | The count is in the button's `aria-label` (`"Community, 3 pending friend requests"`); the badge itself is `aria-hidden` so it is spoken once, not twice |
| No layout shift | Absolutely positioned, out of flow, `pointer-events-none`. The trigger stays `fixed bottom-6 left-6`, `h-9 w-9` at any count |
| Mobile parity | The trigger carries no width gate (COM1-2 removed `hidden sm:flex`); the badge is inside it |

---

## 7. Old scroll component located and removed

**Removed: `src/components/FloatingScrollButton.tsx`** (deleted), and its mount in
`src/components/Layout.tsx`.

It was the exact overlap:

```
FloatingScrollButton   fixed bottom-6 left-6 z-[60]   hidden sm:flex
FloatingFriendsButton  fixed bottom-6 left-6 z-40     (visible at every width)
```

Same coordinates, one stacking layer **above** the Community button, mounted
unconditionally by `Layout`, and self-revealing on any page taller than the viewport +
200px. On desktop it covered the Community trigger outright. COM1-2's own header comment
recorded the shared coordinates but concluded the slot was free "on mobile", which is where
`hidden sm:flex` put it — the desktop collision was never noticed.

**Why deleted rather than moved.** Its entire body was two calls: `window.scrollTo({top: 0})`
and `window.scrollTo({top: scrollHeight})`. That is Home/End and the browser's own
scrollbar. It was a duplicate of native behaviour, not a custom scrollbar, and nothing
depended on it.

**Ordinary page scrolling is untouched.** No global scrollbar was hidden, no CSS was added to
displace the overlap, and no `overflow` rule was changed.

**Sweep of the rest of the frontend** (`ScrollToTop`, `ScrollToBottom`, floating scroll,
fixed `ChevronUp`/`ChevronDown`, `window.scrollTo`, `scrollY` listeners, fixed bottom-left):

| Found | Verdict |
| --- | --- |
| `FloatingScrollButton` | **Removed** — the overlap |
| `ScrollToCommentsHint` | Kept. Inline (not `fixed`), transient, Swipe pages only, no corner conflict |
| `ProRosterPlayers` / `ProRosterTeams` `window.scrollTo` | Kept. Pagination scroll-to-top inside page content, no floating UI |
| `ArrowUp` in carousels/pickers/editors | Kept. In-page controls, not floating chrome |
| `StatCheckPage`, `RankedShellProbe` `fixed bottom-2 left-2` | Kept. `/dev` diagnostic overlays only |

Cleanup: component file deleted, `Layout` import and mount removed, the two `vi.mock`
stubs in `Layout.startup-shell.test.tsx` and `Layout.friends-drawer.test.tsx` removed, and
the stale header comments in `FloatingFriendsButton.tsx` corrected. No route referenced it.

Regression guard: `Layout.bottomLeftSlot.test.tsx` asserts the bottom-left corner has
exactly one fixed occupant, and that it is the Community button.

---

## 8. Tests

### Baseline vs final (`npx vitest run`)

| | Test files | Tests |
| --- | --- | --- |
| Baseline (`origin/main` `40baef10`) | 10 failed, 458 passed (468) | 47 failed, 7061 passed, 4 skipped (7112) |
| Final | 10 failed, 465 passed (475) | 47 failed, 7117 passed, 4 skipped (7168) |

**+56 tests, 0 new failures.** The 47 pre-existing failures are unchanged in count and
file set, and are unrelated to social: `quiz-broadcast/engine`, `ranked-duel-review/api`,
`admin/knowledge/StructuralReview`, `e2e/identity`, `ads/consent`, `onboarding-gate`,
`adminCredentials`, `admin-registry`, `LeaguecraftWorkspace`, `Quiz.rankedRole`. They
reproduce on the untouched baseline and in isolation (env/global pollution across parallel
workers).

**All 32 social / community / notification / layout suites pass: 428 tests, 0 failures.**

`tsc --noEmit` and `eslint` report only pre-existing errors, none in a file this phase
created; the new files are clean. `npm run build` succeeds.

### New suites

| File | Covers |
| --- | --- |
| `src/lib/community/social-realtime.test.ts` (10) | Subscription shape, both friendship sides, DELETE coverage, no blocked-side subscription, frames as signals, channel sharing / idempotent release / account switch |
| `src/hooks/useSocialSync.test.tsx` (9) | Who gets a channel, teardown on unmount/logout/switch, return-to-tab net and its throttle |
| `src/hooks/useFriends.liveSync.test.tsx` (6) | **Two mounted instances converge** — removal, remote block, block-over-friendship, incoming request; silent background re-read; the signal is awaited |
| `src/components/FloatingFriendsButton.badge.test.tsx` (9) | Badge definition, 99+ cap, accessible name, exclusions, no layout shift, mobile |
| `src/components/Layout.bottomLeftSlot.test.tsx` (3) | Exactly one fixed occupant in the corner; no scroll control at any height; empty on Stat Check |
| `src/components/hud/MogzyIdentityMenu.socialNotifications.test.tsx` (8) | Acceptance streams in, count moves, no auth uid, click → public profile id, reconnect catch-up, no duplicate, read stays read |
| `src/test/security/com1LiveSocialRealtime.test.ts` (11) | Migration publishes both tables, sets FULL **before** publishing, guards both ALTERs, changes no policy/function/grant/row; client subscribes only to published tables |

### Live verification performed (dev server on this branch → production Supabase)

Confirmed in the running app:

* the social channel is constructed and **joined** — topic `realtime:social:<profileId>`,
  state `joined`, with all four bindings and their filters exactly as designed;
* **exactly one** social channel across six in-shell navigations — no duplicate topics from
  repeated mounts;
* the Community button (`aria-label="Community"`, 36×36 at `x=24`, `bottom=24`, `z=40`) is
  the **only** fixed control in the bottom-left corner, on a page tall enough (1374px vs a
  720px viewport) that the legacy scroll button would previously have shown;
* no console errors; `npm run build` clean.

**Not verifiable from here:** publication membership (needs `pg_publication_tables`, i.e.
the service role) and any two-account flow (no second credential). No test rows were written
to the production social database.

### Manual two-browser matrix — run after applying the migration

Browser A and Browser B, two different full accounts, **neither reloaded at any step**.

| # | Action | Expected |
| --- | --- | --- |
| 1 | A: Community ▸ Find Players ▸ search B's username | B appears with **Add Friend** |
| 2 | A: Add Friend | Row becomes **Requested**; A's Sent tab lists B |
| 3 | — | **B**: Community badge shows `1` and the bell toasts, with no refresh |
| 4 | B: Community ▸ Requests ▸ Accept | Row leaves Requests; B's badge returns to 0; B's Friends lists A |
| 5 | — | **A**: Friends lists B, with no refresh |
| 6 | — | **A**: bell shows *"\<B\> accepted your friend request"*; clicking opens `/user/<B profile id>` (a profiles id, never an auth uid) |
| 7 | A: Friends ▸ ⋯ ▸ Block B | B leaves A's Friends **immediately**; B appears in A's Blocked tab |
| 8 | — | **B**: A leaves B's Friends, with no refresh, and no indication a block exists |
| 9 | B: search A / open `/user/<A>` / try to invite | A is not findable; profile and invite are refused with the neutral message |
| 10 | A: Blocked ▸ Unblock B | B leaves Blocked |
| 11 | — | Neither side's Friends list regains the friendship (unblock does not restore it) |
| 12 | A: search B ▸ Add Friend | Succeeds; B's badge goes to `1` again |
| 13 | Repeat 1–3, then A cancels from Sent | B's badge returns to 0 without a refresh |
| 14 | Repeat 1–3, then B declines | A's Sent tab empties without a refresh |
| 15 | Either side: ⋯ ▸ Unfriend | The other side's Friends list drops it without a refresh |

Also check, on a phone or at 375px:

* the Community button is present bottom-left and **nothing overlaps it** on a long
  scrolling page (`/lol`, `/quiz`, an Archives article);
* the badge appears on it with a pending request and does not move or resize the button;
* with 100+ pending requests (or by temporarily returning a large count) the badge reads
  `99+` and the button geometry is unchanged;
* a screen reader announces *"Community, N pending friend requests"* once.

---

## 9. Files changed

**New**

```
supabase/migrations/20260824120000_com1_live_social_realtime.sql
src/lib/community/social-realtime.ts
src/lib/community/community-badge.ts
src/hooks/useSocialSync.ts
src/lib/community/social-realtime.test.ts
src/hooks/useSocialSync.test.tsx
src/hooks/useFriends.liveSync.test.tsx
src/components/FloatingFriendsButton.badge.test.tsx
src/components/Layout.bottomLeftSlot.test.tsx
src/components/hud/MogzyIdentityMenu.socialNotifications.test.tsx
src/test/security/com1LiveSocialRealtime.test.ts
docs/COM1_PHASE2B_LIVE_SOCIAL.md
```

**Deleted**

```
src/components/FloatingScrollButton.tsx
```

**Modified**

| File | Change |
| --- | --- |
| `src/lib/community/friends-refresh.ts` | `notifyFriendsChanged` returns a promise that settles when every listener's re-read has; async listeners supported; never rejects |
| `src/hooks/useFriends.ts` | Mutations signal the bus instead of refreshing themselves; `useFriends` and `useFriendStatus` subscribe; `loading` is first-load-only so a live update cannot blank a list on screen |
| `src/hooks/useBlocks.ts` | `blockUser`/`unblockUser` signal the bus; the hook subscribes |
| `src/components/FloatingFriendsButton.tsx` | Badge (99+, accessible name, no layout shift); Blocked tab on the bus; drawer-open re-read + bounded fallback interval; simplified unblock; corrected stale header comments |
| `src/components/community/FindPlayersTab.tsx` | Re-runs the same search on the bus, so row relationships stay server-derived |
| `src/components/hud/MogzyIdentityMenu.tsx` | Re-reads on every `SUBSCRIBED` transition, closing the reconnect gap |
| `src/components/Layout.tsx` | Mounts `useSocialSync()`; `FloatingScrollButton` import and mount removed |
| `src/components/Layout.startup-shell.test.tsx`, `src/components/Layout.friends-drawer.test.tsx` | Dropped the `FloatingScrollButton` mock |

---

## 10. Commit

`97908faf` — `feat(com1): make social state live, badge the Community button, delete the scroll control (COM1-2B)`

(The doc was written before the commit; this line is the only amend.)

## 11. Branch / worktree

* Branch `com1/phase2b-live-social`, from `origin/main` `40baef10`
* Worktree `/Users/macmoney/mogsy-worktrees/com1-phase2b` (created for this phase; no
  existing worktree was touched)

## 12. Deployment

**Not pushed. Not deployed. Migration not applied.** Awaiting approval.

Order when approved:

1. Apply `20260824120000_com1_live_social_realtime.sql` in the Supabase SQL Editor as
   `postgres`, in `BEGIN`/`COMMIT`. Run the four verification queries in its §3.
2. Deploy the frontend.
3. Run the §8 two-browser matrix.

The frontend is safe to deploy before step 1 — without the publication, friend request and
acceptance still sync through the already-published `user_notifications` path and the
drawer-open re-read, and decline / cancel / unfriend / block converge on the next drawer
open or tab focus rather than instantly.
