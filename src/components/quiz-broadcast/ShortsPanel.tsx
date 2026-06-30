import { useState } from "react";
import { Clapperboard, Sparkles, AlertTriangle, CheckCircle2, Loader2, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { quizApi } from "@/lib/quiz/api";
import type { QuizQuestion } from "@/lib/quiz/api";
import type { AspectRatio } from "@/lib/quiz-broadcast/types";

type Status = "idle" | "loading" | "success" | "fallback" | "error";

type Props = {
  onGenerate: (questions: QuizQuestion[]) => void;
  currentAspect: AspectRatio;
  onSwitchToShorts: () => void;
};

export default function ShortsPanel({ onGenerate, currentAspect, onSwitchToShorts }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isShorts = currentAspect === "9:16";

  const generate = async () => {
    setStatus("loading");
    setErrorMsg(null);

    try {
      // Q1 — Easy: difficulty 1, objective only
      const r1 = await quizApi.getPlaylist({ difficulty_min: 1, difficulty_max: 1, answer_certainty: "objective", limit: 1 });
      if (!r1.ok || r1.count === 0) throw new Error("No easy questions (difficulty 1) available.");

      // Q2 — Medium: difficulty 2, objective only
      const r2 = await quizApi.getPlaylist({ difficulty_min: 2, difficulty_max: 2, answer_certainty: "objective", limit: 1 });
      if (!r2.ok || r2.count === 0) throw new Error("No medium questions (difficulty 2) available.");

      // Q3 — Hard: difficulty 3–5, objective + derived (omit certainty to use backend default)
      const r3 = await quizApi.getPlaylist({ difficulty_min: 3, difficulty_max: 5, limit: 1 });

      let usedFallback = false;
      let q3: QuizQuestion;

      if (r3.count === 0) {
        // No hard questions yet — fall back to a second difficulty-2 question
        const r3b = await quizApi.getPlaylist({ difficulty_min: 2, difficulty_max: 2, answer_certainty: "objective", limit: 1 });
        if (!r3b.ok || r3b.count === 0) throw new Error("Cannot fill the hard slot — no questions available.");
        q3 = r3b.questions[0];
        usedFallback = true;
      } else {
        q3 = r3.questions[0];
      }

      onGenerate([r1.questions[0], r2.questions[0], q3]);
      setStatus(usedFallback ? "fallback" : "success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to generate short.");
    }
  };

  return (
    <div className="rounded-xl border border-amber-400/25 bg-gradient-to-r from-amber-950/30 via-background/60 to-background/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: label + description */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-400/30 bg-amber-400/10">
            <Clapperboard className="h-4 w-4 text-amber-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Shorts Maker</span>
              <Badge variant="outline" className="border-amber-400/40 bg-amber-400/10 px-1.5 py-0 text-[10px] font-medium text-amber-200">
                V1
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Generate a 3-question short with an Easy → Medium → Hard curve.{" "}
              <span className="text-amber-200/70">This replaces the current playlist.</span>
            </p>

            {/* Status feedback */}
            {status === "success" && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                3 questions loaded — Easy · Medium · Hard
              </div>
            )}
            {status === "fallback" && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                Hard slot unavailable — used a Medium fallback instead
              </div>
            )}
            {status === "error" && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex shrink-0 items-center gap-2 sm:mt-0">
          {/* 9:16 shortcut */}
          {isShorts ? (
            <Badge variant="outline" className="border-cyan-400/40 bg-cyan-400/10 px-2 py-1 text-[10px] text-cyan-300">
              <Monitor className="mr-1 h-3 w-3" />
              9:16 active
            </Badge>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-cyan-400/30 bg-cyan-400/5 text-xs text-cyan-300 hover:border-cyan-400/60 hover:bg-cyan-400/10"
              onClick={onSwitchToShorts}
              title="Switch Visual Settings to 9:16 for Shorts"
            >
              <Monitor className="mr-1.5 h-3.5 w-3.5" />
              Switch to 9:16
            </Button>
          )}

          <Button
            size="sm"
            onClick={generate}
            disabled={status === "loading"}
            className="h-8 bg-amber-500/80 text-xs font-semibold text-black hover:bg-amber-400"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Generate 3-Question Short
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Slot preview (shown after generation) */}
      {(status === "success" || status === "fallback") && (
        <div className="mt-3 flex gap-2">
          <SlotBadge label="Q1" tier="Easy" difficulty={1} />
          <SlotBadge label="Q2" tier="Medium" difficulty={2} />
          <SlotBadge label="Q3" tier={status === "fallback" ? "Hard Slot / Fallback Medium" : "Hard"} difficulty={status === "fallback" ? 2 : 3} fallback={status === "fallback"} />
        </div>
      )}
    </div>
  );
}

function SlotBadge({
  label,
  tier,
  difficulty,
  fallback = false,
}: {
  label: string;
  tier: string;
  difficulty: number;
  fallback?: boolean;
}) {
  const color = fallback
    ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
    : difficulty === 1
    ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
    : difficulty === 2
    ? "border-sky-400/40 bg-sky-400/10 text-sky-300"
    : "border-violet-400/40 bg-violet-400/10 text-violet-300";

  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${color}`}>
      <span className="text-[10px] font-bold">{label}</span>
      <span className="text-[10px] opacity-70">·</span>
      <span className="text-[10px]">{tier}</span>
    </div>
  );
}
