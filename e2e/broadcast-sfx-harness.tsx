import React, { useState } from "react";
import { createRoot } from "react-dom/client";

import BroadcastSfxLayer from "@/components/quiz-broadcast/BroadcastSfxLayer";
import { EMPTY_AUDIO_STUDIO_CONFIG } from "@/lib/audio/audio-studio-config";
import {
  setSfxConfigForTests,
  SFX_MUTE_CHANGE_EVENT,
  SFX_MUTE_STORAGE_KEY,
} from "@/lib/audio/sfx";
import {
  DEFAULT_CONFIG,
  type BroadcastPhase,
  type EngineSnapshot,
} from "@/lib/quiz-broadcast/types";

declare global {
  interface Window {
    __broadcastSfxQaAdvance: (phase: BroadcastPhase, phaseStartedAt: number, duration?: number) => void;
    __broadcastSfxQaMute: (muted: boolean) => void;
  }
}

setSfxConfigForTests(EMPTY_AUDIO_STUDIO_CONFIG);

const sfx = {
  enabled: true,
  masterVolume: 0.5,
  sounds: {
    questionStart: { enabled: true, src: "/quiz-broadcast/audio/sfx/reveal.mp3", volume: 0.6 },
    countdownTick: { enabled: true, src: "/quiz-broadcast/audio/sfx/reveal.mp3", volume: 0.4 },
    reveal: { enabled: true, src: "/quiz-broadcast/audio/sfx/reveal.mp3", volume: 0.6 },
    correctAnswer: { enabled: true, src: "/quiz-broadcast/audio/sfx/reveal.mp3", volume: 0.6 },
    transition: { enabled: true, src: "/quiz-broadcast/audio/sfx/reveal.mp3", volume: 0.5 },
  },
};

const initial: EngineSnapshot = {
  phase: "idle", playing: false, currentIndex: 0, currentQuestion: null,
  playlist: [], correctAnswer: null, explanation: null,
  phaseStartedAt: 1, phaseDurationMs: 0, playlistLength: 0,
  questionsPlayed: 0, startedAt: null,
  config: { ...DEFAULT_CONFIG, sfx }, playlistId: null, playlistName: null,
  sessionId: "browser-qa",
};

function Harness() {
  const [snapshot, setSnapshot] = useState(initial);
  window.__broadcastSfxQaAdvance = (phase, phaseStartedAt, duration = 0) => {
    setSnapshot((current) => ({
      ...current,
      phase,
      playing: phase !== "idle",
      phaseStartedAt,
      phaseDurationMs: duration,
    }));
  };
  window.__broadcastSfxQaMute = (muted) => {
    if (muted) localStorage.setItem(SFX_MUTE_STORAGE_KEY, "1");
    else localStorage.removeItem(SFX_MUTE_STORAGE_KEY);
    window.dispatchEvent(new Event(SFX_MUTE_CHANGE_EVENT));
  };
  return (
    <main data-testid="broadcast-sfx-harness" className="relative min-h-screen bg-black text-white">
      <p data-testid="phase">{snapshot.phase}:{snapshot.phaseStartedAt}</p>
      <BroadcastSfxLayer snapshot={snapshot} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
