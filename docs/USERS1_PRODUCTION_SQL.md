# USERS1 — production SQL

Everything here runs in the **Lovable Cloud / Supabase SQL Editor**, which is the
only place in this project with privileged access. The repository holds the
publishable (anon) key alone — no agent can read `auth.users`, count anonymous
identities or delete them. Same posture as FUNNEL1 §15.9 / §17.5.

Run the blocks **in order**. Blocks A and B are READ-ONLY. Block C is
destructive and must not be run until the frontend change has shipped, or
automation will immediately mint the accounts again.

---

## A — audit (READ ONLY). Run first, paste the output back.

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

```sql
-- C1. RECORD THE BEFORE-NUMBERS. Paste the output into USERS1_HANDOFF.md.
select
  (select count(*) from auth.users where is_anonymous)     as anon_before,
  (select count(*) from auth.users where not is_anonymous) as registered_before,
  (select count(*) from public.analytics_events)           as events_before,
  (select count(*) from public.analytics_sessions)         as sessions_before,
  (select count(*) from public.analytics_visitors)         as visitors_before;

-- C2. Purge the anonymous identities.
--     PREFERRED PATH: Admin › Users › Accounts › "Purge all anonymous", which
--     calls the existing admin-gated `purge-anonymous-users` edge function and
--     deletes through the Auth API (auth.users rows have side tables the API
--     owns). Use this SQL only if that fails, and only with the API route
--     unavailable — deleting straight out of auth.users bypasses Supabase's own
--     bookkeeping.
--
-- delete from auth.users where is_anonymous;   -- last resort, see above

-- C3. Analytics reset — a clean launch baseline.
--     Children first is irrelevant here (no FKs between the three), but the
--     order is kept deliberate and the whole thing is one transaction.
begin;
  delete from public.analytics_events;
  delete from public.analytics_sessions;
  delete from public.analytics_visitors;
commit;

-- C4. AFTER-NUMBERS.
select
  (select count(*) from auth.users where is_anonymous)     as anon_after,
  (select count(*) from auth.users where not is_anonymous) as registered_after,
  (select count(*) from public.analytics_events)           as events_after,
  (select count(*) from public.analytics_sessions)         as sessions_after,
  (select count(*) from public.analytics_visitors)         as visitors_after;
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
