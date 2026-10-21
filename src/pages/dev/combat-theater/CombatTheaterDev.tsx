/**
 * COMBAT V4 — Combat Theater prototype host. DEVELOPMENT ONLY: registered in
 * App.tsx behind `import.meta.env.DEV` (the same rule as /dev/combat-estimate),
 * so a production build drops the route and the path 404s.
 *
 * Stages committed Team Simulator fixtures only — no backend call, no
 * credits, no auth, and nothing shared with the public `/combat-lab` page.
 *
 *   /dev/combat-theater?scene=ashe-garen|lux-q   which fixture to stage
 *     &motion=reduce                              force the reduced-motion path
 */
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { CombatTheater } from "@/components/combat-theater/CombatTheater";
import { APP_REDUCE_MOTION_CLASS } from "@/hooks/useReducedMotionPreference";

import { findScene, THEATER_SCENES } from "./scenes";

export default function CombatTheaterDev() {
  const [params] = useSearchParams();
  const scene = findScene(params.get("scene"));
  const forceReduce = params.get("motion") === "reduce";

  useEffect(() => {
    if (!forceReduce) return;
    document.documentElement.classList.add(APP_REDUCE_MOTION_CLASS);
    return () => document.documentElement.classList.remove(APP_REDUCE_MOTION_CLASS);
  }, [forceReduce]);

  useEffect(() => {
    const previous = document.title;
    document.title = `Combat Theater · ${scene.title}`;
    return () => {
      document.title = previous;
    };
  }, [scene.title]);

  return (
    <div className="ct-root" style={{ minHeight: "100dvh" }}>
      <div className="ct-shell">
        <header className="ct-header">
          <div>
            <h1 className="ct-header__title">
              Combat Theater <span>· V4 prototype</span>
            </h1>
            <div className="ct-header__meta">
              {scene.title} — {scene.subtitle}. Fixture <code className="ct-mono">{scene.fixtureFile}</code> · scenario{" "}
              <code className="ct-mono">{scene.response.scenario_id}</code> · trace{" "}
              <code className="ct-mono">{scene.response.trace?.detail ?? "unknown"}</code> · {scene.response.contract_version}
            </div>
          </div>
          <nav className="ct-scenes" aria-label="Scenes">
            {THEATER_SCENES.map((s) => (
              <Link
                key={s.id}
                to={`?scene=${s.id}${forceReduce ? "&motion=reduce" : ""}`}
                className="ct-scene"
                aria-current={s.id === scene.id ? "true" : undefined}
              >
                {s.title}
              </Link>
            ))}
          </nav>
        </header>

        <CombatTheater key={scene.id} response={scene.response} initialBeatIndex={scene.initialBeatIndex} forceReducedMotion={forceReduce} />

        <p className="ct-footnote">
          Every number on this page is read from the committed fixture (scheduler <code className="ct-mono">damage_accounting</code>, kernel{" "}
          <code className="ct-mono">payload</code> / <code className="ct-mono">payload.metadata</code>, <code className="ct-mono">effective_builds</code>). HP is
          replayed from <code className="ct-mono">hp_after</code>, never subtracted; formulas are shown verbatim and never evaluated here. Keyboard: Space
          play/pause · [ ] previous/next · Home restart · arrows on the timeline nudge 0.1 s.
        </p>
      </div>
    </div>
  );
}
