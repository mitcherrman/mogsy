import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, UserPlus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BotProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  age: number | null;
  location: string | null;
  status_message: string | null;
}

const RANDOM_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Quinn", "Skyler", "Avery", "Dakota",
  "Sage", "Phoenix", "River", "Ember", "Aspen", "Kai", "Luna", "Nova", "Zara", "Milo",
  "Aria", "Finn", "Ivy", "Leo", "Ruby", "Theo", "Hazel", "Jasper", "Cleo", "Orion",
];
const RANDOM_LOCATIONS = [
  "New York, NY", "Los Angeles, CA", "London, UK", "Tokyo, JP", "Paris, FR", "Seoul, KR",
  "Berlin, DE", "Sydney, AU", "Toronto, CA", "Miami, FL", "Chicago, IL", "Portland, OR",
];
const RANDOM_STATUSES = [
  "Living my best life ✨", "Just vibing 🎶", "Coffee addict ☕", "Adventure awaits 🌍",
  "Night owl 🦉", "Dog lover 🐶", "Gym rat 💪", "Bookworm 📚", "Foodie 🍕", "Dreamer 💭",
];

export default function AdminBots() {
  const [botProfiles, setBotProfiles] = useState<BotProfile[]>([]);
  const [newBot, setNewBot] = useState({ display_name: "", avatar_url: "", age: "", location: "", status_message: "" });
  const [bulkCount, setBulkCount] = useState("5");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    const { data } = await supabase.from("profiles").select("id, display_name, avatar_url, age, location, status_message").eq("is_bot", true).order("created_at", { ascending: false });
    if (data) setBotProfiles(data);
  };

  const handleCreateBot = async () => {
    if (!newBot.display_name.trim()) return;
    const { error } = await supabase.from("profiles").insert({
      user_id: crypto.randomUUID(),
      display_name: newBot.display_name,
      avatar_url: newBot.avatar_url || `https://i.pravatar.cc/500?u=${newBot.display_name}`,
      age: newBot.age ? parseInt(newBot.age) : null,
      location: newBot.location || null,
      status_message: newBot.status_message || null,
      is_bot: true,
    });
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    toast.success("Bot created");
    setNewBot({ display_name: "", avatar_url: "", age: "", location: "", status_message: "" });
    loadBots();
  };

  const handleDeleteBot = async (id: string) => {
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    toast.success("Bot deleted");
    loadBots();
  };

  const handleBulkGenerate = async () => {
    const count = Math.min(Math.max(parseInt(bulkCount) || 1, 1), 50);
    setGenerating(true);
    const bots = [];
    for (let i = 0; i < count; i++) {
      const name = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 999);
      bots.push({
        user_id: crypto.randomUUID(),
        display_name: name,
        avatar_url: `https://i.pravatar.cc/500?u=${name}${Date.now()}`,
        age: 18 + Math.floor(Math.random() * 30),
        location: RANDOM_LOCATIONS[Math.floor(Math.random() * RANDOM_LOCATIONS.length)],
        status_message: RANDOM_STATUSES[Math.floor(Math.random() * RANDOM_STATUSES.length)],
        is_bot: true,
      });
    }
    const { error } = await supabase.from("profiles").insert(bots);
    setGenerating(false);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    toast.success(`${count} bot profiles generated!`);
    loadBots();
  };

  const handleDeleteAllBots = async () => {
    const { error } = await supabase.from("profiles").delete().eq("is_bot", true);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    toast.success("All bots deleted");
    loadBots();
  };

  return (
    <div className="space-y-6">
      {/* Single bot creation */}
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

      {/* Bulk generation */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-bold text-foreground flex items-center gap-2"><Sparkles className="h-4 w-4" /> Bulk Generate Bots</h3>
        <p className="text-xs text-muted-foreground">Generate random bot profiles for testing (max 50 at a time)</p>
        <div className="flex gap-3 items-end">
          <div className="space-y-1 w-24">
            <Label className="text-xs">Count</Label>
            <Input type="number" min="1" max="50" value={bulkCount} onChange={(e) => setBulkCount(e.target.value)} />
          </div>
          <Button onClick={handleBulkGenerate} disabled={generating} className="gap-1.5">
            <Sparkles className="h-4 w-4" /> {generating ? "Generating…" : "Generate"}
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDeleteAllBots} className="ml-auto gap-1.5">
            <Trash2 className="h-4 w-4" /> Delete All Bots
          </Button>
        </div>
      </div>

      {/* Bot list */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Bot Profiles ({botProfiles.length})
        </h3>
        <div className="space-y-2">
          {botProfiles.map((bot) => (
            <div key={bot.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <img src={bot.avatar_url || `https://api.dicebear.com/9.x/avataaars/svg?seed=${bot.display_name}`} alt={bot.display_name} className="h-10 w-10 rounded-full object-cover bg-secondary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{bot.display_name}</p>
                <p className="text-xs text-muted-foreground">{bot.location || "No location"} · {bot.age || "?"} yrs</p>
              </div>
              <Button size="icon" aria-label="Delete" variant="ghost" onClick={() => handleDeleteBot(bot.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          {botProfiles.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No bot profiles yet.</p>}
        </div>
      </div>
    </div>
  );
}
