import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Lightbulb, Plus, Trash2, Save, ToggleLeft, ToggleRight, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TutorialTip {
  id: string;
  page_route: string;
  title: string;
  message: string;
  target_selector: string | null;
  position: string;
  sort_order: number;
  is_enabled: boolean;
}

const PAGE_ROUTES = [
  "/home", "/play", "/swipe", "/profile", "/shop", "/multiplayer",
  "/settings", "/elo-check", "/leaderboard/:leagueId", "/swipe-leagues",
  "/leagues/:type", "/swipe/preset/:leagueId", "/referral",
];

export default function AdminTutorialTips() {
  const [tips, setTips] = useState<TutorialTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newTip, setNewTip] = useState({ page_route: "/home", title: "", message: "", position: "center" });

  useEffect(() => {
    supabase
      .from("tutorial_tips")
      .select("*")
      .order("page_route")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setTips(data as TutorialTip[]);
        setLoading(false);
      });
  }, []);

  const handleAdd = async () => {
    if (!newTip.title.trim() || !newTip.message.trim()) {
      toast.error("Title and message required");
      return;
    }
    setSaving("new");
    const { data, error } = await supabase
      .from("tutorial_tips")
      .insert({
        page_route: newTip.page_route,
        title: newTip.title,
        message: newTip.message,
        position: newTip.position,
        sort_order: tips.filter(t => t.page_route === newTip.page_route).length,
      })
      .select()
      .single();
    if (error) {
      toast.error("Failed to add tip");
    } else if (data) {
      setTips(prev => [...prev, data as TutorialTip]);
      setNewTip({ page_route: "/home", title: "", message: "", position: "center" });
      toast.success("Tip added");
    }
    setSaving(null);
  };

  const toggleTip = async (tip: TutorialTip) => {
    setSaving(tip.id);
    const newEnabled = !tip.is_enabled;
    await supabase.from("tutorial_tips").update({ is_enabled: newEnabled }).eq("id", tip.id);
    setTips(prev => prev.map(t => t.id === tip.id ? { ...t, is_enabled: newEnabled } : t));
    setSaving(null);
  };

  const deleteTip = async (id: string) => {
    setSaving(id);
    await supabase.from("tutorial_tips").delete().eq("id", id);
    setTips(prev => prev.filter(t => t.id !== id));
    toast.success("Tip deleted");
    setSaving(null);
  };

  const updateTip = async (tip: TutorialTip) => {
    setSaving(`save-${tip.id}`);
    await supabase.from("tutorial_tips").update({
      title: tip.title,
      message: tip.message,
      page_route: tip.page_route,
      position: tip.position,
    }).eq("id", tip.id);
    toast.success("Tip updated");
    setSaving(null);
  };

  const updateField = (id: string, field: string, value: string) => {
    setTips(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  // Group by route
  const grouped = tips.reduce<Record<string, TutorialTip[]>>((acc, tip) => {
    (acc[tip.page_route] = acc[tip.page_route] || []).push(tip);
    return acc;
  }, {});

  if (loading) {
    return <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-2xl font-black text-foreground">{tips.length}</div>
          <div className="text-xs text-muted-foreground">Total Tips</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-2xl font-black text-green-500">{tips.filter(t => t.is_enabled).length}</div>
          <div className="text-xs text-muted-foreground">Active</div>
        </div>
        <div className="p-3 rounded-xl border border-border bg-card text-center">
          <div className="text-2xl font-black text-foreground">{Object.keys(grouped).length}</div>
          <div className="text-xs text-muted-foreground">Pages</div>
        </div>
      </div>

      {/* Add new tip */}
      <div className="p-4 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 space-y-3">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" /> Add New Tip
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={newTip.page_route}
            onChange={e => setNewTip(prev => ({ ...prev, page_route: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            {PAGE_ROUTES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <select
            value={newTip.position}
            onChange={e => setNewTip(prev => ({ ...prev, position: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
          >
            <option value="center">Center</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </div>
        <Input
          placeholder="Tip title..."
          value={newTip.title}
          onChange={e => setNewTip(prev => ({ ...prev, title: e.target.value }))}
        />
        <Textarea
          placeholder="Tip message..."
          value={newTip.message}
          onChange={e => setNewTip(prev => ({ ...prev, message: e.target.value }))}
          rows={2}
        />
        <Button onClick={handleAdd} disabled={saving === "new"} size="sm">
          <Plus className="h-4 w-4 mr-1" /> {saving === "new" ? "Adding..." : "Add Tip"}
        </Button>
      </div>

      {/* Tips grouped by route */}
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([route, routeTips]) => (
        <div key={route} className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Lightbulb className="h-3 w-3" /> {route}
            <span className="text-muted-foreground/50">({routeTips.length})</span>
          </h3>
          {routeTips.map(tip => (
            <motion.div
              key={tip.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`p-3 rounded-xl border transition-all ${tip.is_enabled ? "border-primary/20 bg-card" : "border-border bg-muted/10 opacity-60"}`}
            >
              <div className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/30 mt-1 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Input
                    value={tip.title}
                    onChange={e => updateField(tip.id, "title", e.target.value)}
                    className="h-8 text-sm font-bold"
                  />
                  <Textarea
                    value={tip.message}
                    onChange={e => updateField(tip.id, "message", e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateTip(tip)} disabled={saving === `save-${tip.id}`} className="h-7 text-xs">
                      <Save className="h-3 w-3 mr-1" /> {saving === `save-${tip.id}` ? "..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteTip(tip.id)} disabled={saving === tip.id} className="h-7 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <button onClick={() => toggleTip(tip)} className="flex-shrink-0 mt-1">
                  {tip.is_enabled
                    ? <ToggleRight className="h-6 w-6 text-primary" />
                    : <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                  }
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}
