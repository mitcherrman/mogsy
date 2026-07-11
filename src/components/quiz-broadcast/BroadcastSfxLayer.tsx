import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2 } from "lucide-react";
import type { BroadcastSfx, BroadcastSfxEvent, EngineSnapshot } from "@/lib/quiz-broadcast/types";
import { DEFAULT_SFX } from "@/lib/quiz-broadcast/types";
import { playBroadcastSfx, unlockBroadcastAudio } from "@/lib/quiz-broadcast/sfx";

/**
 * BroadcastSfxLayer — presentation-only audio layer.
 *
 * Watches the engine snapshot and plays configured sound effects on phase
 * transitions. Never touches engine/session/channel state or timing.
 *
 * Dedupe: every playback is keyed by phase + phaseStartedAt (+ tick number
 * for the countdown), so re-renders, HMR, and snapshot churn never replay a
 * sound. Failures (missing file, bad path) are silent; an autoplay block
 * shows a small non-blocking "Enable broadcast audio" button.
 */
export default function BroadcastSfxLayer({ snapshot }: { snapshot: EngineSnapshot }) {
  const sfx: BroadcastSfx = snapshot.config.sfx ?? DEFAULT_SFX;
  const [blocked, setBlocked] = useState(false);
  const playedRef = useRef<Set<string>>(new Set());
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;

  const tryPlay = useCallback((event: BroadcastSfxEvent, dedupeKey: string) => {
    const cfg = sfxRef.current;
    if (!cfg.enabled) return;
    const item = cfg.sounds?.[event];
    if (!item?.enabled || !item.src) return;
    if (playedRef.current.has(dedupeKey)) return;
    playedRef.current.add(dedupeKey);
    // Keep the dedupe set from growing unbounded on a 24/7 broadcast.
    if (playedRef.current.size > 300) playedRef.current.clear();
    void playBroadcastSfx(item.src, cfg.masterVolume * item.volume).then((res) => {
      if (res === "blocked") setBlocked(true);
      else if (res === "played") setBlocked(false);
    });
  }, []);

  const { phase, phaseStartedAt, phaseDurationMs } = snapshot;

  // Phase-entry sounds.
  useEffect(() => {
    const key = `${phase}:${phaseStartedAt}`;
    if (phase === "question") tryPlay("questionStart", key);
    else if (phase === "reveal") {
      tryPlay("reveal", key);
      tryPlay("correctAnswer", `${key}:correct`);
    } else if (phase === "transition") tryPlay("transition", key);
  }, [phase, phaseStartedAt, tryPlay]);

  // Countdown ticks — once per remaining second 3, 2, 1 of the question phase.
  useEffect(() => {
    if (phase !== "question" || phaseDurationMs <= 0) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const n of [3, 2, 1]) {
      const fireAt = phaseStartedAt + phaseDurationMs - n * 1000;
      const delay = fireAt - Date.now();
      if (delay < -250) continue; // late joiner past this tick — skip it
      timers.push(
        setTimeout(() => tryPlay("countdownTick", `${phaseStartedAt}:tick${n}`), Math.max(0, delay)),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [phase, phaseStartedAt, phaseDurationMs, tryPlay]);

  const onUnlock = async () => {
    await unlockBroadcastAudio();
    setBlocked(false);
  };

  if (!sfx.enabled || !blocked) return null;

  return (
    <div className="absolute bottom-[2%] right-[2%] z-[60]">
      <button
        type="button"
        onClick={onUnlock}
        className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[#d4b35a]/50 bg-black/70 px-3 py-2 text-[1.4cqmin] font-semibold uppercase tracking-wider text-[#f3dca0] backdrop-blur-md transition-colors hover:bg-black/85"
      >
        <Volume2 className="h-[1.8cqmin] w-[1.8cqmin]" />
        Enable broadcast audio
      </button>
    </div>
  );
}
