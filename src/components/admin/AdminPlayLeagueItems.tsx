import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Upload, Link, Eye, EyeOff, Maximize2, ImageIcon, Star, Smartphone, Move, Film } from "lucide-react";
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
import CardPreviewEditor from "./CardPreviewEditor";
import { gifToWebm } from "@/lib/gif-to-video";

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
  mobile_title_image_scale?: number | null;
  mobile_title_image_offset_y?: number | null;
  mobile_title_image_offset_x?: number | null;
  mobile_title_image_max_height?: number | null;
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
  mobile_focal_x?: number | null;
  mobile_focal_y?: number | null;
  mobile_zoom?: number | null;
  mobile_pad_top?: number | null;
  mobile_pad_left?: number | null;
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
  const [imageClickCounts, setImageClickCounts] = useState<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [addItemName, setAddItemName] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [showHiddenImages, setShowHiddenImages] = useState(false);
  const [convertingAll, setConvertingAll] = useState(false);
  const [convertProgress, setConvertProgress] = useState("");
  const [previewEditorOpen, setPreviewEditorOpen] = useState(false);
  const [previewEditorImageId, setPreviewEditorImageId] = useState<string | undefined>(undefined);

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

    const isGif = file.type === "image/gif";

    const ext = file.name.split(".").pop();
    const ts = Date.now();
    const path = `preset-items/${selectedItem.id}/${ts}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file);
    if (uploadError) { toast.error(uploadError.message); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
    const originalUrl = urlData.publicUrl;

    // GIF conversion pipeline
    let webmUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    let conversionMeta: { width: number; height: number; duration: number } | null = null;

    if (isGif) {
      toast.info("Converting GIF to optimized video…");
      try {
        const result = await gifToWebm(file);
        if (result) {
          // Upload WebM
          const webmPath = `preset-items/${selectedItem.id}/${ts}.webm`;
          const { error: webmErr } = await supabase.storage
            .from("profile-photos")
            .upload(webmPath, result.webmBlob, { contentType: "video/webm" });
          if (!webmErr) {
            const { data: webmData } = supabase.storage.from("profile-photos").getPublicUrl(webmPath);
            webmUrl = webmData.publicUrl;
          }

          // Upload thumbnail
          const thumbPath = `preset-items/${selectedItem.id}/${ts}_thumb.jpg`;
          const { error: thumbErr } = await supabase.storage
            .from("profile-photos")
            .upload(thumbPath, result.thumbnailBlob, { contentType: "image/jpeg" });
          if (!thumbErr) {
            const { data: thumbData } = supabase.storage.from("profile-photos").getPublicUrl(thumbPath);
            thumbnailUrl = thumbData.publicUrl;
          }

          conversionMeta = { width: result.width, height: result.height, duration: result.duration };
        }
      } catch (err) {
        console.error("GIF conversion failed:", err);
        toast.warning("GIF conversion failed — original GIF will be used");
      }
    }

    const nextOrder = itemImages.length;
    const { data, error } = await supabase
      .from("preset_item_images")
      .insert({ preset_item_id: selectedItem.id, image_url: originalUrl, sort_order: nextOrder })
      .select()
      .single();
    if (error) { toast.error(error.message); setUploading(false); return; }
    setItemImages(prev => [...prev, data as ItemImage]);
    setImageCountMap(prev => {
      const next = new Map(prev);
      next.set(selectedItem.id, (next.get(selectedItem.id) || 0) + 1);
      return next;
    });

    // Store processed media record
    if (isGif) {
      await supabase.from("processed_media" as any).insert({
        original_url: originalUrl,
        webm_url: webmUrl,
        thumbnail_url: thumbnailUrl,
        media_type: "gif",
        width: conversionMeta?.width ?? null,
        height: conversionMeta?.height ?? null,
        duration: conversionMeta?.duration ?? null,
      });
    }

    // Auto-set preview if none exists
    if (!selectedItem.image_url) {
      await setPreviewImage(originalUrl);
    }
    setUploading(false);
    if (webmUrl) {
      toast.success("GIF converted to optimized video & uploaded");
    } else if (isGif) {
      toast.success("GIF uploaded (conversion unavailable in this browser)");
    } else {
      toast.success("Image uploaded & added");
    }
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

  const handleSavePosition = async (img: ItemImage, focalX: number, focalY: number, zoom: number, padTop: number, padLeft: number, mFx?: number | null, mFy?: number | null, mZ?: number | null, mPt?: number | null, mPl?: number | null) => {
    const { error } = await supabase
      .from("preset_item_images")
      .update({ focal_x: focalX, focal_y: focalY, zoom, pad_top: padTop, pad_left: padLeft, mobile_focal_x: mFx ?? null, mobile_focal_y: mFy ?? null, mobile_zoom: mZ ?? null, mobile_pad_top: mPt ?? null, mobile_pad_left: mPl ?? null } as any)
      .eq("id", img.id);
    if (error) { toast.error(error.message); return; }
    setItemImages(prev => prev.map(i => i.id === img.id ? { ...i, focal_x: focalX, focal_y: focalY, zoom, pad_top: padTop, pad_left: padLeft, mobile_focal_x: mFx ?? null, mobile_focal_y: mFy ?? null, mobile_zoom: mZ ?? null, mobile_pad_top: mPt ?? null, mobile_pad_left: mPl ?? null } : i));
    setPreviewEditorOpen(false);
    toast.success("Position saved");
  };


  const handleConvertAllGifs = async () => {
    setConvertingAll(true);
    setConvertProgress("Scanning…");
    try {
      // Get all preset_item_images for this league's items that are GIFs
      const itemIds = items.map(i => i.id);
      if (itemIds.length === 0) { toast.info("No items in this league"); setConvertingAll(false); return; }

      const { data: allImages } = await supabase
        .from("preset_item_images")
        .select("id, preset_item_id, image_url")
        .in("preset_item_id", itemIds);

      const gifImages = (allImages || []).filter(img =>
        img.image_url && img.image_url.toLowerCase().split("?")[0].endsWith(".gif")
      );

      if (gifImages.length === 0) {
        toast.info("No GIFs found to convert");
        setConvertingAll(false);
        setConvertProgress("");
        return;
      }

      let converted = 0;
      let failed = 0;

      for (const gifImg of gifImages) {
        setConvertProgress(`${converted + 1}/${gifImages.length}`);
        try {
          // Fetch the GIF
          const response = await fetch(gifImg.image_url);
          const blob = await response.blob();
          const file = new File([blob], "image.gif", { type: "image/gif" });

          const result = await gifToWebm(file);
          if (!result) { failed++; continue; }

          const ts = Date.now();
          // Upload WebM
          const webmPath = `preset-items/${gifImg.preset_item_id}/${ts}.webm`;
          const { error: webmErr } = await supabase.storage
            .from("profile-photos")
            .upload(webmPath, result.webmBlob, { contentType: "video/webm" });
          if (webmErr) { failed++; continue; }
          const { data: webmData } = supabase.storage.from("profile-photos").getPublicUrl(webmPath);
          const webmUrl = webmData.publicUrl;

          // Upload thumbnail
          const thumbPath = `preset-items/${gifImg.preset_item_id}/${ts}_thumb.jpg`;
          await supabase.storage
            .from("profile-photos")
            .upload(thumbPath, result.thumbnailBlob, { contentType: "image/jpeg" });
          const { data: thumbData } = supabase.storage.from("profile-photos").getPublicUrl(thumbPath);
          const thumbnailUrl = thumbData.publicUrl;

          // Record in processed_media
          await supabase.from("processed_media").insert({
            original_url: gifImg.image_url,
            webm_url: webmUrl,
            thumbnail_url: thumbnailUrl,
            media_type: "gif",
            width: result.width,
            height: result.height,
            duration: result.duration,
          });

          // Update preset_item_images to point to WebM
          await supabase
            .from("preset_item_images")
            .update({ image_url: webmUrl })
            .eq("id", gifImg.id);

          // Update preset_items.image_url if it pointed to the old GIF
          await supabase
            .from("preset_items")
            .update({ image_url: webmUrl })
            .eq("id", gifImg.preset_item_id)
            .eq("image_url", gifImg.image_url);

          converted++;
        } catch (err) {
          console.error("Failed to convert GIF:", gifImg.image_url, err);
          failed++;
        }
      }

      toast.success(`Converted ${converted}/${gifImages.length} GIFs to WebM${failed > 0 ? ` (${failed} failed)` : ""}`);
      await loadItems();
    } catch (err) {
      console.error("Convert all GIFs error:", err);
      toast.error("Conversion failed");
    } finally {
      setConvertingAll(false);
      setConvertProgress("");
    }
  };

  if (selectedItem) {
    const visibleCount = itemImages.filter(i => !i.is_hidden).length;

    // Unified Preview Editor sub-view
    if (previewEditorOpen) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setPreviewEditorOpen(false)} className="text-muted-foreground gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to {selectedItem.name}
          </Button>
          <CardPreviewEditor
            item={selectedItem}
            images={itemImages}
            initialImageId={previewEditorImageId}
            onSaveImage={async (img, fx, fy, z, pt, pl, mFx, mFy, mZ, mPt, mPl) => {
              await handleSavePosition(img, fx, fy, z, pt, pl, mFx, mFy, mZ, mPt, mPl);
            }}
            onSaveTitleImage={async (scale, offsetY, offsetX, maxHeight, mScale, mOffY, mOffX, mMH) => {
              const { error } = await supabase.from("preset_items").update({
                title_image_scale: scale,
                title_image_offset_y: offsetY,
                title_image_offset_x: offsetX,
                title_image_max_height: maxHeight,
                mobile_title_image_scale: mScale ?? null,
                mobile_title_image_offset_y: mOffY ?? null,
                mobile_title_image_offset_x: mOffX ?? null,
                mobile_title_image_max_height: mMH ?? null,
              } as any).eq("id", selectedItem.id);
              if (error) { toast.error(error.message); return; }
              const updated = { ...selectedItem, title_image_scale: scale, title_image_offset_y: offsetY, title_image_offset_x: offsetX, title_image_max_height: maxHeight, mobile_title_image_scale: mScale, mobile_title_image_offset_y: mOffY, mobile_title_image_offset_x: mOffX, mobile_title_image_max_height: mMH };
              setSelectedItem(updated);
              setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, ...updated } : i));
              toast.success("Title image sizing saved");
            }}
            onSetTitleImageUrl={async (url) => {
              const { error } = await supabase.from("preset_items").update({ title_image_url: url } as any).eq("id", selectedItem.id);
              if (error) { toast.error(error.message); return; }
              setSelectedItem({ ...selectedItem, title_image_url: url });
              setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, title_image_url: url } : i));
              toast.success(url ? "Title image set" : "Title image removed");
            }}
            onCancel={() => setPreviewEditorOpen(false)}
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
              setPreviewEditorImageId(undefined);
              setPreviewEditorOpen(true);
            }}
          >
            <Smartphone className="h-3.5 w-3.5" /> Preview Editor
          </Button>
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
                    <Button size="icon" aria-label="Expand image" variant="secondary" className="h-8 w-8" onClick={() => setViewingImage(img.image_url)}>
                      <Maximize2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" aria-label="Move" variant="secondary" className="h-8 w-8" onClick={() => { setPreviewEditorImageId(img.id); setPreviewEditorOpen(true); }} title="Preview Editor">
                      <Move className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon" aria-label="Toggle preview"
                      variant={isPreview ? "default" : "secondary"}
                      className="h-8 w-8"
                      onClick={() => setPreviewImage(img.image_url)}
                      title="Set as preview"
                    >
                      <Star className={`h-4 w-4 ${isPreview ? "fill-current" : ""}`} />
                    </Button>
                    <Button size="icon" aria-label="Toggle visibility" variant={img.is_hidden ? "default" : "secondary"} className="h-8 w-8" onClick={() => handleToggleImageVisibility(img)}>
                      {img.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" aria-label="Delete" variant="destructive" className="h-8 w-8"><Trash2 className="h-4 w-4" /></Button>
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

      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 w-full"
        disabled={convertingAll || items.length === 0}
        onClick={handleConvertAllGifs}
      >
        <Film className="h-3.5 w-3.5" />
        {convertingAll ? `Converting ${convertProgress}…` : "Convert All GIFs to WebM"}
      </Button>

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
                  <Button size="icon" aria-label="Delete" variant="ghost" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={(e) => e.stopPropagation()}>
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
