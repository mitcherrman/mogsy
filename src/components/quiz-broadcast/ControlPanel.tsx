import { useState } from "react";
import { Play, Pause, SkipForward, SkipBack, RotateCcw, Square, ExternalLink, Radio, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { BroadcastEngine } from "@/lib/quiz-broadcast/engine";
import type { EngineSnapshot, PlaybackMode } from "@/lib/quiz-broadcast/types";

type Props = {
  engine: BroadcastEngine;
  snapshot: EngineSnapshot;
  onOpenWindow: () => void;
};

const PLAYBACK_MODES: { value: PlaybackMode; label: string }[] = [
  { value: "sequential", label: "Sequential" },
  { value: "playlist_order", label: "Playlist order" },
  { value: "random", label: "Random" },
  { value: "weighted_random", label: "Weighted random" },
  { value: "random_no_repeat", label: "Random — no repeats" },
  { value: "loop_playlist", label: "Loop entire playlist" },
  { value: "loop_single", label: "Loop single question" },
  { value: "repeat_n", label: "Repeat playlist N times" },
  { value: "forever", label: "Run forever" },
];

export default function ControlPanel({ engine, snapshot, onOpenWindow }: Props) {
  const ready = snapshot.playlistLength > 0;
  const [confirmClear, setConfirmClear] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {!snapshot.playing ? (
          <Button onClick={() => engine.start()} disabled={!ready} className="bg-emerald-500 hover:bg-emerald-400">
            <Radio className="mr-2 h-4 w-4" /> Start Broadcast
          </Button>
        ) : (
          <Button onClick={() => engine.pause()} variant="secondary">
            <Pause className="mr-2 h-4 w-4" /> Pause
          </Button>
        )}
        {!snapshot.playing && snapshot.phase !== "idle" && (
          <Button onClick={() => engine.resume()} variant="outline">
            <Play className="mr-2 h-4 w-4" /> Resume
          </Button>
        )}
        <Button
          onClick={() => engine.stop()}
          variant="outline"
          title="Stop playback. Keeps the active playlist and config."
        >
          <Square className="mr-2 h-4 w-4" /> Stop
        </Button>
        <Button onClick={() => engine.previous()} variant="ghost" size="icon">
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button onClick={() => engine.restartCurrent()} variant="ghost" size="icon">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button onClick={() => engine.skip()} variant="ghost" size="icon">
          <SkipForward className="h-4 w-4" />
        </Button>
        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="border border-red-500/60"
              title="Wipe the active playlist and reset the broadcast session"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Clear Session
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear active broadcast session?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently drops the active playlist ({snapshot.playlistLength} questions)
                and resets the broadcast session. Saved playlists are not affected. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 text-white hover:bg-red-500"
                onClick={() => engine.clearSession()}
              >
                Clear Session
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button onClick={onOpenWindow} variant="default" className="ml-auto bg-cyan-500 text-black hover:bg-cyan-400">
          <ExternalLink className="mr-2 h-4 w-4" /> Open Broadcast Window
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Playback mode</Label>
          <Select
            value={snapshot.config.playback}
            onValueChange={(v) => engine.setConfig({ playback: v as PlaybackMode })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PLAYBACK_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Repeat count</Label>
          <Input
            type="number"
            min={1}
            value={snapshot.config.repeatCount}
            onChange={(e) => engine.setConfig({ repeatCount: Math.max(1, Number(e.target.value) || 1) })}
            disabled={snapshot.config.playback !== "repeat_n"}
          />
        </div>
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Jump to #</Label>
          <Input
            type="number"
            min={1}
            max={snapshot.playlistLength}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const v = Number((e.target as HTMLInputElement).value);
              if (!Number.isFinite(v)) return;
              engine.jumpTo(Math.max(0, v - 1));
            }}
            placeholder="Press Enter"
          />
        </div>
      </div>
    </div>
  );
}