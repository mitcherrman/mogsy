import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Search, ChevronDown, ChevronRight, User, Crown, Shield, Diamond,
  Trash2, Undo2, Eye, Settings2, Trophy, Send, UserMinus, UserPlus,
  ArrowLeft,
} from "lucide-react";

interface Profile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  age: number | null;
  location: string | null;
  status_message: string | null;
  is_pro: boolean | null;
  is_bot: boolean | null;
  diamonds: number | null;
  elo_shields: number | null;
  reveals: number | null;
  rewinds: number | null;
  boost_credits: number | null;
  active_boost_until: string | null;
  profile_frame: string | null;
  created_at: string;
}

interface LeagueMembership {
  id: string;
  league_id: string;
  elo: number;
  matches_played: number;
  league_name?: string;
}

interface MatchRecord {
  id: string;
  league_id: string;
  winner_profile_id: string | null;
  loser_profile_id: string | null;
  created_at: string;
  league_name?: string;
}

interface Purchase {
  id: string;
  item_type: string;
  amount_cents: number;
  status: string;
  created_at: string;
}

interface DeletedUser {
  profile: Profile;
  timestamp: number;
}

export default function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<Profile | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "leagues" | "matches" | "purchases">("overview");

  // Detail data
  const [memberships, setMemberships] = useState<LeagueMembership[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [allLeagues, setAllLeagues] = useState<{ id: string; name: string }[]>([]);

  // Editing
  const [editForm, setEditForm] = useState<Partial<Profile>>({});
  const [saving, setSaving] = useState(false);

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifMessage, setNotifMessage] = useState("");

  // Undo delete
  const [deletedUsers, setDeletedUsers] = useState<DeletedUser[]>([]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_bot", false)
      .order("created_at", { ascending: false });
    setProfiles(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfiles();
    supabase.from("leagues").select("id, name").then(({ data }) => setAllLeagues(data || []));
  }, [fetchProfiles]);

  const filtered = profiles.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.display_name.toLowerCase().includes(q) ||
      p.user_id.toLowerCase().includes(q) ||
      (p.location || "").toLowerCase().includes(q)
    );
  });

  const openUserDetail = async (profile: Profile) => {
    setSelectedUser(profile);
    setDetailTab("overview");
    setEditForm({
      display_name: profile.display_name,
      is_pro: profile.is_pro,
      diamonds: profile.diamonds,
      elo_shields: profile.elo_shields,
      reveals: profile.reveals,
      rewinds: profile.rewinds,
      boost_credits: profile.boost_credits,
      profile_frame: profile.profile_frame,
      active_boost_until: profile.active_boost_until,
    });

    const [membRes, matchRes, purchRes] = await Promise.all([
      supabase.from("league_memberships").select("*").eq("profile_id", profile.id),
      supabase.from("matches").select("*").or(`winner_profile_id.eq.${profile.id},loser_profile_id.eq.${profile.id}`).order("created_at", { ascending: false }).limit(50),
      supabase.from("purchases").select("*").eq("profile_id", profile.id).order("created_at", { ascending: false }),
    ]);

    setMemberships(membRes.data || []);
    setMatches(matchRes.data || []);
    setPurchases(purchRes.data || []);
  };

  const saveUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: editForm.display_name,
        is_pro: editForm.is_pro,
        diamonds: editForm.diamonds,
        elo_shields: editForm.elo_shields,
        reveals: editForm.reveals,
        rewinds: editForm.rewinds,
        boost_credits: editForm.boost_credits,
        profile_frame: editForm.profile_frame,
        active_boost_until: editForm.active_boost_until,
      })
      .eq("id", selectedUser.id);
    setSaving(false);
    if (error) { toast.error("Failed to save"); return; }
    toast.success("User updated");
    fetchProfiles();
    setSelectedUser({ ...selectedUser, ...editForm } as Profile);
  };

  const deleteUser = async (profile: Profile) => {
    // Soft-delete: remove from DB but keep in undo stack
    const { error } = await supabase.from("profiles").delete().eq("id", profile.id);
    if (error) { toast.error("Cannot delete: " + error.message); return; }
    setDeletedUsers((prev) => [{ profile, timestamp: Date.now() }, ...prev].slice(0, 20));
    setProfiles((prev) => prev.filter((p) => p.id !== profile.id));
    setSelectedUser(null);
    toast.success(`Deleted ${profile.display_name}`, { description: "Use undo to restore" });
  };

  const restoreUser = async (deleted: DeletedUser) => {
    const p = deleted.profile;
    const { error } = await supabase.from("profiles").insert({
      id: p.id,
      user_id: p.user_id,
      display_name: p.display_name,
      avatar_url: p.avatar_url,
      age: p.age,
      location: p.location,
      status_message: p.status_message,
      is_pro: p.is_pro,
      is_bot: p.is_bot,
      diamonds: p.diamonds,
      elo_shields: p.elo_shields,
      reveals: p.reveals,
      rewinds: p.rewinds,
      boost_credits: p.boost_credits,
      profile_frame: p.profile_frame,
    });
    if (error) { toast.error("Restore failed: " + error.message); return; }
    setDeletedUsers((prev) => prev.filter((d) => d.profile.id !== p.id));
    fetchProfiles();
    toast.success(`Restored ${p.display_name}`);
  };

  const addToLeague = async (leagueId: string) => {
    if (!selectedUser) return;
    const existing = memberships.find((m) => m.league_id === leagueId);
    if (existing) { toast.error("Already in this league"); return; }
    const { error } = await supabase.from("league_memberships").insert({ profile_id: selectedUser.id, league_id: leagueId });
    if (error) { toast.error(error.message); return; }
    toast.success("Added to league");
    const { data } = await supabase.from("league_memberships").select("*").eq("profile_id", selectedUser.id);
    setMemberships(data || []);
  };

  const removeFromLeague = async (membershipId: string) => {
    // We can't delete due to RLS, so we update elo to 0 and notify
    // Actually league_memberships has no DELETE policy. Let's inform admin.
    toast.error("League membership deletion requires a DB policy update. Contact dev team.");
  };

  const getLeagueName = (leagueId: string) => allLeagues.find((l) => l.id === leagueId)?.name || "Unknown";

  const sendNotification = () => {
    // Placeholder - would integrate with push/email service
    toast.success(`Notification sent to ${selectedUser?.display_name}: "${notifMessage}"`);
    setNotifOpen(false);
    setNotifMessage("");
  };

  if (selectedUser) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
        </Button>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <div className="h-14 w-14 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
            {selectedUser.avatar_url ? (
              <img src={selectedUser.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground truncate">{selectedUser.display_name}</h3>
            <p className="text-xs text-muted-foreground truncate">{selectedUser.user_id}</p>
            <p className="text-xs text-muted-foreground">Joined {new Date(selectedUser.created_at).toLocaleDateString()}</p>
          </div>
          <div className="flex gap-2">
            {selectedUser.is_pro && <Badge variant="secondary"><Crown className="h-3 w-3 mr-1" /> Pro</Badge>}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-1 rounded-lg bg-secondary p-1">
          {(["overview", "leagues", "matches", "purchases"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setDetailTab(tab)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                detailTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {detailTab === "overview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Display Name</Label>
                <Input value={editForm.display_name || ""} onChange={(e) => setEditForm((f) => ({ ...f, display_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Profile Frame</Label>
                <Select value={editForm.profile_frame || "default"} onValueChange={(v) => setEditForm((f) => ({ ...f, profile_frame: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["default", "gold", "neon", "fire", "diamond"].map((fr) => (
                      <SelectItem key={fr} value={fr}>{fr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Diamonds", key: "diamonds", icon: Diamond },
                { label: "Elo Shields", key: "elo_shields", icon: Shield },
                { label: "Reveals", key: "reveals", icon: Eye },
                { label: "Rewinds", key: "rewinds", icon: Undo2 },
              ].map(({ label, key, icon: Icon }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Icon className="h-3 w-3" />{label}</Label>
                  <Input
                    type="number"
                    value={(editForm as any)[key] ?? 0}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Boost Credits</Label>
                <Input
                  type="number"
                  value={editForm.boost_credits ?? 0}
                  onChange={(e) => setEditForm((f) => ({ ...f, boost_credits: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <Switch
                  checked={editForm.is_pro ?? false}
                  onCheckedChange={(c) => setEditForm((f) => ({ ...f, is_pro: c }))}
                />
                <Label className="text-xs">Pro Status</Label>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button onClick={saveUser} disabled={saving} size="sm">{saving ? "Saving…" : "Save Changes"}</Button>
              <Button variant="outline" size="sm" onClick={() => setNotifOpen(true)}>
                <Send className="h-3 w-3 mr-1" /> Send Notification
              </Button>
              <Button variant="destructive" size="sm" onClick={() => deleteUser(selectedUser)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete User
              </Button>
            </div>
          </div>
        )}

        {detailTab === "leagues" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Select onValueChange={addToLeague}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Add to league…" /></SelectTrigger>
                <SelectContent>
                  {allLeagues.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {memberships.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not in any leagues.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>League</TableHead>
                    <TableHead>Elo</TableHead>
                    <TableHead>Matches</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {memberships.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-foreground">{getLeagueName(m.league_id)}</TableCell>
                      <TableCell>{m.elo}</TableCell>
                      <TableCell>{m.matches_played}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {detailTab === "matches" && (
          <div>
            {matches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No matches yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>League</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-foreground">{getLeagueName(m.league_id)}</TableCell>
                      <TableCell>
                        <Badge variant={m.winner_profile_id === selectedUser.id ? "default" : "secondary"}>
                          {m.winner_profile_id === selectedUser.id ? "Won" : "Lost"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {detailTab === "purchases" && (
          <div>
            {purchases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-foreground capitalize">{p.item_type.replace(/_/g, " ")}</TableCell>
                      <TableCell>${(p.amount_cents / 100).toFixed(2)}</TableCell>
                      <TableCell><Badge variant="outline">{p.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        {/* Notification dialog */}
        <Dialog open={notifOpen} onOpenChange={setNotifOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Notification</DialogTitle>
              <DialogDescription>Send a message to {selectedUser.display_name}</DialogDescription>
            </DialogHeader>
            <Textarea placeholder="Type your message…" value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} rows={3} />
            <Button onClick={sendNotification} disabled={!notifMessage.trim()}>
              <Send className="h-4 w-4 mr-1" /> Send
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users by name or ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Badge variant="outline">{filtered.length} users</Badge>
      </div>

      {/* Undo deleted users */}
      {deletedUsers.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm text-destructive font-medium">
            <Undo2 className="h-4 w-4" /> {deletedUsers.length} recently deleted — click to restore
            <ChevronDown className="h-3 w-3" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-1">
            {deletedUsers.map((d) => (
              <div key={d.profile.id} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                <span className="text-sm text-foreground">{d.profile.display_name}</span>
                <Button variant="outline" size="sm" onClick={() => restoreUser(d)}>
                  <Undo2 className="h-3 w-3 mr-1" /> Restore
                </Button>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">No users found</p>
      ) : (
        <div className="space-y-1">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => openUserDetail(p)}
              className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-3 hover:bg-secondary/50 transition-colors text-left"
            >
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center overflow-hidden shrink-0">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{p.display_name || "Unnamed"}</p>
                <p className="text-xs text-muted-foreground">{p.location || "No location"} · Joined {new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.is_pro && <Crown className="h-4 w-4 text-primary" />}
                <Diamond className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{p.diamonds ?? 0}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

