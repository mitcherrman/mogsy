
-- Update swipe ad frequency to 5 and ensure proper config
UPDATE public.app_settings
SET value = jsonb_set(
  jsonb_set(value, '{placements,swipe,frequency}', '5'::jsonb, true),
  '{placements,swipe,enabled}', 'true'::jsonb, true
),
updated_at = now()
WHERE key = 'global_ads_enabled';

-- Insert default ad creatives for the swipe placement
INSERT INTO public.ad_creatives (title, brand_name, image_url, cta_text, destination_url, placement, view_duration_seconds, is_enabled)
VALUES
  ('Go Pro — Remove All Ads', 'Mogsy Pro', 'https://images.unsplash.com/photo-1620325867502-221cfb5faa5f?w=800&q=80', 'Upgrade Now', 'https://mogsy.net/shop', 'swipe', 5, true),
  ('Compete in Live Leagues', 'Mogsy Compete', 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&q=80', 'Join a League', 'https://mogsy.net/leagues', 'swipe', 5, true),
  ('Climb the Leaderboard', 'Mogsy Rankings', 'https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?w=800&q=80', 'View Leaderboard', 'https://mogsy.net/leaderboard', 'swipe', 5, true),
  ('Invite Friends, Earn Diamonds', 'Mogsy Friends', 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80', 'Invite Now', 'https://mogsy.net/referral', 'swipe', 5, true);
