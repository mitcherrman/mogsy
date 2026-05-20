import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, UserPlus, Copy, Check, Loader2, ArrowLeft, Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFriends } from "@/hooks/useFriends";
import UserAvatar from "@/components/UserAvatar";
import { toast } from "sonner";
import type { MultiplayerPlayer, MultiplayerTeam } from "@/hooks/useMultiplayerGame";

interface MultiplayerLobbyProps {
  gameId: string;
  teams: MultiplayerTeam[];
  players: MultiplayerPlayer[];
  myPlayer: MultiplayerPlayer | null;
  myProfileId: string | null;
  isHost: boolean;
  onStartGame: () => void;
  onLeaveGame: () => void;
  onSetReady: (ready: boolean) => void;
}

interface ProfileInfo {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function MultiplayerLobby({
  gameId,
  teams,
  players,
  myPlayer,
  myProfileId,
  isHost,
  onStartGame,
  onLeaveGame,
  onSetReady,
}: MultiplayerLobbyProps) {
  const { user } = useAuth();
  const { friends } = useFriends();
  const [profiles, setProfiles] = useState<Record<string, ProfileInfo>>({});
  const [copied, setCopied] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    const profileIds = players.map(p => p.profile_id);
    if (profileIds.length === 0) return;

    supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", profileIds)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, ProfileInfo> = {};
          data.forEach(p => { if (p.id) map[p.id] = p as ProfileInfo; });
          setProfiles(map);
        }
      });
  }, [players]);

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/multiplayer/game/${gameId}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const allReady = players.every(p => p.is_ready);
  const hasEnoughPlayers = teams.length === 2 && players.length >= 4;
  const canStart = isHost && allReady && hasEnoughPlayers;

  const renderTeam = (team: MultiplayerTeam, index: number) => {
    const teamPlayers = players.filter(p => p.team_id === team.id);
    const isMyTeam = myPlayer?.team_id === team.id;

    return (
      <motion.div
        key={team.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
        className={`p-4 rounded-xl border-2 ${isMyTeam ? "border-primary bg-primary/5" : "border-border bg-card"}`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-bold text-foreground">Team {index + 1}</span>
          {isMyTeam && (
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold">Your Team</span>
          )}
        </div>

        <div className="space-y-2">
          {teamPlayers.map(player => {
            const playerProfile = profiles[player.profile_id];
            const isMe = player.profile_id === myProfileId;

            return (
              <div key={player.id} className={`flex items-center gap-3 p-2 rounded-lg ${isMe ? "bg-primary/10" : "bg-muted/30"}`}>
                <UserAvatar src={playerProfile?.avatar_url} name={playerProfile?.display_name || "Player"} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold truncate">{playerProfile?.display_name || "Loading..."}</span>
                    {player.is_host && <Crown className="h-3.5 w-3.5 text-amber-500" />}
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${player.is_ready ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground"}`}>
                  {player.is_ready ? "Ready" : "Not Ready"}
                </div>
              </div>
            );
          })}

          {Array.from({ length: Math.max(0, 2 - teamPlayers.length) }).map((_, i) => (
            <div key={`empty-${i}`} className="flex items-center gap-3 p-2 rounded-lg border-2 border-dashed border-muted">
              <div className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center">
                <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <span className="text-sm text-muted-foreground">Waiting for player...</span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Game Lobby</h2>
          <p className="text-sm text-muted-foreground">
            {hasEnoughPlayers ? "All players joined! Ready up to start." : "Waiting for players to join..."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onLeaveGame}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Leave
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team, i) => renderTeam(team, i))}

        {teams.length < 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl border-2 border-dashed border-muted bg-muted/10"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-bold text-muted-foreground">Team 2</span>
            </div>
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              <span className="text-sm text-muted-foreground">Waiting for opponents...</span>
            </div>
          </motion.div>
        )}
      </div>

      <div className="p-4 rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-foreground">Invite Players</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyInviteLink} className="flex-1">
            {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
            {copied ? "Copied!" : "Copy Link"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
            <Users className="h-4 w-4 mr-1" />
            Invite Friend
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        {myPlayer && (
          <Button
            variant={myPlayer.is_ready ? "outline" : "default"}
            className="flex-1"
            onClick={() => onSetReady(!myPlayer.is_ready)}
          >
            {myPlayer.is_ready ? "Not Ready" : "Ready Up"}
          </Button>
        )}
        {isHost && (
          <Button variant="hero" className="flex-1" disabled={!canStart} onClick={onStartGame}>
            {!hasEnoughPlayers ? "Waiting for players..." : !allReady ? "Waiting for ready..." : "Start Game!"}
          </Button>
        )}
      </div>

      <AnimatePresence>
        {showInvite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowInvite(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-sm bg-card rounded-xl border border-border p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground">Invite a Friend</h3>
                <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setShowInvite(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {friends.filter(f => f.status === "accepted").length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No friends yet. Add friends from their profile page!
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {friends.filter(f => f.status === "accepted").map(friend => (
                    <button
                      key={friend.id}
                      onClick={() => { toast.info("Share the invite link with your friend!"); setShowInvite(false); }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                    >
                      <UserAvatar src={friend.profile.avatar_url} name={friend.profile.display_name || ""} size="sm" />
                      <span className="text-sm font-semibold text-foreground">{friend.profile.display_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
