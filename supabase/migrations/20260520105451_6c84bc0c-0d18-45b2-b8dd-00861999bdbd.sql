
-- Editor mode enum
DO $$ BEGIN
  CREATE TYPE public.blog_editor_mode AS ENUM ('blocks', 'rich', 'canvas');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.blog_post_status AS ENUM ('draft', 'scheduled', 'published');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Posts
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  subtitle text NOT NULL DEFAULT '',
  cover_url text,
  author_user_id uuid NOT NULL,
  editor_mode public.blog_editor_mode NOT NULL DEFAULT 'blocks',
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  category text,
  status public.blog_post_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  scheduled_at timestamptz,
  views integer NOT NULL DEFAULT 0,
  seo_title text,
  seo_description text,
  og_image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_status_pub ON public.blog_posts(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_tags ON public.blog_posts USING GIN(tags);

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published posts are publicly readable" ON public.blog_posts;
CREATE POLICY "Published posts are publicly readable"
  ON public.blog_posts FOR SELECT
  USING (status = 'published' AND (published_at IS NULL OR published_at <= now()));

DROP POLICY IF EXISTS "Admins can read all posts" ON public.blog_posts;
CREATE POLICY "Admins can read all posts"
  ON public.blog_posts FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage posts" ON public.blog_posts;
CREATE POLICY "Admins can manage posts"
  ON public.blog_posts FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_blog_posts_updated_at ON public.blog_posts;
CREATE TRIGGER trg_blog_posts_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Views
CREATE TABLE IF NOT EXISTS public.blog_post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  profile_id uuid,
  view_day date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_blog_post_views_dedupe
  ON public.blog_post_views(post_id, profile_id, view_day)
  WHERE profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_blog_post_views_post ON public.blog_post_views(post_id);

ALTER TABLE public.blog_post_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert a view" ON public.blog_post_views;
CREATE POLICY "Anyone can insert a view"
  ON public.blog_post_views FOR INSERT
  WITH CHECK (profile_id IS NULL OR is_profile_owner(profile_id));

DROP POLICY IF EXISTS "Admins can read views" ON public.blog_post_views;
CREATE POLICY "Admins can read views"
  ON public.blog_post_views FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Comments: add blog_post_id
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS blog_post_id uuid REFERENCES public.blog_posts(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_blog_post_id ON public.comments(blog_post_id);
