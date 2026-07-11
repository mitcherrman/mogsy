import { toast } from "sonner";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import type { BroadcastEngine } from "@/lib/quiz-broadcast/engine";
import type { BroadcastSfxEvent, BroadcastSfxItem, EngineSnapshot } from "@/lib/quiz-broadcast/types";
import { DEFAULT_SFX } from "@/lib/quiz-broadcast/types";
import { playBroadcastSfx, unlockBroadcastAudio } from "@/lib/quiz-broadcast/sfx";

const EVENT_ROWS: { key: BroadcastSfxEvent; label: string; hint: string }[] = [
  { key: "questionStart", label: "Question Start", hint: "New question appears" },
  { key: "countdownTick", label: "Countdown Tick", hint: "Final 3 · 2 · 1 seconds" },
  { key: "reveal", label: "Reveal", hint: "Answer reveal begins" },
  { key: "correctAnswer", label: "Correct Answer", hint: "Correct answer highlighted" },
  { key: "transition", label: "Transition / Next Question", hint: "Between questions" },
];

/**
 * Audio / SFX portal for Broadcast Studio. Paths point at files served from
 * public/, e.g. put a file at public/quiz-broadcast/audio/sfx/reveal.mp3 and
 * enter /quiz-broadcast/audio/sfx/reveal.mp3 here. No upload backend yet.
 */
export default function SfxSettings({ engine, snapshot }: { engine: BroadcastEngine; snapshot: EngineSnapshot }) {
  const sfx = snapshot.config.sfx ?? DEFAULT_SFX;
  const updateSound = (key: BroadcastSfxEvent, patch: Partial<BroadcastSfxItem>) =>
    engine.setConfig({ sfx: { sounds: { [key]: patch } } });

  const onTest = async (key: BroadcastSfxEvent) => {
    const item = sfx.sounds[key];
    if (!item.src.trim()) {
      toast.message("No audio path set for this sound.");
      return;
    }
    await unlockBroadcastAudio(); // test click is a user gesture — prime audio
    const res = await playBroadcastSfx(item.src, sfx.masterVolume * item.volume);
    if (res === "blocked") toast.message("Audio blocked — click again or interact with the page to enable audio.");
    else if (res === "error") toast.error(`Could not play "${item.src}". Check the file exists under public/.`);
  };

  const onReset = () => {
    engine.setConfig({ sfx: DEFAULT_SFX });
    toast.success("SFX settings reset to defaults (off).");
  };

  return (
    <div className="space-y-4">
      {/* Master controls */}
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-3">
          <Switch checked={sfx.enabled} onCheckedChange={(val) => engine.setConfig({ sfx: { enabled: val } })} />
          <div>
            <Label className="text-sm font-semibold">Enable Sound Effects</Label>
            <p className="text-xs text-muted-foreground">Master switch — nothing plays while off.</p>
          </div>
        </div>
        <div className="flex min-w-[220px] flex-1 items-center gap-3">
          <Label className="shrink-0 text-xs uppercase tracking-wide text-muted-foreground">Master volume</Label>
          <Slider
            value={[Math.round(sfx.masterVolume * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={([val]) => engine.setConfig({ sfx: { masterVolume: val / 100 } })}
            className="flex-1"
          />
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {Math.round(sfx.masterVolume * 100)}%
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset SFX to Defaults
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Place audio files under <code className="rounded bg-muted px-1">public/quiz-broadcast/audio/sfx/</code> and
        reference them by browser path, e.g.{" "}
        <code className="rounded bg-muted px-1">/quiz-broadcast/audio/sfx/reveal.mp3</code>.
      </p>

      {/* Per-event rows */}
      <div className="space-y-3">
        {EVENT_ROWS.map((row) => {
          const item = sfx.sounds[row.key];
          return (
            <div key={row.key} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-3">
                <Switch checked={item.enabled} onCheckedChange={(val) => updateSound(row.key, { enabled: val })} />
                <div className="w-52 shrink-0">
                  <div className="text-sm font-medium">{row.label}</div>
                  <div className="text-xs text-muted-foreground">{row.hint}</div>
                </div>
                <Input
                  value={item.src}
                  placeholder={`/quiz-broadcast/audio/sfx/${row.key === "questionStart" ? "question-start" : row.key === "countdownTick" ? "countdown-tick" : row.key === "correctAnswer" ? "correct-answer" : row.key}.mp3`}
                  onChange={(e) => updateSound(row.key, { src: e.target.value })}
                  className="min-w-[220px] flex-1 font-mono text-xs"
                />
                <div className="flex w-44 shrink-0 items-center gap-2">
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
                <Button variant="secondary" size="sm" onClick={() => onTest(row.key)} disabled={!item.src.trim()}>
                  <Play className="mr-1 h-3.5 w-3.5" />
                  Test
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
