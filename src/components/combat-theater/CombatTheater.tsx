/**
 * Combat Theater V4 — composition root.
 *
 * Isolated from the public Combat Lab: this component takes a
 * `TeamSimulationResponse` (a committed fixture, in the prototype) and
 * renders the HUD, stage, timeline, transport and math explainer over one
 * deterministic controller. It imports only read-only modules
 * (`team-sim/playback.ts`, `team-sim/contract.ts` types, `abilityIcons`,
 * `useChampionAssets`) — never `CombatLab.tsx`, the Team Sim page, its
 * network client or Supabase.
 *
 * Keyboard: Space play/pause · [ ] previous/next event · Home restart ·
 * arrows on the focused timeline nudge the clock.
 */
import { useEffect, useMemo } from "react";

import { useChampionAssets } from "@/hooks/useChampionAssets";
import { useReducedMotionPreference } from "@/hooks/useReducedMotionPreference";
import type { TeamSimulationResponse } from "@/lib/combat-lab/team-sim/contract";
import { buildTheaterScript } from "@/lib/combat-theater/theater";
import { useTheaterController } from "@/lib/combat-theater/useTheaterController";

import "./theater.css";
import { MathExplainer } from "./MathExplainer";
import { TheaterHud } from "./TheaterHud";
import { TheaterStage } from "./TheaterStage";
import { TheaterTimeline } from "./TheaterTimeline";
import { TheaterTransport } from "./TheaterTransport";

export type CombatTheaterProps = {
  response: TeamSimulationResponse;
  /** Beat index to open on (paused, pinned). Defaults to "before the first beat". */
  initialBeatIndex?: number | null;
  /** Force the reduced-motion path regardless of OS/app preference. */
  forceReducedMotion?: boolean;
  /** Bind Space / [ / ] / Home on `window` (off inside tests or embedded hosts). */
  keyboardShortcuts?: boolean;
};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

export function CombatTheater({
  response,
  initialBeatIndex = null,
  forceReducedMotion = false,
  keyboardShortcuts = true,
}: CombatTheaterProps) {
  const script = useMemo(() => buildTheaterScript(response), [response]);
  const controller = useTheaterController(script, initialBeatIndex);
  const prefersReduced = useReducedMotionPreference();
  const reduced = forceReducedMotion || prefersReduced;
  const { data: manifestData } = useChampionAssets();
  const manifest = manifestData ?? null;

  const { toggle, next, prev, restart } = controller;
  useEffect(() => {
    if (!keyboardShortcuts) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if ((e.target as HTMLElement | null)?.getAttribute?.("role") === "slider") return; // the timeline handles its own keys
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "]") {
        e.preventDefault();
        next();
      } else if (e.key === "[") {
        e.preventDefault();
        prev();
      } else if (e.key === "Home") {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboardShortcuts, toggle, next, prev, restart]);

  const selected = controller.selected;

  return (
    <div className="ct-root" data-reduced={reduced ? "true" : "false"} data-testid="combat-theater">
      <div className="ct-layout">
        <div className="ct-theater">
          <TheaterHud
            left={script.left}
            right={script.right}
            states={controller.state.combatants}
            manifest={manifest}
            time={controller.time}
            duration={script.duration}
            actorId={selected?.actorId ?? null}
            targetId={selected?.targetId ?? null}
            reduced={reduced}
          />
          <TheaterStage
            script={script}
            beat={selected}
            states={controller.state.combatants}
            manifest={manifest}
            reduced={reduced}
            atEnd={controller.atEnd}
          />
          <TheaterTimeline
            script={script}
            time={controller.time}
            selectedIndex={controller.selectedIndex}
            manifest={manifest}
            onSeek={controller.seek}
            onSelectBeat={controller.selectBeat}
            onStep={(d) => (d > 0 ? controller.next() : controller.prev())}
          />
          <TheaterTransport controller={controller} beatCount={script.beats.length} />
        </div>
        <aside className="ct-layout__aside">
          <MathExplainer script={script} beat={selected} manifest={manifest} reduced={reduced} />
        </aside>
      </div>
      <p className="ct-sr-only" aria-live="polite">
        {selected
          ? `Event ${selected.index + 1} of ${script.beats.length}: ${selected.label} at ${selected.time.toFixed(3)} seconds${selected.hp ? `, ${Math.round(selected.hp.applied)} HP damage` : ""}.`
          : "Ready."}
      </p>
    </div>
  );
}

export default CombatTheater;
