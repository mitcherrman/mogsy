/**
 * PPQ2-A — dev-only probe for the arena's NEUTRAL QUESTION SURFACE.
 *
 * Mounts the production `CanonicalArena` with an `ArenaQuestionSurface`: a
 * question with no Ranked match around it — no public round, no players, no
 * clock, no result beat — and two `panel` flanks that draw labelled probe
 * boxes instead of combatants. Everything is synthetic (`questionProbeView`).
 *
 *   /dev/arena-question-probe?state=pre|selected|revealed-correct|revealed-wrong
 *     &opts=2|3|4 &prompt=short|long &labels=short|long &rails=panel|empty
 *
 * In `pre` the tablets are live: clicking one locks it locally (nothing is
 * submitted anywhere), so selection can be exercised by hand.
 *
 * Registered only when `import.meta.env.DEV` (see App.tsx), so a production
 * build dead-code-eliminates it and the path 404s.
 */
import { useMemo, useState } from "react";
import { CanonicalArena } from "@/components/ranked-arena/CanonicalArena";
import { questionProbeView, readProbeParams } from "./questionProbeView";

/** A flank box that is plainly a probe — never a combatant, never a player. */
function ProbePanel({ side }: { side: "left" | "right" }) {
  return (
    <section data-testid={`probe-panel-${side}`}
      className="ranked-panel flex h-full flex-col gap-2 p-4 text-left">
      <div className="ranked-eyebrow">{side === "left" ? "Probe panel · left" : "Probe panel · right"}</div>
      <p className="text-xs text-muted-foreground">
        A mode-supplied flank. Synthetic probe content only.
      </p>
    </section>
  );
}

export default function ArenaQuestionProbe() {
  const params = useMemo(() => readProbeParams(window.location.search), []);
  const [selected, setSelected] = useState<string | null>(null);
  const view = questionProbeView(params, {
    selectedOptionId: params.state === "pre" ? selected : undefined,
    onSelectOption: (option) => setSelected(option.id),
    leftPanel: <ProbePanel side="left" />,
    rightPanel: <ProbePanel side="right" />,
  });
  // A locked selection closes input, as a real mode would while it waits on
  // the server; still no reveal, because no server ever graded it.
  const live = params.state === "pre" && selected !== null
    ? { ...view, surface: { ...view.surface, inputOpen: false,
      permissions: { ...view.surface.permissions, canSelectAnswer: false } } }
    : view;
  return (
    <div data-testid="arena-question-probe" data-probe-state={params.state}
      data-probe-options={params.options}>
      <CanonicalArena view={live} />
    </div>
  );
}
