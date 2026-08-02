import { useCallback, useEffect, useRef, useState } from "react";
import {
  isAborted,
  statCheckOnlineApi,
  StatCheckApiError,
  type StatCheckErrorDetails,
  type StatCheckOnlineApi,
} from "@/lib/stat-check-online/client";
import { fetchLeagueProfiles } from "@/lib/league-profiles";
import { useAuth } from "@/hooks/useAuth";

/** Fallback cadence. Every mutation refreshes immediately, so this only has to
 *  catch invites that arrive while the user is idle. */
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
 * Outcome of an accept attempt. Failures are NOT collapsed to null: the caller
 * needs the code to tell "this invite is dead" apart from "you are simply
 * already in a room, want to switch?" — outcomes that look identical if all you
 * get back is a falsy value. That collapse is what made a recoverable conflict
 * read as "That invite is no longer available" in production.
 */
export type AcceptOutcome =
  | { ok: true; joinPath: string }
  | { ok: false; code: string | null; message: string; details: StatCheckErrorDetails | null };

/** Codes meaning the invite is still good and must stay on screen. */
const RECOVERABLE = new Set([
  "SC_ACTIVE_ROOM_EXISTS",
  "SC_SWITCH_CONFIRM_REQUIRED",
  "SC_SWITCH_ROOM_ACTIVE",
  "SC_SWITCH_NOT_ROOM_OWNER",
  "SC_COMMUNITY_UNAVAILABLE",
]);

export const isRecoverableInviteError = (code: string | null): boolean =>
  code !== null && RECOVERABLE.has(code);

function toOutcome(error: unknown): AcceptOutcome {
  if (error instanceof StatCheckApiError) {
    return { ok: false, code: error.code, message: error.message, details: error.details };
  }
  return { ok: false, code: null, message: "Something went wrong.", details: null };
}

/**
 * Incoming Stat Check friend invites.
 *
 * Polled, not realtime — realtime delivery is explicitly out of scope. The
 * inbox names its sender only by `sender_profile_id`; display names come from
 * the existing `get_league_profiles` RPC, which already filters profiles
 * blocked in either direction. No Supabase auth id is involved on either side.
 *
 * The feature flag lives on the backend: unset means every invite route 404s,
 * so `disabled` latches and the hook goes quiet. A 403 (ACCOUNT_REQUIRED, i.e.
 * an anonymous session) latches too — production logs showed anonymous visitors
 * re-polling a guaranteed 403 every 30 s indefinitely.
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
            // Same "Someone" fallback the friend notifications already use.
            displayName: profile?.display_name || "Someone",
            avatarUrl: profile?.avatar_url ?? null,
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
          };
        }),
      );
    } catch (error) {
      if (disposedRef.current || isAborted(error)) return;
      // 404 = feature flag off. 403 = anonymous session, which can never
      // succeed. Both are permanent for this session, so stop rather than
      // hammering a guaranteed failure every 30 s.
      if (
        error instanceof StatCheckApiError &&
        (error.status === 404 || error.status === 403)
      ) {
        disabledRef.current = true;
        setDisabled(true);
        setInvites([]);
        return;
      }
      // Anything else (network, 5xx) keeps the last good list and retries.
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

  /**
   * Shared tail for both accept paths. On success the invite is dropped locally
   * and the inbox refetched. On a RECOVERABLE failure it is left alone —
   * removing it before the backend has resolved it is exactly how a fixable
   * conflict turns into a vanished invite the user can no longer act on.
   */
  const runAccept = useCallback(
    async (
      inviteToken: string,
      call: () => Promise<{ joinPath: string }>,
    ): Promise<AcceptOutcome> => {
      setBusyToken(inviteToken);
      try {
        const accepted = await call();
        setInvites((current) => current.filter((i) => i.inviteToken !== inviteToken));
        void refresh();
        return { ok: true, joinPath: accepted.joinPath };
      } catch (error) {
        const outcome = toOutcome(error);
        // A recoverable conflict is about the user's OWN room, not this invite,
        // so refetching is pointless churn that could race the confirmation
        // dialog. Anything else may genuinely be resolved server-side: resync.
        if (!isRecoverableInviteError(outcome.code)) void refresh();
        return outcome;
      } finally {
        setBusyToken(null);
      }
    },
    [refresh],
  );

  const accept = useCallback(
    (inviteToken: string) => runAccept(inviteToken, () => api.acceptInvite(inviteToken)),
    [api, runAccept],
  );

  /** Close the caller's own waiting room and join, in one backend transaction. */
  const acceptSwitch = useCallback(
    (inviteToken: string, confirmCloseOccupiedRoom = false) =>
      runAccept(inviteToken, () =>
        api.acceptInviteWithSwitch(inviteToken, confirmCloseOccupiedRoom),
      ),
    [api, runAccept],
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
        return false;
      } finally {
        setBusyToken(null);
        void refresh();
      }
    },
    [api, refresh],
  );

  return { invites, disabled, busyToken, accept, acceptSwitch, decline, refresh };
}
