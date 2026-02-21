import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Plus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";

interface PresetLeague {
  id: string;
  name: string;
  description: string;
  itemCount: number;
}

export default function Presets() {
  const [isPro] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [presets, setPresets] = useState<PresetLeague[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    const { data: leagues } = await supabase.from("leagues").select("*").eq("type", "preset");
    if (leagues) {
      // Get item counts
      const mapped = await Promise.all(
        leagues.map(async (l: any) => {
          const { count } = await supabase.from("preset_items").select("*", { count: "exact", head: true }).eq("league_id", l.id);
          return { id: l.id, name: l.name, description: l.description || "", itemCount: count || 0 };
        })
      );
      setPresets(mapped);
    }
    setLoading(false);
  };

  const getIcon = (name: string) => {
    if (name.includes("Restaurant")) return "🍽️";
    if (name.includes("Fast Food")) return "🍔";
    if (name.includes("2025")) return "🎬";
    if (name.includes("All Time")) return "🏆";
    if (name.includes("Celebrity")) return "⭐";
    if (name.includes("Car")) return "🏎️";
    if (name.includes("Anime")) return "🎌";
    return "📋";
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">Preset Leagues</h1>
            <p className="text-muted-foreground text-sm mt-1">Vote on categories beyond user profiles</p>
          </div>
          <Button variant={isPro ? "default" : "accent"} onClick={() => setShowCreate(!showCreate)}>
            {isPro ? <><Plus className="h-4 w-4" /> Create</> : <><Lock className="h-4 w-4" /> Create Custom</>}
          </Button>
        </div>

        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mb-8 rounded-2xl border border-border bg-card p-6">
            {!isPro ? (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 text-accent mx-auto mb-4" />
                <h3 className="text-xl font-bold text-foreground mb-2">Upgrade to Pro</h3>
                <p className="text-muted-foreground text-sm mb-4">Create unlimited custom preset leagues with a Pro subscription.</p>
                <Button variant="hero" size="lg">Upgrade — $9.99/mo</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground">Create Custom League</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Title</Label><Input placeholder="Best Pizza Place" /></div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="things">Things / Entities</option>
                      <option value="users">Users</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea placeholder="Describe this league..." rows={2} /></div>
                </div>
                <Button variant="hero">Create League</Button>
              </div>
            )}
          </motion.div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset, i) => (
            <motion.div key={preset.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link to={`/swipe/preset/${preset.id}`} className="block rounded-2xl border border-border bg-card p-6 card-hover">
                <div className="text-4xl mb-3">{getIcon(preset.name)}</div>
                <h3 className="text-lg font-bold text-foreground">{preset.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{preset.itemCount} items · Vote now</p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
