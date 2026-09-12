/**
 * Dev-only launcher for GENERATED Mastery: any supported champion, or any
 * pair, synthesized on demand from current canonical data.
 *
 * Not linked from navigation, not in the sitemap, not part of the public
 * catalog. It names no champion and no set: whatever is typed here is sent to
 * `POST /api/mastery/dev/generated-mastery-session` (404s unless the backend
 * runs with `MASTERY_GENERATED_SYNTHESIS_DEV=1`), and the EXISTING live
 * Mastery player is mounted on the session that comes back — the same
 * current/answer/advance endpoints every other Mastery set uses.
 *
 * It replaces a launcher for two hand-authored playtest sets
 * (`playtest.champion.ahri`, `playtest.matchup.ahri.syndra`), which were a
 * static duplicate of what this synthesizer produces and were deleted. That
 * page could offer exactly two things; this one can play anything the
 * generator covers.
 */
import { useMemo, useState } from "react";
import {
  MasteryPlayerLive,
  startGeneratedMasterySession,
} from "@/features/mastery/live";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Subject {
  championA: string;
  championB: string;
  questionCount: number;
}

const DEFAULT_SUBJECT: Subject = { championA: "", championB: "", questionCount: 5 };

export default function GeneratedMasteryLauncherPage() {
  const [form, setForm] = useState<Subject>(DEFAULT_SUBJECT);
  const [playing, setPlaying] = useState<Subject | null>(null);

  // The player creates the session through whatever function it is handed; a
  // closure over the chosen subject is how a champion/pair reaches an
  // endpoint whose contract is not a set id. The `masterySetId` it passes in
  // is ignored here for the same reason.
  const startSessionFn = useMemo(() => {
    if (!playing) return undefined;
    return (_ignoredSetId: string, signal?: AbortSignal) =>
      startGeneratedMasterySession({
        championA: playing.championA,
        championB: playing.championB.trim() || undefined,
        questionCount: playing.questionCount,
      }, signal);
  }, [playing]);

  if (playing && startSessionFn) {
    return (
      <div className="min-h-[60vh]">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <button
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setPlaying(null)}
            data-testid="generated-mastery-back"
          >
            ← Back to the generated Mastery launcher
          </button>
        </div>
        <MasteryPlayerLive
          masterySetId={playing.championA}
          startSessionFn={startSessionFn}
        />
      </div>
    );
  }

  const canPlay = form.championA.trim() !== "" && form.questionCount > 0;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10" data-testid="generated-mastery-launcher">
      <h1 className="mb-1 text-lg font-semibold">Generated Mastery</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Dev-only. Requires the backend running with
        MASTERY_GENERATED_SYNTHESIS_DEV=1. Leave the opponent empty for
        Champion Mastery; name one for a Matchup.
      </p>

      <div className="flex flex-col gap-3">
        <label className="text-xs text-muted-foreground" htmlFor="champion-a">
          Champion
          <Input
            id="champion-a"
            value={form.championA}
            placeholder="e.g. Zed"
            data-testid="generated-mastery-champion-a"
            onChange={(e) => setForm({ ...form, championA: e.target.value })}
          />
        </label>
        <label className="text-xs text-muted-foreground" htmlFor="champion-b">
          Opponent (optional)
          <Input
            id="champion-b"
            value={form.championB}
            placeholder="e.g. Vayne"
            data-testid="generated-mastery-champion-b"
            onChange={(e) => setForm({ ...form, championB: e.target.value })}
          />
        </label>
        <label className="text-xs text-muted-foreground" htmlFor="question-count">
          Questions
          <Input
            id="question-count"
            type="number"
            min={1}
            value={form.questionCount}
            data-testid="generated-mastery-question-count"
            onChange={(e) =>
              setForm({ ...form, questionCount: Number(e.target.value) })}
          />
        </label>
        <Button
          disabled={!canPlay}
          data-testid="generated-mastery-play"
          onClick={() => setPlaying({ ...form, championA: form.championA.trim() })}
        >
          Play
        </Button>
        <p className="text-[11px] text-muted-foreground">
          An unsupported champion, or more questions than the champion can
          currently supply, is refused by the backend and shown here verbatim
          — nothing is padded or silently shortened.
        </p>
      </div>
    </div>
  );
}
