import { useState } from "react";
import { Users, UserPlus, UserCheck, UserX, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import UserAvatar from "@/components/UserAvatar";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export default function FloatingFriendsButton() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { friends, pendingRequests, loading, acceptRequest, declineRequest, removeFriend, sendRequest, myProfileId } = useFriends();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  if (!user) return null;

  const handleSearch = async () => {
    if (!searchQuery.trim() || !myProfileId) return;
    setSearching(true);
    const { data } = await supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .ilike("display_name", `%${searchQuery.trim()}%`)
      .neq("id", myProfileId)
      .eq("is_anonymous", false)
      .limit(10);
    setSearchResults((data || []).filter((p) => p.id) as SearchResult[]);
    setSearching(false);
  };

  const handleSendRequest = async (targetId: string) => {
    await sendRequest(targetId);
    setSentIds((prev) => new Set(prev).add(targetId));
  };

  const friendIds = new Set(friends.map((f) => f.profile.id));
  const pendingIds = new Set(pendingRequests.map((r) => r.profile.id));

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="fixed bottom-[4.5rem] sm:bottom-6 left-3 sm:left-6 z-40 h-9 w-9 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
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
            <TabsList className="mx-4 mb-2">
              <TabsTrigger value="friends" className="flex-1">
                Friends ({friends.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex-1 relative">
                Requests
                {pendingRequests.length > 0 && (
                  <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                    {pendingRequests.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="search" className="flex-1">
                <Search className="h-3.5 w-3.5 mr-1" /> Find
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {/* Friends Tab */}
              <TabsContent value="friends" className="mt-0">
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
                ) : friends.length === 0 ? (
                  <div className="text-center py-8">
                    <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No friends yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Search for users to add friends</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {friends.map((f) => (
                      <div key={f.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => { setOpen(false); navigate(`/user/${f.profile.id}`); }}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <UserAvatar src={f.profile.avatar_url} name={f.profile.display_name || ""} size="md" />
                          <span className="text-sm font-semibold text-foreground truncate">
                            {f.profile.display_name || "User"}
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFriend(f.id)}
                          className="text-muted-foreground hover:text-destructive flex-shrink-0"
                        >
                          <UserX className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Requests Tab */}
              <TabsContent value="requests" className="mt-0">
                {pendingRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No pending requests</p>
                ) : (
                  <div className="space-y-2">
                    {pendingRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => { setOpen(false); navigate(`/user/${r.profile.id}`); }}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <UserAvatar src={r.profile.avatar_url} name={r.profile.display_name || ""} size="md" />
                          <span className="text-sm font-semibold text-foreground truncate">
                            {r.profile.display_name || "User"}
                          </span>
                        </button>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <Button size="sm" onClick={() => acceptRequest(r.id)} className="h-8 px-3 text-xs">
                            Accept
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => declineRequest(r.id)} className="h-8 px-2 text-muted-foreground hover:text-destructive">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Search Tab */}
              <TabsContent value="search" className="mt-0">
                <div className="flex gap-2 mb-3">
                  <Input
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="h-9"
                  />
                  <Button size="sm" onClick={handleSearch} disabled={searching} className="h-9 px-3">
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {searchResults.map((r) => {
                    const isFriend = friendIds.has(r.id);
                    const isPending = pendingIds.has(r.id) || sentIds.has(r.id);
                    return (
                      <div key={r.id} className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5">
                        <button
                          onClick={() => { setOpen(false); navigate(`/user/${r.id}`); }}
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <UserAvatar src={r.avatar_url} name={r.display_name || ""} size="md" />
                          <span className="text-sm font-semibold text-foreground truncate">
                            {r.display_name || "User"}
                          </span>
                        </button>
                        {isFriend ? (
                          <span className="text-xs text-primary font-medium flex items-center gap-1">
                            <UserCheck className="h-3.5 w-3.5" /> Friends
                          </span>
                        ) : isPending ? (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendRequest(r.id)}
                            className="h-8 px-3 text-xs"
                          >
                            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  );
}
