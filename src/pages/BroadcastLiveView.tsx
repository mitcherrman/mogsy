import { useEffect, useState } from "react";
import SEOHead from "@/components/SEOHead";
import BroadcastRenderer from "@/components/quiz-broadcast/BroadcastRenderer";
import { subscribeLiveSnapshot } from "@/lib/quiz-broadcast/liveSync";
import type { EngineSnapshot } from "@/lib/quiz-broadcast/types";

/**
 * Public OBS Browser Source route — /broadcast/live-view
 *
 * Read-only: subscribes to the Supabase-mirrored broadcast snapshot
 * (public-read `broadcast_live_state` row) and renders the shared
 * BroadcastRenderer scene. No auth, no navbar, no controls, no user data.
 * Designed for a 1920x1080 Browser Source.
 */
export default function BroadcastLiveView() {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);

  useEffect(() => subscribeLiveSnapshot(setSnapshot), []);

  useEffect(() => {
    document.title = "Mogsy Live Broadcast";
    // Pristine frame for OBS: no scrollbars, solid black behind the scene.
    const prevOverflow = document.body.style.overflow;
    const prevBackground = document.body.style.background;
    document.body.style.overflow = "hidden";
    document.body.style.background = "#000";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBackground;
    };
  }, []);

  return (
    <>
      {/* OBS-only output surface — never index */}
      <SEOHead title="Mogsy Live Broadcast" description="OBS browser source for the Mogsy quiz broadcast." noindex />
      <BroadcastRenderer snapshot={snapshot} />
    </>
  );
}
