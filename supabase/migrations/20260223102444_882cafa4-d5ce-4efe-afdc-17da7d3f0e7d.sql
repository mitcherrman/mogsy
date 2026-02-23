
ALTER TABLE public.profiles ADD CONSTRAINT check_diamonds_non_negative CHECK (diamonds >= 0);
ALTER TABLE public.profiles ADD CONSTRAINT check_boost_credits_non_negative CHECK (boost_credits >= 0);
ALTER TABLE public.profiles ADD CONSTRAINT check_elo_shields_non_negative CHECK (elo_shields >= 0);
ALTER TABLE public.profiles ADD CONSTRAINT check_reveals_non_negative CHECK (reveals >= 0);
ALTER TABLE public.profiles ADD CONSTRAINT check_rewinds_non_negative CHECK (rewinds >= 0);
