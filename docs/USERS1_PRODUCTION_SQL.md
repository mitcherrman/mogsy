# USERS1 — production SQL

Everything here runs in the **Lovable Cloud / Supabase SQL Editor**, which is the
only place in this project with privileged access. The repository holds the
publishable (anon) key alone — no agent can read `auth.users`, count anonymous
identities or delete them. Same posture as FUNNEL1 §15.9 / §17.5.

Run the blocks **in order**. Blocks A and B are READ-ONLY. Block C is
destructive and must not be run until the frontend change has shipped, or
automation will immediately mint the accounts again.

---

## A — audit (READ ONLY). **RUN — results recorded below.**

```
registered auth users   4, all four classified, NONE to be deleted (USERS1_HANDOFF.md)
analytics_events        178
analytics_sessions      159
analytics_visitors      157
anonymous auth users    ~5,031   (anonymous profiles ~5,031)
```

Retained as the re-audit recipe.

```sql
-- A1. Headline identity counts.
select
  count(*) filter (where is_anonymous)                as anonymous_auth_users,
  count(*) filter (where not is_anonymous)            as registered_auth_users,
  count(*)                                            as total_auth_users,
  min(created_at)                                     as first_created,
  max(created_at)                                     as last_created
from auth.users;

-- A2. THE FOUR REGISTERED ACCOUNTS, in full, so each can be classified.
--     Email is needed to tell owner / owner-test / friend apart; nothing else
--     about them is read.
select u.id,
       u.email,
       u.created_at,
       u.last_sign_in_at,
       u.is_anonymous,
       u.raw_user_meta_data ->> 'display_name'        as signup_display_name,
       p.display_name                                 as profile_display_name,
       p.username,
       p.is_bot,
       p.is_anonymous                                 as profile_says_anonymous,
       p.created_at                                   as profile_created_at,
       coalesce(
         (select string_agg(r.role::text, ',')
            from public.user_roles r where r.user_id = u.id), '—')  as roles,
       (select count(*) from public.user_identity_links l
         where l.user_id = u.id)                      as identity_links
from auth.users u
left join public.profiles p on p.user_id = u.id
where not u.is_anonymous
order by u.created_at;

-- A3. Anonymous identities: shape of the pollution, not the rows themselves.
select date_trunc('day', created_at)::date as day,
       count(*)                            as anon_users_created
from auth.users
where is_anonymous
group by 1 order by 1;

-- A4. How many anonymous identities ever did anything that persisted.
--     A high "did_nothing" number is the evidence that these are page loads,
--     not people.
with anon as (select id from auth.users where is_anonymous)
select
  (select count(*) from anon)                                           as anon_total,
  (select count(*) from anon a
     where exists (select 1 from public.league_swipe_votes v where v.user_id = a.id))
                                                                        as voted_meta_reflex,
  (select count(*) from anon a
     where exists (select 1 from public.league_swipe_preferences pr where pr.voter_id = a.id))
                                                                        as holds_a_preference,
  (select count(*) from anon a
     where exists (select 1 from public.analytics_events e
                    where e.user_id = a.id and e.source_system = 'railway'))
                                                                        as server_confirmed_gameplay,
  (select count(*) from anon a
     where exists (select 1 from public.user_identity_links l where l.user_id = a.id))
                                                                        as linked_discord_or_riot;
-- If a table above does not exist in this project, delete that sub-select and
-- re-run; the point is the ratio, not any single column.

-- A5. Everything in the database that references an auth user id BY FOREIGN KEY.
--     These cascade or null out automatically when an auth user is deleted.
select tc.table_schema, tc.table_name, kcu.column_name, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_schema = 'auth' and ccu.table_name = 'users'
order by tc.table_name;

-- A6. Everything that references a user id WITHOUT a foreign key — the rows
--     that would be left orphaned rather than cleaned up.
select c.table_name, c.column_name
from information_schema.columns c
where c.table_schema = 'public'
  and c.data_type = 'uuid'
  and (c.column_name in ('user_id','voter_id','owner_id','author_id','created_by',
                         'created_by_user_id','updated_by','actor_id','profile_user_id')
       or c.column_name like '%user_id')
order by c.table_name, c.column_name;

-- A7. Current analytics volume, so the reset has a before-number.
select
  (select count(*) from public.analytics_events)   as events,
  (select count(*) from public.analytics_sessions) as sessions,
  (select count(*) from public.analytics_visitors) as visitors,
  (select min(received_at) from public.analytics_events) as first_event,
  (select max(received_at) from public.analytics_events) as last_event;

-- A8. Profiles vs auth users — the two stores that the Admin headline confuses.
select
  (select count(*) from public.profiles)                                as profiles_total,
  (select count(*) from public.profiles where is_anonymous)             as profiles_anonymous,
  (select count(*) from public.profiles where not is_anonymous and not is_bot) as profiles_registered,
  (select count(*) from public.profiles where is_bot)                   as profiles_bot;
```

---

## B — schema change (WRITE, additive, safe). Run when USERS1 ships.

Contents: `supabase/migrations/20260923120000_users1_traffic_classification.sql`
in this repo. Paste that file whole. It only ADDS columns, a table and
policies — it drops nothing and rewrites no row.

---

## C — cleanup (DESTRUCTIVE). Run only after B and after the new build is live.

Do not run this before the frontend stops minting an anonymous user per page
load, or the count will be back within a day.

### C0 — the pre-flight, and it is not optional

The purge deletes by **`profiles.is_anonymous`**, not by `auth.users.is_anonymous`
(`supabase/functions/purge-anonymous-users/index.ts:65`). Those two flags are
written by different systems and CAN disagree — that is the entire reason
AUTH2 added `ensureProfilePermanent()`, whose own comment says: *"when they
disagree the admin purge believes the profile and deletes a real account."*

With ~5,031 rows about to be deleted and exactly four accounts that must
survive, that is a one-shot, unrecoverable risk. **Run this first. If it
returns any row, repair those rows and re-run it before going further.**

```sql
-- C0a. Any REAL account whose profile still claims to be anonymous.
--      Expected: ZERO ROWS. Each row returned is an account the purge
--      would delete.
select p.id as profile_id, p.user_id, p.display_name, p.is_bot,
       u.email, u.is_anonymous as auth_says_anonymous,
       p.is_anonymous          as profile_says_anonymous
from public.profiles p
join auth.users u on u.id = p.user_id
where p.is_anonymous = true
  and u.is_anonymous = false;

-- C0b. THE REPAIR, if and only if C0a returned rows. Same write
--      ensureProfilePermanent() makes, applied in bulk.
-- update public.profiles p
--    set is_anonymous = false
--   from auth.users u
--  where u.id = p.user_id
--    and p.is_anonymous = true
--    and u.is_anonymous = false;

-- C0c. The four accounts, named, must be outside the purge set.
--      Expected: four rows, every would_be_purged = false.
select u.email, p.display_name, p.is_bot,
       p.is_anonymous as would_be_purged
from auth.users u
join public.profiles p on p.user_id = u.id
where u.email in (
  'mlmitchaman@gmail.com',      -- REAL_OWNER
  'alastairigpark@gmail.com',   -- REAL_USER
  'bobbungo2@gmail.com',        -- OWNER_TEST
  'contact.mogzy.lol@gmail.com' -- AUTOMATION_TEST, is_bot — Ranked bot identity
);
```

### C1 — record the before-numbers

```sql
select
  (select count(*) from auth.users where is_anonymous)     as anon_before,
  (select count(*) from auth.users where not is_anonymous) as registered_before,
  (select count(*) from public.profiles where is_anonymous) as anon_profiles_before,
  (select count(*) from public.analytics_events)           as events_before,
  (select count(*) from public.analytics_sessions)         as sessions_before,
  (select count(*) from public.analytics_visitors)         as visitors_before;
-- expect registered_before = 4, and it must still be 4 in C4.
```

### C2 — purge the anonymous identities

**Use the UI, not SQL.** Admin › Users › Accounts › "Purge all anonymous"
calls the existing admin-gated `purge-anonymous-users` edge function, which
deletes through the Auth API. `auth.users` has side tables the Auth API owns;
deleting straight out of the table bypasses Supabase's own bookkeeping.

It deletes one account per request, so ~5,031 will take a while and may need
more than one run. The function reports `count` and `total` — if they differ,
run it again and check the `errors` list.

```sql
-- LAST RESORT ONLY, if the edge function cannot be made to work. The
-- predicate is auth-side on purpose: after C0 the two flags agree, and this
-- one cannot be fooled by a mislabelled profile.
-- delete from auth.users where is_anonymous = true;
```

### C3 — analytics reset

178 events, 159 sessions, 157 visitors. All of it predates the classification
columns and most of it is this workstream's own automation, so there is nothing
to salvage by filtering.

```sql
begin;
  delete from public.analytics_events;
  delete from public.analytics_sessions;
  delete from public.analytics_visitors;
commit;
```

Nothing else is touched. Railway's gameplay databases are not analytics and are
not in scope.

### C4 — the after-numbers

```sql
select
  (select count(*) from auth.users where is_anonymous)      as anon_after,
  (select count(*) from auth.users where not is_anonymous)  as registered_after,
  (select count(*) from public.profiles where is_anonymous) as anon_profiles_after,
  (select count(*) from public.analytics_events)            as events_after,
  (select count(*) from public.analytics_sessions)          as sessions_after,
  (select count(*) from public.analytics_visitors)          as visitors_after;
-- registered_after MUST be 4. If it is not, stop and say so.
```

---

## D — certification read-back (READ ONLY). After the smoke visits.

```sql
-- D1. What the smoke traffic produced, and how it was classified.
select s.session_id, s.started_at, s.landing_path,
       s.traffic_class, s.traffic_source, s.classification_reason,
       (select count(*) from public.analytics_events e where e.session_id = s.session_id) as events
from public.analytics_sessions s
order by s.started_at desc
limit 20;

-- D2. The whole store, by class. This is the number Admin's default filter
--     (human + unknown) is computed from.
select traffic_class, traffic_source, count(*) as sessions
from public.analytics_sessions
group by 1, 2 order by 1, 2;

-- D3. Confirm no anonymous auth user appeared from ordinary browsing.
select count(*) as anon_auth_users_now from auth.users where is_anonymous;
```
