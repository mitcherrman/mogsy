import { useEffect, useState, useCallback, useRef } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  SoundSettings,
  SOUND_DEFAULTS,
  SOUND_LABELS,
  invalidateSoundSettingsCache,
} from "@/hooks/useSoundSettings";

// Group keys by group label
const GROUPS = ["General", "Swiping", "Card Animations", "Shop"] as const;

function groupedEntries() {
  const keys = Object.keys(SOUND_LABELS) as (keyof SoundSettings)[];
  return GROUPS.map((group) => ({
    group,
    items: keys.filter((k) => SOUND_LABELS[k].group === group),
  }));
}

export default function AdminSounds() {
  const [settings, setSettings] = useState<SoundSettings>({ ...SOUND_DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "sound_settings")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          setSettings({ ...SOUND_DEFAULTS, ...(data.value as Record<string, boolean>) });
        }
        setLoading(false);
      });
  }, []);

  const toggle = (key: keyof SoundSettings) => {
    setSettings((s) => ({ ...s, [key]: !s[key] }));
  };

  const toggleAll = (enabled: boolean) => {
    const next = { ...settings };
    for (const k of Object.keys(next) as (keyof SoundSettings)[]) {
      next[k] = enabled;
    }
    setSettings(next);
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        { key: "sound_settings", value: settings as any, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    setSaving(false);
    invalidateSoundSettingsCache();
    if (error) {
      toast.error("Failed to save sound settings");
      return;
    }
    toast.success("Sound settings saved");
  };

  // Quick preview sound
  const preview = useCallback((key: keyof SoundSettings) => {
    try {
      const ctx = ctxRef.current || new AudioContext();
      ctxRef.current = ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    } catch {}
  }, []);

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
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            disabled={allOn}
            onClick={() => toggleAll(true)}
          >
            <Volume2 className="h-3 w-3" /> All On
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1"
            disabled={allOff}
            onClick={() => toggleAll(false)}
          >
            <VolumeX className="h-3 w-3" /> All Off
          </Button>
        </div>
      </div>

      {groupedEntries().map(({ group, items }) => (
        <div key={group} className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {group}
          </h4>
          {items.map((key) => {
            const meta = SOUND_LABELS[key];
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-3 gap-3"
              >
                <div className="flex-1 min-w-0">
                  <Label className="text-sm font-medium">{meta.label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => preview(key)}
                    className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    title="Preview sound"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <Switch checked={settings[key]} onCheckedChange={() => toggle(key)} />
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "Saving…" : "Save Sound Settings"}
      </Button>
    </div>
  );
}
