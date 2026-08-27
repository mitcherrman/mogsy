-- Account Connections: verified external identity links (Discord, Riot RSO).
-- Verified fields are written ONLY server-side (edge function, service role).
-- Users control exactly two fields: contact_consent, public_on_profile.

CREATE TABLE public.user_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('discord', 'riot')),
  provider_user_id text NOT NULL,
  username text,
  display_name text,
  tag_line text,
  avatar_url text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  contact_consent boolean NOT NULL DEFAULT false,
  public_on_profile boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_identity_links_user_provider_key UNIQUE (user_id, provider),
  CONSTRAINT user_identity_links_provider_account_key UNIQUE (provider, provider_user_id)
);

CREATE INDEX user_identity_links_user_id_idx ON public.user_identity_links(user_id);

-- Column-scoped grants: the browser may read its own rows and flip only the two
-- consent switches. INSERT is service_role only (verified writes happen after a
-- successful provider auth); DELETE is allowed so a user can disconnect.
GRANT SELECT, DELETE ON public.user_identity_links TO authenticated;
GRANT UPDATE (contact_consent, public_on_profile) ON public.user_identity_links TO authenticated;
GRANT ALL ON public.user_identity_links TO service_role;

ALTER TABLE public.user_identity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own identity links"
  ON public.user_identity_links FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update consent on their own identity links"
  ON public.user_identity_links FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can disconnect their own identity links"
  ON public.user_identity_links FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view all identity links"
  ON public.user_identity_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin'));

-- Defence in depth behind the column grants: even if a future grant widens,
-- a non-service caller can never re-assert the verified identity fields.
CREATE OR REPLACE FUNCTION public.protect_identity_link_verified_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_user_id IS DISTINCT FROM OLD.provider_user_id
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.display_name IS DISTINCT FROM OLD.display_name
     OR NEW.tag_line IS DISTINCT FROM OLD.tag_line
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.metadata IS DISTINCT FROM OLD.metadata THEN
    RAISE EXCEPTION 'Verified identity fields are server-managed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_user_identity_links_verified_fields
  BEFORE UPDATE ON public.user_identity_links
  FOR EACH ROW EXECUTE FUNCTION public.protect_identity_link_verified_fields();

CREATE TRIGGER update_user_identity_links_updated_at
  BEFORE UPDATE ON public.user_identity_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Admin review listing: reuses the existing has_role admin architecture and
-- maps each link to the public profile id the admin directory already uses.
CREATE OR REPLACE FUNCTION public.admin_list_identity_links()
RETURNS TABLE (
  profile_id uuid,
  provider text,
  provider_user_id text,
  username text,
  display_name text,
  tag_line text,
  contact_consent boolean,
  public_on_profile boolean,
  verified_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'master_admin')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  RETURN QUERY
    SELECT p.id, l.provider, l.provider_user_id, l.username, l.display_name,
           l.tag_line, l.contact_consent, l.public_on_profile, l.verified_at
    FROM public.user_identity_links l
    JOIN public.profiles p ON p.user_id = l.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_identity_links() TO authenticated;