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

Same rule as every migration on this table.

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

Checks after applying:

```sql
-- the column exists and defaults to an object
select report_context from public.feedback limit 1;

-- the widened vocabulary is live
select pg_get_constraintdef(oid) from pg_constraint
where conname = 'feedback_entry_intent_check';

-- the trigger derives the new types
select prosrc from pg_proc where proname = 'normalize_feedback_submission';
```

### 3. Regenerate `src/integrations/supabase/types.ts`

Only now does the live database match. Regenerating earlier describes a
database that does not exist.

This also clears one deliberate wart: `AdminFeedback.tsx` currently maps its
rows with `as unknown as FeedbackRow` because `report_context` is not in the
generated types. After regeneration that can go back to a plain assertion. It
is confined to one mapping so the clean-up is a one-line edit.

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

## Known overlap to settle separately

Practice (`/quiz`) now has **two** question reporters: the new dock control and
the pre-existing "Report issue" button under the answer feedback, which posts
to `POST /api/quiz/reports` in the FastAPI backend and lands in the
`question_reports` table with its own admin resolution flow.

That path is left running on purpose — it feeds the question-override pipeline,
and retiring it silently would drop reports. But `question_reports` is keyed on
a `quiz_questions.id`, so it cannot accept a report from Ranked, Mastery, Time
Trial, Pro Play or Matchup at all. Deciding which of the two survives is an
owner call, not a deploy step.
