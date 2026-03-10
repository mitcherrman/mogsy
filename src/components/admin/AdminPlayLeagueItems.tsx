import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Upload, Link, Eye, EyeOff, Maximize2, ImageIcon, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

interface Props {
  leagueId: string;
  leagueName: string;
  onClose: () => void;
}

export default function AdminPlayLeagueItems({ leagueId, leagueName, onClose }: Props) {
  const [items, setItems] = useState<PresetItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PresetItem | null>(null);
  const [itemImages, setItemImages] = useState<ItemImage[]>([]);
  const [addImageUrl, setAddImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [imageCountMap, setImageCountMap] = useState<Map<string, number>>(new Map());
  const [firstImageMap, setFirstImageMap] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addItemName, setAddItemName] = useState("");
  const [addingItem, setAddingItem] = useState(false);

  useEffect(() => {
    loadItems();
  }, [leagueId]);

  const loadItems = async () => {
    const { data } = await supabase
      .from("preset_items")
      .select("*")
      .eq("league_id", leagueId)
      .order("name");
    if (data) {
      setItems(data);
      const ids = data.map(i => i.id);
      if (ids.length > 0) {
        const { data: images } = await supabase
          .from("preset_item_images")
          .select("preset_item_id, image_url, is_hidden, sort_order")
          .in("preset_item_id", ids)
          .order("sort_order");
        const countMap = new Map<string, number>();
        const imgMap = new Map<string, string>();
        images?.forEach(img => {
          countMap.set(img.preset_item_id, (countMap.get(img.preset_item_id) || 0) + 1);
          if (!imgMap.has(img.preset_item_id) && !img.is_hidden) {
            imgMap.set(img.preset_item_id, img.image_url);
          }
        });
        setImageCountMap(countMap);
        setFirstImageMap(imgMap);

        // Auto-set preview image for items that have no image_url but have available images
        const updatePromises: Promise<any>[] = [];
        const updatedItems = data.map(item => {
          if (!item.image_url && imgMap.has(item.id)) {
            const url = imgMap.get(item.id)!;
            updatePromises.push(
              supabase.from("preset_items").update({ image_url: url }).eq("id", item.id)
            );
            return { ...item, image_url: url };
          }
          return item;
        });
        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          setItems(updatedItems);
        }
      }
    }
  };

  const openItemImages = async (item: PresetItem) => {
    setSelectedItem(item);
    setAddImageUrl("");
    const { data: images } = await supabase
      .from("preset_item_images")
      .select("*")
      .eq("preset_item_id", item.id)
      .order("sort_order");
    setItemImages((images as ItemImage[]) || []);
  };

  const setPreviewImage = async (url: string) => {
    if (!selectedItem) return;
    const { error } = await supabase.from("preset_items").update({ image_url: url }).eq("id", selectedItem.id);
    if (error) { toast.error(error.message); return; }
    setSelectedItem({ ...selectedItem, image_url: url });
    setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, image_url: url } : i));
    toast.success("Preview image updated");
  };

  const handleAddImageByUrl = async () => {
    if (!addImageUrl.trim() || !selectedItem) return;
    const exists = itemImages.some(img => img.image_url === addImageUrl.trim());
    if (exists) { toast.error("This image URL already exists"); return; }
    const nextOrder = itemImages.length;
    const { data, error } = await supabase
      .from("preset_item_images")
      .insert({ preset_item_id: selectedItem.id, image_url: addImageUrl.trim(), sort_order: nextOrder })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    setItemImages(prev => [...prev, data as ItemImage]);
    setAddImageUrl("");
    setImageCountMap(prev => {
      const next = new Map(prev);
      next.set(selectedItem.id, (next.get(selectedItem.id) || 0) + 1);
      return next;
    });
    // Auto-set preview if none exists
    if (!selectedItem.image_url) {
      await setPreviewImage(addImageUrl.trim());
    }
    toast.success("Image added");
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedItem) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) { toast.error("Only JPEG, PNG, WebP, GIF"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5MB"); return; }
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `preset-items/${selectedItem.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file);
    if (uploadError) { toast.error(uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
    const nextOrder = itemImages.length;
    const { data, error } = await supabase
      .from("preset_item_images")
      .insert({ preset_item_id: selectedItem.id, image_url: urlData.publicUrl, sort_order: nextOrder })
      .select()
      .single();
    if (error) { toast.error(error.message); setUploading(false); return; }
    setItemImages(prev => [...prev, data as ItemImage]);
    setImageCountMap(prev => {
      const next = new Map(prev);
      next.set(selectedItem.id, (next.get(selectedItem.id) || 0) + 1);
      return next;
    });
    // Auto-set preview if none exists
    if (!selectedItem.image_url) {
      await setPreviewImage(urlData.publicUrl);
    }
    setUploading(false);
    toast.success("Image uploaded & added");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleToggleImageVisibility = async (img: ItemImage) => {
    const newHidden = !img.is_hidden;
    const { error } = await supabase.from("preset_item_images").update({ is_hidden: newHidden }).eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    setItemImages(prev => prev.map(i => i.id === img.id ? { ...i, is_hidden: newHidden } : i));
    toast.success(newHidden ? "Image hidden" : "Image visible");
  };

  const handleDeleteImage = async (img: ItemImage) => {
    const { error } = await supabase.from("preset_item_images").delete().eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    setItemImages(prev => prev.filter(i => i.id !== img.id));
    if (selectedItem) {
      setImageCountMap(prev => {
        const next = new Map(prev);
        next.set(selectedItem.id, Math.max(0, (next.get(selectedItem.id) || 1) - 1));
        return next;
      });
      // If deleted image was the preview, pick another
      if (selectedItem.image_url === img.image_url) {
        const remaining = itemImages.filter(i => i.id !== img.id && !i.is_hidden);
        const newUrl = remaining.length > 0 ? remaining[0].image_url : null;
        await supabase.from("preset_items").update({ image_url: newUrl }).eq("id", selectedItem.id);
        setSelectedItem({ ...selectedItem, image_url: newUrl });
        setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, image_url: newUrl } : i));
      }
    }
    toast.success("Image removed");
  };

  // Item image detail view
  if (selectedItem) {
    const visibleCount = itemImages.filter(i => !i.is_hidden).length;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedItem(null)} className="text-muted-foreground gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to {leagueName}
        </Button>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <div className="h-12 w-12 rounded-lg bg-secondary overflow-hidden shrink-0">
            {selectedItem.image_url ? (
              <img src={selectedItem.image_url} alt={selectedItem.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-lg font-bold text-muted-foreground">{selectedItem.name.charAt(0)}</div>
            )}
          </div>
          <div>
            <h3 className="font-bold text-foreground">{selectedItem.name}</h3>
            <p className="text-xs text-muted-foreground">{itemImages.length} images • {visibleCount} active</p>
          </div>
        </div>

        {/* Add image */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add Image</h5>
          <div className="flex gap-2">
            <Input
              value={addImageUrl}
              onChange={(e) => setAddImageUrl(e.target.value)}
              placeholder="Paste image URL..."
              className="text-sm"
              onKeyDown={e => e.key === "Enter" && handleAddImageByUrl()}
            />
            <Button size="sm" onClick={handleAddImageByUrl} disabled={!addImageUrl.trim()} className="gap-1 shrink-0">
              <Link className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleUploadImage} className="hidden" />
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-1">
              <Upload className="h-3.5 w-3.5" /> {uploading ? "Uploading..." : "Upload File"}
            </Button>
          </div>
        </div>

        {/* Images grid */}
        {itemImages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No images yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {itemImages.map(img => {
              const isPreview = selectedItem.image_url === img.image_url;
              return (
                <div key={img.id} className={`relative rounded-xl border overflow-hidden group ${img.is_hidden ? "opacity-40 border-destructive" : isPreview ? "border-primary border-2" : "border-border"}`}>
                  <img src={img.image_url} alt="" className="w-full aspect-square object-cover bg-muted cursor-pointer" onClick={() => setViewingImage(img.image_url)} />
                  <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setViewingImage(img.image_url)}>
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant={isPreview ? "default" : "secondary"}
                      className="h-8 w-8"
                      onClick={() => setPreviewImage(img.image_url)}
                      title="Set as preview"
                    >
                      <Star className={`h-4 w-4 ${isPreview ? "fill-current" : ""}`} />
                    </Button>
                    <Button size="icon" variant={img.is_hidden ? "default" : "secondary"} className="h-8 w-8" onClick={() => handleToggleImageVisibility(img)}>
                      {img.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="destructive" className="h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete image?</AlertDialogTitle>
                          <AlertDialogDescription>Permanently remove this image.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteImage(img)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-background/80 backdrop-blur-sm px-2 py-1 text-[10px] flex items-center justify-between">
                    <span className={img.is_hidden ? "text-destructive font-bold" : "text-muted-foreground"}>
                      {img.is_hidden ? "Hidden" : `${img.report_count} reports`}
                    </span>
                    {isPreview && <span className="text-primary font-bold">Preview</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Dialog open={!!viewingImage} onOpenChange={() => setViewingImage(null)}>
          <DialogContent className="max-w-3xl p-2 bg-background/95 backdrop-blur-xl">
            {viewingImage && <img src={viewingImage} alt="" className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />}
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Items list
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Layout
      </Button>

      <div className="flex items-center gap-2">
        <h3 className="text-lg font-bold text-foreground flex-1">{leagueName}</h3>
        <Badge variant="outline">{items.length} items</Badge>
      </div>

      {/* Add Item */}
      <div className="flex gap-2">
        <Input
          value={addItemName}
          onChange={e => setAddItemName(e.target.value)}
          placeholder="New item name…"
          className="text-sm"
          onKeyDown={async e => {
            if (e.key === "Enter" && addItemName.trim()) {
              setAddingItem(true);
              const { error } = await supabase.from("preset_items").insert({ league_id: leagueId, name: addItemName.trim() });
              if (error) { toast.error(error.message); setAddingItem(false); return; }
              toast.success(`Item "${addItemName.trim()}" added`);
              setAddItemName("");
              setAddingItem(false);
              loadItems();
            }
          }}
        />
        <Button
          size="sm"
          disabled={!addItemName.trim() || addingItem}
          className="gap-1 shrink-0"
          onClick={async () => {
            if (!addItemName.trim()) return;
            setAddingItem(true);
            const { error } = await supabase.from("preset_items").insert({ league_id: leagueId, name: addItemName.trim() });
            if (error) { toast.error(error.message); setAddingItem(false); return; }
            toast.success(`Item "${addItemName.trim()}" added`);
            setAddItemName("");
            setAddingItem(false);
            loadItems();
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      <div className="space-y-1.5">
        {items.length === 0 && <p className="text-center text-muted-foreground text-sm py-8">No items.</p>}
        {items.map(item => {
          const imgCount = imageCountMap.get(item.id) || 0;
          const displayUrl = item.image_url || firstImageMap.get(item.id);
          return (
            <button
              key={item.id}
              onClick={() => openItemImages(item)}
              className="flex items-center gap-3 w-full text-left rounded-xl border border-border bg-card p-3 hover:bg-accent/30 transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-secondary overflow-hidden shrink-0">
                {displayUrl ? (
                  <img src={displayUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-xs font-bold text-muted-foreground">{item.name.charAt(0)}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
                    <ImageIcon className="h-2.5 w-2.5 mr-0.5" /> {imgCount}
                  </Badge>
                </div>
                {item.subtitle && <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">Elo {item.elo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
