import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, Save, Shield, UserPlus, Pencil, X, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const showPersistentError = (message: string) => {
  toast.error(message, {
    duration: Infinity,
    action: {
      label: "Copy",
      onClick: () => navigator.clipboard.writeText(message),
    },
  });
};

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
  league_id: string;
}

interface League {
  id: string;
  name: string;
}

interface BotProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  age: number | null;
  location: string | null;
  status_message: string | null;
}

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [items, setItems] = useState<PresetItem[]>([]);
  const [botProfiles, setBotProfiles] = useState<BotProfile[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", image_url: "" });
  const [newBot, setNewBot] = useState({ display_name: "", avatar_url: "", age: "", location: "", status_message: "" });

  useEffect(() => {
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    if (!user) { navigate("/auth"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin");
    if (!data || data.length === 0) {
      navigate("/");
      toast.error("Access denied");
      return;
    }
    setIsAdmin(true);
    loadData();
  };

  const loadData = async () => {
    const [{ data: leaguesData }, { data: bots }] = await Promise.all([
      supabase.from("leagues").select("id, name").eq("type", "preset"),
      supabase.from("profiles").select("id, display_name, avatar_url, age, location, status_message").eq("is_bot", true),
    ]);
    if (leaguesData) {
      setLeagues(leaguesData);
      if (leaguesData.length > 0) {
        setSelectedLeague(leaguesData[0].id);
        loadItems(leaguesData[0].id);
      }
    }
    if (bots) setBotProfiles(bots);
    setLoading(false);
  };

  const loadItems = async (leagueId: string) => {
    const { data } = await supabase.from("preset_items").select("*").eq("league_id", leagueId).order("name");
    if (data) setItems(data);
  };

  const handleLeagueChange = (id: string) => {
    setSelectedLeague(id);
    loadItems(id);
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim()) return;
    const { error } = await supabase.from("preset_items").insert({
      league_id: selectedLeague,
      name: newItem.name,
      image_url: newItem.image_url || null,
    });
    if (error) { showPersistentError(error.message); return; }
    toast.success("Item added");
    setNewItem({ name: "", image_url: "" });
    loadItems(selectedLeague);
  };

  const handleUpdateItem = async (item: PresetItem) => {
    const { error } = await supabase.from("preset_items").update({ name: item.name, image_url: item.image_url }).eq("id", item.id);
    if (error) { showPersistentError(error.message); return; }
    toast.success("Updated");
    setEditingItem(null);
    loadItems(selectedLeague);
  };

  const handleDeleteItem = async (id: string) => {
    const { error } = await supabase.from("preset_items").delete().eq("id", id);
    if (error) { showPersistentError(error.message); return; }
    toast.success("Deleted");
    loadItems(selectedLeague);
  };

  const handleCreateBot = async () => {
    if (!newBot.display_name.trim()) return;
    const { error } = await supabase.from("profiles").insert({
      user_id: crypto.randomUUID(),
      display_name: newBot.display_name,
      avatar_url: newBot.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${newBot.display_name}`,
      age: newBot.age ? parseInt(newBot.age) : null,
      location: newBot.location || null,
      status_message: newBot.status_message || null,
      is_bot: true,
    });
    if (error) { showPersistentError(error.message); return; }
    toast.success("Bot profile created");
    setNewBot({ display_name: "", avatar_url: "", age: "", location: "", status_message: "" });
    loadData();
  };

  const handleDeleteBot = async (id: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) { showPersistentError(error.message); return; }
    toast.success("Bot deleted");
    loadData();
  };

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-7 w-7 text-accent" />
          <h1 className="text-3xl font-extrabold text-foreground">Admin Panel</h1>
        </div>

        <Tabs defaultValue="items" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="items">Preset Items</TabsTrigger>
            <TabsTrigger value="bots">Bot Profiles</TabsTrigger>
          </TabsList>

          <TabsContent value="items" className="space-y-6">
            {/* League selector */}
            <div className="flex flex-wrap gap-2">
              {leagues.map((l) => (
                <Button
                  key={l.id}
                  variant={selectedLeague === l.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleLeagueChange(l.id)}
                >
                  {l.name}
                </Button>
              ))}
            </div>

            {/* Add new item */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-bold text-foreground flex items-center gap-2"><Plus className="h-4 w-4" /> Add Item</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Name</Label>
                  <Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Item name" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Image URL</Label>
                  <Input value={newItem.image_url} onChange={(e) => setNewItem({ ...newItem, image_url: e.target.value })} placeholder="https://..." />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleAddItem} className="w-full">Add</Button>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div className="space-y-2">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <div className="h-10 w-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-contain p-1" onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&size=40`;
                      }} />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground font-bold">{item.name.charAt(0)}</div>
                    )}
                  </div>
                  {editingItem === item.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        defaultValue={item.name}
                        onChange={(e) => { item.name = e.target.value; }}
                        className="text-sm"
                      />
                      <Input
                        defaultValue={item.image_url || ""}
                        onChange={(e) => { item.image_url = e.target.value; }}
                        placeholder="Image URL"
                        className="text-sm"
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleUpdateItem(item)}><Save className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Elo: {item.elo}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => setEditingItem(item.id)} className="text-muted-foreground hover:text-foreground">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteItem(item.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="bots" className="space-y-6">
            {/* Create bot */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <h3 className="font-bold text-foreground flex items-center gap-2"><UserPlus className="h-4 w-4" /> Create Bot Profile</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label className="text-xs">Display Name</Label><Input value={newBot.display_name} onChange={(e) => setNewBot({ ...newBot, display_name: e.target.value })} placeholder="Bot Name" /></div>
                <div className="space-y-1"><Label className="text-xs">Avatar URL</Label><Input value={newBot.avatar_url} onChange={(e) => setNewBot({ ...newBot, avatar_url: e.target.value })} placeholder="https://..." /></div>
                <div className="space-y-1"><Label className="text-xs">Age</Label><Input type="number" value={newBot.age} onChange={(e) => setNewBot({ ...newBot, age: e.target.value })} placeholder="25" /></div>
                <div className="space-y-1"><Label className="text-xs">Location</Label><Input value={newBot.location} onChange={(e) => setNewBot({ ...newBot, location: e.target.value })} placeholder="New York, NY" /></div>
                <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Status Message</Label><Input value={newBot.status_message} onChange={(e) => setNewBot({ ...newBot, status_message: e.target.value })} placeholder="Living my best life..." /></div>
              </div>
              <Button onClick={handleCreateBot} className="gap-1.5"><UserPlus className="h-4 w-4" /> Create</Button>
            </div>

            {/* Bot list */}
            <div className="space-y-2">
              {botProfiles.map((bot) => (
                <div key={bot.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <img
                    src={bot.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${bot.display_name}`}
                    alt={bot.display_name}
                    className="h-10 w-10 rounded-full object-cover bg-secondary"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{bot.display_name}</p>
                    <p className="text-xs text-muted-foreground">{bot.location || "No location"} · {bot.age || "?"} yrs</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDeleteBot(bot.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {botProfiles.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No bot profiles yet.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
