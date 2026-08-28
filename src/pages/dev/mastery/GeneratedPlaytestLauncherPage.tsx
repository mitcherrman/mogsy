/**
 * Dev-only launcher for the Phase 4D2 generated Mastery playtest prototypes.
 *
 * Not linked from navigation, not in the sitemap, not part of the public
 * catalog. Fetches the two prototypes' real (non-deterministic-at-source,
 * DB-derived) `mastery_set_id`s from the dev-only backend endpoint
 * `GET /api/mastery/dev/generated-playtest-sets` (404s unless the backend has
 * `MASTERY_GENERATED_PLAYTEST=1`), then mounts the EXISTING live Mastery
 * player (`MasteryPlayerLive`) against the chosen id — the same session
 * creation (`POST /api/mastery/sessions`) and player used by every other
 * Mastery set. No new runtime, no hardcoded set id.
 */
import { useEffect, useState } from "react";
import { MASTERY_API_BASE, MasteryPlayerLive, startGeneratedPlaytestSession } from "@/features/mastery/live";
import { Button } from "@/components/ui/button";

interface GeneratedPlaytestSet {
  manifestId: string;
  kind: "champion" | "matchup";
  masterySetId: string;
  title: string;
}

type LoadState = "loading" | "ready" | "error";

export default function GeneratedPlaytestLauncherPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [sets, setSets] = useState<GeneratedPlaytestSet[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${MASTERY_API_BASE}/api/mastery/dev/generated-playtest-sets`,
          { signal: ctrl.signal });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = await res.json();
        const parsed: GeneratedPlaytestSet[] = (body.sets ?? []).map((s: {
          manifest_id: string; kind: string; mastery_set_id: string; title: string;
        }) => ({
          manifestId: s.manifest_id,
          kind: s.kind as "champion" | "matchup",
          masterySetId: s.mastery_set_id,
          title: s.title,
        }));
        if (!ctrl.signal.aborted) { setSets(parsed); setLoadState("ready"); }
      } catch {
        if (!ctrl.signal.aborted) setLoadState("error");
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (selected) {
    return (
      <div className="min-h-[60vh]">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4">
          <button
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setSelected(null)}
            data-testid="generated-playtest-back"
          >
            ← Back to generated playtest launcher
          </button>
        </div>
        <MasteryPlayerLive masterySetId={selected} startSessionFn={startGeneratedPlaytestSession} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10" data-testid="generated-playtest-launcher">
      <h1 className="mb-1 text-lg font-semibold">Generated Mastery Playtest</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Dev-only. Requires the backend running with MASTERY_GENERATED_PLAYTEST=1.
      </p>

      {loadState === "loading" && <p className="text-sm">Loading prototype sets…</p>}

      {loadState === "error" && (
        <p className="text-sm text-destructive" data-testid="generated-playtest-error">
          Could not load the generated playtest sets. Confirm the backend is running with
          MASTERY_GENERATED_PLAYTEST=1.
        </p>
      )}

      {loadState === "ready" && sets.length === 0 && (
        <p className="text-sm text-destructive" data-testid="generated-playtest-empty">
          No generated playtest sets are registered. Confirm the backend is running with
          MASTERY_GENERATED_PLAYTEST=1.
        </p>
      )}

      {loadState === "ready" && sets.length > 0 && (
        <div className="flex flex-col gap-3">
          {sets.map((s) => (
            <Button
              key={s.masterySetId}
              onClick={() => setSelected(s.masterySetId)}
              data-testid={`generated-playtest-play-${s.kind}`}
            >
              {s.kind === "champion" ? "Play Ahri Champion Mastery" : "Play Ahri vs Syndra Mastery"}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
