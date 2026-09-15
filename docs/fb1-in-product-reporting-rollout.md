# FB1-4 in-product reporting — rollout

One migration and one frontend deploy. **The migration goes first**, which is
the reverse of the FB1 Feedback Center rollout — see "Why the order flips"
below before assuming this doc is a copy of that one.

Mogzy's Supabase is managed through Lovable Cloud. Apply the migration by hand
in the **Lovable Cloud SQL Editor**. Do not use the Supabase CLI, do not run
`supabase db push`, and do not link the CLI to this project.

## The pieces

| # | Artifact | Safe under the OLD frontend? |
|---|---|---|
| M4 | `20260913120000_fb1_in_product_reporting.sql` | ✅ purely additive |
| F | this branch's frontend | ❌ **needs M4 first** |

## Why the order flips

FB1-3 (`20260812140000`) revoked a privilege the then-live frontend depended
on, so it had to wait for the new bundle. M4 removes nothing. It adds a
defaulted column and *widens* a CHECK, and neither is visible to the frontend
running in production today: nothing live writes `report_context`, and no live
path sends `question_report` or `page_report`.

The new frontend, on the other hand, cannot work without M4. Its inserts name
`report_context` (a column that does not exist yet) and two `entry_intent`
values the current CHECK rejects. Deploying first means every in-product report
fails for the ~25 minutes the deploy takes, with the visitor seeing a generic
"we couldn't send that".

So: migration first, deploy second. There is no window in which either half is
broken.

## Order

### 1. Take a backup

Same rule as every migration on this table. Supabase is managed through Lovable
Cloud, so the backup is taken in the **Supabase dashboard → Database → Backups**
for project `kewgjwrzpzpeltwidvuc` — either the latest daily snapshot (confirm
its timestamp is after the last change you care about) or a point-in-time
restore marker if the plan has PITR. There is no CLI path from this repo: the
Supabase CLI is deliberately unlinked and the only credential checked in is the
publishable anon key, which cannot read or write schema.

**What a backup is and is not needed for here.** This migration is additive —
one defaulted column, two new CHECKs, a widened CHECK, one CREATE OR REPLACE and
one column GRANT — and it runs in a single transaction, so a failed apply rolls
back on its own and leaves nothing half-done. The backup covers the case the
transaction cannot: a *successful* apply that is later judged wrong, after rows
have been written under the new intents. See Rollback at the foot of this file
for the cheaper path (revert the frontend; the schema is inert without it).

### 2. Apply M4 — `20260913120000_fb1_in_product_reporting.sql`

Additive only:

- `feedback.report_context jsonb NOT NULL DEFAULT '{}'`, plus a
  `jsonb_typeof = 'object'` check and a 16 KB size cap;
- `feedback_entry_intent_check` dropped and re-added as a strict superset
  (`question_report`, `page_report` added to the existing four);
- `normalize_feedback_submission()` replaced, deriving `type = 'bug'` for both
  new intents.

The CHECK widening cannot fail validation: every existing row already satisfies
the new predicate. The trigger is **not** dropped and recreated — it already
points at the function by name, and recreating it would momentarily leave the
table without its `profile_id` guard.

#### Checks after applying — run all ten, in the SQL Editor

Every row returned should say `PASS`. Anything else means **do not deploy the
frontend**: the schema and the bundle would disagree in the one direction that
breaks every report.

```sql
-- 1-3. The column: exists, is jsonb, NOT NULL, defaults to an empty object.
select 'column' as check,
       case when data_type = 'jsonb'
             and is_nullable = 'NO'
             and column_default = '\'{}\'::jsonb'
            then 'PASS' else 'FAIL: ' || coalesce(data_type,'missing')
                                      || ' null=' || coalesce(is_nullable,'?')
                                      || ' default=' || coalesce(column_default,'none')
       end as result
from information_schema.columns
where table_schema = 'public' and table_name = 'feedback'
  and column_name = 'report_context';

-- 4. Both CHECK constraints are present.
select 'checks' as check,
       case when count(*) = 2 then 'PASS'
            else 'FAIL: found ' || count(*) || ' of 2' end as result
from pg_constraint
where conrelid = 'public.feedback'::regclass
  and conname in ('feedback_report_context_is_object',
                  'feedback_report_context_size');

-- 5. The widened entry-intent vocabulary is live.
select 'entry_intent' as check,
       case when pg_get_constraintdef(oid) like '%question_report%'
             and pg_get_constraintdef(oid) like '%page_report%'
            then 'PASS' else 'FAIL: ' || pg_get_constraintdef(oid) end as result
from pg_constraint
where conrelid = 'public.feedback'::regclass
  and conname = 'feedback_entry_intent_check';

-- 6. Normalisation derives type='bug' for BOTH new doors, and still guards
--    profile_id.
select 'normalize' as check,
       case when prosrc like '%question_report%' and prosrc like '%page_report%'
             and prosrc like '%feedback_profile_id_required%'
            then 'PASS' else 'FAIL' end as result
from pg_proc where proname = 'normalize_feedback_submission';

-- 7. authenticated can INSERT report_context. THIS IS THE ONE THAT FAILS
--    SILENTLY IN PRODUCTION IF MISSED.
select 'insert grant' as check,
       case when has_column_privilege('authenticated', 'public.feedback',
                                      'report_context', 'INSERT')
            then 'PASS' else 'FAIL: not insertable' end as result;

--    ...and still cannot UPDATE it (the snapshot is evidence, not a draft).
select 'no update grant' as check,
       case when has_column_privilege('authenticated', 'public.feedback',
                                      'report_context', 'UPDATE')
            then 'FAIL: updatable' else 'PASS' end as result;

-- 8. The admin notification trigger survived untouched.
select 'notify trigger' as check,
       case when count(*) = 1 then 'PASS' else 'FAIL: missing' end as result
from pg_trigger
where tgrelid = 'public.feedback'::regclass
  and not tgisinternal
  and tgfoid = 'public.notify_admins_on_feedback'::regproc;

-- 9. The submitter read contract still hides report_context (and the other
--    admin-only columns).
select 'list_my_feedback' as check,
       case when prosrc not like '%report_context%'
             and prosrc not like '%admin_notes%'
             and prosrc not like '%client_meta%'
            then 'PASS' else 'FAIL: leaks an admin column' end as result
from pg_proc where proname = 'list_my_feedback';

-- 10. The admin RPC can return it. It is RETURNS SETOF public.feedback doing
--     SELECT *, so the column flows through with no function change.
select 'admin_list_feedback' as check,
       case when pg_get_function_result(oid) = 'SETOF feedback'
            then 'PASS' else 'FAIL: ' || pg_get_function_result(oid) end as result
from pg_proc where proname = 'admin_list_feedback';
```

A live end-to-end insert is deliberately NOT part of this list: it would write a
real row, and the frontend smoke test in step 5 exercises the same path with a
row you can then archive.

### 3. Regenerate `src/integrations/supabase/types.ts`

Only now does the live database match. Regenerating earlier describes a
database that does not exist — which is also why the regeneration was NOT done
in advance as part of the RFB branch: `types.ts` is required to describe the
live database, and until step 2 runs, the live database has no
`report_context`.

This clears one deliberate wart: `AdminFeedback.tsx` maps its rows with
`as unknown as FeedbackRow` because `report_context` is not in the generated
types. After regeneration that can go back to a plain assertion. It is confined
to one mapping, so the clean-up is a one-line edit.

Note the project rule this obeys: migrations here are applied by hand in the
Lovable Cloud SQL Editor and **the Supabase CLI is deliberately not linked**,
so regeneration is an owner step rather than something this branch could have
done safely on its own.

### 4. Deploy the frontend

Pushing `main` auto-deploys, but **it takes roughly 25 minutes**. Do not treat
the push as the deploy.

Fingerprint it rather than trusting the clock:

- the HUD's top-right cluster shows a flag icon between the music control and
  the Mogzy portrait;
- opening a Ranked match shows **two** tabs in the bottom-right corner —
  "Report" and "Rules" — side by side rather than stacked on top of each other.

### 5. Verify end to end

1. Play a question in any mode, open **Report**, pick *Typo*, send.
2. Open `/admin` → Feedback. The new row's origin line reads
   `Question Report · Typo · <mode>`, and expanding it shows the prompt, the
   choices and the identity fields.
3. Press the HUD flag on any page, describe something, send. The row reads
   `Page Issue · <route>`.
4. Confirm both arrived as admin notifications — `notify_admins_on_feedback`
   is unchanged and fires for every insert, so this should need no action.

## What is deliberately unchanged

- **The rate limit.** Five per profile per hour, admins exempt. In-product
  reports count against the same budget as `/feedback` submissions. A player
  who finds six bad questions in one hour is throttled — a known cost of not
  building a second, unthrottled write path.
- **`list_my_feedback()`.** Not widened. `report_context` joins `client_meta`
  as a column the submitter's own read contract omits. Reports still appear in
  the user's history through the existing seventeen columns.
- **RLS.** No policy added, dropped or altered.
- **The evidence bucket and screenshots.** Neither reporter uploads one; both
  capture a text snapshot instead, which is what survives a generator change.

## Rollback

- **M4** — `ALTER TABLE public.feedback DROP COLUMN report_context;` and
  re-add the four-value CHECK, but ONLY if no row has been filed under a new
  intent. Once one has, the narrower CHECK will refuse to validate. Prefer
  rolling back the frontend, which makes the schema inert.
- **The frontend** — reverting removes both controls. The rows already filed
  stay readable in the admin list, because `admin_list_feedback()` returns
  every column regardless.

## Practice's second reporter — resolved

Practice used to carry **two** report buttons. The older one has been removed;
the shared Report tab is now the only user-facing path on every mode.

What was audited before removing it:

| | writes | read by | applied where |
|---|---|---|---|
| `question_reports` | `POST /api/quiz/reports` (unauthenticated; the client never sent a `reporter_id`) | the `/quiz/admin` inbox only | nowhere |
| `question_overrides` | `POST /api/quiz/admin/override-question` (admin) | five endpoints in `routes/quiz.py` | serve **and** grade |

`question_overrides` is the capability worth keeping, and it survives intact:
it is keyed on `question_id` **or** `question_key`, has no foreign key to a
report, and never required one. The endpoint, the `question_reports` table, its
rows and the `/quiz/admin` inbox are all still in place — only the second
user-facing door is closed, and `quizApi.reportQuestion` is retained (with no
caller) so re-opening it needs no new contract.

No dual-write was added. One click files one report.

### Two pre-existing defects found in that audit — NOT fixed here

Both are in the legacy admin surface, predate RFB, and are out of this
workstream's scope. Flagged so they are not mistaken for RFB regressions:

1. **`/quiz/admin` "Apply override" is broken.** `src/lib/quiz/api.ts` sends
   `new_correct_answer` / `new_explanation` / `report_id`; `QuizOverrideIn` in
   `schemas/quiz_schemas.py` requires `correct_answer` and declares none of
   those names. Every click is a 422.
2. **"Mark invalid" silently marks resolved.** `QuizAdmin.tsx` sends
   `{ resolution }`; the endpoint reads `{ status, admin_notes }` with `status`
   defaulting to `'resolved'`.

Neither is load-bearing today: locally `question_reports` held one smoke-test
row and `question_overrides` held none.
