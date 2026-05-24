
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='comment_reports') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.comment_reports';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='user_reports') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.user_reports';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='feedback') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.feedback';
  END IF;
END $$;
