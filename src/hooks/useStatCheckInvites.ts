import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAborted,
  statCheckOnlineApi,
  StatCheckApiError,
  type StatCheckOnlineApi,
} from "@/lib/stat-check-online/client";
import { fetchLeagueProfiles } from "@/lib/league-profiles";
import { useAuth } from "@/hooks/useAuth";

/** Matches the friend-notification refresh cadence, not a lobby poll. */
const POLL_MS = 30_000;

export type StatCheckInvite = {
  inviteToken: string;
  senderProfileId: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  expiresAt: string;
};

/**
 * Incoming Stat Check friend invites.
 *
 * Deliberately polled, like every other Stat Check surface — realtime delivery
 * is explicitly out of scope for this phase. The inbox payload names its sender
 * only by `sender_profile_id`; the display name and avatar come from the
 * existing `get_league_profiles` RPC, which already filters profiles blocked in
 * either direction. No Supabase auth id is involved on either side.
 *
 * The feature flag lives on the backend: with
 * `STAT_CHECK_FRIEND_INVITES_ENABLED` unset every invite route returns 404, so
 * `disabled` latches on the first 404 and the hook goes quiet. That is what
 * keeps the UI hidden without a second flag to keep in sync.
 */
export function useStatCheckInvites(api: StatCheckOnlineApi = statCheckOnlineApi) {
  const { user } = useAuth();
  const [invites, setInvites] = useState<StatCheckInvite[]>([]);
  const [disabled, setDisabled] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const disposedRef = useRef(false);
  const inFlightRef = useRef(false);
  const disabledRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!user || disabledRef.current || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const inbox = await api.listInvites();
      if (disposedRef.current) return;
      const profiles = await fetchLeagueProfiles(inbox.invites.map((i) => i.senderProfileId));
      if (disposedRef.current) return;
      const byId = new Map(profiles.map((p) => [p.id, p]));
      setInvites(
        inbox.invites.map((invite) => {
          const profile = byId.get(invite.senderProfileId);
          return {
            inviteToken: invite.inviteToken,
            senderProfileId: invite.senderProfileId,
            // Same "Someone" fallback the friend notifications already use when
            // a profile is not visible to this viewer.
            displayName: profile?.display_name || "Someone",
            avatarUrl: profile?.avatar_url ?? null,
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
          };
        }),
      );
    } catch (error) {
      if (disposedRef.current || isAborted(error)) return;
      // 404 is the feature flag being off, not a transient failure — stop
      // polling permanently for this session rather than retrying forever.
      if (error instanceof StatCheckApiError && error.status === 404) {
        disabledRef.current = true;
        setDisabled(true);
        setInvites([]);
        return;
      }
      // Any other failure (auth, network, backend) leaves the last good list in
      // place and simply retries on the next tick.
    } finally {
      inFlightRef.current = false;
    }
  }, [api, user]);

  useEffect(() => {
    disposedRef.current = false;
    if (!user) {
      setInvites([]);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => {
      disposedRef.current = true;
      window.clearInterval(timer);
    };
  }, [user, refresh]);

  /** Resolves to the room's join path on success, null on any failure. */
  const accept = useCallback(
    async (inviteToken: string): Promise<string | null> => {
      setBusyToken(inviteToken);
      try {
        const accepted = await api.acceptInvite(inviteToken);
        setInvites((current) => current.filter((i) => i.inviteToken !== inviteToken));
        return accepted.joinPath;
      } catch {
        // The invite may have expired, been cancelled, or the room may have
        // filled. Re-reading the inbox is the honest recovery.
        void refresh();
        return null;
      } finally {
        setBusyToken(null);
      }
    },
    [api, refresh],
  );

  const decline = useCallback(
    async (inviteToken: string): Promise<boolean> => {
      setBusyToken(inviteToken);
      // Optimistic: a decline that fails server-side is re-surfaced by refresh.
      setInvites((current) => current.filter((i) => i.inviteToken !== inviteToken));
      try {
        await api.declineInvite(inviteToken);
        return true;
      } catch {
        void refresh();
        return false;
      } finally {
        setBusyToken(null);
      }
    },
    [api, refresh],
  );

  return { invites, disabled, busyToken, accept, decline, refresh };
}
