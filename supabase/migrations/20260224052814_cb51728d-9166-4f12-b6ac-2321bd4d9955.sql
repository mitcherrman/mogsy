
-- Add subcategory column to leagues
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS subcategory text DEFAULT NULL;

-- Create LoL leagues under Video Games category with subcategory "League of Legends"
INSERT INTO public.leagues (name, category, subcategory, type, is_system)
VALUES 
  ('Best Champion', 'Video Games', 'League of Legends', 'preset', true),
  ('Best Item', 'Video Games', 'League of Legends', 'preset', true),
  ('Best Pro Team', 'Video Games', 'League of Legends', 'preset', true),
  ('Best Pro Player', 'Video Games', 'League of Legends', 'preset', true),
  ('Best Role', 'Video Games', 'League of Legends', 'preset', true);
