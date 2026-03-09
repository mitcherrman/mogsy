
-- Allow players to delete their own player record (leave game)
CREATE POLICY "Players can delete their own record"
ON public.multiplayer_players
FOR DELETE
TO authenticated
USING (is_profile_owner(profile_id));

-- Allow viewing open/waiting games for everyone authenticated (for the lobby list)
-- Already handled by existing policy: "Players can view games they're in" with OR status = 'waiting'
