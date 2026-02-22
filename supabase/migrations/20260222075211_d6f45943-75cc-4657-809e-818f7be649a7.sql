
-- Add display_order column to leagues for admin-controlled ordering
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0;

-- Set initial display_order based on created_at
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.leagues
)
UPDATE public.leagues SET display_order = ordered.rn
FROM ordered WHERE public.leagues.id = ordered.id;
