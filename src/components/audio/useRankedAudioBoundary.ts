import { useEffect } from "react";

import { mogzyAudio } from "@/lib/audio/engine";
import "@/lib/audio/mode-soundtrack";

/** Keeps Ranked's lifecycle policy out of its polling/domain controller. */
export function useRankedAudioBoundary(matchId: string, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const owner = `ranked:${matchId}`;
    void mogzyAudio.acquireModeSoundtrack({
      owner,
      source: "track",
      sourceId: "ranked",
      startBehavior: "restart",
      exitBehavior: "return-to-radio",
    });
    return () => mogzyAudio.releaseModeSoundtrack(owner);
  }, [active, matchId]);
}
