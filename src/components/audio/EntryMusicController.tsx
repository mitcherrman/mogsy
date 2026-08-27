import { useEffect } from "react";

import {
  adoptAcademyRadioPlaylist,
  installFirstGestureUnlock,
  installRadioInactivityMonitor,
  prepareRadio,
  startRadio,
} from "@/lib/audio/academy-radio";
import {
  getAudioStudioRuntimeSnapshot,
  loadAudioStudioRuntime,
  resolveRuntimePlaylist,
  subscribeAudioStudioRuntime,
} from "@/lib/audio/audio-studio-runtime";

/**
 * Academy Radio mount point.
 *
 * All of the behaviour lives in the store (src/lib/audio/academy-radio.ts); this
 * component exists only to give it a lifecycle. On mount it builds and warms the
 * single music element and arms the centralized first-interaction listener.
 *
 * Placement is load-bearing. It is mounted inside <BrowserRouter> but outside
 * <Routes> so it spans every route, and it must not move into <Layout /> (the
 * root entrance renders outside Layout) or into the entrance itself (that
 * component unmounts during the / -> /lol hand-off, taking the music with it).
 *
 * There is deliberately no cleanup: the element is global and has to survive
 * this component, HMR, and every route change. Pausing or cancelling a fade here
 * would cut the music off mid-transition.
 *
 * The file keeps its original name because the entrance imports
 * `startEntryMusic` from this path and both audio specs are written against it.
 */
export default function AcademyRadioController() {
  useEffect(() => {
    prepareRadio();
    installFirstGestureUnlock();
    installRadioInactivityMonitor();
    const applyRuntime = (runtime = getAudioStudioRuntimeSnapshot()) => {
      const playlist = resolveRuntimePlaylist(runtime.config, "academy-radio");
      if (!playlist) return;
      adoptAcademyRadioPlaylist(playlist.tracks.map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        artworkUrl: track.artworkUrl,
        sources: track.sources,
        relativeGain: track.relativeGain,
        durationMs: track.durationMs,
      })));
    };
    const unsubscribe = subscribeAudioStudioRuntime(() => applyRuntime());
    void loadAudioStudioRuntime().then(applyRuntime);
    return unsubscribe;
  }, []);

  return null;
}

/**
 * The entrance's own start, called from the "Enter Mogzy" gesture.
 *
 * The entrance is where the long swell belongs, so this takes the default
 * FADE_IN_MS. It announces nothing: the centered radio controls are the only
 * feedback a visitor gets that the music has started, by design.
 *
 * Never throws and never rejects, so the entrance can fire it with `void` from
 * inside its click handler without risking the navigation that follows.
 */
export function startEntryMusic(): Promise<boolean> {
  return startRadio({ automatic: true });
}

/** Test-only: drops the cross-module singleton so specs start from silence. */
export { resetRadioForTests as resetEntryMusicForTests } from "@/lib/audio/academy-radio";
