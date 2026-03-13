import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CARD_ANIMATIONS } from "@/lib/card-animations";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Plus, Upload, Trash2, Play, Eye, X, Image, Volume2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AnimationConfig {
  [animationId: string]: {
    enabled: boolean;
    pro_only: boolean;
  };
}

interface UsageStats {
  animation_id: string;
  context: string;
  count: number;
}

interface CustomAnimation {
  id: string;
  name: string;
  description: string;
  icon: string;
  image_url: string | null;
  sound_url: string | null;
  duration_ms: number;
  sound_delay_ms: number;
  sound_duration_ms: number | null;
  effects: {
    fadeIn: boolean;
    fadeOut: boolean;
    scale: boolean;
    shake: boolean;
    blur: boolean;
    rotate: boolean;
    slideUp: boolean;
    slideDown: boolean;
  };
  is_enabled: boolean;
  pro_only: boolean;
  contexts: string[];
  sort_order: number;
}

const DEFAULT_EFFECTS = {
  fadeIn: true, fadeOut: true, scale: false, shake: false,
  blur: false, rotate: false, slideUp: false, slideDown: false,
};

const EFFECT_LABELS: Record<string, { label: string; desc: string }> = {
  fadeIn: { label: "Fade In", desc: "Smooth opacity entrance" },
  fadeOut: { label: "Fade Out", desc: "Dissolve exit" },
  scale: { label: "Scale Pulse", desc: "Grow/shrink effect" },
  shake: { label: "Shake", desc: "Rumble vibration" },
  blur: { label: "Blur", desc: "Gaussian blur transition" },
  rotate: { label: "Rotate", desc: "Spin effect" },
  slideUp: { label: "Slide Up", desc: "Card slides upward" },
  slideDown: { label: "Slide Down", desc: "Card slides downward" },
};

export default function AdminCardAnimations() {
  const [config, setConfig] = useState<AnimationConfig>({});
  const [usage, setUsage] = useState<UsageStats[]>([]);
  const [activeUsers, setActiveUsers] = useState<{ animation: string; context: string; count: number }[]>([]);
  const [customAnims, setCustomAnims] = useState<CustomAnimation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [editingAnim, setEditingAnim] = useState<CustomAnimation | null>(null);
  const [previewAnim, setPreviewAnim] = useState<CustomAnimation | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [settingsRes, logsRes, swipeRes, eloRes, customRes] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "card_animations").single(),
      supabase.from("animation_usage_logs").select("animation_id, context")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
      supabase.from("profiles").select("swipe_animation").not("swipe_animation", "is", null),
      supabase.from("profiles").select("elocheck_animation").not("elocheck_animation", "is", null),
      supabase.from("custom_animations").select("*").order("sort_order"),
    ]);

    if (settingsRes.data?.value) {
      setConfig(settingsRes.data.value as unknown as AnimationConfig);
    } else {
      const defaults: AnimationConfig = {};
      CARD_ANIMATIONS.forEach(a => { defaults[a.id] = { enabled: true, pro_only: a.defaultProOnly }; });
      setConfig(defaults);
    }

    if (logsRes.data) {
      const countMap = new Map<string, number>();
      logsRes.data.forEach((l: any) => {
        const key = `${l.animation_id}__${l.context}`;
        countMap.set(key, (countMap.get(key) || 0) + 1);
      });
      setUsage(Array.from(countMap.entries()).map(([key, count]) => {
        const [animation_id, context] = key.split("__");
        return { animation_id, context, count };
      }).sort((a, b) => b.count - a.count));
    }

    const userCounts = new Map<string, number>();
    swipeRes.data?.forEach((p: any) => {
      const key = `${p.swipe_animation}__swipe`;
      userCounts.set(key, (userCounts.get(key) || 0) + 1);
    });
    eloRes.data?.forEach((p: any) => {
      const key = `${p.elocheck_animation}__elocheck`;
      userCounts.set(key, (userCounts.get(key) || 0) + 1);
    });
    setActiveUsers(Array.from(userCounts.entries()).map(([key, count]) => {
      const [animation, context] = key.split("__");
      return { animation, context, count };
    }).sort((a, b) => b.count - a.count));

    if (customRes.data) {
      setCustomAnims(customRes.data.map((d: any) => ({
        ...d,
        effects: { ...DEFAULT_EFFECTS, ...(d.effects || {}) },
      })));
    }

    setLoading(false);
  };

  const saveConfig = async (newConfig: AnimationConfig) => {
    setConfig(newConfig);
    await supabase.from("app_settings").upsert({ key: "card_animations", value: newConfig as any });
    toast.success("Animation config saved");
  };

  const toggleEnabled = (id: string) => {
    const updated = { ...config };
    if (!updated[id]) updated[id] = { enabled: true, pro_only: false };
    updated[id] = { ...updated[id], enabled: !updated[id].enabled };
    saveConfig(updated);
  };

  const toggleProOnly = (id: string) => {
    const updated = { ...config };
    if (!updated[id]) updated[id] = { enabled: true, pro_only: false };
    updated[id] = { ...updated[id], pro_only: !updated[id].pro_only };
    saveConfig(updated);
  };

  const getUsageCount = (animId: string, ctx?: string) =>
    usage.filter(u => u.animation_id === animId && (!ctx || u.context === ctx)).reduce((s, u) => s + u.count, 0);

  const getActiveUserCount = (animId: string, ctx?: string) =>
    activeUsers.filter(u => u.animation === animId && (!ctx || u.context === ctx)).reduce((s, u) => s + u.count, 0);

  const deleteCustomAnim = async (id: string) => {
    if (!confirm("Delete this custom animation?")) return;
    await supabase.from("custom_animations").delete().eq("id", id);
    setCustomAnims(prev => prev.filter(a => a.id !== id));
    toast.success("Animation deleted");
  };

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Loading...</div>;

  const totalUsage = usage.reduce((s, u) => s + u.count, 0);

  return (
    <div className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Plays</p>
          <p className="text-xl font-black text-primary">{totalUsage.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">last 30 days</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Animations</p>
          <p className="text-xl font-black text-foreground">{CARD_ANIMATIONS.length + customAnims.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Enabled</p>
          <p className="text-xl font-black text-foreground">
            {CARD_ANIMATIONS.filter(a => config[a.id]?.enabled !== false).length + customAnims.filter(a => a.is_enabled).length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Custom</p>
          <p className="text-xl font-black text-primary">{customAnims.length}</p>
        </div>
      </div>

      {/* Create Custom Animation button */}
      <Button onClick={() => { setEditingAnim(null); setCreatorOpen(true); }} className="w-full gap-2">
        <Plus className="h-4 w-4" /> Create Custom Animation
      </Button>

      {/* Custom Animations */}
      {customAnims.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Custom Animations
          </h3>
          {customAnims.map(anim => (
            <CustomAnimCard
              key={anim.id}
              anim={anim}
              onEdit={() => { setEditingAnim(anim); setCreatorOpen(true); }}
              onDelete={() => deleteCustomAnim(anim.id)}
              onPreview={() => setPreviewAnim(anim)}
              getUsageCount={getUsageCount}
              getActiveUserCount={getActiveUserCount}
            />
          ))}
        </div>
      )}

      {/* Built-in Animation cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-foreground">Built-in Animations</h3>
        {CARD_ANIMATIONS.map(anim => {
          const cfg = config[anim.id] || { enabled: true, pro_only: anim.defaultProOnly };
          const swipeUsage = getUsageCount(anim.id, "swipe");
          const eloUsage = getUsageCount(anim.id, "elocheck");
          const swipeUsers = getActiveUserCount(anim.id, "swipe");
          const eloUsers = getActiveUserCount(anim.id, "elocheck");

          return (
            <div key={anim.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{anim.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-foreground text-sm">{anim.name}</h4>
                    {cfg.pro_only && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">PRO</Badge>}
                    {!cfg.enabled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-destructive">OFF</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{anim.description}</p>
                  <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
                    <span>Swipe: <strong className="text-foreground">{swipeUsage}</strong> plays · <strong className="text-foreground">{swipeUsers}</strong> users</span>
                    <span>Aura Check: <strong className="text-foreground">{eloUsage}</strong> plays · <strong className="text-foreground">{eloUsers}</strong> users</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Enabled</span>
                    <Switch checked={cfg.enabled} onCheckedChange={() => toggleEnabled(anim.id)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Pro only</span>
                    <Switch checked={cfg.pro_only} onCheckedChange={() => toggleProOnly(anim.id)} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Usage Leaderboard */}
      {usage.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-foreground mb-2">Usage Leaderboard (30d)</h3>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {usage.slice(0, 10).map((u, i) => {
              const anim = CARD_ANIMATIONS.find(a => a.id === u.animation_id);
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                  <span className="text-lg">{anim?.icon || "❓"}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-foreground">{anim?.name || u.animation_id}</span>
                    <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0">{u.context}</Badge>
                  </div>
                  <span className="text-sm font-bold text-primary">{u.count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Creator/Editor Dialog */}
      <AnimationCreatorDialog
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        editing={editingAnim}
        onSaved={() => { loadData(); setCreatorOpen(false); }}
      />

      {/* Preview Dialog */}
      {previewAnim && (
        <AnimationPreviewDialog
          anim={previewAnim}
          onClose={() => setPreviewAnim(null)}
        />
      )}
    </div>
  );
}

// --- Custom Animation Card ---
function CustomAnimCard({
  anim, onEdit, onDelete, onPreview, getUsageCount, getActiveUserCount,
}: {
  anim: CustomAnimation;
  onEdit: () => void;
  onDelete: () => void;
  onPreview: () => void;
  getUsageCount: (id: string, ctx?: string) => number;
  getActiveUserCount: (id: string, ctx?: string) => number;
}) {
  const activeEffects = Object.entries(anim.effects).filter(([, v]) => v).map(([k]) => k);

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex items-start gap-3">
        {anim.image_url ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden border border-border shrink-0">
            <img src={anim.image_url} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <span className="text-2xl">{anim.icon}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-foreground text-sm">{anim.name}</h4>
            <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-primary/20 text-primary">CUSTOM</Badge>
            {anim.pro_only && <Badge variant="secondary" className="text-[9px] px-1.5 py-0">PRO</Badge>}
            {!anim.is_enabled && <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-destructive">OFF</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{anim.description}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {activeEffects.map(e => (
              <Badge key={e} variant="outline" className="text-[8px] px-1 py-0">{EFFECT_LABELS[e]?.label || e}</Badge>
            ))}
            <Badge variant="outline" className="text-[8px] px-1 py-0">{anim.duration_ms}ms</Badge>
            {anim.sound_url && <Badge variant="outline" className="text-[8px] px-1 py-0">🔊 Sound</Badge>}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-muted-foreground">
            <span>Swipe: <strong className="text-foreground">{getUsageCount(anim.id, "swipe")}</strong> plays</span>
            <span>Aura Check: <strong className="text-foreground">{getUsageCount(anim.id, "elocheck")}</strong> plays</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-end shrink-0">
          <button onClick={onPreview} className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" title="Preview">
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button onClick={onEdit} className="text-[10px] text-primary hover:underline">Edit</button>
          <button onClick={onDelete} className="h-7 w-7 rounded-md flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Animation Creator/Editor Dialog ---
function AnimationCreatorDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CustomAnimation | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("✨");
  const [durationMs, setDurationMs] = useState(2000);
  const [soundDelayMs, setSoundDelayMs] = useState(0);
  const [soundDurationMs, setSoundDurationMs] = useState<number | null>(null);
  const [effects, setEffects] = useState({ ...DEFAULT_EFFECTS });
  const [proOnly, setProOnly] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [soundUrl, setSoundUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"image" | "sound" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setDescription(editing.description);
        setIcon(editing.icon);
        setDurationMs(editing.duration_ms);
        setSoundDelayMs(editing.sound_delay_ms);
        setSoundDurationMs(editing.sound_duration_ms);
        setEffects({ ...DEFAULT_EFFECTS, ...editing.effects });
        setProOnly(editing.pro_only);
        setIsEnabled(editing.is_enabled);
        setImageUrl(editing.image_url);
        setSoundUrl(editing.sound_url);
      } else {
        setName(""); setDescription(""); setIcon("✨");
        setDurationMs(2000); setSoundDelayMs(0); setSoundDurationMs(null);
        setEffects({ ...DEFAULT_EFFECTS }); setProOnly(false); setIsEnabled(true);
        setImageUrl(null); setSoundUrl(null);
      }
    }
  }, [open, editing]);

  const uploadFile = async (file: File, type: "image" | "sound") => {
    setUploading(type);
    const ext = file.name.split(".").pop();
    const path = `${type}s/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("animation-assets").upload(path, file);
    if (error) { toast.error(`Upload failed: ${error.message}`); setUploading(null); return; }
    const { data: { publicUrl } } = supabase.storage.from("animation-assets").getPublicUrl(path);
    if (type === "image") setImageUrl(publicUrl);
    else setSoundUrl(publicUrl);
    setUploading(null);
    toast.success(`${type === "image" ? "Image" : "Sound"} uploaded`);
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    const payload = {
      name: name.trim(),
      description: description.trim(),
      icon, image_url: imageUrl, sound_url: soundUrl,
      duration_ms: durationMs, sound_delay_ms: soundDelayMs,
      sound_duration_ms: soundDurationMs,
      effects: effects as any, pro_only: proOnly, is_enabled: isEnabled,
      contexts: ["swipe", "elocheck"],
    };

    if (editing) {
      await supabase.from("custom_animations").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("custom_animations").insert(payload);
    }
    setSaving(false);
    toast.success(editing ? "Animation updated" : "Animation created");
    onSaved();
  };

  const previewSound = () => {
    if (!soundUrl) return;
    if (audioRef.current) { audioRef.current.pause(); }
    const audio = new Audio(soundUrl);
    audioRef.current = audio;
    if (soundDelayMs > 0) {
      setTimeout(() => audio.play().catch(() => {}), soundDelayMs);
    } else {
      audio.play().catch(() => {});
    }
    if (soundDurationMs) {
      setTimeout(() => { audio.pause(); audio.currentTime = 0; }, (soundDelayMs || 0) + soundDurationMs);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {editing ? "Edit Animation" : "Create Custom Animation"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Basic Info */}
          <div className="grid grid-cols-[1fr_60px] gap-3">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="My Custom Animation" />
            </div>
            <div>
              <Label className="text-xs">Icon</Label>
              <Input value={icon} onChange={e => setIcon(e.target.value)} className="text-center text-lg" maxLength={4} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="A brief description..." />
          </div>

          {/* Image Upload */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
              <Image className="h-3.5 w-3.5" /> Visual Asset (Image/GIF)
            </Label>
            {imageUrl ? (
              <div className="relative rounded-xl border border-border overflow-hidden bg-muted/50">
                <img src={imageUrl} alt="" className="w-full max-h-40 object-contain" />
                <button
                  onClick={() => setImageUrl(null)}
                  className="absolute top-2 right-2 h-6 w-6 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">{uploading === "image" ? "Uploading..." : "Upload image or GIF"}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, GIF, WebP up to 20MB</span>
                <input type="file" className="hidden" accept="image/*,.gif" disabled={!!uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, "image"); }} />
              </label>
            )}
          </div>

          {/* Sound Upload */}
          <div>
            <Label className="text-xs font-semibold flex items-center gap-1.5 mb-2">
              <Volume2 className="h-3.5 w-3.5" /> Sound Effect
            </Label>
            {soundUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                <button onClick={previewSound} className="h-8 w-8 rounded-lg bg-primary/20 text-primary flex items-center justify-center hover:bg-primary/30 transition-colors">
                  <Play className="h-4 w-4" />
                </button>
                <span className="text-xs text-foreground truncate flex-1">Sound loaded</span>
                <button onClick={() => setSoundUrl(null)} className="h-6 w-6 rounded-full text-destructive/60 hover:text-destructive flex items-center justify-center">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 cursor-pointer hover:border-primary/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">{uploading === "sound" ? "Uploading..." : "Upload sound file"}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">MP3, WAV, OGG up to 10MB</span>
                <input type="file" className="hidden" accept="audio/*" disabled={!!uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f, "sound"); }} />
              </label>
            )}
          </div>

          {/* Timing Controls */}
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-foreground">Timing</h4>
            <div>
              <div className="flex justify-between mb-1">
                <Label className="text-xs">Animation Duration</Label>
                <span className="text-xs font-mono text-primary">{durationMs}ms</span>
              </div>
              <Slider value={[durationMs]} min={500} max={8000} step={100}
                onValueChange={([v]) => setDurationMs(v)} />
            </div>
            {soundUrl && (
              <>
                <div>
                  <div className="flex justify-between mb-1">
                    <Label className="text-xs">Sound Delay</Label>
                    <span className="text-xs font-mono text-primary">{soundDelayMs}ms</span>
                  </div>
                  <Slider value={[soundDelayMs]} min={0} max={3000} step={50}
                    onValueChange={([v]) => setSoundDelayMs(v)} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <Label className="text-xs">Sound Duration (0 = full)</Label>
                    <span className="text-xs font-mono text-primary">{soundDurationMs || 0}ms</span>
                  </div>
                  <Slider value={[soundDurationMs || 0]} min={0} max={5000} step={100}
                    onValueChange={([v]) => setSoundDurationMs(v || null)} />
                </div>
              </>
            )}
          </div>

          {/* Visual Effects */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-foreground">Visual Effects</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(EFFECT_LABELS).map(([key, { label, desc }]) => (
                <button
                  key={key}
                  onClick={() => setEffects(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                  className={`rounded-lg border p-2.5 text-left transition-all ${
                    effects[key as keyof typeof effects]
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  }`}
                >
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Settings */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Pro Only</span>
              <Switch checked={proOnly} onCheckedChange={setProOnly} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Enabled</span>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
          </div>

          {/* Live Preview */}
          {imageUrl && (
            <div>
              <h4 className="text-xs font-semibold text-foreground mb-2">Preview</h4>
              <AnimationPreviewInline imageUrl={imageUrl} effects={effects} durationMs={durationMs} />
            </div>
          )}

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Saving..." : editing ? "Update Animation" : "Create Animation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Inline Preview ---
function AnimationPreviewInline({
  imageUrl, effects, durationMs,
}: {
  imageUrl: string;
  effects: Record<string, boolean>;
  durationMs: number;
}) {
  const [playing, setPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const play = () => {
    setPlaying(true);
    setTimeout(() => setPlaying(false), durationMs);
  };

  const animStyle: React.CSSProperties = playing ? {
    animation: buildCssAnimation(effects, durationMs),
  } : {};

  return (
    <div className="relative rounded-xl border border-border bg-muted/30 p-4 flex flex-col items-center gap-3">
      <div
        ref={containerRef}
        className="w-32 h-40 rounded-lg overflow-hidden border border-border"
        style={animStyle}
      >
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
      </div>
      <Button variant="outline" size="sm" onClick={play} disabled={playing} className="text-xs gap-1.5">
        <Play className="h-3 w-3" /> {playing ? "Playing..." : "Preview"}
      </Button>
    </div>
  );
}

function buildCssAnimation(effects: Record<string, boolean>, durationMs: number): string {
  const parts: string[] = [];
  const dur = `${durationMs}ms`;
  if (effects.fadeIn) parts.push(`fadeIn ${dur} ease-out`);
  if (effects.fadeOut) parts.push(`fadeOut ${dur} ease-in`);
  if (effects.scale) parts.push(`pulse 0.6s ease-in-out infinite`);
  if (effects.shake) parts.push(`shake 0.3s ease-in-out infinite`);
  if (effects.rotate) parts.push(`spin ${dur} linear`);
  if (effects.blur) parts.push(`blurIn ${dur} ease-out`);
  if (effects.slideUp) parts.push(`slideUp ${dur} ease-out`);
  if (effects.slideDown) parts.push(`slideDown ${dur} ease-out`);
  return parts.join(", ") || `fadeOut ${dur} ease-out`;
}

// --- Full Preview Dialog ---
function AnimationPreviewDialog({ anim, onClose }: { anim: CustomAnimation; onClose: () => void }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = () => {
    setPlaying(true);
    if (anim.sound_url) {
      const audio = new Audio(anim.sound_url);
      audioRef.current = audio;
      setTimeout(() => audio.play().catch(() => {}), anim.sound_delay_ms || 0);
      if (anim.sound_duration_ms) {
        setTimeout(() => { audio.pause(); }, (anim.sound_delay_ms || 0) + anim.sound_duration_ms);
      }
    }
    setTimeout(() => setPlaying(false), anim.duration_ms);
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Preview: {anim.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div
            className="w-40 h-52 rounded-xl overflow-hidden border-2 border-border bg-muted/50"
            style={playing ? { animation: buildCssAnimation(anim.effects, anim.duration_ms) } : {}}
          >
            {anim.image_url ? (
              <img src={anim.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-5xl">{anim.icon}</div>
            )}
          </div>
          <Button onClick={play} disabled={playing} className="gap-2">
            <Play className="h-4 w-4" /> {playing ? "Playing..." : "Play Animation"}
          </Button>
          <div className="text-[10px] text-muted-foreground text-center space-y-0.5">
            <p>Duration: {anim.duration_ms}ms</p>
            <p>Effects: {Object.entries(anim.effects).filter(([, v]) => v).map(([k]) => EFFECT_LABELS[k]?.label || k).join(", ") || "None"}</p>
            {anim.sound_url && <p>🔊 Sound: delay {anim.sound_delay_ms}ms{anim.sound_duration_ms ? `, duration ${anim.sound_duration_ms}ms` : ""}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
