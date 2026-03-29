import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RotateCcw, Monitor, Smartphone, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Upload, Link, Trash2, Copy, Ruler, Crosshair } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import AutoVideo from "@/components/AutoVideo";
import CardStatsFooter from "@/components/CardStatsFooter";
import { type CardStatsConfig, DEFAULT_CARD_STATS_CONFIG } from "@/hooks/useAppSettings";

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
  item: PresetItem;
  images: ItemImage[];
  initialImageId?: string;
  onSaveImage: (img: ItemImage, focalX: number, focalY: number, zoom: number, padTop: number, padLeft: number, mobileFocalX: number | null, mobileFocalY: number | null, mobileZoom: number | null, mobilePadTop: number | null, mobilePadLeft: number | null) => void;
  onSaveTitleImage: (scale: number, offsetY: number, offsetX: number, maxHeight: number, mobileScale: number | null, mobileOffsetY: number | null, mobileOffsetX: number | null, mobileMaxHeight: number | null) => void;
  onSetTitleImageUrl: (url: string | null) => void;
  onCancel: () => void;
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

  // Desktop image controls
  const [focalX, setFocalX] = useState(selectedImg?.focal_x ?? 50);
  const [focalY, setFocalY] = useState(selectedImg?.focal_y ?? 50);
  const [zoom, setZoom] = useState(selectedImg?.zoom ?? 1);
  const [padTop, setPadTop] = useState(selectedImg?.pad_top ?? 0);
  const [padLeft, setPadLeft] = useState(selectedImg?.pad_left ?? 0);

  // Mobile image controls (null = use desktop)
  const [mobileFocalX, setMobileFocalX] = useState<number>(selectedImg?.mobile_focal_x ?? selectedImg?.focal_x ?? 50);
  const [mobileFocalY, setMobileFocalY] = useState<number>(selectedImg?.mobile_focal_y ?? selectedImg?.focal_y ?? 50);
  const [mobileZoom, setMobileZoom] = useState<number>(selectedImg?.mobile_zoom ?? selectedImg?.zoom ?? 1);
  const [mobilePadTop, setMobilePadTop] = useState<number>(selectedImg?.mobile_pad_top ?? selectedImg?.pad_top ?? 0);
  const [mobilePadLeft, setMobilePadLeft] = useState<number>(selectedImg?.mobile_pad_left ?? selectedImg?.pad_left ?? 0);
  const [mobileHasOverride, setMobileHasOverride] = useState(selectedImg?.mobile_focal_x != null);

  // Desktop title image controls
  const [tiScale, setTiScale] = useState(item.title_image_scale ?? 1);
  const [tiOffsetY, setTiOffsetY] = useState(item.title_image_offset_y ?? 0);
  const [tiOffsetX, setTiOffsetX] = useState(item.title_image_offset_x ?? 0);
  const [tiMaxHeight, setTiMaxHeight] = useState(item.title_image_max_height ?? 0);

  // Mobile title image controls
  const [mTiScale, setMTiScale] = useState<number>(item.mobile_title_image_scale ?? item.title_image_scale ?? 1);
  const [mTiOffsetY, setMTiOffsetY] = useState<number>(item.mobile_title_image_offset_y ?? item.title_image_offset_y ?? 0);
  const [mTiOffsetX, setMTiOffsetX] = useState<number>(item.mobile_title_image_offset_x ?? item.title_image_offset_x ?? 0);
  const [mTiMaxHeight, setMTiMaxHeight] = useState<number>(item.mobile_title_image_max_height ?? item.title_image_max_height ?? 0);
  const [mobileTitleHasOverride, setMobileTitleHasOverride] = useState(item.mobile_title_image_scale != null);

  const [titleImageUrl, setTitleImageUrl] = useState("");
  const [uploadingTitle, setUploadingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<"mobile" | "desktop">("mobile");
  const [cardBgOpacity, setCardBgOpacity] = useState(20);
  const [cardStatsConfig, setCardStatsConfig] = useState<CardStatsConfig>(DEFAULT_CARD_STATS_CONFIG);
  const [imageOpen, setImageOpen] = useState(true);
  const [titleOpen, setTitleOpen] = useState(!!item.title_image_url);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    supabase.from("app_settings").select("key, value").in("key", ["card_bg_opacity", "card_stats_config"]).then(({ data }) => {
      if (data) {
        for (const row of data) {
          if (row.key === "card_bg_opacity") setCardBgOpacity((row.value as any)?.opacity ?? 20);
          if (row.key === "card_stats_config") setCardStatsConfig({ ...DEFAULT_CARD_STATS_CONFIG, ...(row.value as any) });
        }
      }
    });
  }, []);

  // Active state based on mode
  const isDesktop = mode === "desktop";
  const activeFocalX = isDesktop ? focalX : mobileFocalX;
  const activeFocalY = isDesktop ? focalY : mobileFocalY;
  const activeZoom = isDesktop ? zoom : mobileZoom;
  const activePadTop = isDesktop ? padTop : mobilePadTop;
  const activePadLeft = isDesktop ? padLeft : mobilePadLeft;
  const setActiveFocalX = isDesktop ? setFocalX : setMobileFocalX;
  const setActiveFocalY = isDesktop ? setFocalY : setMobileFocalY;
  const setActiveZoom = isDesktop ? setZoom : setMobileZoom;
  const setActivePadTop = isDesktop ? setPadTop : setMobilePadTop;
  const setActivePadLeft = isDesktop ? setPadLeft : setMobilePadLeft;

  const activeTiScale = isDesktop ? tiScale : mTiScale;
  const activeTiOffsetY = isDesktop ? tiOffsetY : mTiOffsetY;
  const activeTiOffsetX = isDesktop ? tiOffsetX : mTiOffsetX;
  const activeTiMaxHeight = isDesktop ? tiMaxHeight : mTiMaxHeight;
  const setActiveTiScale = isDesktop ? setTiScale : setMTiScale;
  const setActiveTiOffsetY = isDesktop ? setTiOffsetY : setMTiOffsetY;
  const setActiveTiOffsetX = isDesktop ? setTiOffsetX : setMTiOffsetX;
  const setActiveTiMaxHeight = isDesktop ? setTiMaxHeight : setMTiMaxHeight;

  const syncImageState = (img: ItemImage) => {
    setFocalX(img.focal_x);
    setFocalY(img.focal_y);
    setZoom(img.zoom);
    setPadTop(img.pad_top);
    setPadLeft(img.pad_left);
    setMobileFocalX(img.mobile_focal_x ?? img.focal_x);
    setMobileFocalY(img.mobile_focal_y ?? img.focal_y);
    setMobileZoom(img.mobile_zoom ?? img.zoom);
    setMobilePadTop(img.mobile_pad_top ?? img.pad_top);
    setMobilePadLeft(img.mobile_pad_left ?? img.pad_left);
    setMobileHasOverride(img.mobile_focal_x != null);
  };

  const selectImage = (img: ItemImage) => {
    setSelectedImg(img);
    syncImageState(img);
  };

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFocal(e);
  }, [mode, isDesktop]);
  const handlePointerMove = useCallback((e: React.PointerEvent) => { if (dragging.current) updateFocal(e); }, [mode, isDesktop]);
  const handlePointerUp = useCallback(() => { dragging.current = false; }, []);

  const updateFocal = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)));
    const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)));
    if (isDesktop) { setFocalX(x); setFocalY(y); }
    else { setMobileFocalX(x); setMobileFocalY(y); if (!mobileHasOverride) setMobileHasOverride(true); }
  };

  const handleResetImage = () => {
    if (isDesktop) { setFocalX(50); setFocalY(50); setZoom(1); setPadTop(0); setPadLeft(0); }
    else { setMobileFocalX(50); setMobileFocalY(50); setMobileZoom(1); setMobilePadTop(0); setMobilePadLeft(0); }
  };
  const handleResetTitle = () => {
    if (isDesktop) { setTiScale(1); setTiOffsetY(0); setTiOffsetX(0); setTiMaxHeight(0); }
    else { setMTiScale(1); setMTiOffsetY(0); setMTiOffsetX(0); setMTiMaxHeight(0); }
  };

  const copyDesktopToMobile = () => {
    setMobileFocalX(focalX); setMobileFocalY(focalY); setMobileZoom(zoom); setMobilePadTop(padTop); setMobilePadLeft(padLeft);
    setMTiScale(tiScale); setMTiOffsetY(tiOffsetY); setMTiOffsetX(tiOffsetX); setMTiMaxHeight(tiMaxHeight);
    setMobileHasOverride(true); setMobileTitleHasOverride(true);
    toast.success("Copied desktop settings to mobile");
  };
  const copyMobileToDesktop = () => {
    setFocalX(mobileFocalX); setFocalY(mobileFocalY); setZoom(mobileZoom); setPadTop(mobilePadTop); setPadLeft(mobilePadLeft);
    setTiScale(mTiScale); setTiOffsetY(mTiOffsetY); setTiOffsetX(mTiOffsetX); setTiMaxHeight(mTiMaxHeight);
    toast.success("Copied mobile settings to desktop");
  };

  // Current preview style using active state
  const hasCustomPos = activeFocalX !== 50 || activeFocalY !== 50 || activeZoom !== 1 || activePadTop !== 0 || activePadLeft !== 0;
  const liveImgStyle: React.CSSProperties = selectedImg ? {
    position: 'absolute' as const,
    top: `${activePadTop}%`,
    left: `${activePadLeft}%`,
    width: `${100 - activePadLeft}%`,
    height: `${100 - activePadTop}%`,
    objectPosition: `${activeFocalX}% ${activeFocalY}%`,
    transform: `scale(${activeZoom})`,
    transformOrigin: `${activeFocalX}% ${activeFocalY}%`,
  } : {};

  const displayUrl = selectedImg?.image_url || item.image_url;
  const aspectClass = mode === "mobile" ? "aspect-[5/4]" : "aspect-[3/4]";

  const handleSaveAll = () => {
    if (selectedImg) {
      const mFx = mobileHasOverride ? mobileFocalX : null;
      const mFy = mobileHasOverride ? mobileFocalY : null;
      const mZ = mobileHasOverride ? mobileZoom : null;
      const mPt = mobileHasOverride ? mobilePadTop : null;
      const mPl = mobileHasOverride ? mobilePadLeft : null;
      onSaveImage(selectedImg, focalX, focalY, zoom, padTop, padLeft, mFx, mFy, mZ, mPt, mPl);
    }
    if (item.title_image_url) {
      const mScale = mobileTitleHasOverride ? mTiScale : null;
      const mOffY = mobileTitleHasOverride ? mTiOffsetY : null;
      const mOffX = mobileTitleHasOverride ? mTiOffsetX : null;
      const mMH = mobileTitleHasOverride ? mTiMaxHeight : null;
      onSaveTitleImage(tiScale, tiOffsetY, tiOffsetX, tiMaxHeight, mScale, mOffY, mOffX, mMH);
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

      {/* Copy buttons */}
      <div className="flex gap-2">
        {mode === "mobile" ? (
          <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={copyDesktopToMobile}>
            <Copy className="h-3 w-3" /> Copy from Desktop
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="gap-1 text-[10px] h-7" onClick={copyMobileToDesktop}>
            <Copy className="h-3 w-3" /> Copy from Mobile
          </Button>
        )}
      </div>

      {/* Live preview card */}
      <div className={`flex flex-col rounded-2xl border border-border bg-card mx-auto ${item.title_image_url ? 'overflow-visible' : 'overflow-hidden'} ${mode === "mobile" ? "max-w-[300px]" : "max-w-[260px]"}`}>
        <div
          ref={containerRef}
          className={`w-full ${aspectClass} overflow-hidden relative cursor-crosshair select-none bg-muted/30`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: "none" }}
        >
          {displayUrl && (
            <img src={displayUrl} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl pointer-events-none" style={{ opacity: cardBgOpacity / 100 }} aria-hidden="true" draggable={false} />
          )}
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
          {selectedImg && (
            <div
              className="absolute w-5 h-5 rounded-full border-2 border-primary bg-primary/30 -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-lg z-20"
              style={{ left: `${activePadLeft + (100 - activePadLeft) * activeFocalX / 100}%`, top: `${activePadTop + (100 - activePadTop) * activeFocalY / 100}%` }}
            >
              <div className="absolute inset-[3px] rounded-full bg-primary" />
            </div>
          )}
        </div>

        <CardStatsFooter
          config={cardStatsConfig}
          isMobile={mode === "mobile"}
          itemName={item.name}
          subtitle={item.subtitle}
          titleImageUrl={item.title_image_url}
          titleImageStyle={getTitleImageStyle(activeTiScale, activeTiOffsetY, activeTiOffsetX, activeTiMaxHeight)}
          localElo={item.elo}
          localRank={1}
          globalElo={item.elo}
          globalRank={1}
          eloChange={null}
          rankOld={null}
          rankNew={null}
          globalDirection={undefined}
          statsHidden={false}
          hasMultipleImages={false}
          onChoose={() => {}}
          onReport={() => {}}
        />
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
            <span>Image Controls {!isDesktop && mobileHasOverride && <span className="text-primary text-[9px] ml-1">(MOBILE)</span>}</span>
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
            <ControlSlider label="Focal X" value={activeFocalX} min={0} max={100} step={1} onChange={(v) => { setActiveFocalX(v); if (!isDesktop && !mobileHasOverride) setMobileHasOverride(true); }} />
            <ControlSlider label="Focal Y" value={activeFocalY} min={0} max={100} step={1} onChange={(v) => { setActiveFocalY(v); if (!isDesktop && !mobileHasOverride) setMobileHasOverride(true); }} />
            <ControlSlider label="Zoom" value={activeZoom} min={0.3} max={3} step={0.05} onChange={(v) => { setActiveZoom(v); if (!isDesktop && !mobileHasOverride) setMobileHasOverride(true); }} isFloat />
            <ControlSlider label="Border Top" value={activePadTop} min={0} max={50} step={1} onChange={(v) => { setActivePadTop(v); if (!isDesktop && !mobileHasOverride) setMobileHasOverride(true); }} />
            <div className="col-span-2">
              <ControlSlider label="Border Left" value={activePadLeft} min={0} max={50} step={1} onChange={(v) => { setActivePadLeft(v); if (!isDesktop && !mobileHasOverride) setMobileHasOverride(true); }} />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Title Image Controls */}
      <Collapsible open={titleOpen} onOpenChange={setTitleOpen}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground py-1.5">
            <span>Title Image {!isDesktop && mobileTitleHasOverride && <span className="text-primary text-[9px] ml-1">(MOBILE)</span>}</span>
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
              <ControlSlider label="Scale" value={activeTiScale} min={0.1} max={15} step={0.05} onChange={(v) => { setActiveTiScale(v); if (!isDesktop && !mobileTitleHasOverride) setMobileTitleHasOverride(true); }} isFloat />
              <NudgeSlider label="Vertical Offset" value={activeTiOffsetY} min={-600} max={300} onChange={(v) => { setActiveTiOffsetY(v); if (!isDesktop && !mobileTitleHasOverride) setMobileTitleHasOverride(true); }} decIcon={<ChevronDown className="h-3 w-3" />} incIcon={<ChevronUp className="h-3 w-3" />} />
              <NudgeSlider label="Horizontal Offset" value={activeTiOffsetX} min={-200} max={200} onChange={(v) => { setActiveTiOffsetX(v); if (!isDesktop && !mobileTitleHasOverride) setMobileTitleHasOverride(true); }} decIcon={<ChevronLeft className="h-3 w-3" />} incIcon={<ChevronRight className="h-3 w-3" />} />
              <ControlSlider label="Max Height (0=auto)" value={activeTiMaxHeight} min={0} max={600} step={1} onChange={(v) => { setActiveTiMaxHeight(v); if (!isDesktop && !mobileTitleHasOverride) setMobileTitleHasOverride(true); }} />
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
