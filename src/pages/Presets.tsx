import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Plus, Sparkles, Megaphone, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

interface PresetLeague {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  isPromoted: boolean;
  promotedBrandName: string | null;
  category: string | null;
}

export default function Presets() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isPro, setIsPro] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [presets, setPresets] = useState<PresetLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLeague, setNewLeague] = useState({ name: "", description: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadPresets();
  }, [user]);

  const loadPresets = async () => {
    // Check pro status
    if (user) {
      const { data: profile } = await supabase
        .from("profiles").select("is_pro").eq("user_id", user.id).single();
      if (profile?.is_pro) setIsPro(true);
    }

    const { data: leagues } = await supabase
      .from("leagues")
      .select("id, name, description, is_promoted, promoted_brand_name, category")
      .eq("type", "preset");
    if (leagues) {
      const mapped = await Promise.all(
        leagues.map(async (l: any) => {
          const { count } = await supabase.from("preset_items").select("*", { count: "exact", head: true }).eq("league_id", l.id);
          return {
            id: l.id, name: l.name, description: l.description || "",
            itemCount: count || 0,
            isPromoted: l.is_promoted || false,
            promotedBrandName: l.promoted_brand_name,
            category: (l as any).category || null,
          };
        })
      );
      // Sort promoted first
      mapped.sort((a, b) => (b.isPromoted ? 1 : 0) - (a.isPromoted ? 1 : 0));
      setPresets(mapped);
    }
    setLoading(false);
  };

  const handleCreateLeague = async () => {
    if (!newLeague.name.trim() || !user) return;
    setCreating(true);
    const { error } = await supabase.from("leagues").insert({
      name: newLeague.name,
      description: newLeague.description,
      type: "preset",
      created_by_user_id: user.id,
    });
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "League created!" });
      setNewLeague({ name: "", description: "" });
      setShowCreate(false);
      loadPresets();
    }
    setCreating(false);
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
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-extrabold text-foreground">Preset Leagues</h1>
              <p className="text-muted-foreground text-sm mt-1">Vote on categories beyond user profiles</p>
            </div>
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
                <Link to="/shop"><Button variant="hero" size="lg">Upgrade — $9.99/mo</Button></Link>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-foreground">Create Custom League</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label>Title</Label><Input placeholder="Best Pizza Place" value={newLeague.name} onChange={(e) => setNewLeague({ ...newLeague, name: e.target.value })} /></div>
                  <div className="space-y-2 sm:col-span-2"><Label>Description</Label><Textarea placeholder="Describe this league..." rows={2} value={newLeague.description} onChange={(e) => setNewLeague({ ...newLeague, description: e.target.value })} /></div>
                </div>
                <Button variant="hero" onClick={handleCreateLeague} disabled={creating}>
                  {creating ? "Creating…" : "Create League"}
                </Button>
              </div>
            )}
          </motion.div>
        )}

        {(() => {
          const categories = new Map<string, PresetLeague[]>();
          const uncategorized: PresetLeague[] = [];
          presets.forEach((p) => {
            if (p.category) {
              if (!categories.has(p.category)) categories.set(p.category, []);
              categories.get(p.category)!.push(p);
            } else {
              uncategorized.push(p);
            }
          });
          const renderCard = (preset: PresetLeague, i: number) => (
            <motion.div key={preset.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Link
                to={`/swipe/preset/${preset.id}`}
                className={`block rounded-2xl border bg-card p-6 card-hover ${
                  preset.isPromoted ? "border-primary/40 shadow-[0_0_15px_hsl(210_80%_60%/0.1)]" : "border-border"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-4xl">{getIcon(preset.name)}</span>
                  {preset.isPromoted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                      <Megaphone className="h-3 w-3" /> Promoted
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-foreground">{preset.name}</h3>
                {preset.promotedBrandName && (
                  <p className="text-[10px] text-muted-foreground">Sponsored by {preset.promotedBrandName}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">{preset.itemCount} items · Vote now</p>
              </Link>
            </motion.div>
          );
          return (
            <div className="space-y-8">
              {Array.from(categories.entries()).map(([cat, list]) => (
                <div key={cat}>
                  <h2 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                    {cat === "Anime" ? "🎌" : "📂"} {cat}
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((p, i) => renderCard(p, i))}
                  </div>
                </div>
              ))}
              {uncategorized.length > 0 && (
                <div>
                  {categories.size > 0 && <h2 className="text-xl font-bold text-foreground mb-4">📋 Other</h2>}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {uncategorized.map((p, i) => renderCard(p, i))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
