# Community M2 / M3 — rollout plan

Branch `community/db-m2-m3`, worktree `~/mogsy-community-db`, based on `f160a196`.
Nothing in here has been applied. No ledger rows have been inserted.

| Migration | File | Status |
| --- | --- | --- |
| M1 | `supabase/migrations/20260728130000_league_profile_view_isolation.sql` | unchanged, already committed on `main`, not yet applied |
| M2 | `supabase/migrations/20260730140000_friendship_hardening.sql` | new, this branch |
| M3 | `supabase/migrations/20260730150000_league_profiles_rpc.sql` | new, this branch |

Apply order is strictly M1 → M2 → M3. M3 grants cross-user reads; if it landed
before M1 the dating-era columns would still be in the projection.

M3 is not a novel pattern for this codebase. `public.resolve_custom_link(text)`
(`20260520083308`) already does exactly the same thing — SECURITY DEFINER, a
fixed `RETURNS TABLE` contract, and a deliberate omission of the sensitive
identifier (`created_by_user_id`) that the underlying table carries. M3 applies
that established shape to profiles.

## Apply workflow (per migration)

1. Supabase SQL Editor, connected as `postgres` (M1 requires this so the view's
   grants are restored from `ALTER DEFAULT PRIVILEGES`).
2. Paste the migration wrapped in `BEGIN; … COMMIT;` so a failure rolls back whole.
3. Verify with the matching section of the audit bundle before recording.
4. Record the version with the ledger insert below.

Never `supabase db push` — repo and remote ledger have 117 drifted versions and
a push would replay them.

### Ledger inserts — DO NOT RUN YET

Schema confirmed: `version text NOT NULL`; `statements text[]`, `name text`,
`created_by text`, `idempotency_key text`, `rollback text[]` all nullable.

```sql
-- after M1 verifies
INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
VALUES ('20260728130000', 'league_profile_view_isolation', 'sql-editor@com2');

-- after M2 verifies
INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
VALUES ('20260730140000', 'friendship_hardening', 'sql-editor@com2');

-- after M3 verifies
INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
VALUES ('20260730150000', 'league_profiles_rpc', 'sql-editor@com2');
```

`statements` is left NULL deliberately — populating it would imply the ledger
replayed the SQL, which it did not.

---

## Frontend call-site plan

`public_profiles` is read at ~30 sites. Only a small subset is a live League
surface, and two categories **must not** be migrated. Full classification:

### A. Migrate — League-live and broken today (4 sites)

Each of these reads another user's profile through the `security_invoker` view,
so RLS resolves it to zero rows right now.

| Site | Current | Notes |
| --- | --- | --- |
| `src/hooks/useFriends.ts:83` | `.select("id, display_name, avatar_url, is_pro").in("id", otherIds)` | every friend currently renders as `"Unknown"` |
| `src/components/FloatingFriendsButton.tsx:51` | `.select("id, display_name, avatar_url")` | drawer entry point |
| `src/pages/UserProfile.tsx:283` | `.select(LEAGUE_PROFILE_COLUMNS).eq("id", profileId)` | `/user/:profileId` for anyone else hits the not-found path |
| `src/components/UserNotificationBell.tsx:267` | `.select("id, display_name, avatar_url")` | notification actor names |

Transform, in every case:

```ts
// before
const { data } = await supabase
  .from("public_profiles")
  .select("id, display_name, avatar_url, is_pro")
  .in("id", otherIds);

// after
const { data } = await supabase
  .rpc("get_league_profiles", { _profile_ids: otherIds });
```

The RPC returns the fixed 8-column contract, so `.select()` disappears. For a
single profile pass a one-element array and read `data?.[0]`:

```ts
// UserProfile.tsx:283
const { data: rows } = await supabase
  .rpc("get_league_profiles", { _profile_ids: [profileId] });
const profileData = rows?.[0] ?? null;
```

`LEAGUE_PROFILE_COLUMNS` (UserProfile.tsx:96) becomes dead once that call moves
and should be deleted along with the `user_id` field on the `ProfileData`
interface (line 32).

### B. Verified NOT reachable — do not migrate (2 sites)

Both were candidates because they are rendered from ungated routes. Checked
2026-07-30 against `f160a196`; neither renders in League-only mode.

- `src/components/RecentMatchups.tsx:71` — the only render site is
  `UserProfile.tsx:739`, wrapped at line 733 in `{!LEAGUE_ONLY_MODE && (…)}`
  with the comment *"Recent Matchups (legacy Mogsy — hidden in League-only
  mode)"*. Unreachable.
- `src/components/FavoritesEditor.tsx:66,103` — the only render site is
  `Profile.tsx:930`, gated on `showLegacy`, which is
  `!LEAGUE_ONLY_MODE || (config.showLegacyMogsy && isModerator)` (line 77). With
  the flag on, it renders **only** for a moderator when `config.showLegacyMogsy`
  is also enabled. Not reachable for ordinary users; treat as a legacy
  moderator-only surface and leave it on `public_profiles`.

The `AdminAbout.tsx:252` hit is documentation prose naming the component, not a
render.

Net: the migration set is **Group A only — 4 sites.**

### C. Do NOT migrate — admin surfaces

These work today via the `"Admins can view all profiles"` policy on
`public.profiles`, which the `security_invoker` view honours. The RPC would
**break** them: it applies `LIMIT 200` and filters blocked profiles, neither of
which is correct for an admin listing.

`AdminUserReports.tsx:51`, `AdminFeedback.tsx:112`, `AdminMultiplayer.tsx:114`,
`AdminComments.tsx:66`, `AdminBanners.tsx:113`, `AdminDemo.tsx:284`.

### D. Do NOT migrate — dead or gated in League-only mode

`leagueGate` redirects when `LEAGUE_ONLY_MODE` is true; `/multiplayer*` are hard
`<Navigate>` redirects.

- `NavBanner.tsx:78` — not rendered (`Navbar.tsx:137`)
- `SwipeComments.tsx:91,200`, `Swipe.tsx:181` — `/swipe*` gated
- `Home.tsx:559,661,750` — `/home` gated
- `Referral.tsx:61` — `/referral` gated; also selects `user_id`, incompatible with the M3 contract by design
- `Leaderboard.tsx:140,256`, `Leagues.tsx:154`, `EloCheck.tsx:144,219,313` — gated
- `MultiplayerLobby.tsx:52`, `MultiplayerGame.tsx:42` — routes redirected
- `UserProfile.tsx:436` — unreachable; the `LEAGUE_ONLY_MODE` early return at ~line 296 precedes it

`Swipe.tsx:181` additionally selects `active_boost_until`, which is not in the
live view — that query already 400s today and M1 does not change it.

### E. Cannot be served by the RPC — flag only

`src/hooks/blog/useBlogData.ts:47,97`. `/blog` and `/blog/:slug` are public
routes with no `ProtectedRoute`, and `get_league_profiles` returns zero rows
when `auth.uid()` is NULL. Blog author identity is therefore already empty for
signed-out visitors and M3 cannot fix it. Needs its own decision — out of scope
for this branch.

---

## `UserProfile.tsx` fixes

### 1. Own-profile detection (line 496)

```ts
// before — depends on profile.user_id, which M3 no longer returns
const isOwnProfile = !!user && !!profile?.user_id && user.id === profile.user_id;
```

The inner friend-action component at line ~198 already solves this correctly by
reading the caller's **own** `profiles` row, which RLS permits:

```ts
supabase.from("profiles").select("id").eq("user_id", userId).single()
  .then(({ data }) => setIsOwnProfile(data?.id === profileId));
```

Lift that to the page: hold `myProfileId` in state, fetch it once from
`profiles` by `user_id = user.id`, and compare against the `profileId` route
param.

```ts
const [myProfileId, setMyProfileId] = useState<string | null>(null);

useEffect(() => {
  if (!user) { setMyProfileId(null); return; }
  supabase.from("profiles").select("id").eq("user_id", user.id).single()
    .then(({ data }) => setMyProfileId(data?.id ?? null));
}, [user]);

const isOwnProfile = !!myProfileId && myProfileId === profileId;
```

No `user_id` from any cross-user surface is involved. The inner component can
then take `isOwnProfile` as a prop instead of refetching.

### 2. The incorrect rank pill — and the wider League profile body

The pill is **wrong today, before any of this work**. It calls
`quizApi.getProgress(targetUserId)` with the *profile owner's* `user_id`, but
`resolve_user_id` (`routes/supabase_auth.py:132`) returns the verified caller's
own id whenever a JWT is present — and `/user/:profileId` sits behind
`ProtectedRoute`, so every viewer is authenticated. **Every profile shows the
viewer's own rank.**

**Scope is wider than the pill.** `targetUserId` is also passed to
`LeaguePublicProfile` (`UserProfile.tsx:725`), which uses it for three separate
queries — `quizApi.getProgress`, `getCategories` and `getAchievements`
(`LeaguePublicProfile.tsx:121-135`). All three are among the seven endpoints
that honour only the verified caller's id. So the League public profile's stats,
category breakdown and achievements are **all** showing the viewer's own data on
every profile they visit, not just the rank pill.

Fix without any backend change: request quiz data only on your own profile, and
source the id from the session rather than from the profile row.

```ts
// before
const targetUserId = LEAGUE_ONLY_MODE ? profile?.user_id ?? null : null;

// after — correct by construction: the only id the API will honour is the
// caller's own, so only request it for the caller's own profile.
const targetUserId = LEAGUE_ONLY_MODE && isOwnProfile ? user?.id ?? null : null;
```

`enabled: !!targetUserId` then suppresses all four queries on other people's
profiles — the page's own `quiz-progress` query plus the three inside
`LeaguePublicProfile` — and `showQuizRank` is already false when there is no
data.

**Consequence — APPROVED 2026-07-30.** On another user's profile the League
stats, categories and achievements sections go **empty**. This trades
demonstrably wrong data (the viewer's own numbers presented as someone else's)
for absent data. Signed off as the intended visible behaviour: hide rank,
category progress and achievements rather than display the viewer's own.

Restoring those sections for **other** users requires new backend endpoints
keyed on **profile id**, resolving `user_id` server-side and requiring a
verified JWT — for all three of progress, categories and achievements. That is
backend work and belongs with the SEC1/SEC2 task below; it is not a prerequisite
for M3.

---

## Tests required

Frontend (vitest), on this branch:

1. `useFriends` — mock `supabase.rpc`; assert it is called with
   `("get_league_profiles", { _profile_ids: [...] })` and that friends resolve
   to real display names rather than the `"Unknown"` fallback.
2. `UserProfile` — another user's profile renders identity from the RPC; assert
   **no** `user_id` is present on the parsed profile object.
3. `UserProfile` — `isOwnProfile` is true for your own `profileId` and false for
   another, driven by the `profiles`-by-`user_id` lookup, not `profile.user_id`.
4. `UserProfile` — the rank pill renders on your own profile and is **absent**
   on another user's; assert `quizApi.getProgress`, `getCategories` and
   `getAchievements` are **none of them** called when viewing another user, and
   that `LeaguePublicProfile` receives `userId={null}` in that case.
5. Regression: an admin component from group C still uses `.from("public_profiles")`
   — a guard test so a later sweep does not migrate it into the RPC's `LIMIT 200`.

Database (manual, post-apply, before the ledger insert):

6. M2 — insert a friend request where a block exists in either direction ⇒
   rejected, and **no** row appears in `user_notifications`.
7. M2 — `A→B` pending then `B→A` pending ⇒ second insert violates
   `friendships_unique_live_pair`.
8. M2 — as addressee, attempt `accepted → pending` ⇒ rejected; attempt to change
   `requester_id` ⇒ rejected.
9. M2 — re-run audit Section 4; every counter still zero, `b_status_distribution`
   unchanged at 4 `accepted`.
10. M3 — as `anon`, `rpc('get_league_profiles', …)` ⇒ permission denied.
11. M3 — as an authenticated user, request a profile that has blocked you ⇒ zero
    rows; request a normal profile ⇒ exactly 8 columns, no `user_id`.

---

## Out of scope for this branch

**SEC1/SEC2 — Railway backend authorization.** `REQUIRE_SUPABASE_AUTH` is
confirmed **unset** in Railway production. `resolve_user_id`
(`routes/supabase_auth.py:132`) therefore adopts a client-supplied `user_id`
whenever no verified JWT is presented, across seven endpoints:

| Endpoint | `user_id` source | Effect unauthenticated |
| --- | --- | --- |
| `GET /api/quiz/progress/{user_id}` | path | reads victim XP / streaks |
| `GET /api/quiz/achievements/{user_id}` | path | reads victim achievements |
| `GET /api/quiz/categories/{user_id}` | path | reads victim category progress |
| `GET /api/quiz/daily-challenge?user_id=` | query | reads victim daily progress |
| `POST /api/quiz/daily-challenge/submit` | body | **writes** as victim |
| `POST /api/quiz/attempts` | body | **writes** as victim |
| `POST /api/quiz/sessions` | body | **writes** as victim |

`GET /api/quiz/history` (`routes/quiz.py:994`) is the hardened counterexample.
M3 omitting `user_id` denies the identifier that would make this exploitable at
scale, but it is a mitigation, not a fix.

**Also out of scope**, all now resolved by the reconciliation checks — full
results in `docs/community-reconciliation-checks.sql`:

- **The four orphan ledger rows — investigated, none affect Community.** Two are
  schema/policy changes that should be reconstructed into the repo
  (`20260224125853`, which hardens `profile_photos` to authenticated-only, and
  `20260310114226`, which adds `leagues.show_global_stats`); two are one-off data
  backfills that should not be re-committed as migrations. The
  `profile_photos` one is the notable risk: it is a **security hardening that
  exists only in the database**, so a rebuild from the repo would silently
  restore the public-readable policy.
- **`custom_links` — the earlier conclusion was wrong and is corrected.**
  `grant_pro` and `grant_diamonds` *are* protected (never column-granted, and
  anon/authenticated hold no table-level SELECT on that table), but
  `created_by_user_id` — an auth user id — carries an explicit column grant to
  both roles. Currently inert: the public read policy was dropped in
  `20260520083308`, so RLS yields no rows, and `resolve_custom_link()` is
  SECURITY DEFINER with a fixed 10-column contract that omits it. It belongs to
  the same perimeter as M3's `user_id` omission and should be closed when that
  backlog is worked.
- **Ledger primary key confirmed** — `PRIMARY KEY (version)`. The duplicate
  `20260710120000` must be renamed before any historical backfill. The three
  M1/M2/M3 inserts above are unaffected, and `UNIQUE (idempotency_key)` does not
  interfere because NULLs do not conflict.
- **`20260710130000_funnel_events`** — still never applied; silent-fail
  analytics, no user-facing breakage.
