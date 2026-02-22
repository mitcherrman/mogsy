import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Save, Pencil, Undo2, ImageIcon, ImageOff, ArrowLeft, Eye, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PresetItem {
  id: string;
  name: string;
  image_url: string | null;
  elo: number;
  league_id: string;
}

interface ItemImage {
  id: string;
  preset_item_id: string;
  image_url: string;
  is_hidden: boolean;
  report_count: number;
  sort_order: number;
}

interface MatchRecord {
  id: string;
  winner_item_id: string | null;
  loser_item_id: string | null;
  created_at: string;
}

interface League {
  id: string;
  name: string;
  category: string | null;
  show_elo: boolean | null;
  show_rank: boolean | null;
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

export default function AdminCollections() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [items, setItems] = useState<PresetItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", image_url: "" });
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [imageCountMap, setImageCountMap] = useState<Map<string, number>>(new Map());

  // Detail view state
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [itemDetailImages, setItemDetailImages] = useState<ItemImage[]>([]);
  const [itemMatches, setItemMatches] = useState<MatchRecord[]>([]);
  const [allItems, setAllItems] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    supabase
      .from("leagues")
      .select("id, name, category, show_elo, show_rank")
      .eq("type", "preset")
      .order("category")
      .order("name")
      .then(({ data }) => {
        if (data) {
          setLeagues(data as League[]);
          if (data.length > 0) {
            const firstCat = data[0].category || "Uncategorized";
            setSelectedCategory(firstCat);
            setSelectedLeague(data[0].id);
            loadItems(data[0].id);
          }
        }
      });
  }, []);

  const loadItems = async (leagueId: string) => {
    const { data } = await supabase.from("preset_items").select("*").eq("league_id", leagueId).order("name");
    if (data) {
      setItems(data);
      const ids = data.map(i => i.id);
      if (ids.length > 0) {
        const { data: images } = await supabase
          .from("preset_item_images")
          .select("preset_item_id")
          .in("preset_item_id", ids);
        const countMap = new Map<string, number>();
        images?.forEach(img => {
          countMap.set(img.preset_item_id, (countMap.get(img.preset_item_id) || 0) + 1);
        });
        setImageCountMap(countMap);
      }
    }
  };

  const selectLeague = (id: string) => {
    setSelectedLeague(id);
    loadItems(id);
  };

  const updateLeagueDisplay = async (id: string, field: "show_elo" | "show_rank", value: boolean) => {
    setLeagues(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
    const { error } = await supabase.from("leagues").update({ [field]: value }).eq("id", id);
    if (error) {
      toast.error("Failed to update");
      setLeagues(prev => prev.map(l => l.id === id ? { ...l, [field]: !value } : l));
    }
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
        id: action.item.id, league_id: action.item.league_id,
        name: action.item.name, image_url: action.item.image_url, elo: action.item.elo,
      });
      toast.success("Undo: item restored");
    } else if (action.type === "update" && action.previousState) {
      await supabase.from("preset_items")
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
      .select().single();
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

  const openItemDetail = async (item: PresetItem) => {
    setSelectedItem(item);
    const { data: images } = await supabase
      .from("preset_item_images")
      .select("*")
      .eq("preset_item_id", item.id)
      .order("sort_order");
    setItemDetailImages((images as ItemImage[]) || []);

    const { data: matchData } = await supabase
      .from("matches")
      .select("*")
      .or(`winner_item_id.eq.${item.id},loser_item_id.eq.${item.id}`)
      .order("created_at", { ascending: false })
      .limit(50);
    setItemMatches(matchData || []);

    const opponentIds = new Set<string>();
    matchData?.forEach(m => {
      if (m.winner_item_id && m.winner_item_id !== item.id) opponentIds.add(m.winner_item_id);
      if (m.loser_item_id && m.loser_item_id !== item.id) opponentIds.add(m.loser_item_id);
    });
    if (opponentIds.size > 0) {
      const { data: opponents } = await supabase
        .from("preset_items")
        .select("id, name")
        .in("id", Array.from(opponentIds));
      const map = new Map<string, string>();
      opponents?.forEach(o => map.set(o.id, o.name));
      map.set(item.id, item.name);
      setAllItems(map);
    } else {
      setAllItems(new Map([[item.id, item.name]]));
    }
  };

  // Detail view
  if (selectedItem) {
    const wins = itemMatches.filter(m => m.winner_item_id === selectedItem.id).length;
    const losses = itemMatches.filter(m => m.loser_item_id === selectedItem.id).length;
    const rank = [...items].sort((a, b) => b.elo - a.elo).findIndex(i => i.id === selectedItem.id) + 1;

    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Items
        </Button>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
          <div className="h-14 w-14 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
            {selectedItem.image_url ? (
              <img src={selectedItem.image_url} alt={selectedItem.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg font-bold text-muted-foreground">{selectedItem.name.charAt(0)}</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-foreground text-lg">{selectedItem.name}</h3>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant="outline" className="gap-1"><Trophy className="h-3 w-3" /> Rank #{rank}</Badge>
              <Badge variant="secondary">Elo: {selectedItem.elo}</Badge>
              <Badge variant="outline">{wins}W / {losses}L ({wins + losses} total)</Badge>
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="space-y-3">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" /> Images ({itemDetailImages.length})
          </h4>
          {itemDetailImages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images associated with this item.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {itemDetailImages.map(img => (
                <div key={img.id} className={`relative rounded-xl border overflow-hidden ${img.is_hidden ? "opacity-40 border-destructive" : "border-border"}`}>
                  <img src={img.image_url} alt="" className="w-full aspect-square object-cover bg-muted" />
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm px-2 py-1 text-[10px]">
                    <span className={img.is_hidden ? "text-destructive font-bold" : "text-muted-foreground"}>
                      {img.is_hidden ? "Hidden" : `${img.report_count} reports`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Match history */}
        <div className="space-y-3">
          <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> Recent Matches ({itemMatches.length})
          </h4>
          {itemMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Result</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemMatches.map(m => {
                  const won = m.winner_item_id === selectedItem.id;
                  const opponentId = won ? m.loser_item_id : m.winner_item_id;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Badge variant={won ? "default" : "secondary"}>{won ? "Won" : "Lost"}</Badge>
                      </TableCell>
                      <TableCell className="text-foreground">{opponentId ? allItems.get(opponentId) || "Unknown" : "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    );
  }

  // Group leagues by category
  const grouped = leagues.reduce<Record<string, League[]>>((acc, l) => {
    const cat = l.category || "Uncategorized";
    (acc[cat] = acc[cat] || []).push(l);
    return acc;
  }, {});
  const categories = Object.keys(grouped).sort();

  const selectedLeagueData = leagues.find(l => l.id === selectedLeague);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Collections</h3>
        <Button size="sm" variant="outline" disabled={undoStack.length === 0} onClick={handleUndo} className="gap-1.5">
          <Undo2 className="h-3.5 w-3.5" /> Undo ({undoStack.length})
        </Button>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <Button
            key={cat}
            variant={selectedCategory === cat ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(cat)}
            className="text-xs h-7 px-2.5"
          >
            {CATEGORY_ICONS[cat] || "📁"} {cat}
          </Button>
        ))}
      </div>

      {/* League buttons for selected category */}
      {selectedCategory && grouped[selectedCategory] && (
        <div className="flex flex-wrap gap-1.5">
          {grouped[selectedCategory].map((l) => (
            <Button
              key={l.id}
              variant={selectedLeague === l.id ? "default" : "ghost"}
              size="sm"
              onClick={() => selectLeague(l.id)}
              className="text-xs h-7 px-2.5"
            >
              {l.name}
            </Button>
          ))}
        </div>
      )}

      {/* Display settings for selected league */}
      {selectedLeagueData && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card px-3 py-2">
          <span className="text-sm font-medium text-foreground truncate">{selectedLeagueData.name}</span>
          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground">Elo</Label>
              <Switch checked={selectedLeagueData.show_elo ?? true} onCheckedChange={(v) => updateLeagueDisplay(selectedLeague, "show_elo", v)} />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-[10px] text-muted-foreground">Rank</Label>
              <Switch checked={selectedLeagueData.show_rank ?? true} onCheckedChange={(v) => updateLeagueDisplay(selectedLeague, "show_rank", v)} />
            </div>
          </div>
        </div>
      )}

      {/* Selected league items section */}
      {selectedLeagueData && (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="font-bold text-foreground flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add Item to {selectedLeagueData.name}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Item name" /></div>
              <div className="space-y-1"><Label className="text-xs">Image URL</Label><Input value={newItem.image_url} onChange={(e) => setNewItem({ ...newItem, image_url: e.target.value })} placeholder="https://..." /></div>
              <div className="flex items-end"><Button onClick={handleAddItem} className="w-full">Add</Button></div>
            </div>
          </div>

          <div className="space-y-2">
            {items.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No items in this league.</p>}
            {items.map((item) => {
              const snapshot = { ...item };
              const imgCount = imageCountMap.get(item.id) || 0;
              return (
                <motion.div key={item.id} layout className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                  <button onClick={() => openItemDetail(item)} className="h-10 w-10 rounded-lg bg-secondary overflow-hidden flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name)}&size=40`; }} />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground font-bold">{item.name.charAt(0)}</div>
                    )}
                  </button>
                  {editingItem === item.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input defaultValue={item.name} onChange={(e) => { item.name = e.target.value; }} className="text-sm" />
                      <Input defaultValue={item.image_url || ""} onChange={(e) => { item.image_url = e.target.value; }} placeholder="Image URL" className="text-sm" />
                      <Button size="sm" variant="ghost" onClick={() => handleUpdateItem(item, snapshot)}><Save className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => openItemDetail(item)} className="flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          {item.image_url ? (
                            <ImageIcon className="h-3 w-3 text-primary shrink-0" />
                          ) : (
                            <ImageOff className="h-3 w-3 text-destructive shrink-0" />
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            📷 {imgCount}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Elo: {item.elo}</p>
                      </button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingItem(item.id)} className="text-muted-foreground hover:text-foreground"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => handleDeleteItem(item)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </motion.div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
