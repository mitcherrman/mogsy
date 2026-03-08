import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Save, Pencil, Undo2, ImageIcon, ImageOff, ArrowLeft, Eye, Trophy, RotateCcw, EyeOff, Upload, Link, Maximize2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PresetItem {
  id: string;
  name: string;
  subtitle: string;
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

interface EloResetData {
  items: { id: string; previousElo: number }[];
  memberships: { id: string; previousElo: number }[];
}

interface UndoAction {
  type: "add" | "delete" | "update" | "elo_reset";
  item?: PresetItem;
  previousState?: PresetItem;
  resetData?: EloResetData;
  leagueId?: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Anime: "🎌",
  Movies: "🎬",
  "Video Games": "🎮",
  Celebrities: "⭐",
  Sports: "⚽",
  Food: "🍕",
};

function ItemDetailHeader({ item, rank, wins, losses, onUpdate }: {
  item: PresetItem;
  rank: number;
  wins: number;
  losses: number;
  onUpdate: (updated: PresetItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [subtitle, setSubtitle] = useState(item.subtitle || "");
  const [imageUrl, setImageUrl] = useState(item.image_url || "");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(item.name);
    setSubtitle(item.subtitle || "");
    setImageUrl(item.image_url || "");
  }, [item]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("preset_items")
      .update({ name, subtitle, image_url: imageUrl || null })
      .eq("id", item.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Item updated");
    onUpdate({ ...item, name, subtitle, image_url: imageUrl || null });
    setEditing(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) { toast.error("Only JPEG, PNG, WebP, GIF"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    const ext = file.name.split(".").pop();
    const path = `preset-items/${item.id}/profile-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file);
    if (uploadError) { toast.error(uploadError.message); return; }
    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
    setImageUrl(urlData.publicUrl);
    toast.success("Image uploaded — click Save to apply");
    if (fileRef.current) fileRef.current.value = "";
  };

  if (editing) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-4">
          <div className="space-y-2">
            <div className="h-20 w-20 rounded-lg bg-secondary overflow-hidden flex-shrink-0 relative group">
              {imageUrl ? (
                <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-muted-foreground">{name.charAt(0)}</div>
              )}
              <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleImageUpload} className="hidden" />
          </div>
          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subtitle</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Dragon Ball Z" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Image URL</Label>
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save Changes"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setEditing(false); setName(item.name); setSubtitle(item.subtitle || ""); setImageUrl(item.image_url || ""); }}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
      <div className="h-14 w-14 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-lg font-bold text-muted-foreground">{item.name.charAt(0)}</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="font-bold text-foreground text-lg">{item.name}</h3>
        {item.subtitle && <p className="text-sm text-muted-foreground">{item.subtitle}</p>}
        <div className="flex items-center gap-3 mt-1">
          <Badge variant="outline" className="gap-1"><Trophy className="h-3 w-3" /> Rank #{rank}</Badge>
          <Badge variant="secondary">Elo: {item.elo}</Badge>
          <Badge variant="outline">{wins}W / {losses}L ({wins + losses} total)</Badge>
        </div>
      </div>
      <Button size="icon" variant="ghost" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-foreground shrink-0">
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function AdminCollections() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [items, setItems] = useState<PresetItem[]>([]);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({ name: "", subtitle: "", image_url: "" });
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [imageCountMap, setImageCountMap] = useState<Map<string, number>>(new Map());

  // Detail view state
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [itemDetailImages, setItemDetailImages] = useState<ItemImage[]>([]);
  const [itemMatches, setItemMatches] = useState<MatchRecord[]>([]);
  const [allItems, setAllItems] = useState<Map<string, string>>(new Map());

  // Image add state
  const [addImageUrl, setAddImageUrl] = useState("");
  const [addImageZoom, setAddImageZoom] = useState(100);
  const [uploading, setUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (action.type === "add" && action.item) {
      await supabase.from("preset_items").delete().eq("id", action.item.id);
      toast.success("Undo: item removed");
    } else if (action.type === "delete" && action.item) {
      await supabase.from("preset_items").insert({
        id: action.item.id, league_id: action.item.league_id,
        name: action.item.name, image_url: action.item.image_url, elo: action.item.elo,
      });
      toast.success("Undo: item restored");
    } else if (action.type === "update" && action.previousState && action.item) {
      await supabase.from("preset_items")
        .update({ name: action.previousState.name, image_url: action.previousState.image_url })
        .eq("id", action.item.id);
      toast.success("Undo: item reverted");
    } else if (action.type === "elo_reset" && action.resetData && action.leagueId) {
      for (const item of action.resetData.items) {
        await supabase.from("preset_items").update({ elo: item.previousElo }).eq("id", item.id);
      }
      for (const mem of action.resetData.memberships) {
        await supabase.from("league_memberships").update({ elo: mem.previousElo }).eq("id", mem.id);
      }
      toast.success("Undo: Aura & leaderboard restored");
    }
    setUndoStack((prev) => prev.slice(0, -1));
    loadItems(selectedLeague);
  };

  const handleResetElo = async () => {
    if (!selectedLeague) return;
    const { data: currentItems } = await supabase.from("preset_items").select("id, elo").eq("league_id", selectedLeague);
    const { data: currentMemberships } = await supabase.from("league_memberships").select("id, elo").eq("league_id", selectedLeague);
    const resetData: EloResetData = {
      items: (currentItems || []).map(i => ({ id: i.id, previousElo: i.elo })),
      memberships: (currentMemberships || []).map(m => ({ id: m.id, previousElo: m.elo })),
    };
    const { error: e1 } = await supabase.from("preset_items").update({ elo: 1200 }).eq("league_id", selectedLeague);
    const { error: e2 } = await supabase.from("league_memberships").update({ elo: 1200 }).eq("league_id", selectedLeague);
    if (e1 || e2) { toast.error("Failed to reset Elo"); return; }
    pushUndo({ type: "elo_reset", resetData, leagueId: selectedLeague });
    toast.success(`Reset Elo for all items & users in this league to 1200`);
    loadItems(selectedLeague);
  };

  const handleAddItem = async () => {
    if (!newItem.name.trim()) return;
    const { data, error } = await supabase
      .from("preset_items")
      .insert({ league_id: selectedLeague, name: newItem.name, subtitle: newItem.subtitle, image_url: newItem.image_url || null })
      .select().single();
    if (error) { toast.error(error.message, { duration: Infinity }); return; }
    if (data) pushUndo({ type: "add", item: data });
    toast.success("Item added");
    setNewItem({ name: "", subtitle: "", image_url: "" });
    loadItems(selectedLeague);
  };

  const handleUpdateItem = async (item: PresetItem, prev: PresetItem) => {
    const { error } = await supabase.from("preset_items").update({ name: item.name, subtitle: item.subtitle, image_url: item.image_url }).eq("id", item.id);
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
    setAddImageUrl("");
    setAddImageZoom(100);
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

  // Image management functions
  const handleAddImageByUrl = async () => {
    if (!addImageUrl.trim() || !selectedItem) return;
    // Check for duplicate
    const exists = itemDetailImages.some(img => img.image_url === addImageUrl.trim());
    if (exists) { toast.error("This image URL already exists for this item"); return; }

    const nextOrder = itemDetailImages.length;
    const { data, error } = await supabase
      .from("preset_item_images")
      .insert({ preset_item_id: selectedItem.id, image_url: addImageUrl.trim(), sort_order: nextOrder })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setItemDetailImages(prev => [...prev, data as ItemImage]);
    setAddImageUrl("");
    setAddImageZoom(100);
    toast.success("Image added");
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) { toast.error("Only JPEG, PNG, WebP, GIF allowed"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `preset-items/${selectedItem.id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(path, file);

    if (uploadError) { toast.error(uploadError.message); setUploading(false); return; }

    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
    const imageUrl = urlData.publicUrl;

    const nextOrder = itemDetailImages.length;
    const { data, error } = await supabase
      .from("preset_item_images")
      .insert({ preset_item_id: selectedItem.id, image_url: imageUrl, sort_order: nextOrder })
      .select()
      .single();

    if (error) { toast.error(error.message); setUploading(false); return; }
    setItemDetailImages(prev => [...prev, data as ItemImage]);
    setUploading(false);
    toast.success("Image uploaded & added");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleImageVisibility = async (img: ItemImage) => {
    const newHidden = !img.is_hidden;
    const { error } = await supabase
      .from("preset_item_images")
      .update({ is_hidden: newHidden })
      .eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    setItemDetailImages(prev => prev.map(i => i.id === img.id ? { ...i, is_hidden: newHidden } : i));
    toast.success(newHidden ? "Image hidden from rotation" : "Image shown in rotation");
  };

  const handleDeleteImage = async (img: ItemImage) => {
    const { error } = await supabase
      .from("preset_item_images")
      .delete()
      .eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    setItemDetailImages(prev => prev.filter(i => i.id !== img.id));
    toast.success("Image removed");
  };

  // Detail view
  if (selectedItem) {
    const wins = itemMatches.filter(m => m.winner_item_id === selectedItem.id).length;
    const losses = itemMatches.filter(m => m.loser_item_id === selectedItem.id).length;
    const rank = [...items].sort((a, b) => b.elo - a.elo).findIndex(i => i.id === selectedItem.id) + 1;
    const visibleCount = itemDetailImages.filter(i => !i.is_hidden).length;

    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)} className="text-muted-foreground">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Items
        </Button>

        <ItemDetailHeader
          item={selectedItem}
          rank={rank}
          wins={wins}
          losses={losses}
          onUpdate={(updated) => {
            setSelectedItem(updated);
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
          }}
        />

        {/* Images section with management */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-foreground flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" /> Images ({itemDetailImages.length})
              <span className="text-muted-foreground font-normal">• {visibleCount} active</span>
            </h4>
          </div>

          {/* Add image controls */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add Image</h5>
            <div className="flex gap-2">
              <Input
                value={addImageUrl}
                onChange={(e) => setAddImageUrl(e.target.value)}
                placeholder="Paste image URL..."
                className="text-sm"
              />
              <Button size="sm" onClick={handleAddImageByUrl} disabled={!addImageUrl.trim()} className="gap-1 shrink-0">
                <Link className="h-3.5 w-3.5" /> Add URL
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleUploadImage}
                className="hidden"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1"
              >
                <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading..." : "Upload File"}
              </Button>
            </div>

            {/* Zoom/crop preview for URL */}
            {addImageUrl.trim() && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Zoom / Crop Preview</Label>
                <Slider
                  value={[addImageZoom]}
                  onValueChange={([v]) => setAddImageZoom(v)}
                  min={50}
                  max={200}
                  step={5}
                  className="w-full"
                />
                <span className="text-[10px] text-muted-foreground">{addImageZoom}%</span>
                <div className="w-32 h-32 rounded-lg border border-border overflow-hidden mx-auto bg-muted">
                  <img
                    src={addImageUrl}
                    alt="Preview"
                    className="w-full h-full object-cover"
                    style={{ transform: `scale(${addImageZoom / 100})` }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Existing images grid */}
          {itemDetailImages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images associated with this item.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {itemDetailImages.map(img => (
                <div key={img.id} className={`relative rounded-xl border overflow-hidden group ${img.is_hidden ? "opacity-40 border-destructive" : "border-border"}`}>
                  <img src={img.image_url} alt="" className="w-full aspect-square object-cover bg-muted cursor-pointer" onClick={() => setViewingImage(img.image_url)} />
                  {/* Overlay with action buttons */}
                  <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8"
                      onClick={() => setViewingImage(img.image_url)}
                      title="View full image"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={img.is_hidden ? "default" : "secondary"}
                      className="h-8 w-8"
                      onClick={() => handleToggleImageVisibility(img)}
                      title={img.is_hidden ? "Show in rotation" : "Hide from rotation"}
                    >
                      {img.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="destructive" className="h-8 w-8" title="Delete image">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete image?</AlertDialogTitle>
                          <AlertDialogDescription>This will permanently remove this image from the rotation.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteImage(img)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm px-2 py-1 text-[10px]">
                    <span className={img.is_hidden ? "text-destructive font-bold" : "text-muted-foreground"}>
                      {img.is_hidden ? "Hidden" : `${img.report_count} reports`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Full image lightbox */}
          <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
            <DialogContent className="max-w-3xl p-2 bg-background/95 backdrop-blur-xl">
              {viewingImage && (
                <img src={viewingImage} alt="" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
              )}
            </DialogContent>
          </Dialog>
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

      {/* Categories header + chips */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Categories</h4>
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
      </div>

      {/* Sub-categories header + outlined buttons */}
      {selectedCategory && grouped[selectedCategory] && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sub Categories</h4>
          <div className="flex flex-wrap gap-1.5">
            {grouped[selectedCategory].map((l) => (
              <Button
                key={l.id}
                variant={selectedLeague === l.id ? "default" : "outline"}
                size="sm"
                onClick={() => selectLeague(l.id)}
                className="text-xs h-7 px-2.5"
              >
                {l.name}
              </Button>
            ))}
          </div>
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="gap-1 text-xs h-7">
                  <RotateCcw className="h-3 w-3" /> Reset Aura
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all Elo & Rankings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will set <strong>all items and user memberships</strong> in "{selectedLeagueData.name}" back to the default Elo of 1200. This action can be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetElo} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} placeholder="Item name" /></div>
              <div className="space-y-1"><Label className="text-xs">Subtitle</Label><Input value={newItem.subtitle} onChange={(e) => setNewItem({ ...newItem, subtitle: e.target.value })} placeholder="e.g. Dragon Ball Z" /></div>
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
                      <Input defaultValue={item.name} onChange={(e) => { item.name = e.target.value; }} className="text-sm" placeholder="Name" />
                      <Input defaultValue={item.subtitle || ""} onChange={(e) => { item.subtitle = e.target.value; }} placeholder="Subtitle" className="text-sm" />
                      <Input defaultValue={item.image_url || ""} onChange={(e) => { item.image_url = e.target.value; }} placeholder="Image URL" className="text-sm" />
                      <Button size="sm" variant="ghost" onClick={() => handleUpdateItem(item, snapshot)}><Save className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => openItemDetail(item)} className="flex-1 text-left cursor-pointer hover:opacity-80 transition-opacity">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          {item.subtitle && <span className="text-xs text-muted-foreground">— {item.subtitle}</span>}
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
