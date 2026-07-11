import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  type UiSfxEvent,
  type UiSfxItem,
  playUiSfxRaw,
  setUiSfxConfig,
  unlockUiSfx,
  useUiSfxConfig,
} from "@/lib/ui-sfx";

const ROWS: { key: UiSfxEvent; label: string; hint: string; placeholder: string }[] = [
  { key: "appEnter", label: "App Enter", hint: "Entering the League hub", placeholder: "/audio/sfx/app-enter.mp3" },
  { key: "navClick", label: "Navigation Click", hint: "Navbar links", placeholder: "/audio/sfx/nav-click.mp3" },
  { key: "sectionOpen", label: "Section Open", hint: "Opening Quiz, Combat Lab, Docs…", placeholder: "/audio/sfx/section-open.mp3" },
  { key: "primaryAction", label: "Primary Action", hint: "Main CTA buttons", placeholder: "/audio/sfx/primary-action.mp3" },
  { key: "success", label: "Success", hint: "Positive feedback (reserved)", placeholder: "/audio/sfx/success.mp3" },
  { key: "error", label: "Error", hint: "Error feedback (reserved)", placeholder: "/audio/sfx/error.mp3" },
];

/**
 * "Sound Effects" section for the Settings page — configures the main-app UI
 * SFX (src/lib/ui-sfx.ts). Files go in public/audio/sfx/ and are referenced
 * as /audio/sfx/<name>.mp3. Separate from the broadcast SFX system.
 */
export default function UiSfxSettings() {
  const config = useUiSfxConfig();
  const [testing, setTesting] = useState<UiSfxEvent | null>(null);

  const updateSound = (key: UiSfxEvent, patch: Partial<UiSfxItem>) =>
    setUiSfxConfig({ sounds: { [key]: patch } });

  const onTest = async (key: UiSfxEvent) => {
    const item = config.sounds[key];
    if (!item.src.trim()) {
      toast.message("No audio path set for this sound.");
      return;
    }
    setTesting(key);
    await unlockUiSfx(); // the click is a user gesture — prime audio
    const res = await playUiSfxRaw(item.src, config.masterVolume * item.volume);
    setTesting(null);
    if (res === "blocked") toast.message("Audio blocked — click Test again or interact with the page first.");
    else if (res === "error") toast.error(`Could not play "${item.src}". Is the file in public/audio/sfx/?`);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07 }}
      className="rounded-2xl border border-border bg-card p-6 mb-6"
    >
      <h2 className="font-bold text-foreground mb-1 flex items-center gap-2">
        <Volume2 className="h-4 w-4" /> Sound Effects
      </h2>
      <p className="text-xs text-muted-foreground mb-4">
        Optional UI sounds for navigation and actions. Place audio files in{" "}
        <code className="rounded bg-muted px-1">public/audio/sfx/</code> and reference them by path, e.g.{" "}
        <code className="rounded bg-muted px-1">/audio/sfx/nav-click.mp3</code>.
      </p>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/40 p-3 mb-3">
        <div className="min-w-0">
          <Label className="text-sm font-medium">Enable App Sound Effects</Label>
          <p className="text-xs text-muted-foreground mt-0.5">Master switch — nothing plays while off.</p>
        </div>
        <Switch checked={config.enabled} onCheckedChange={(val) => setUiSfxConfig({ enabled: val })} />
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3 mb-4">
        <Label className="shrink-0 text-xs font-medium text-muted-foreground">Master volume</Label>
        <Slider
          value={[Math.round(config.masterVolume * 100)]}
          min={0}
          max={100}
          step={5}
          onValueChange={([val]) => setUiSfxConfig({ masterVolume: val / 100 })}
          className="flex-1"
        />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {Math.round(config.masterVolume * 100)}%
        </span>
      </div>

      <div className="space-y-3">
        {ROWS.map((row) => {
          const item = config.sounds[row.key];
          return (
            <div key={row.key} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <Label className="text-sm font-medium">{row.label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.hint}</p>
                </div>
                <Switch checked={item.enabled} onCheckedChange={(val) => updateSound(row.key, { enabled: val })} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={item.src}
                  placeholder={row.placeholder}
                  onChange={(e) => updateSound(row.key, { src: e.target.value })}
                  className="min-w-[180px] flex-1 font-mono text-xs"
                />
                <div className="flex w-36 shrink-0 items-center gap-2">
                  <Slider
                    value={[Math.round(item.volume * 100)]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={([val]) => updateSound(row.key, { volume: val / 100 })}
                    className="flex-1"
                  />
                  <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                    {Math.round(item.volume * 100)}%
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onTest(row.key)}
                  disabled={!item.src.trim() || testing === row.key}
                >
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Test
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </motion.section>
  );
}
