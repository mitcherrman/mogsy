
-- Add category column to leagues
ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS category text DEFAULT null;

-- Create anime preset leagues
INSERT INTO public.leagues (name, type, description, category, is_system) VALUES
  ('Best Anime Villain', 'preset', 'Who is the greatest anime villain of all time?', 'Anime', true),
  ('Best Anime Cat', 'preset', 'Vote for the most iconic anime cat!', 'Anime', true),
  ('Best Anime Love Story', 'preset', 'Which anime romance tugs at your heartstrings the most?', 'Anime', true),
  ('Best Anime Isekai', 'preset', 'Which isekai world would you want to live in?', 'Anime', true),
  ('Best Anime Protagonist', 'preset', 'Who is the greatest anime main character?', 'Anime', true),
  ('Best Anime Action Scene', 'preset', 'Which anime fight or action sequence is the most legendary?', 'Anime', true),
  ('Best Anime Food', 'preset', 'Which anime made you the hungriest?', 'Anime', true),
  ('Best Anime Girl', 'preset', 'Vote for the best anime girl!', 'Anime', true),
  ('Best Anime Opening', 'preset', 'Which anime OP is the biggest banger?', 'Anime', true),
  ('Best Anime Sidekick', 'preset', 'Who is the best supporting character in anime?', 'Anime', true),
  ('Best Anime Plot Twist', 'preset', 'Which anime twist blew your mind the hardest?', 'Anime', true),
  ('Best Anime Power System', 'preset', 'Nen, Haki, Chakra — which power system reigns supreme?', 'Anime', true);

-- Now insert preset items for each league

-- Best Anime Villain
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Madara Uchiha'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Frieza'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Light Yagami'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Johan Liebert'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Aizen'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Meruem'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Griffith'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Pain'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Dio Brando'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Villain' LIMIT 1), 'Hisoka');

-- Best Anime Cat
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Jiji (Kiki''s Delivery Service)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Luna (Sailor Moon)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Happy (Fairy Tail)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Meowth (Pokémon)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Baron (The Cat Returns)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Kuro (Blue Exorcist)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Chi (Chi''s Sweet Home)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Nyanko-sensei (Natsume)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Sakamoto (Nichijou)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Cat' LIMIT 1), 'Chomusuke (Konosuba)');

-- Best Anime Love Story
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Your Name'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Clannad: After Story'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Toradora!'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Kaguya-sama'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Fruits Basket'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Horimiya'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Weathering With You'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Nana'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Your Lie in April'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Love Story' LIMIT 1), 'Bunny Girl Senpai');

-- Best Anime Isekai
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Re:Zero'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Sword Art Online'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Konosuba'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Mushoku Tensei'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'That Time I Got Reincarnated as a Slime'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Overlord'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'No Game No Life'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'The Rising of the Shield Hero'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Log Horizon'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Isekai' LIMIT 1), 'Grimgar of Fantasy and Ash');

-- Best Anime Protagonist
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Goku'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Naruto Uzumaki'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Monkey D. Luffy'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Eren Yeager'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Edward Elric'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Spike Spiegel'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Gon Freecss'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Tanjiro Kamado'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Lelouch Lamperouge'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Protagonist' LIMIT 1), 'Guts');

-- Best Anime Action Scene
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Naruto vs Sasuke (Final Valley)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Goku vs Frieza (Namek)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Levi vs Beast Titan'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Luffy vs Kaido'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Saitama vs Boros'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Mob vs Mogami'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Ichigo vs Ulquiorra'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Gojo vs Sukuna'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'Netero vs Meruem'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Action Scene' LIMIT 1), 'All Might vs All For One');

-- Best Anime Food
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Food Wars (Shokugeki no Soma)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Spirited Away (Feast Scene)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Naruto Ichiraku Ramen'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Ponyo Ham Ramen'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'One Piece Sanji''s Cooking'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Sweetness & Lightning'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Laid-Back Camp Curry'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Dragon Ball Senzu Beans'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Howl''s Moving Castle Breakfast'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Food' LIMIT 1), 'Delicious in Dungeon');

-- Best Anime Girl
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Rem (Re:Zero)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Mikasa Ackerman'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Zero Two'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Yor Forger'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Hinata Hyuga'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Asuna Yuuki'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Nezuko Kamado'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Nami (One Piece)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Mai Sakurajima'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Girl' LIMIT 1), 'Megumin (Konosuba)');

-- Best Anime Opening
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Cruel Angel''s Thesis (Evangelion)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Unravel (Tokyo Ghoul)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Again (FMA: Brotherhood)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Guren no Yumiya (Attack on Titan)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Tank! (Cowboy Bebop)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'The Hero (One Punch Man)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Kaikai Kitan (Jujutsu Kaisen)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Blue Bird (Naruto Shippuden)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'We Are! (One Piece)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Opening' LIMIT 1), 'Colors (Code Geass)');

-- Best Anime Sidekick
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Killua Zoldyck'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Vegeta'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Roronoa Zoro'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Pikachu'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Alphonse Elric'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Zenitsu Agatsuma'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Shikamaru Nara'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Chopper'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Jet Black'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Sidekick' LIMIT 1), 'Todoroki Shoto');

-- Best Anime Plot Twist
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Attack on Titan - Basement Reveal'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Death Note - L''s Death'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Code Geass - Zero Requiem'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Madoka Magica - Episode 3'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Steins;Gate - True Ending'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Hunter x Hunter - Chimera Ant King'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Naruto - Itachi''s Truth'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'One Piece - Void Century Hints'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Promised Neverland - Chapter 1 Reveal'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Plot Twist' LIMIT 1), 'Fullmetal Alchemist - Hughes'' Death');

-- Best Anime Power System
INSERT INTO public.preset_items (league_id, name) VALUES
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Nen (Hunter x Hunter)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Haki (One Piece)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Chakra (Naruto)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Cursed Energy (Jujutsu Kaisen)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Alchemy (FMA)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Stands (JoJo)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Breathing Techniques (Demon Slayer)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Devil Fruits (One Piece)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Quirks (My Hero Academia)'),
  ((SELECT id FROM public.leagues WHERE name = 'Best Anime Power System' LIMIT 1), 'Ki (Dragon Ball)');

-- Tag any existing anime-related leagues with the Anime category
UPDATE public.leagues SET category = 'Anime' WHERE type = 'preset' AND (
  name ILIKE '%anime%' 
  OR name ILIKE '%waifu%'
  OR name ILIKE '%shonen%'
);
