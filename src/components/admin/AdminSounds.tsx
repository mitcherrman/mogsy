import { useEffect, useState, useCallback, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Volume2, VolumeX, Play, Upload, Trash2, X, Pause } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SoundSettings,
  SOUND_DEFAULTS,
  SOUND_LABELS,
  invalidateSoundSettingsCache,
} from "@/hooks/useSoundSettings";

const GROUPS = ["General", "Swiping", "Card Animations", "Shop"] as const;

function groupedEntries() {
  const keys = Object.keys(SOUND_LABELS) as (keyof SoundSettings)[];
  return GROUPS.map((group) => ({
    group,
    items: keys.filter((k) => SOUND_LABELS[k].group === group),
  }));
}

function synthesizeSound(ctx: AudioContext, key: keyof SoundSettings) {
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(ctx.destination);

  switch (key) {
    case "launch_chime": {
      [600, 800, 1000].forEach((freq, i) => {
        const osc = ctx.createOscillator(); osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.06, t + i * 0.1);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.2);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.1); osc.stop(t + i * 0.1 + 0.25);
      }); return;
    }
    case "bubble_tap": {
      const osc = ctx.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.06);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g); osc.start(t); osc.stop(t + 0.1); return;
    }
    case "swipe_tap": {
      const osc = ctx.createOscillator(); osc.type = "triangle";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g); osc.start(t); osc.stop(t + 0.08); return;
    }
    case "correct_chime": {
      [800, 1200].forEach((freq, i) => {
        const osc = ctx.createOscillator(); osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.07, t + i * 0.12);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.15);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.2);
      }); return;
    }
    case "wrong_tone": {
      [600, 350].forEach((freq, i) => {
        const osc = ctx.createOscillator(); osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.05, t + i * 0.12);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.18);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.22);
      }); return;
    }
    default: {
      const osc = ctx.createOscillator(); osc.type = "sine";
      osc.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g); osc.start(t); osc.stop(t + 0.18);
    }
  }
}

interface CustomSoundEntry {
  key: string;
  label: string;
  url: string;
}

export default function AdminSounds() {
  const [settings, setSettings] = useState<SoundSettings>({ ...SOUND_DEFAULTS });
  const [customSounds, setCustomSounds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadDialogKey, setUploadDialogKey] = useState<string | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("app_settings").select("value").eq("key", "sound_settings").maybeSingle(),
      supabase.from("app_settings").select("value").eq("key", "custom_sound_urls").maybeSingle(),
    ]).then(([settingsRes, customRes]) => {
      if (settingsRes.data?.value) {
        setSettings({ ...SOUND_DEFAULTS, ...(settingsRes.data.value as Record<string, boolean>) });
      }
      if (customRes.data?.value) {
        setCustomSounds(customRes.data.value as Record<string, string>);
      }
      setLoading(false);
    });
  }, []);

  const toggle = (key: keyof SoundSettings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  const toggleAll = (enabled: boolean) => {
    const next = { ...settings };
    for (const k of Object.keys(next) as (keyof SoundSettings)[]) next[k] = enabled;
    setSettings(next);
  };

  const save = async () => {
    setSaving(true);
    await Promise.all([
      supabase.from("app_settings").upsert(
        { key: "sound_settings", value: settings as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      ),
      supabase.from("app_settings").upsert(
        { key: "custom_sound_urls", value: customSounds as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      ),
    ]);
    setSaving(false);
    invalidateSoundSettingsCache();
    toast.success("Sound settings saved");
  };

  const preview = useCallback((key: keyof SoundSettings) => {
    // Stop any currently playing audio
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlayingKey(key);

    // If there's a custom sound URL, play that instead
    if (customSounds[key]) {
      const audio = new Audio(customSounds[key]);
      audioRef.current = audio;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingKey(null);
      return;
    }

    // Otherwise synthesize
    try {
      const ctx = ctxRef.current || new AudioContext();
      ctxRef.current = ctx;
      synthesizeSound(ctx, key);
      setTimeout(() => setPlayingKey(null), 500);
    } catch {
      setPlayingKey(null);
    }
  }, [customSounds]);

  const uploadCustomSound = async (key: string, file: File) => {
    const ext = file.name.split(".").pop();
    const path = `sounds/${key}_${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("animation-assets").upload(path, file);
    if (error) { toast.error(`Upload failed: ${error.message}`); return; }
    const { data: { publicUrl } } = supabase.storage.from("animation-assets").getPublicUrl(path);
    setCustomSounds(prev => ({ ...prev, [key]: publicUrl }));
    toast.success("Custom sound uploaded — save to apply");
    setUploadDialogKey(null);
  };

  const removeCustomSound = (key: string) => {
    setCustomSounds(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    toast.success("Custom sound removed — save to apply");
  };

  if (loading) return null;

  const allOn = Object.values(settings).every(Boolean);
  const allOff = Object.values(settings).every((v) => !v);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-foreground flex items-center gap-2">
          <Volume2 className="h-4 w-4" /> Sound Effects
        </h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1" disabled={allOn} onClick={() => toggleAll(true)}>
            <Volume2 className="h-3 w-3" /> All On
          </Button>
          <Button variant="outline" size="sm" className="text-xs gap-1" disabled={allOff} onClick={() => toggleAll(false)}>
            <VolumeX className="h-3 w-3" /> All Off
          </Button>
        </div>
      </div>

      {groupedEntries().map(({ group, items }) => (
        <div key={group} className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</h4>
          {items.map((key) => {
            const meta = SOUND_LABELS[key];
            const hasCustom = !!customSounds[key];
            return (
              <div key={key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">{meta.label}</Label>
                      {hasCustom && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">CUSTOM</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => preview(key)}
                      className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors ${
                        playingKey === key
                          ? "text-primary bg-primary/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                      title="Preview sound"
                    >
                      {playingKey === key ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => setUploadDialogKey(key)}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Upload custom sound"
                    >
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                    {hasCustom && (
                      <button
                        onClick={() => removeCustomSound(key)}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove custom sound"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Switch checked={settings[key]} onCheckedChange={() => toggle(key)} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "Saving…" : "Save Sound Settings"}
      </Button>

      {/* Upload Dialog */}
      <Dialog open={!!uploadDialogKey} onOpenChange={() => setUploadDialogKey(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Upload Custom Sound</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Upload a custom audio file to replace the synthesized sound for{" "}
              <strong>{uploadDialogKey ? SOUND_LABELS[uploadDialogKey as keyof SoundSettings]?.label : ""}</strong>
            </p>
            <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-6 cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">MP3, WAV, OGG up to 10MB</span>
              <input
                type="file"
                className="hidden"
                accept="audio/*"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f && uploadDialogKey) uploadCustomSound(uploadDialogKey, f);
                }}
              />
            </label>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
