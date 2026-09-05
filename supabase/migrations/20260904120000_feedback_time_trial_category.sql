-- ---------------------------------------------------------------------------
-- Feedback taxonomy: split Time Trial out of "Daily Challenge".
-- ---------------------------------------------------------------------------
-- FB1 shipped one "Daily Challenge" area while /quiz/daily was the only daily
-- surface. Since then the two products separated:
--
--   /quiz/daily-challenge  Daily Challenge (DC2) — the 11-15 card graded run
--   /quiz/daily            Time Trial — the 30-question / 90s score attack
--
-- The route table in src/lib/feedback/contract.ts mapped the prefix
-- "/quiz/daily" to "Daily Challenge", so every Time Trial report was filed
-- under the wrong product. Longest-prefix matching already routed
-- "/quiz/daily-challenge" correctly, so only the shorter prefix was wrong.
--
-- `category` carries no CHECK constraint — this list is the taxonomy the admin
-- category editor and the Feedback Center form offer, seeded exactly as
-- 20260812120000_fb1_feedback_foundation.sql seeded it. Nothing else changes:
-- no existing category is renamed or removed, and no historical row is
-- rewritten. Reports already filed under "Daily Challenge" stay there, because
-- we cannot tell which of them came from Time Trial.

BEGIN;

UPDATE public.app_settings
SET value = jsonb_set(
      value,
      '{categories}',
      '["General","Leaguecraft","Daily Challenge","Time Trial","Ranked","Stat Check","Combat Lab","Mastery","Mogzy Archives","Patch Reports","Quiz History","Account & Profile","Performance","Other"]'::jsonb,
      true
    ),
    updated_at = now()
WHERE key = 'feedback_config';

COMMIT;
