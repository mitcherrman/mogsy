/**
 * Mogzy community drawer.
 *
 * Reduced from the legacy Mogsy social panel to the four surfaces a League
 * player needs: who your friends are, who wants to be one, who you have asked,
 * and who you have blocked.
 *
 * Two legacy tabs were removed rather than restyled:
 *   - "Saved" bookmarked strangers' profiles, which is dating-app behaviour.
 *     The `saved_profiles` rows are untouched; nothing reads them here.
 *   - "Find" searched every profile by display name. That is the stranger
 *     discovery surface, and it cannot work anyway: no RLS policy currently
 *     permits reading another user's profile, so it returned an empty list.
 *
 * Adding friends therefore has no entry point in this drawer yet. That is
 * deliberate and matches reality — the cross-user read policy is still gated
 * on operator review, and a post-match "add friend" is later work.
 *
 * Inviting a known friend to Stat Check now DOES have an entry point: the
 * Friends tab passes `canInviteToStatCheck` to FriendActionMenu. Only that tab
 * may — it is the only one whose rows are guaranteed `status === "accepted"`.
 * The backend re-derives the sender from the JWT and re-checks friendship and
 * blocks anyway, so this prop is an affordance, not the security boundary.
 */
import { useState, useEffect } from "react";
import { Users, Clock, X, Ban } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import UserAvatar from "@/components/UserAvatar";
import FriendActionMenu from "@/components/FriendActionMenu";
import { useFriends } from "@/hooks/useFriends";
import { useBlocks } from "@/hooks/useBlocks";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchLeagueProfiles } from "@/lib/league-profiles";
import { toast } from "sonner";

function BlockedUsersList({
  blockedIds,
  onUnblock,
  navigate,
  setOpen,
}: {
  blockedIds: Set<string>;
  onUnblock: (id: string) => Promise<void>;
  navigate: (path: string) => void;
  setOpen: (v: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<{ id: string; display_name: string | null; avatar_url: string | null }[]>([]);

  useEffect(() => {
    if (blockedIds.size === 0) return;
    // KNOWN GAP — this list still renders empty, and did before this change.
    // public_profiles is security_invoker, so RLS resolved these rows to
    // nothing; get_league_profiles filters out profiles blocked in EITHER
    // direction, which is precisely this set. Moving it here anyway keeps all
    // cross-user profile reads on one code path, so the eventual fix (a
    // block-list-aware RPC) lands in one place. Blocking, unblocking and the
    // blocked-id set itself are unaffected — only the names/avatars are absent.
    fetchLeagueProfiles(Array.from(blockedIds)).then(setProfiles);
  }, [blockedIds]);

  return (
    <div className="space-y-2">
      {profiles.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
          <button
            onClick={() => { setOpen(false); navigate(`/user/${p.id}`); }}
            className="flex items-center gap-2.5 min-w-0"
          >
            <UserAvatar src={p.avatar_url} name={p.display_name || ""} size="md" />
            <span className="text-sm font-semibold text-foreground truncate">
              {p.display_name || "User"}
            </span>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUnblock(p.id)}
            className="h-8 text-xs"
          >
            Unblock
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function FloatingFriendsButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    friends,
    pendingRequests,
    sentRequests,
    loading,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    refresh: refreshFriends,
  } = useFriends();
  const { blockedIds, unblockUser } = useBlocks();
  const [open, setOpen] = useState(false);

  /**
   * COM1-1 / P0-2. Accept / decline / cancel / remove used to be fired and
   * forgotten: `useFriends` discarded the `{ error }` envelope, so a refused
   * write simply produced no visible change and no reason. Each now reports.
   *
   * Only FAILURE is announced. A successful accept or decline is already
   * legible — the row leaves the list — so a toast would be noise.
   */
  const runFriendAction = async (run: () => Promise<{ ok: boolean; error?: string }>) => {
    const result = await run();
    if (!result.ok && result.error) toast.error(result.error);
  };

  // Listen for mobile nav trigger
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-friends-panel", handler);
    return () => window.removeEventListener("open-friends-panel", handler);
  }, []);

  if (!user) return null;

  const openProfile = (profileId: string) => {
    setOpen(false);
    navigate(`/user/${profileId}`);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            aria-label="Friends"
            data-testid="friends-drawer-trigger"
            className="fixed bottom-6 left-6 z-40 h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-lg hidden sm:flex items-center justify-center hover:bg-primary/90 transition-colors"
          >
            <Users className="h-4 w-4" />
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
                {pendingRequests.length}
              </span>
            )}
          </motion.button>
        </SheetTrigger>

        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="text-lg font-extrabold">Friends</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="friends" className="flex flex-col h-full">
            <TabsList className="mx-4 mb-2 flex-wrap h-auto gap-1">
              <TabsTrigger value="friends" className="flex-1 text-xs">
                Friends ({friends.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex-1 text-xs relative">
                Requests
                {pendingRequests.length > 0 && (
                  <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                    {pendingRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex-1 text-xs">
                <Clock className="h-3.5 w-3.5 mr-1" /> Sent
              </TabsTrigger>
              <TabsTrigger value="blocked" className="flex-1 text-xs">
                <Ban className="h-3.5 w-3.5 mr-1" /> Blocked
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {/* Friends */}
              <TabsContent value="friends" className="mt-0">
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
                ) : friends.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No friends yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friends.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => openProfile(f.profile.id)}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <UserAvatar src={f.profile.avatar_url} name={f.profile.display_name || ""} size="md" />
                          <span className="text-sm font-semibold text-foreground truncate">
                            {f.profile.display_name || "User"}
                          </span>
                        </button>
                        <FriendActionMenu
                          targetProfileId={f.profile.id}
                          targetName={f.profile.display_name || "User"}
                          friendshipId={f.id}
                          onRemoveFriend={(id) => void runFriendAction(() => removeFriend(id))}
                          onBlocked={refreshFriends}
                          /* Safe here and only here: this tab renders
                             `friends`, which useFriends already filters to
                             status === "accepted". The Requests, Sent and
                             Blocked tabs must never pass this. */
                          canInviteToStatCheck
                        />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Incoming requests */}
              <TabsContent value="requests" className="mt-0">
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No pending requests</p>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => openProfile(r.profile.id)}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <UserAvatar src={r.profile.avatar_url} name={r.profile.display_name || ""} size="md" />
                          <span className="text-sm font-semibold text-foreground truncate">
                            {r.profile.display_name || "User"}
                          </span>
                        </button>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <Button
                            size="sm"
                            onClick={() => void runFriendAction(() => acceptRequest(r.id))}
                            className="h-8 px-3 text-xs"
                          >
                            Accept
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Decline request"
                            onClick={() => void runFriendAction(() => declineRequest(r.id))}
                            className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Outgoing requests */}
              <TabsContent value="sent" className="mt-0">
                {sentRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Clock className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No requests awaiting a reply</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sentRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => openProfile(r.profile.id)}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <UserAvatar src={r.profile.avatar_url} name={r.profile.display_name || ""} size="md" />
                          <span className="text-sm font-semibold text-foreground truncate">
                            {r.profile.display_name || "User"}
                          </span>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-muted-foreground">Pending</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label="Cancel request"
                            onClick={() => void runFriendAction(() => cancelRequest(r.id))}
                            className="h-8 px-2 text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Blocked */}
              <TabsContent value="blocked" className="mt-0">
                {blockedIds.size === 0 ? (
                  <div className="text-center py-8">
                    <Ban className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No blocked users</p>
                  </div>
                ) : (
                  <BlockedUsersList
                    blockedIds={blockedIds}
                    onUnblock={async (id) => {
                      const result = await unblockUser(id);
                      if (!result.ok) { toast.error(result.error); return; }
                      toast.success("User unblocked");
                    }}
                    navigate={navigate}
                    setOpen={setOpen}
                  />
                )}
              </TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
