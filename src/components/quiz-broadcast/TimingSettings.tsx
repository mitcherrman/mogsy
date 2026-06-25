import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BroadcastEngine } from "@/lib/quiz-broadcast/engine";
import type { BroadcastTiming, EngineSnapshot } from "@/lib/quiz-broadcast/types";

const FIELDS: { key: keyof BroadcastTiming; label: string }[] = [
  { key: "questionMs", label: "Question display" },
  { key: "countdownMs", label: "Countdown length" },
  { key: "revealMs", label: "Answer reveal" },
  { key: "explanationMs", label: "Explanation" },
  { key: "transitionMs", label: "Transition" },
  { key: "delayBeforeNextMs", label: "Delay before next" },
];

export default function TimingSettings({ engine, snapshot }: { engine: BroadcastEngine; snapshot: EngineSnapshot }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">{f.label} (ms)</Label>
          <Input
            type="number"
            min={0}
            step={100}
            value={snapshot.config.timing[f.key]}
            onChange={(e) =>
              engine.setConfig({ timing: { [f.key]: Math.max(0, Number(e.target.value) || 0) } as Partial<BroadcastTiming> })
            }
          />
        </div>
      ))}
    </div>
  );
}