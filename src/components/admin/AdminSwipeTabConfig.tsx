import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { GripVertical, Circle, Square, RectangleHorizontal, LayoutGrid, Rows3, Columns3 } from "lucide-react";

const SWIPE_BUTTONS = [
  { key: "anime", label: "Anime" },
  { key: "fastfood", label: "Best Fast Food" },
  { key: "movies", label: "Movies" },
  { key: "sports", label: "Sports" },
  { key: "marvel", label: "Marvel Movies" },
  { key: "videogames", label: "Video Games" },
  { key: "lol", label: "League of Legends" },
  { key: "compete", label: "Compete" },
];

const SHAPES = [
  { value: "circle", label: "Circle", icon: Circle },
  { value: "rounded", label: "Rounded Square", icon: Square },
  { value: "pill", label: "Pill", icon: RectangleHorizontal },
];

const FORMATIONS = [
  { value: "wrap", label: "Wrap Grid", icon: LayoutGrid },
  { value: "rows", label: "Fixed Rows", icon: Rows3 },
  { value: "horizontal", label: "Horizontal Scroll", icon: Columns3 },
];

interface SwipeTabConfig {
  bubble_size_mobile: number;
  bubble_size_desktop: number;
  items_per_row_mobile: number;
  items_per_row_desktop: number;
  shape: string;
  formation: string;
  button_order: string[];
  button_slugs: Record<string, string>;
}

const DEFAULT_CONFIG: SwipeTabConfig = {
  bubble_size_mobile: 110,
  bubble_size_desktop: 150,
  items_per_row_mobile: 3,
  items_per_row_desktop: 8,
  shape: "circle",
  formation: "wrap",
  button_order: ["anime", "fastfood", "movies", "sports", "marvel", "videogames", "lol", "compete"],
};

export default function AdminSwipeTabConfig() {
  const [config, setConfig] = useState<SwipeTabConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "swipe_tab_config")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setConfig({ ...DEFAULT_CONFIG, ...(data.value as any) });
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ value: config as any, updated_at: new Date().toISOString() })
      .eq("key", "swipe_tab_config");
    if (error) toast.error("Failed to save");
    else toast.success("Swipe tab config saved");
    setSaving(false);
  };

  const moveItem = (from: number, to: number) => {
    const newOrder = [...config.button_order];
    const [item] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, item);
    setConfig(c => ({ ...c, button_order: newOrder }));
  };

  const getLabel = (key: string) => SWIPE_BUTTONS.find(b => b.key === key)?.label || key;

  if (loading) return null;

  // Min 110, max 550 (5x of 110)
  const MIN_SIZE = 60;
  const MAX_SIZE = 550;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground">Swipe Tab Layout</h3>
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? "Saving..." : "Save Config"}
        </Button>
      </div>

      {/* Bubble Size */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Bubble Size</h4>
        
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Mobile Size: {config.bubble_size_mobile}px</Label>
          </div>
          <Slider
            value={[config.bubble_size_mobile]}
            onValueChange={([v]) => setConfig(c => ({ ...c, bubble_size_mobile: v }))}
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={10}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Desktop Size: {config.bubble_size_desktop}px</Label>
          </div>
          <Slider
            value={[config.bubble_size_desktop]}
            onValueChange={([v]) => setConfig(c => ({ ...c, bubble_size_desktop: v }))}
            min={MIN_SIZE}
            max={MAX_SIZE}
            step={10}
          />
        </div>
      </div>

      {/* Items Per Row */}
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Items Per Row</h4>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Label className="text-sm">Mobile: {config.items_per_row_mobile}</Label>
          <Slider
            value={[config.items_per_row_mobile]}
            onValueChange={([v]) => setConfig(c => ({ ...c, items_per_row_mobile: v }))}
            min={1}
            max={8}
            step={1}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Label className="text-sm">Desktop: {config.items_per_row_desktop}</Label>
          <Slider
            value={[config.items_per_row_desktop]}
            onValueChange={([v]) => setConfig(c => ({ ...c, items_per_row_desktop: v }))}
            min={1}
            max={10}
            step={1}
          />
        </div>
      </div>

      {/* Shape */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Button Shape</h4>
        <div className="flex gap-2">
          {SHAPES.map(s => (
            <button
              key={s.value}
              onClick={() => setConfig(c => ({ ...c, shape: s.value }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                config.shape === s.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Formation */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Layout Formation</h4>
        <div className="flex gap-2">
          {FORMATIONS.map(f => (
            <button
              key={f.value}
              onClick={() => setConfig(c => ({ ...c, formation: f.value }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                config.formation === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <f.icon className="h-4 w-4" />
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Button Order */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Button Order</h4>
        <p className="text-xs text-muted-foreground">Drag to reorder</p>
        <div className="space-y-1">
          {config.button_order.map((key, idx) => (
            <div
              key={key}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== idx) {
                  moveItem(dragIndex, idx);
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-all ${
                dragIndex === idx ? "opacity-50 scale-95" : ""
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{getLabel(key)}</span>
              <span className="ml-auto text-xs text-muted-foreground">#{idx + 1}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-foreground">Preview</h4>
        <div className="rounded-xl border border-border bg-card/50 p-6 flex justify-center">
          <div
            className="flex flex-wrap justify-center gap-3"
            style={{
              maxWidth: config.formation === "horizontal"
                ? "none"
                : `${(config.bubble_size_desktop + 16) * config.items_per_row_desktop}px`,
              flexWrap: config.formation === "horizontal" ? "nowrap" : "wrap",
              overflowX: config.formation === "horizontal" ? "auto" : "visible",
            }}
          >
            {config.button_order.map(key => {
              const size = Math.min(config.bubble_size_desktop, 120); // cap preview size
              const borderRadius =
                config.shape === "circle" ? "50%" :
                config.shape === "rounded" ? "16px" : "999px";
              const w = config.shape === "pill" ? size * 1.8 : size;
              return (
                <div
                  key={key}
                  className="border-2 border-border bg-muted flex items-center justify-center shrink-0"
                  style={{ width: w, height: size, borderRadius }}
                >
                  <span className="text-[9px] font-bold text-muted-foreground text-center px-1 leading-tight">
                    {getLabel(key)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
