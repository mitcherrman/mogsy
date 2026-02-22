-- Tighten matches INSERT policy: only admins can directly insert (normal flow uses SECURITY DEFINER RPCs)
DROP POLICY IF EXISTS "Authenticated users can create matches" ON public.matches;
CREATE POLICY "Admins can insert matches"
  ON public.matches
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));