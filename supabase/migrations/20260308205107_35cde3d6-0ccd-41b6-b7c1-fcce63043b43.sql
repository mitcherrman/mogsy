
-- Security definer function to check if current user is party to a friendship
CREATE OR REPLACE FUNCTION public.is_friendship_party(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _profile_id AND user_id = auth.uid()
  )
$$;

-- Create friendships table
CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- SELECT: users can see friendships they are part of
CREATE POLICY "Users can view own friendships"
ON public.friendships FOR SELECT TO authenticated
USING (
  is_friendship_party(requester_id) OR is_friendship_party(addressee_id)
);

-- INSERT: user can send friend request (must own requester_id)
CREATE POLICY "Users can send friend requests"
ON public.friendships FOR INSERT TO authenticated
WITH CHECK (is_friendship_party(requester_id));

-- UPDATE: addressee can update status (accept/decline)
CREATE POLICY "Addressee can update friendship status"
ON public.friendships FOR UPDATE TO authenticated
USING (is_friendship_party(addressee_id));

-- DELETE: either party can delete (unfriend)
CREATE POLICY "Either party can delete friendship"
ON public.friendships FOR DELETE TO authenticated
USING (
  is_friendship_party(requester_id) OR is_friendship_party(addressee_id)
);

-- Admins can manage all friendships
CREATE POLICY "Admins can manage all friendships"
ON public.friendships FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Updated_at trigger
CREATE TRIGGER update_friendships_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
