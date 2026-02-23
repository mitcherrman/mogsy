
-- Comments table
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  hidden_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_length CHECK (char_length(content) BETWEEN 1 AND 500)
);

-- Comment reactions table (emoji reactions)
CREATE TABLE public.comment_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL DEFAULT '👍',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_reaction UNIQUE (comment_id, profile_id, emoji),
  CONSTRAINT emoji_length CHECK (char_length(emoji) BETWEEN 1 AND 10)
);

-- Comment reports table
CREATE TABLE public.comment_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reporter_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text DEFAULT 'inappropriate',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_report UNIQUE (comment_id, reporter_profile_id)
);

-- Indexes
CREATE INDEX idx_comments_league_id ON public.comments(league_id);
CREATE INDEX idx_comments_profile_id ON public.comments(profile_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at DESC);
CREATE INDEX idx_comment_reactions_comment_id ON public.comment_reactions(comment_id);
CREATE INDEX idx_comment_reactions_profile_id ON public.comment_reactions(profile_id);
CREATE INDEX idx_comment_reports_comment_id ON public.comment_reports(comment_id);

-- Enable RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;

-- Comments policies
CREATE POLICY "Comments are publicly readable" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own comments" ON public.comments
  FOR INSERT WITH CHECK (is_profile_owner(profile_id));

CREATE POLICY "Users can update own comments" ON public.comments
  FOR UPDATE USING (is_profile_owner(profile_id));

CREATE POLICY "Users can delete own comments" ON public.comments
  FOR DELETE USING (is_profile_owner(profile_id));

CREATE POLICY "Admins can update any comment" ON public.comments
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete any comment" ON public.comments
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Reaction policies
CREATE POLICY "Reactions are publicly readable" ON public.comment_reactions
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own reactions" ON public.comment_reactions
  FOR INSERT WITH CHECK (is_profile_owner(profile_id));

CREATE POLICY "Users can delete own reactions" ON public.comment_reactions
  FOR DELETE USING (is_profile_owner(profile_id));

-- Report policies
CREATE POLICY "Users can insert own reports" ON public.comment_reports
  FOR INSERT WITH CHECK (is_profile_owner(reporter_profile_id));

CREATE POLICY "Admins can view all reports" ON public.comment_reports
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own reports" ON public.comment_reports
  FOR SELECT USING (is_profile_owner(reporter_profile_id));

-- Trigger for updated_at on comments
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
