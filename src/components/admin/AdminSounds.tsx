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

const GROUPS = ["General", "Swiping", "Card Animations", "Shop"] as const;

function groupedEntries() {
  const keys = Object.keys(SOUND_LABELS) as (keyof SoundSettings)[];
  return GROUPS.map((group) => ({
    group,
    items: keys.filter((k) => SOUND_LABELS[k].group === group),
  }));
}

// Synthesize a distinct sound for each effect key
function synthesizeSound(ctx: AudioContext, key: keyof SoundSettings) {
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.connect(ctx.destination);

  switch (key) {
    case "launch_chime": {
      // Ascending 3-note chime
      [600, 800, 1000].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.1);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.06, t + i * 0.1);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 0.2);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.1);
        osc.stop(t + i * 0.1 + 0.25);
      });
      return;
    }
    case "bubble_tap": {
      // iOS-style pop
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(600, t + 0.06);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.1);
      return;
    }
    case "swipe_tap": {
      // Quick haptic pop
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(200, t + 0.05);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.08);
      return;
    }
    case "correct_chime": {
      // Ascending two-note
      [800, 1200].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.07, t + i * 0.12);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.15);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.2);
      });
      return;
    }
    case "wrong_tone": {
      // Descending two-note
      [600, 350].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.05, t + i * 0.12);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.18);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.22);
      });
      return;
    }
    case "anim_paper_rip": {
      // Noise burst (rip)
      const bufferSize = ctx.sampleRate * 0.15;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      src.connect(g);
      src.start(t);
      return;
    }
    case "anim_shatter": {
      // High freq burst + noise
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(2000, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.3);
      return;
    }
    case "anim_burn": {
      // Low rumble whoosh
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(400, t + 0.3);
      g.gain.setValueAtTime(0.06, t);
      g.gain.linearRampToValueAtTime(0.08, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.4);
      return;
    }
    case "anim_vaporize": {
      // Sparkle dissolve — high shimmer
      [2400, 3200, 1800].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.06);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.04, t + i * 0.06);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.12);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.06);
        osc.stop(t + i * 0.06 + 0.15);
      });
      return;
    }
    case "anim_crush": {
      // Heavy low impact
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(80, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.3);
      return;
    }
    case "shop_purchase": {
      // Ascending arpeggio
      [500, 700, 900, 1200].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, t + i * 0.08);
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.06, t + i * 0.08);
        ng.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
        osc.connect(ng).connect(ctx.destination);
        osc.start(t + i * 0.08);
        osc.stop(t + i * 0.08 + 0.2);
      });
      return;
    }
    case "shop_diamond_tap": {
      // Quick high clink
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(3000, t);
      osc.frequency.exponentialRampToValueAtTime(2000, t + 0.04);
      g.gain.setValueAtTime(0.05, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.08);
      return;
    }
    case "shop_powerup": {
      // Rising whoosh
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(200, t);
      osc.frequency.exponentialRampToValueAtTime(1500, t + 0.25);
      g.gain.setValueAtTime(0.04, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.35);
      return;
    }
    default: {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, t);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  }
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

  const preview = useCallback((key: keyof SoundSettings) => {
    try {
      const ctx = ctxRef.current || new AudioContext();
      ctxRef.current = ctx;
      synthesizeSound(ctx, key);
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
            return (
              <div key={key} className="flex items-center justify-between rounded-xl border border-border bg-card p-3 gap-3">
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
