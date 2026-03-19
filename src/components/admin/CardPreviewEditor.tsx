import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RotateCcw, Monitor, Smartphone, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Upload, Link, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AutoVideo from "@/components/AutoVideo";

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
  sort_order: number;
  focal_x: number;
  focal_y: number;
  zoom: number;
  pad_top: number;
  pad_left: number;
}

interface Props {
  item: PresetItem;
  images: ItemImage[];
  initialImageId?: string;
  onSaveImage: (img: ItemImage, focalX: number, focalY: number, zoom: number, padTop: number, padLeft: number) => void;
  onSaveTitleImage: (scale: number, offsetY: number, offsetX: number, maxHeight: number) => void;
  onSetTitleImageUrl: (url: string | null) => void;
  onCancel: () => void;
}

function getImageStyle(img: ItemImage): React.CSSProperties {
  const hasCustom = img.focal_x !== 50 || img.focal_y !== 50 || img.zoom !== 1 || img.pad_top !== 0 || img.pad_left !== 0;
  if (!hasCustom) return {};
  return {
    position: 'absolute' as const,
    top: `${img.pad_top}%`,
    left: `${img.pad_left}%`,
    width: `${100 - img.pad_left}%`,
    height: `${100 - img.pad_top}%`,
    objectPosition: `${img.focal_x}% ${img.focal_y}%`,
    transform: `scale(${img.zoom})`,
    transformOrigin: `${img.focal_x}% ${img.focal_y}%`,
  };
}

function getTitleImageStyle(scale: number, offsetY: number, offsetX: number, maxHeight: number): React.CSSProperties {
  return {
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    marginTop: `${offsetY}px`,
    marginLeft: `${offsetX + 50}px`,
    maxHeight: maxHeight > 0 ? `${maxHeight}px` : undefined,
    maxWidth: '75%',
    position: 'relative' as const,
    zIndex: 30,
  };
}

export default function CardPreviewEditor({ item, images, initialImageId, onSaveImage, onSaveTitleImage, onSetTitleImageUrl, onCancel }: Props) {
  const visibleImages = images.filter(i => !i.is_hidden);
  const initialImg = initialImageId ? visibleImages.find(i => i.id === initialImageId) : visibleImages[0];
  const [selectedImg, setSelectedImg] = useState<ItemImage | null>(initialImg || visibleImages[0] || null);

  // Image controls
  const [focalX, setFocalX] = useState(selectedImg?.focal_x ?? 50);
  const [focalY, setFocalY] = useState(selectedImg?.focal_y ?? 50);
  const [zoom, setZoom] = useState(selectedImg?.zoom ?? 1);
  const [padTop, setPadTop] = useState(selectedImg?.pad_top ?? 0);
  const [padLeft, setPadLeft] = useState(selectedImg?.pad_left ?? 0);

  // Title image controls
  const [tiScale, setTiScale] = useState(item.title_image_scale ?? 1);
  const [tiOffsetY, setTiOffsetY] = useState(item.title_image_offset_y ?? 0);
  const [tiOffsetX, setTiOffsetX] = useState(item.title_image_offset_x ?? 0);
  const [tiMaxHeight, setTiMaxHeight] = useState(item.title_image_max_height ?? 0);
  const [titleImageUrl, setTitleImageUrl] = useState("");
  const [uploadingTitle, setUploadingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"mobile" | "desktop">("mobile");
  const [cardBgOpacity, setCardBgOpacity] = useState(20);
  const [imageOpen, setImageOpen] = useState(true);
  const [titleOpen, setTitleOpen] = useState(!!item.title_image_url);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    supabase.from("app_settings").select("key, value").eq("key", "card_bg_opacity").single().then(({ data }) => {
      if (data) setCardBgOpacity((data.value as any)?.opacity ?? 20);
    });
  }, []);

  const syncImageState = (img: ItemImage) => {
    setFocalX(img.focal_x);
    setFocalY(img.focal_y);
    setZoom(img.zoom);
    setPadTop(img.pad_top);
    setPadLeft(img.pad_left);
  };

  const selectImage = (img: ItemImage) => {
    setSelectedImg(img);
    syncImageState(img);
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFocal(e);
  }, []);
  const handlePointerMove = useCallback((e: React.PointerEvent) => { if (dragging.current) updateFocal(e); }, []);
  const handlePointerUp = useCallback(() => { dragging.current = false; }, []);

  const updateFocal = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setFocalX(Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))));
    setFocalY(Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))));
  };

  const handleResetImage = () => { setFocalX(50); setFocalY(50); setZoom(1); setPadTop(0); setPadLeft(0); };
  const handleResetTitle = () => { setTiScale(1); setTiOffsetY(0); setTiOffsetX(0); setTiMaxHeight(0); };

  const clampInt = (v: string, min: number, max: number) => { const n = parseInt(v, 10); return isNaN(n) ? min : Math.max(min, Math.min(max, n)); };

  // Current preview style using live state
  const liveImgStyle: React.CSSProperties = selectedImg ? {
    position: 'absolute' as const,
    top: `${padTop}%`,
    left: `${padLeft}%`,
    width: `${100 - padLeft}%`,
    height: `${100 - padTop}%`,
    objectPosition: `${focalX}% ${focalY}%`,
    transform: `scale(${zoom})`,
    transformOrigin: `${focalX}% ${focalY}%`,
  } : {};

  const hasCustomPos = focalX !== 50 || focalY !== 50 || zoom !== 1 || padTop !== 0 || padLeft !== 0;
  const displayUrl = selectedImg?.image_url || item.image_url;
  const aspectClass = mode === "mobile" ? "aspect-[5/4]" : "aspect-[3/4]";

  const handleSaveAll = () => {
    if (selectedImg) {
      onSaveImage(selectedImg, focalX, focalY, zoom, padTop, padLeft);
    }
    if (item.title_image_url) {
      onSaveTitleImage(tiScale, tiOffsetY, tiOffsetX, tiMaxHeight);
    }
  };

  const handleUploadTitleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) { toast.error("Only JPEG, PNG, WebP, GIF"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Max 20MB"); return; }
    setUploadingTitle(true);
    const ext = file.name.split(".").pop();
    const path = `preset-items/${item.id}/title-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file);
    if (uploadError) { toast.error(uploadError.message); setUploadingTitle(false); return; }
    const { data: urlData } = supabase.storage.from("profile-photos").getPublicUrl(path);
    onSetTitleImageUrl(urlData.publicUrl);
    setUploadingTitle(false);
    toast.success("Title image uploaded");
    if (titleInputRef.current) titleInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">Preview Editor</h4>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button
            onClick={() => setMode("desktop")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${mode === "desktop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button
            onClick={() => setMode("mobile")}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${mode === "mobile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>
      </div>

      {/* Live preview card — 1:1 match to SwipePreset */}
      <div className={`flex flex-col rounded-2xl border border-border bg-card mx-auto ${item.title_image_url ? 'overflow-visible' : 'overflow-hidden'} ${mode === "mobile" ? "max-w-[300px]" : "max-w-[260px]"}`}>
        <div
          ref={containerRef}
          className={`w-full ${aspectClass} overflow-hidden relative cursor-crosshair select-none bg-muted/30`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: "none" }}
        >
          {/* Blurred background layer */}
          {displayUrl && (
            <img src={displayUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl pointer-events-none" style={{ opacity: cardBgOpacity / 100 }} aria-hidden="true" draggable={false} />
          )}
          {/* Main image */}
          {displayUrl ? (
            <img
              src={displayUrl}
              alt={item.name}
              className={`${hasCustomPos ? 'absolute' : 'w-full h-full'} object-contain pointer-events-none relative z-10`}
              draggable={false}
              style={hasCustomPos ? liveImgStyle : {}}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-4xl font-black text-muted-foreground/30">{item.name.charAt(0)}</span>
          )}
          {/* Focal point indicator */}
          {selectedImg && (
            <div
              className="absolute w-5 h-5 rounded-full border-2 border-primary bg-primary/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg z-20"
              style={{ left: `${padLeft + (100 - padLeft) * focalX / 100}%`, top: `${padTop + (100 - padTop) * focalY / 100}%` }}
            >
              <div className="absolute inset-[3px] rounded-full bg-primary" />
            </div>
          )}
        </div>

        {/* Footer — matches game layout */}
        {mode === "mobile" ? (
          <div className={`px-1.5 py-0.5 flex-shrink-0 relative z-20 ${item.title_image_url ? 'overflow-visible' : ''}`}>
            <div className="flex items-center justify-between gap-1">
              {item.title_image_url ? (
                <img src={item.title_image_url} alt={item.name} className="w-auto object-contain" style={getTitleImageStyle(tiScale, tiOffsetY, tiOffsetX, tiMaxHeight)} draggable={false} />
              ) : (
                <h3 className="text-xs font-extrabold text-foreground truncate">{item.name}</h3>
              )}
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  <span className="font-semibold text-primary">{item.elo}</span>
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className={`px-2 py-1.5 flex-shrink-0 relative z-20 ${item.title_image_url ? 'overflow-visible' : ''}`}>
            <div className="text-center">
              {item.title_image_url ? (
                <img src={item.title_image_url} alt={item.name} className="w-auto object-contain mx-auto" style={getTitleImageStyle(tiScale, tiOffsetY, tiOffsetX, tiMaxHeight)} draggable={false} />
              ) : (
                <>
                  <h3 className="text-sm font-extrabold text-foreground truncate">{item.name}</h3>
                  {item.subtitle && <p className="text-[10px] text-muted-foreground truncate">{item.subtitle}</p>}
                </>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mt-0.5">
              <span className="text-[10px] font-semibold text-primary">{item.elo}</span>
            </div>
          </div>
        )}
      </div>

      {/* Image selector strip */}
      {visibleImages.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {visibleImages.map(img => (
            <button
              key={img.id}
              onClick={() => selectImage(img)}
              className={`h-10 w-10 rounded-lg border-2 overflow-hidden shrink-0 transition-all ${selectedImg?.id === img.id ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
            >
              <img src={img.image_url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Image Controls */}
      <Collapsible open={imageOpen} onOpenChange={setImageOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground py-1.5">
            <span>Image Controls</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleResetImage(); }} className="gap-1 text-[10px] h-6 px-1.5">
                <RotateCcw className="h-2.5 w-2.5" /> Reset
              </Button>
              {imageOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <ControlSlider label="Focal X" value={focalX} min={0} max={100} step={1} onChange={setFocalX} />
            <ControlSlider label="Focal Y" value={focalY} min={0} max={100} step={1} onChange={setFocalY} />
            <ControlSlider label="Zoom" value={zoom} min={0.3} max={3} step={0.05} onChange={setZoom} isFloat />
            <ControlSlider label="Border Top" value={padTop} min={0} max={50} step={1} onChange={setPadTop} />
            <div className="col-span-2">
              <ControlSlider label="Border Left" value={padLeft} min={0} max={50} step={1} onChange={setPadLeft} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Title Image Controls */}
      <Collapsible open={titleOpen} onOpenChange={setTitleOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground py-1.5">
            <span>Title Image</span>
            {titleOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {item.title_image_url ? (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2">
                <img src={item.title_image_url} alt="Title" className="max-h-8 w-auto object-contain rounded border border-border bg-muted p-0.5" />
                <Button size="sm" variant="destructive" className="h-7 gap-1 text-[10px]" onClick={() => onSetTitleImageUrl(null)}>
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
                <Button variant="ghost" size="sm" onClick={handleResetTitle} className="gap-1 text-[10px] h-7 px-1.5">
                  <RotateCcw className="h-2.5 w-2.5" /> Reset
                </Button>
              </div>
              <ControlSlider label="Scale" value={tiScale} min={0.1} max={15} step={0.05} onChange={setTiScale} isFloat />
              <NudgeSlider label="Vertical Offset" value={tiOffsetY} min={-600} max={300} onChange={setTiOffsetY} decIcon={<ChevronDown className="h-3 w-3" />} incIcon={<ChevronUp className="h-3 w-3" />} />
              <NudgeSlider label="Horizontal Offset" value={tiOffsetX} min={-200} max={200} onChange={setTiOffsetX} decIcon={<ChevronLeft className="h-3 w-3" />} incIcon={<ChevronRight className="h-3 w-3" />} />
              <ControlSlider label="Max Height (0=auto)" value={tiMaxHeight} min={0} max={600} step={1} onChange={setTiMaxHeight} />
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex gap-2">
                <Input
                  value={titleImageUrl}
                  onChange={e => setTitleImageUrl(e.target.value)}
                  placeholder="Paste title image URL..."
                  className="text-sm"
                  onKeyDown={e => {
                    if (e.key === "Enter" && titleImageUrl.trim()) {
                      onSetTitleImageUrl(titleImageUrl.trim());
                      setTitleImageUrl("");
                    }
                  }}
                />
                <Button size="sm" onClick={() => { if (titleImageUrl.trim()) { onSetTitleImageUrl(titleImageUrl.trim()); setTitleImageUrl(""); } }} disabled={!titleImageUrl.trim()} className="gap-1 shrink-0">
                  <Link className="h-3.5 w-3.5" /> Add
                </Button>
              </div>
              <div>
                <input ref={titleInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleUploadTitleImage} className="hidden" />
                <Button size="sm" variant="outline" onClick={() => titleInputRef.current?.click()} disabled={uploadingTitle} className="gap-1">
                  <Upload className="h-3.5 w-3.5" /> {uploadingTitle ? "Uploading..." : "Upload File"}
                </Button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
        <Button className="flex-1" onClick={handleSaveAll}>Save All</Button>
      </div>
    </div>
  );
}

/* ─── Reusable control sub-components ─── */

function ControlSlider({ label, value, min, max, step, onChange, isFloat }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; isFloat?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        <Input
          type="number" min={min} max={max} step={step}
          value={isFloat ? value.toFixed(2) : value}
          onChange={e => {
            const n = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
          }}
          className="w-14 h-6 text-[10px] text-right px-1 font-mono"
        />
      </div>
      <Slider min={min} max={max} step={step} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function NudgeSlider({ label, value, min, max, onChange, decIcon, incIcon }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void; decIcon: React.ReactNode; incIcon: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => onChange(Math.max(min, value - 1))}>{decIcon}</Button>
          <Input
            type="number" min={min} max={max}
            value={value}
            onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) onChange(Math.max(min, Math.min(max, n))); }}
            className="w-14 h-6 text-[10px] text-right px-1 font-mono"
          />
          <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => onChange(Math.min(max, value + 1))}>{incIcon}</Button>
        </div>
      </div>
      <Slider min={min} max={max} step={1} value={[value]} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
