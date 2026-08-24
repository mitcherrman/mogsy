/**
 * Mogzy Community drawer.
 *
 * Reduced from the legacy Mogsy social panel to the surfaces a League player
 * needs: who your friends are, who wants to be one, who you have asked, who you
 * have blocked, and — from COM1-2 — how to find someone in the first place.
 *
 * "Saved" is still gone and stays gone: bookmarking strangers' profiles is
 * dating-app behaviour. The `saved_profiles` rows are untouched; nothing reads
 * them here.
 *
 * FIND PLAYERS (COM1-2)
 * The legacy "Find" tab searched `public_profiles` — a `security_invoker` view
 * over owner-only RLS — and so returned an empty list for every query. It was
 * removed for that reason, and the removal note said adding friends therefore
 * had no entry point. It now has one: `FindPlayersTab` searches
 * `public.search_league_profiles`, a SECURITY DEFINER RPC over the AUTH3
 * normalised username. `public.profiles` RLS is unchanged and still owner-only.
 *
 * USERS (COM1-2)
 * An admin-only tab that is an ENTRY POINT into the existing admin user
 * management, not a second copy of it. It renders only for a resolved master
 * admin, and the privileged read lives inside the tab component, so an ordinary
 * user's client never issues it.
 *
 * REACHABILITY (COM1-2)
 * The trigger used to be `hidden sm:flex`, and the HUD's Friends entry sits
 * inside `{!LEAGUE_ONLY_MODE && …}` — which is false in production. Between
 * them, a phone had NO way to open this drawer unless a friend-request
 * notification happened to be waiting. The trigger is now visible at every
 * width; on mobile the bottom-left slot is otherwise empty, because
 * `FloatingScrollButton` shares the coordinates but is itself `hidden sm:flex`.
 *
 * Inviting a known friend to Stat Check has an entry point on the Friends tab,
 * which passes `canInviteToStatCheck` to FriendActionMenu. Only that tab may —
 * it is the only one whose rows are guaranteed `status === "accepted"`. The
 * backend re-derives the sender from the JWT and re-checks friendship and
 * blocks anyway, so the prop is an affordance, not the security boundary.
 */
import { useState, useEffect, useCallback } from "react";
import { Users, Clock, X, Ban, UserRoundSearch, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import UserAvatar from "@/components/UserAvatar";
import FriendActionMenu from "@/components/FriendActionMenu";
import FindPlayersTab from "@/components/community/FindPlayersTab";
import CommunityUsersTab from "@/components/community/CommunityUsersTab";
import { useFriends } from "@/hooks/useFriends";
import { useBlocks } from "@/hooks/useBlocks";
import { useAdminRoles } from "@/hooks/useAdminRoles";
import { useAuth } from "@/hooks/useAuth";
import { fetchBlockedProfiles, type BlockedProfile } from "@/lib/community/discovery";
import type { SocialResult } from "@/lib/community/social-result";
import { toast } from "sonner";

function BlockedUsersList({
  version,
  onUnblock,
  navigate,
  setOpen,
}: {
  /** Bumped by the parent after any block change, to force a re-read. */
  version: number;
  onUnblock: (id: string) => Promise<void>;
  navigate: (path: string) => void;
  setOpen: (v: boolean) => void;
}) {
  const [profiles, setProfiles] = useState<BlockedProfile[]>([]);

  useEffect(() => {
    // COM1-2. This list rendered empty from the day it was written. It read
    // names through `get_league_profiles`, which filters out every profile
    // blocked in EITHER direction — precisely this set — so that RPC could
    // never return them. `get_blocked_profiles` is the block-aware read: it
    // returns only rows the caller blocked, and cannot be used to learn who
    // blocked the caller.
    let cancelled = false;
    void fetchBlockedProfiles().then((rows) => {
      if (!cancelled) setProfiles(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  if (profiles.length === 0) {
    return (
      <div className="py-8 text-center" data-testid="blocked-empty">
        <Ban className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" aria-hidden />
        <p className="text-sm text-muted-foreground">No blocked users</p>
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="blocked-list">
      {profiles.map((p) => (
        <div
          key={p.id}
          data-testid={`blocked-${p.id}`}
          className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5"
        >
          <button
            onClick={() => { setOpen(false); navigate(`/user/${p.id}`); }}
            className="flex min-w-0 items-center gap-2.5"
          >
            <UserAvatar src={p.avatarUrl} name={p.displayName || ""} size="md" />
            <span className="truncate text-sm font-semibold text-foreground">
              {p.displayName || "User"}
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
    sendRequest,
    acceptRequest,
    declineRequest,
    cancelRequest,
    removeFriend,
    refresh: refreshFriends,
  } = useFriends();
  const { unblockUser } = useBlocks();
  // Presentation only. `admin_list_profiles()` raises unless has_role(admin)
  // and every admin mutation re-checks is_master_admin server-side; this hook
  // grants nothing. What it buys is that a non-admin never MOUNTS the tab, so
  // the privileged read is never issued from their client.
  const { isMasterAdmin } = useAdminRoles();
  const [open, setOpen] = useState(false);
  // Incremented after any block change so the Blocked tab re-reads rather than
  // trusting a list it fetched before the mutation.
  const [blockVersion, setBlockVersion] = useState(0);

  /**
   * COM1-1 / P0-2. Accept / decline / cancel / remove report their outcome.
   * Only FAILURE is announced: a successful accept or decline is already
   * legible — the row leaves the list — so a toast would be noise.
   */
  const runFriendAction = async (run: () => Promise<{ ok: boolean; error?: string }>) => {
    const result = await run();
    if (!result.ok && result.error) toast.error(result.error);
  };

  const handleUnblock = useCallback(
    async (targetProfileId: string): Promise<SocialResult> => {
      const result = await unblockUser(targetProfileId);
      setBlockVersion((v) => v + 1);
      await refreshFriends();
      return result;
    },
    [unblockUser, refreshFriends],
  );

  // Listen for the HUD's Community entry and for the friend_request
  // notification, both of which dispatch this event.
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
            aria-label="Community"
            data-testid="friends-drawer-trigger"
            /* COM1-2 / P1-2: `hidden sm:flex` is gone. This was the only
               trigger in League mode, so a phone could not open the drawer at
               all. The bottom-left slot is free on mobile — FloatingScrollButton
               shares the coordinates but is itself `hidden sm:flex`. */
            className="fixed bottom-6 left-6 z-40 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
          >
            <Users className="h-4 w-4" />
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                {pendingRequests.length}
              </span>
            )}
          </motion.button>
        </SheetTrigger>

        <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl p-0">
          <SheetHeader className="px-4 pb-2 pt-4">
            <SheetTitle className="text-lg font-extrabold">Community</SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="friends" className="flex h-full flex-col">
            <TabsList className="mx-4 mb-2 h-auto flex-wrap gap-1">
              <TabsTrigger value="friends" className="flex-1 text-xs">
                Friends ({friends.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="relative flex-1 text-xs">
                Requests
                {pendingRequests.length > 0 && (
                  <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {pendingRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="sent" className="flex-1 text-xs">
                <Clock className="mr-1 h-3.5 w-3.5" /> Sent
              </TabsTrigger>
              <TabsTrigger value="find" className="flex-1 text-xs">
                <UserRoundSearch className="mr-1 h-3.5 w-3.5" /> Find Players
              </TabsTrigger>
              <TabsTrigger value="blocked" className="flex-1 text-xs">
                <Ban className="mr-1 h-3.5 w-3.5" /> Blocked
              </TabsTrigger>
              {isMasterAdmin && (
                <TabsTrigger
                  value="users"
                  className="flex-1 text-xs"
                  data-testid="community-tab-users"
                >
                  <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Users
                </TabsTrigger>
              )}
            </TabsList>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {/* Friends */}
              <TabsContent value="friends" className="mt-0">
                {loading ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
                ) : friends.length === 0 ? (
                  <div className="py-8 text-center">
                    <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No friends yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friends.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => openProfile(f.profile.id)}
                          className="flex min-w-0 items-center gap-2.5"
                        >
                          <UserAvatar src={f.profile.avatar_url} name={f.profile.display_name || ""} size="md" />
                          <span className="truncate text-sm font-semibold text-foreground">
                            {f.profile.display_name || "User"}
                          </span>
                        </button>
                        <FriendActionMenu
                          targetProfileId={f.profile.id}
                          targetName={f.profile.display_name || "User"}
                          friendshipId={f.id}
                          onRemoveFriend={(id) => void runFriendAction(() => removeFriend(id))}
                          onBlocked={() => {
                            setBlockVersion((v) => v + 1);
                            void refreshFriends();
                          }}
                          /* Safe here and only here: this tab renders
                             `friends`, which useFriends already filters to
                             status === "accepted". The other tabs must not
                             pass this. */
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
                  <p className="py-8 text-center text-sm text-muted-foreground">No pending requests</p>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => openProfile(r.profile.id)}
                          className="flex min-w-0 items-center gap-2.5"
                        >
                          <UserAvatar src={r.profile.avatar_url} name={r.profile.display_name || ""} size="md" />
                          <span className="truncate text-sm font-semibold text-foreground">
                            {r.profile.display_name || "User"}
                          </span>
                        </button>
                        <div className="flex flex-shrink-0 gap-1.5">
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
                  <div className="py-8 text-center">
                    <Clock className="mx-auto mb-2 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No requests awaiting a reply</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sentRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => openProfile(r.profile.id)}
                          className="flex min-w-0 items-center gap-2.5"
                        >
                          <UserAvatar src={r.profile.avatar_url} name={r.profile.display_name || ""} size="md" />
                          <span className="truncate text-sm font-semibold text-foreground">
                            {r.profile.display_name || "User"}
                          </span>
                        </button>
                        <div className="flex flex-shrink-0 items-center gap-2">
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

              {/* Find Players */}
              <TabsContent value="find" className="mt-0">
                <FindPlayersTab
                  onAddFriend={sendRequest}
                  onAcceptRequest={acceptRequest}
                  onUnblock={handleUnblock}
                  onOpenProfile={openProfile}
                />
              </TabsContent>

              {/* Blocked */}
              <TabsContent value="blocked" className="mt-0">
                <BlockedUsersList
                  version={blockVersion}
                  onUnblock={async (id) => {
                    const result = await handleUnblock(id);
                    if (!result.ok) { toast.error(result.error); return; }
                    toast.success("User unblocked");
                  }}
                  navigate={navigate}
                  setOpen={setOpen}
                />
              </TabsContent>

              {/* Users — admin only. Mounted only when the role has resolved to
                  master admin, so the privileged read is never issued for an
                  ordinary user. Radix unmounts inactive TabsContent, so it is
                  not even fetched until the tab is opened. */}
              {isMasterAdmin && (
                <TabsContent value="users" className="mt-0">
                  <CommunityUsersTab />
                </TabsContent>
              )}
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
