import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Trash2, Plus, Save, Pencil, ChevronDown, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  category: string | null;
}

interface UndoAction {
  type: "add" | "delete" | "update";
  item: PresetItem;
  previousState?: PresetItem;
}

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
};

export default function AdminPresetItems() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [items, setItems] = useState<PresetItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", image_url: "" });
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("leagues")
      .select("id, name, category")
      .eq("type", "preset")
      .order("category")
      .order("name")
      .then(({ data }) => {
        if (data) {
          setLeagues(data);
          if (data.length > 0) {
            setSelectedLeague(data[0].id);
            loadItems(data[0].id);
          }
        }
      });
  }, []);

  const loadItems = async (leagueId: string) => {
    const { data } = await supabase.from("preset_items").select("*").eq("league_id", leagueId).order("name");
    if (data) setItems(data);
  };

  const selectLeague = (id: string) => {
    setSelectedLeague(id);
    loadItems(id);
  };

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const pushUndo = (action: UndoAction) => {
    setUndoStack((prev) => [...prev.slice(-19), action]);
  };

  const handleUndo = async () => {
    const action = undoStack[undoStack.length - 1];
    if (!action) return;

    if (action.type === "add") {
      await supabase.from("preset_items").delete().eq("id", action.item.id);
      toast.success("Undo: item removed");
    } else if (action.type === "delete") {
      await supabase.from("preset_items").insert({
        id: action.item.id,
        league_id: action.item.league_id,
        name: action.item.name,
        image_url: action.item.image_url,
        elo: action.item.elo,
      });
      toast.success("Undo: item restored");
    } else if (action.type === "update" && action.previousState) {
      await supabase
        .from("preset_items")
        .update({ name: action.previousState.name, image_url: action.previousState.image_url })
        .eq("id", action.item.id);
      toast.success("Undo: item reverted");
    }

    setUndoStack((prev) => prev.slice(0, -1));
    loadItems(selectedLeague);
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim()) return;
    const { data, error } = await supabase
      .from("preset_items")
      .insert({ league_id: selectedLeague, name: newItem.name, image_url: newItem.image_url || null })
      .select()
      .single();
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    if (data) pushUndo({ type: "add", item: data });
    toast.success("Item added");
    setNewItem({ name: "", image_url: "" });
    loadItems(selectedLeague);
  };

  const handleUpdateItem = async (item: PresetItem, prev: PresetItem) => {
    const { error } = await supabase.from("preset_items").update({ name: item.name, image_url: item.image_url }).eq("id", item.id);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    pushUndo({ type: "update", item, previousState: prev });
    toast.success("Updated");
    setEditingItem(null);
    loadItems(selectedLeague);
  };

  const handleDeleteItem = async (item: PresetItem) => {
    const { error } = await supabase.from("preset_items").delete().eq("id", item.id);
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    pushUndo({ type: "delete", item });
    toast.success("Deleted");
    loadItems(selectedLeague);
  };

  // Group leagues by category
  const grouped = leagues.reduce<Record<string, League[]>>((acc, l) => {
    const cat = l.category || "Uncategorized";
    (acc[cat] = acc[cat] || []).push(l);
    return acc;
  }, {});

  const categories = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      {/* Undo bar */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Select League</h3>
        <Button
          size="sm"
          variant="outline"
          disabled={undoStack.length === 0}
          onClick={handleUndo}
          className="gap-1.5"
        >
          <Undo2 className="h-3.5 w-3.5" /> Undo ({undoStack.length})
        </Button>
      </div>

      {/* Collapsible category league picker */}
      <div className="space-y-2">
        {categories.map((cat) => (
          <Collapsible key={cat} open={openCategories.has(cat)} onOpenChange={() => toggleCategory(cat)}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent/50 transition-colors">
              <span>{CATEGORY_ICONS[cat] || "📁"} {cat} ({grouped[cat].length})</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${openCategories.has(cat) ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-1">
              <div className="flex flex-wrap gap-1.5 pl-4">
                {grouped[cat].map((l) => (
                  <Button key={l.id} variant={selectedLeague === l.id ? "default" : "ghost"} size="sm" onClick={() => selectLeague(l.id)} className="text-xs h-7">
                    {l.name}
                  </Button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      {/* Add item form */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <h3 className="font-bold text-foreground flex items-center gap-2"><Plus className="h-4 w-4" /> Add Item</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Item name" /></div>
          <div className="space-y-1"><Label className="text-xs">Image URL</Label><Input value={newItem.image_url} onChange={(e) => setNewItem({ ...newItem, image_url: e.target.value })} placeholder="https://..." /></div>
          <div className="flex items-end"><Button onClick={handleAddItem} className="w-full">Add</Button></div>
        </div>
      </div>

      {/* Items list */}
      <div className="space-y-2">
        {items.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No items in this league.</p>}
        {items.map((item) => {
          const snapshot = { ...item }; // for undo
          return (
            <motion.div key={item.id} layout className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div className="h-10 w-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&size=40`; }} />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground font-bold">{item.name.charAt(0)}</div>
                )}
              </div>
              {editingItem === item.id ? (
                <div className="flex-1 flex gap-2">
                  <Input defaultValue={item.name} onChange={(e) => { item.name = e.target.value; }} className="text-sm" />
                  <Input defaultValue={item.image_url || ""} onChange={(e) => { item.image_url = e.target.value; }} placeholder="Image URL" className="text-sm" />
                  <Button size="sm" variant="ghost" onClick={() => handleUpdateItem(item, snapshot)}><Save className="h-4 w-4" /></Button>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Elo: {item.elo}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setEditingItem(item.id)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDeleteItem(item)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
