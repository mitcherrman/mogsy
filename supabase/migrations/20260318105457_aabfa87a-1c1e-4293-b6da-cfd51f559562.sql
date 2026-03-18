UPDATE play_layout_config 
SET config = jsonb_set(
  config, 
  '{categories}', 
  (SELECT jsonb_agg(cat) FROM jsonb_array_elements(config->'categories') cat WHERE NOT (cat->>'key' LIKE 'league_%'))
)
WHERE id IN ('published', 'draft') 
AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(config->'categories') cat WHERE cat->>'key' LIKE 'league_%'
);