import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BroadcastEngine } from "@/lib/quiz-broadcast/engine";
import type { BroadcastVisuals, EngineSnapshot } from "@/lib/quiz-broadcast/types";

const TOGGLES: { key: keyof BroadcastVisuals; label: string }[] = [
  { key: "showLogo", label: "Logo" },
  { key: "showWebsite", label: "Website URL" },
  { key: "showQrCode", label: "QR code" },
  { key: "showQuestionNumber", label: "Question number" },
  { key: "showCategoryBadge", label: "Category badge" },
  { key: "showDifficultyBadge", label: "Difficulty badge" },
  { key: "showChampionPortrait", label: "Champion portrait" },
  { key: "showChampionSplash", label: "Champion splash" },
  { key: "showItemIcons", label: "Item icons" },
  { key: "showRuneIcons", label: "Rune icons" },
  { key: "showPatchLabel", label: "Patch label" },
  { key: "showTips", label: "Tips / insight" },
  { key: "showExplanations", label: "Show explanations" },
  { key: "hideShortsDormantInsight", label: "Hide dormant insight (Shorts)" },
];

export default function VisualSettings({ engine, snapshot }: { engine: BroadcastEngine; snapshot: EngineSnapshot }) {
  const v = snapshot.config.visuals;
  const update = (patch: Partial<BroadcastVisuals>) => engine.setConfig({ visuals: patch });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Aspect ratio</Label>
          <Select value={v.aspect} onValueChange={(val) => update({ aspect: val as BroadcastVisuals["aspect"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="16:9">Horizontal 16:9</SelectItem>
              <SelectItem value="9:16">Vertical 9:16</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Theme</Label>
          <Select value={v.theme} onValueChange={(val) => update({ theme: val as BroadcastVisuals["theme"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hextech">Hextech</SelectItem>
              <SelectItem value="midnight">Midnight</SelectItem>
              <SelectItem value="classic">Classic</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Answer card style</Label>
          <Select value={v.answerStyle} onValueChange={(val) => update({ answerStyle: val as BroadcastVisuals["answerStyle"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cards">Cards (2-up)</SelectItem>
              <SelectItem value="rows">Rows</SelectItem>
              <SelectItem value="grid">Grid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Countdown style</Label>
          <Select value={v.countdownStyle} onValueChange={(val) => update({ countdownStyle: val as BroadcastVisuals["countdownStyle"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar">Bar</SelectItem>
              <SelectItem value="ring">Ring</SelectItem>
              <SelectItem value="digits">Digits</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Transition</Label>
          <Select value={v.transitionStyle} onValueChange={(val) => update({ transitionStyle: val as BroadcastVisuals["transitionStyle"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="fade">Fade</SelectItem>
              <SelectItem value="slide">Slide</SelectItem>
              <SelectItem value="zoom">Zoom</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Background animation</Label>
          <Select value={v.backgroundAnimation} onValueChange={(val) => update({ backgroundAnimation: val as BroadcastVisuals["backgroundAnimation"] })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              <SelectItem value="pulse">Pulse</SelectItem>
              <SelectItem value="particles">Particles</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Font scale ({v.fontScale.toFixed(2)}x)</Label>
          <Input type="range" min={0.75} max={1.5} step={0.05} value={v.fontScale}
            onChange={(e) => update({ fontScale: Number(e.target.value) })} />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Question width ({v.questionWidth}%)</Label>
          <Input type="range" min={50} max={100} step={1} value={v.questionWidth}
            onChange={(e) => update({ questionWidth: Number(e.target.value) })} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Website URL</Label>
          <Input value={v.websiteUrl} onChange={(e) => update({ websiteUrl: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TOGGLES.map((t) => (
          <label key={t.key} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm">
            <span>{t.label}</span>
            <Switch checked={Boolean(v[t.key])} onCheckedChange={(val) => update({ [t.key]: val } as Partial<BroadcastVisuals>)} />
          </label>
        ))}
      </div>
    </div>
  );
}