# FB1 Feedback Center — rollout

Three migrations and one frontend deploy. The order matters: two of the
migrations are safe to apply under the frontend that is live in production
today, and one is not.

Mogzy's Supabase is managed through Lovable Cloud. Every migration below is
applied by hand in the **Lovable Cloud SQL Editor**. Do not use the Supabase
CLI, do not run `supabase db push`, and do not link the CLI to this project.

## The pieces

| # | Artifact | Safe under the OLD frontend? |
|---|---|---|
| M1 | `20260812120000_fb1_feedback_foundation.sql` | ✅ purely additive |
| M2 | `20260812130000_fb1_feedback_evidence_storage.sql` | ✅ new bucket + RPC only |
| F | frontend commit `61eaffb6` (Feedback Center) | needs M1 + M2 first |
| M3 | `20260812140000_fb1_feedback_privilege_hardening.sql` | ❌ **breaks it** |

"OLD frontend" means what is in production right now: the pre-FB1 Feedback page,
which reads submissions with `.from("feedback").select("*")`. M3 revokes exactly
that, so applying M3 while the old page is live turns `/feedback` into a
permission error.

## Order

### 1. Apply M1 — `20260812120000_fb1_feedback_foundation.sql`

Additive only: new columns (all nullable or defaulted), the `ON DELETE SET NULL`
FK change, two BEFORE INSERT triggers, an index, and `list_my_feedback()`. The
old page keeps working — its `select("*")` simply returns more columns than its
interface names, which it ignores.

Run the §"after M1" checks in the runbook before continuing.

### 2. Apply M2 — `20260812130000_fb1_feedback_evidence_storage.sql`

Creates the private `feedback-evidence` bucket, its four object policies, and
`attach_feedback_screenshot()`. Nothing in the old frontend touches any of it.

### 3. Regenerate `src/integrations/supabase/types.ts`

Only now does the live database match the new schema, so this is the first
moment regeneration produces correct output. Regenerating earlier would have
described a database that did not exist.

Check the diff before committing: `not1/per-admin-read-state` has its own
pending additive edit to this file, and that must not be clobbered.

### 4. Deploy the frontend (commit `61eaffb6`)

Pushing `main` auto-deploys, but **it takes roughly 25 minutes**. Do not treat
the push as the deploy.

Confirm the new bundle is actually serving before step 5 — fingerprint it rather
than trusting the clock. Load `https://mogzy.lol/feedback` and check that the
four entry cards render ("Report a Bug", "Request a Feature", "Gameplay
Feedback", "Other Feedback"). The old page shows a single "Submit Feedback"
form instead.

### 5. Apply M3 — `20260812140000_fb1_feedback_privilege_hardening.sql`

Only after step 4 is confirmed live. M3 refuses to run if M1 has not been
applied (it checks for `list_my_feedback()` and raises), but it cannot detect
which frontend is deployed — that gate is this document.

Then run the §"after M3" checks.

## Why this order, and what the residual risk is

The alternative — applying all three migrations together, then deploying — has a
~25 minute window where production has no working `/feedback` read path at all.
That is a real outage.

This order has no outage. Its cost is that the pre-existing column-read hole
stays open a little longer, from step 1 until step 5. That is the right trade:
the hole has been open since the feedback table shipped in March, it requires a
signed-in user deliberately crafting a request against their *own* row, and the
exposure is staff notes on that row. A few extra hours of a months-old,
low-severity, self-only exposure is preferable to taking the feature down.

**Residual risk after step 5:** a user who still has the old JavaScript bundle
open in a tab will get a permission error on `/feedback` until they reload. It
affects only that page, and only until refresh. There is no way to avoid this
without leaving the hole open indefinitely, and no data is at risk.

## Rollback

- **M3** — `GRANT SELECT ON public.feedback TO authenticated;` restores the old
  reach immediately. Use only if step 5 was applied too early and the old
  frontend is still serving.
- **M2** — dropping the bucket destroys uploaded evidence. Prefer leaving it;
  it is inert without the frontend.
- **M1** — do not roll back after any new-schema row exists. The `ON DELETE
  SET NULL` FK and the backfill are the parts worth keeping even if FB1 were
  abandoned. Restore from the pre-apply backup instead.

Take a backup before M1.
