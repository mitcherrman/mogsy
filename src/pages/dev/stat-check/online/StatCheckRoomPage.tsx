import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, Copy, DoorOpen, Swords, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import StatCheckPage from "../StatCheckPage";
import { statCheckIdentities, type StatCheckIdentities } from "../damageIdentity";
import { useStatCheckMatch } from "./useStatCheckMatch";
import { useStatCheckRoom } from "./useStatCheckRoom";

/** Started room: the existing Stat Check arena driven by the online driver. */
function OnlineMatch({
  matchId,
  identities,
  onExit,
}: {
  matchId: string;
  identities: StatCheckIdentities;
  onExit: () => void;
}) {
  const online = useStatCheckMatch(matchId);
  return <StatCheckPage online={online} identities={identities} onOnlineExit={onExit} />;
}

/**
 * Private-match room flow: create → share invite code/link → both ready →
 * automatic start. Presentation only — every state transition here is the
 * server's; this page renders the member-scoped room projection.
 */
export default function StatCheckRoomPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { state, createRoom, setReady, cancelRoom } = useStatCheckRoom(inviteCode ?? null);
  const [copied, setCopied] = useState(false);

  const room = state.room;
  const selfSeat = room?.seats.find((seat) => seat.isSelf) ?? null;
  const opponentSeat = room?.seats.find((seat) => !seat.isSelf) ?? null;
  const joinUrl = useMemo(
    () => (room ? `${window.location.origin}/quiz/stat-check/room/${room.inviteCode}` : ""),
    [room],
  );

  if (state.phase === "started" && room?.matchId) {
    /**
     * Damage-tally identities for the arena. The names are the seats'
     * `display_name`, which the room contract already carries and this page
     * already renders in the lobby — nothing new is requested from the server.
     * The room projection carries no avatar, so both sides fall through to the
     * shared UserAvatar's own fallback glyph rather than to an invented source.
     */
    const identities = statCheckIdentities({
      player: { name: selfSeat?.displayName ?? "" },
      bot: { name: opponentSeat?.displayName ?? "" },
    });
    return (
      <OnlineMatch
        matchId={room.matchId}
        identities={identities}
        onExit={() => navigate("/quiz/stat-check")}
      />
    );
  }

  const copyInvite = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_600);
    } catch {
      /* clipboard denied: the code stays visible for manual copy */
    }
  };

  return (
    <main className="min-h-screen bg-[#050b12] px-4 py-10 text-slate-100">
      <div className="mx-auto max-w-xl space-y-4">
        <header>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#d6b55d]">
            <Swords className="h-4 w-4" /> Private match
          </div>
          <h1 className="text-3xl font-black">Stat Check Room</h1>
        </header>

        {state.phase === "recovering" || state.phase === "joining" ? (
          <div data-testid="sc-room-loading" className="rounded-md border border-cyan-300/15 bg-black/30 p-6 text-sm text-slate-300">
            {state.phase === "joining" ? "Joining room…" : "Checking for your room…"}
          </div>
        ) : null}

        {state.phase === "creating" && (
          <div className="rounded-md border border-cyan-300/15 bg-black/30 p-6">
            <p className="text-sm text-slate-300">
              Create a private room and share the invite link with one opponent. The match starts
              automatically once you are both ready.
            </p>
            <Button
              data-testid="sc-room-create"
              disabled={state.busy}
              onClick={() => void createRoom()}
              className="mt-4 bg-[#d6b55d] text-[#071018] hover:bg-[#f4d77d]"
            >
              Create room
            </Button>
          </div>
        )}

        {room && (state.phase === "lobby" || state.phase === "started") && (
          <div data-testid="sc-room-lobby" className="space-y-4">
            <div className="rounded-md border border-[#d6b55d]/30 bg-[#d6b55d]/10 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#f4d77d]">Invite code</div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span data-testid="sc-room-invite-code" className="font-mono text-2xl font-black tracking-[0.3em] text-white">
                  {room.inviteCode}
                </span>
                <Button size="sm" variant="outline" data-testid="sc-room-copy" onClick={() => void copyInvite()} className="border-[#d6b55d]/40 bg-black/30 text-[#f4d77d]">
                  {copied ? <Check className="mr-1.5 h-4 w-4" /> : <Copy className="mr-1.5 h-4 w-4" />}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <div className="mt-1 break-all text-[11px] text-slate-400">{joinUrl}</div>
            </div>

            <div className="rounded-md border border-cyan-300/15 bg-black/30 p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                <Users className="h-3.5 w-3.5" /> Seats
              </div>
              <div className="mt-2 grid gap-2">
                {(["p1", "p2"] as const).map((seatId) => {
                  const seat = room.seats.find((entry) => entry.seat === seatId) ?? null;
                  return (
                    <div
                      key={seatId}
                      data-testid={`sc-room-seat-${seatId}`}
                      className="flex items-center justify-between rounded border border-cyan-300/12 bg-black/30 px-3 py-2"
                    >
                      <span className="text-sm font-black">
                        {seat ? seat.displayName : "Waiting for opponent…"}
                      </span>
                      {seat && (
                        <Badge
                          variant="outline"
                          data-ready={seat.ready ? "true" : "false"}
                          className={
                            seat.ready
                              ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200"
                              : "border-slate-400/30 bg-black/30 text-slate-400"
                          }
                        >
                          {seat.ready ? "Ready" : "Not ready"}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {state.phase === "started" ? (
              <div data-testid="sc-room-started" className="rounded-md border border-emerald-300/30 bg-emerald-300/10 p-4">
                <div className="text-sm font-black text-emerald-200">Match started</div>
                <div className="mt-1 text-xs text-slate-300">
                  Both players are ready. Match {room.matchId ?? "created"} is live — the online
                  arena opens in the next milestone of this rollout.
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  data-testid="sc-room-ready"
                  disabled={state.busy || !selfSeat}
                  onClick={() => void setReady(!(selfSeat?.ready ?? false))}
                  className={
                    selfSeat?.ready
                      ? "bg-slate-700 text-slate-100 hover:bg-slate-600"
                      : "bg-cyan-300 text-[#06111f] hover:bg-cyan-200"
                  }
                >
                  {selfSeat?.ready ? "Unready" : "Ready up"}
                </Button>
                {room.createdByYou && (
                  <Button
                    data-testid="sc-room-cancel"
                    variant="outline"
                    onClick={() => void cancelRoom()}
                    className="border-red-400/40 bg-black/30 text-red-200"
                  >
                    <DoorOpen className="mr-1.5 h-4 w-4" /> Cancel room
                  </Button>
                )}
                <span className="text-xs text-slate-400">
                  {opponentSeat ? "Match starts automatically when both are ready." : "Waiting for your opponent to join…"}
                </span>
              </div>
            )}
          </div>
        )}

        {state.phase === "cancelled" && (
          <div data-testid="sc-room-cancelled" className="rounded-md border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-200">
            This room was cancelled.
            <Button size="sm" variant="outline" className="ml-3 border-cyan-300/30" onClick={() => navigate("/quiz/stat-check")}>
              Back
            </Button>
          </div>
        )}

        {state.phase === "error" && (
          <div data-testid="sc-room-error" className="rounded-md border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-200">
            {state.errorCode === "ACCOUNT_REQUIRED" || state.errorCode === "AUTH_REQUIRED"
              ? "Sign in with a full account to play private matches."
              : state.errorCode === "SC_ROOM_FULL"
                ? "This room already has two players."
                : state.errorCode === "SC_ROOM_NOT_FOUND"
                  ? "No room matches that invite code."
                  : state.errorCode === "FEATURE_DISABLED"
                    ? "Stat Check multiplayer is not enabled on this server."
                    : `Something went wrong${state.errorCode ? ` (${state.errorCode})` : ""}.`}
          </div>
        )}
      </div>
    </main>
  );
}
