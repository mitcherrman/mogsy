import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Monitor, Smartphone, RotateCcw, Globe } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type CardStatsConfig, DEFAULT_CARD_STATS_CONFIG } from "@/hooks/useAppSettings";
import CardStatsFooter from "@/components/CardStatsFooter";

const FONT_SIZE_MAP: Record<string, string> = {
  "2xs": "8px", "xs": "10px", "sm": "12px", "base": "14px", "lg": "16px",
};
const FONT_SIZE_OPTIONS = Object.keys(FONT_SIZE_MAP);

export default function AdminCardStatsPreview() {
  const [config, setConfig] = useState<CardStatsConfig>(DEFAULT_CARD_STATS_CONFIG);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"mobile" | "desktop">("mobile");

  useEffect(() => {
    supabase.from("app_settings").select("key, value").eq("key", "card_stats_config").single().then(({ data }) => {
      if (data?.value) setConfig({ ...DEFAULT_CARD_STATS_CONFIG, ...(data.value as any) });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({ key: "card_stats_config", value: config as any, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Card stats config saved");
  };

  const handleReset = () => setConfig(DEFAULT_CARD_STATS_CONFIG);
  const update = (patch: Partial<CardStatsConfig>) => setConfig(prev => ({ ...prev, ...patch }));

  const sampleItem = { name: "Sample Item", subtitle: "Subtitle", elo: 1547 };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold text-foreground">Card Stats Preview</h4>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <button onClick={() => setMode("desktop")} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${mode === "desktop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Monitor className="h-3 w-3" /> Desktop
          </button>
          <button onClick={() => setMode("mobile")} className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${mode === "mobile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Smartphone className="h-3 w-3" /> Mobile
          </button>
        </div>
      </div>

      {/* Live preview card */}
      <div className={`rounded-2xl border border-border bg-card mx-auto overflow-hidden ${mode === "mobile" ? "max-w-[300px]" : "max-w-[260px]"}`}>
        <div className={`w-full ${mode === "mobile" ? "aspect-[5/4]" : "aspect-[3/4]"} bg-muted/30 flex items-center justify-center`}>
          <span className="text-4xl font-black text-muted-foreground/20">IMG</span>
        </div>
        <CardStatsFooter
          config={config}
          isMobile={mode === "mobile"}
          itemName={sampleItem.name}
          subtitle={sampleItem.subtitle}
          titleImageUrl={null}
          titleImageStyle={{}}
          localElo={1547}
          localRank={3}
          globalElo={1423}
          globalRank={7}
          eloChange={15}
          rankOld={5}
          rankNew={3}
          globalDirection="up"
          statsHidden={false}
          hasMultipleImages={false}
          onChoose={() => {}}
          onReport={() => {}}
        />
      </div>

      {/* Controls */}
      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        {/* Use Default */}
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">Use Default Layout</label>
          <Switch checked={config.use_default_layout} onCheckedChange={(v) => { if (v) handleReset(); else update({ use_default_layout: false }); }} />
        </div>

        {/* Position */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Position</label>
          <Select value={config.position} onValueChange={(v) => update({ position: v as any })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["bottom-center", "bottom-left", "bottom-right", "below-name", "overlay-bottom"].map(p => (
                <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Visibility toggles */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "show_aura", label: "Show Aura" },
            { key: "show_rank", label: "Show Rank" },
            { key: "show_global", label: "Show Global" },
            { key: "show_elo_change", label: "Elo Change" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-2">
              <label className="text-[10px] font-semibold text-muted-foreground">{label}</label>
              <Switch checked={(config as any)[key]} onCheckedChange={(v) => update({ [key]: v })} />
            </div>
          ))}
        </div>

        {/* Labels */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Aura Label</label>
            <Input value={config.aura_label} onChange={e => update({ aura_label: e.target.value })} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rank Prefix</label>
            <Input value={config.rank_label} onChange={e => update({ rank_label: e.target.value })} className="h-7 text-xs" />
          </div>
        </div>

        {/* Typography */}
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Font Size</label>
          <div className="flex items-center gap-2">
            <Slider
              min={0} max={FONT_SIZE_OPTIONS.length - 1} step={1}
              value={[FONT_SIZE_OPTIONS.indexOf(config.font_size)]}
              onValueChange={([v]) => update({ font_size: FONT_SIZE_OPTIONS[v] })}
            />
            <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{FONT_SIZE_MAP[config.font_size]}</span>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Font Weight</label>
          <Select value={config.font_weight} onValueChange={(v) => update({ font_weight: v })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["normal", "medium", "semibold", "bold"].map(w => (
                <SelectItem key={w} value={w} className="text-xs">{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Color Scheme</label>
          <Select value={config.color_scheme} onValueChange={(v) => update({ color_scheme: v as any })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["default", "muted", "accent"].map(c => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={handleReset}>
          <RotateCcw className="h-3 w-3" /> Reset
        </Button>
        <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Config"}
        </Button>
      </div>
    </div>
  );
}
