import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Upload, Link, Eye, EyeOff, Maximize2, ImageIcon, Star, Smartphone, Move, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ImagePositionEditor from "./ImagePositionEditor";

interface PresetItem {
  id: string;
  name: string;
  subtitle: string;
  image_url: string | null;
  elo: number;
  league_id: string;
  title_image_url?: string | null;
  title_image_scale?: number;
  title_image_offset_y?: number;
  title_image_offset_x?: number;
  title_image_max_height?: number;
}

interface ItemImage {
  id: string;
  preset_item_id: string;
  image_url: string;
  is_hidden: boolean;
  report_count: number;
  sort_order: number;
  focal_x: number;
  focal_y: number;
  zoom: number;
  pad_top: number;
  pad_left: number;
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
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);
  const [cardPreviewImage, setCardPreviewImage] = useState<string | null>(null);
  const [positioningImage, setPositioningImage] = useState<ItemImage | null>(null);
  const [imageCountMap, setImageCountMap] = useState<Map<string, number>>(new Map());
  const [firstImageMap, setFirstImageMap] = useState<Map<string, string>>(new Map());
  const [imageClickCounts, setImageClickCounts] = useState<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleImageInputRef = useRef<HTMLInputElement>(null);
  const [addItemName, setAddItemName] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [titleImageUrl, setTitleImageUrl] = useState("");
  const [uploadingTitleImage, setUploadingTitleImage] = useState(false);
  const [adjustingTitleImage, setAdjustingTitleImage] = useState(false);
  const [tiScale, setTiScale] = useState(1);
  const [tiOffsetY, setTiOffsetY] = useState(0);
  const [tiOffsetX, setTiOffsetX] = useState(0);
  const [tiMaxHeight, setTiMaxHeight] = useState(0);

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
        const updatedItems = [...data];
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          if (!item.image_url && imgMap.has(item.id)) {
            const url = imgMap.get(item.id)!;
            await supabase.from("preset_items").update({ image_url: url }).eq("id", item.id);
            updatedItems[i] = { ...item, image_url: url };
          }
        }
        setItems(updatedItems);
      }
    }
  };

  const loadImageClickCounts = async (imageIds: string[]) => {
    if (imageIds.length === 0) return;
    // Count clicks per image_id
    const { data } = await supabase
      .from("image_clicks")
      .select("image_id")
      .in("image_id", imageIds);
    const counts = new Map<string, number>();
    data?.forEach(row => {
      counts.set(row.image_id, (counts.get(row.image_id) || 0) + 1);
    });
    setImageClickCounts(counts);
  };

  const openItemImages = async (item: PresetItem) => {
    setSelectedItem(item);
    setAddImageUrl("");
    const { data: images } = await supabase
      .from("preset_item_images")
      .select("*")
      .eq("preset_item_id", item.id)
      .order("sort_order");
    const imgs = (images as ItemImage[]) || [];
    setItemImages(imgs);
    // Load click counts for these images
    await loadImageClickCounts(imgs.map(i => i.id));
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
    if (file.size > 20 * 1024 * 1024) { toast.error("Max 20MB"); return; }
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

  const handleSavePosition = async (img: ItemImage, focalX: number, focalY: number, zoom: number, padTop: number, padLeft: number) => {
    const { error } = await supabase
      .from("preset_item_images")
      .update({ focal_x: focalX, focal_y: focalY, zoom, pad_top: padTop, pad_left: padLeft })
      .eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    setItemImages(prev => prev.map(i => i.id === img.id ? { ...i, focal_x: focalX, focal_y: focalY, zoom, pad_top: padTop, pad_left: padLeft } : i));
    setPositioningImage(null);
    toast.success("Position saved");
  };


  if (selectedItem) {
    const visibleCount = itemImages.filter(i => !i.is_hidden).length;

    // Image positioning sub-view
    if (positioningImage) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setPositioningImage(null)} className="text-muted-foreground gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {selectedItem.name}
          </Button>
          <ImagePositionEditor
            imageUrl={positioningImage.image_url}
            itemName={selectedItem.name}
            initialFocalX={positioningImage.focal_x}
            initialFocalY={positioningImage.focal_y}
            initialZoom={positioningImage.zoom}
            initialPadTop={positioningImage.pad_top}
            initialPadLeft={positioningImage.pad_left}
            onSave={(fx, fy, z, pt, pl) => handleSavePosition(positioningImage, fx, fy, z, pt, pl)}
            onCancel={() => setPositioningImage(null)}
          />
        </div>
      );
    }

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
          <div className="flex-1">
            <h3 className="font-bold text-foreground">{selectedItem.name}</h3>
            <p className="text-xs text-muted-foreground">{itemImages.length} images • {visibleCount} active</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs shrink-0"
            onClick={() => {
              const visibleImg = itemImages.find(i => !i.is_hidden);
              setCardPreviewImage(visibleImg?.image_url || selectedItem.image_url || null);
              setCardPreviewOpen(true);
            }}
          >
            <Smartphone className="h-3.5 w-3.5" /> Card Preview
          </Button>
        </div>

        {/* Title Image */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title Image</h5>
          <p className="text-[10px] text-muted-foreground">Replaces the text name on cards. Bleeds over the card image edges.</p>
          {selectedItem.title_image_url ? (
            adjustingTitleImage ? (
              /* ── Title Image Adjust Editor ── */
              <div className="space-y-4">
                {/* Live card preview */}
                <div className="flex flex-col rounded-2xl border border-border bg-card overflow-visible max-w-[280px] mx-auto">
                  <div className="w-full aspect-[5/4] overflow-hidden relative bg-muted/30">
                    {selectedItem.image_url ? (
                      <img src={selectedItem.image_url} alt={selectedItem.name} className="w-full h-full object-contain" draggable={false} />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">{selectedItem.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="px-2 py-1.5 text-center overflow-visible relative z-20">
                    <img
                      src={selectedItem.title_image_url}
                      alt={selectedItem.name}
                      className="w-auto object-contain mx-auto"
                      draggable={false}
                      style={{
                        transform: tiScale !== 1 ? `scale(${tiScale})` : undefined,
                        marginTop: `${tiOffsetY}px`,
                        marginLeft: `${tiOffsetX + 50}px`,
                        maxHeight: tiMaxHeight > 0 ? `${tiMaxHeight}px` : undefined,
                        maxWidth: '75%',
                      }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="grid grid-cols-1 gap-3">
                  {/* Scale */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Scale</label>
                      <Input
                        type="number" min={0.1} max={15} step={0.05}
                        value={tiScale.toFixed(2)}
                        onChange={e => { const n = parseFloat(e.target.value); if (!isNaN(n)) setTiScale(Math.max(0.1, Math.min(15, n))); }}
                        className="w-16 h-6 text-[10px] text-right px-1 font-mono"
                      />
                    </div>
                    <Slider min={0.1} max={15} step={0.05} value={[tiScale]} onValueChange={([v]) => setTiScale(v)} />
                  </div>

                  {/* Vertical Offset with +/- buttons */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Vertical Offset</label>
                      <div className="flex items-center gap-0.5">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setTiOffsetY(v => Math.max(-600, v - 1))}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number" min={-600} max={300}
                          value={tiOffsetY}
                          onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setTiOffsetY(Math.max(-600, Math.min(300, n))); }}
                          className="w-14 h-6 text-[10px] text-right px-1 font-mono"
                        />
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setTiOffsetY(v => Math.min(300, v + 1))}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Slider min={-600} max={300} step={1} value={[tiOffsetY]} onValueChange={([v]) => setTiOffsetY(v)} />
                  </div>

                  {/* Horizontal Offset with +/- buttons */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Horizontal Offset</label>
                      <div className="flex items-center gap-0.5">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setTiOffsetX(v => Math.max(-200, v - 1))}>
                          <ChevronLeft className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number" min={-200} max={200}
                          value={tiOffsetX}
                          onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setTiOffsetX(Math.max(-200, Math.min(200, n))); }}
                          className="w-14 h-6 text-[10px] text-right px-1 font-mono"
                        />
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setTiOffsetX(v => Math.min(200, v + 1))}>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <Slider min={-200} max={200} step={1} value={[tiOffsetX]} onValueChange={([v]) => setTiOffsetX(v)} />
                  </div>

                  {/* Max Height */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Max Height (0 = auto)</label>
                      <Input
                        type="number" min={0} max={600}
                        value={tiMaxHeight}
                        onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) setTiMaxHeight(Math.max(0, Math.min(600, n))); }}
                        className="w-16 h-6 text-[10px] text-right px-1 font-mono"
                      />
                    </div>
                    <Slider min={0} max={600} step={1} value={[tiMaxHeight]} onValueChange={([v]) => setTiMaxHeight(v)} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setAdjustingTitleImage(false)}>Cancel</Button>
                  <Button className="flex-1" onClick={async () => {
                    const { error } = await supabase.from("preset_items").update({
                      title_image_scale: tiScale,
                      title_image_offset_y: tiOffsetY,
                      title_image_offset_x: tiOffsetX,
                      title_image_max_height: tiMaxHeight,
                    } as any).eq("id", selectedItem.id);
                    if (error) { toast.error(error.message); return; }
                    const updated = { ...selectedItem, title_image_scale: tiScale, title_image_offset_y: tiOffsetY, title_image_offset_x: tiOffsetX, title_image_max_height: tiMaxHeight };
                    setSelectedItem(updated);
                    setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...updated } : i));
                    setAdjustingTitleImage(false);
                    toast.success("Title image sizing saved");
                  }}>Save</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <img src={selectedItem.title_image_url} alt="Title" className="max-h-12 w-auto object-contain rounded border border-border bg-muted p-1" />
                <Button size="sm" variant="outline" onClick={() => {
                  setTiScale(selectedItem.title_image_scale ?? 1);
                  setTiOffsetY(selectedItem.title_image_offset_y ?? 0);
                  setTiOffsetX(selectedItem.title_image_offset_x ?? 0);
                  setTiMaxHeight(selectedItem.title_image_max_height ?? 0);
                  setAdjustingTitleImage(true);
                }} className="gap-1">
                  <Maximize2 className="h-3.5 w-3.5" /> Adjust
                </Button>
                <Button size="sm" variant="destructive" onClick={async () => {
                  const { error } = await supabase.from("preset_items").update({ title_image_url: null } as any).eq("id", selectedItem.id);
                  if (error) { toast.error(error.message); return; }
                  setSelectedItem({ ...selectedItem, title_image_url: null });
                  setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, title_image_url: null } : i));
                  toast.success("Title image removed");
                }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={titleImageUrl}
                  onChange={(e) => setTitleImageUrl(e.target.value)}
                  placeholder="Paste title image URL..."
                  className="text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && titleImageUrl.trim()) {
                      const { error } = await supabase.from("preset_items").update({ title_image_url: titleImageUrl.trim() } as any).eq("id", selectedItem.id);
                      if (error) { toast.error(error.message); return; }
                      setSelectedItem({ ...selectedItem, title_image_url: titleImageUrl.trim() });
                      setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, title_image_url: titleImageUrl.trim() } : i));
                      setTitleImageUrl("");
                      toast.success("Title image set");
                    }
                  }}
                />
                <Button size="sm" onClick={async () => {
                  if (!titleImageUrl.trim()) return;
                  const { error } = await supabase.from("preset_items").update({ title_image_url: titleImageUrl.trim() } as any).eq("id", selectedItem.id);
                  if (error) { toast.error(error.message); return; }
                  setSelectedItem({ ...selectedItem, title_image_url: titleImageUrl.trim() });
                  setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, title_image_url: titleImageUrl.trim() } : i));
                  setTitleImageUrl("");
                  toast.success("Title image set");
                }} disabled={!titleImageUrl.trim()} className="gap-1 shrink-0">
                  <Link className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <div>
                <input ref={titleImageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
                  if (!allowedTypes.includes(file.type)) { toast.error("Only JPEG, PNG, WebP, GIF"); return; }
                  if (file.size > 20 * 1024 * 1024) { toast.error("Max 20MB"); return; }
                  setUploadingTitleImage(true);
                  const ext = file.name.split(".").pop();
                  const path = `preset-items/${selectedItem.id}/title-${Date.now()}.${ext}`;
                  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file);
                  if (uploadError) { toast.error(uploadError.message); setUploadingTitleImage(false); return; }
                  const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
                  const { error } = await supabase.from("preset_items").update({ title_image_url: urlData.publicUrl } as any).eq("id", selectedItem.id);
                  if (error) { toast.error(error.message); setUploadingTitleImage(false); return; }
                  setSelectedItem({ ...selectedItem, title_image_url: urlData.publicUrl });
                  setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, title_image_url: urlData.publicUrl } : i));
                  setUploadingTitleImage(false);
                  toast.success("Title image uploaded");
                  if (titleImageInputRef.current) titleImageInputRef.current.value = "";
                }} className="hidden" />
                <Button size="sm" variant="outline" onClick={() => titleImageInputRef.current?.click()} disabled={uploadingTitleImage} className="gap-1">
                  <Upload className="h-3.5 w-3.5" /> {uploadingTitleImage ? "Uploading..." : "Upload File"}
                </Button>
              </div>
            </div>
          )}
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

        {/* Show hidden toggle */}
        {itemImages.some(i => i.is_hidden) && (
          <Button
            size="sm"
            variant={showHiddenImages ? "default" : "outline"}
            className="gap-1.5 text-xs"
            onClick={() => setShowHiddenImages(!showHiddenImages)}
          >
            {showHiddenImages ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showHiddenImages ? "Hide hidden" : `Show hidden (${itemImages.filter(i => i.is_hidden).length})`}
          </Button>
        )}

        {/* Images grid */}
        {itemImages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No images yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {itemImages.filter(img => showHiddenImages || !img.is_hidden).map(img => {
              const isPreview = selectedItem.image_url === img.image_url;
              return (
                <div key={img.id} className={`relative rounded-xl border overflow-hidden group ${img.is_hidden ? "opacity-40 border-destructive" : isPreview ? "border-primary border-2" : "border-border"}`}>
                  <img src={img.image_url} alt="" className="w-full aspect-square object-cover bg-muted cursor-pointer" onClick={() => setViewingImage(img.image_url)} />
                  <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 flex-wrap">
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setViewingImage(img.image_url)}>
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setPositioningImage(img)} title="Position & Zoom">
                      <Move className="h-4 w-4" />
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
                    <span className="text-muted-foreground">{imageClickCounts.get(img.id) || 0} clicks</span>
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

        {/* Card Preview Dialog — mirrors exact swipe card layout */}
        <Dialog open={cardPreviewOpen} onOpenChange={setCardPreviewOpen}>
          <DialogContent className="max-w-sm p-4 bg-background/95 backdrop-blur-xl">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Card Preview — as seen in game</h4>
            {/* Image selector */}
            {itemImages.filter(i => !i.is_hidden).length > 1 && (
              <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
                {itemImages.filter(i => !i.is_hidden).map(img => (
                  <button
                    key={img.id}
                    onClick={() => setCardPreviewImage(img.image_url)}
                    className={`h-10 w-10 rounded-lg border-2 overflow-hidden shrink-0 transition-all ${
                      cardPreviewImage === img.image_url ? "border-primary ring-1 ring-primary/30" : "border-border"
                    }`}
                  >
                    <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            {(() => {
              const previewImg = itemImages.find(i => i.image_url === cardPreviewImage);
              const imgStyle = previewImg ? {
                objectPosition: `${previewImg.focal_x}% ${previewImg.focal_y}%`,
                transform: `scale(${previewImg.zoom})`,
                transformOrigin: `${previewImg.focal_x}% ${previewImg.focal_y}%`,
              } : {};
              return (
                <>
                  {/* Simulated card */}
                  <div className={`flex flex-col rounded-2xl border border-border bg-card max-w-[320px] mx-auto ${selectedItem.title_image_url ? 'overflow-visible' : 'overflow-hidden'}`}>
                    <div className="w-full aspect-[5/4] bg-muted/30 overflow-hidden relative">
                      {cardPreviewImage && (
                        <img src={cardPreviewImage} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-20" aria-hidden="true" />
                      )}
                      {cardPreviewImage ? (
                        <img src={cardPreviewImage} alt={selectedItem.name} className="w-full h-full object-contain relative z-10" style={imgStyle} />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">{selectedItem.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className={`px-2 py-1.5 flex-shrink-0 ${selectedItem.title_image_url ? 'overflow-visible' : ''}`}>
                      <div className="text-center">
                        {selectedItem.title_image_url ? (
                          <img
                            src={selectedItem.title_image_url}
                            alt={selectedItem.name}
                            className="w-auto object-contain mx-auto"
                            draggable={false}
                            style={{
                              transform: (selectedItem.title_image_scale ?? 1) !== 1 ? `scale(${selectedItem.title_image_scale})` : undefined,
                              marginTop: `${selectedItem.title_image_offset_y ?? 0}px`,
                              marginLeft: `${(selectedItem.title_image_offset_x ?? 0) + 50}px`,
                              maxHeight: (selectedItem.title_image_max_height ?? 0) > 0 ? `${selectedItem.title_image_max_height}px` : undefined,
                              maxWidth: '75%',
                            }}
                          />
                        ) : (
                          <>
                            <h3 className="text-sm font-extrabold text-foreground truncate">{selectedItem.name}</h3>
                            {selectedItem.subtitle && <p className="text-[10px] text-muted-foreground truncate">{selectedItem.subtitle}</p>}
                          </>
                        )}
                      </div>
                      <div className="flex items-center justify-center gap-3 mt-0.5">
                        <span className="text-[10px] font-semibold text-primary">{selectedItem.elo}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center mt-2">Mobile portrait uses 5:4 • Desktop/landscape uses 3:4</p>
                  <details className="mt-2">
                    <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">Show desktop (3:4) preview</summary>
                    <div className="flex flex-col rounded-2xl border border-border bg-card overflow-hidden max-w-[240px] mx-auto mt-2">
                      <div className="w-full aspect-[3/4] bg-muted/30 overflow-hidden">
                        {cardPreviewImage ? (
                          <img src={cardPreviewImage} alt={selectedItem.name} className="w-full h-full object-contain" style={imgStyle} />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-3xl font-black text-muted-foreground/30">{selectedItem.name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="px-2 py-1.5">
                        <h3 className="text-xs font-extrabold text-foreground truncate text-center">{selectedItem.name}</h3>
                        <div className="flex items-center justify-center mt-0.5">
                          <span className="text-[10px] font-semibold text-primary">{selectedItem.elo}</span>
                        </div>
                      </div>
                    </div>
                  </details>
                </>
              );
            })()}
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
            <div
              key={item.id}
              className="flex items-center gap-3 w-full rounded-xl border border-border bg-card p-3 hover:bg-accent/30 transition-colors"
            >
              <button
                onClick={() => openItemImages(item)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{item.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>This will permanently delete this item and all its images. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                      const { error } = await supabase.from("preset_items").delete().eq("id", item.id);
                      if (error) { toast.error(error.message); return; }
                      toast.success(`"${item.name}" deleted`);
                      loadItems();
                    }}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        })}
      </div>
    </div>
  );
}
