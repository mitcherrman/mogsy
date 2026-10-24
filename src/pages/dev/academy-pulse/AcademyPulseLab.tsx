/**
 * DEV ONLY — the Academy Pulse lab (`/dev/academy-pulse`).
 *
 * Every fixture scene at the frame sizes the Home Hub actually gives Pulse,
 * optionally drawn at 2x for inspection, plus the paused / reduced options.
 * Used for review screenshots (CI) and design iteration; never routed in a
 * production build (App.tsx gates it on import.meta.env.DEV).
 *
 *   ?scene=<item id>  &size=desktop|tall|short|mobile  &zoom=2  &paused=1
 *   &still=1  every framer animation jumps to its end (layout review in a
 *             backgrounded browser, where animation frames barely run)
 */
import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { MotionGlobalConfig } from "framer-motion";

import AcademyPulse from "@/features/academy-pulse/AcademyPulse";
import { PULSE_FIXTURE_ITEMS } from "@/features/academy-pulse/content/pulse-fixtures";
import { fixturePulseCatalogue } from "@/features/academy-pulse/content/pulse-provider";
import { CATEGORY_LABEL, type PulseCatalogue, type PulseContentProvider } from "@/features/academy-pulse/model/pulse-types";

/** The fixtures with the chosen item first in its category, so the first cycle shows it. */
function labProvider(sceneId: string): PulseContentProvider {
  const catalogue: PulseCatalogue = {};
  for (const [cat, items] of Object.entries(fixturePulseCatalogue())) {
    const list = [...(items ?? [])];
    const i = list.findIndex((x) => x.id === sceneId);
    if (i > 0) list.unshift(...list.splice(i, 1));
    catalogue[cat as keyof PulseCatalogue] = list;
  }
  return { id: `lab:${sceneId}`, load: async () => catalogue, peek: () => catalogue };
}

/** Frame sizes measured from the Orrery's left column (see academy-core-pulse.css). */
export const LAB_SIZES = {
  desktop: { w: 369, h: 236, note: "1366 x 768 laptop" },
  short: { w: 345, h: 160, note: "1280 x 640 short laptop" },
  tall: { w: 430, h: 420, note: "1920 x 1080 desktop" },
  mobile: { w: 358, h: 286, note: "390 px phone, below the first screen" },
} as const;
type SizeKey = keyof typeof LAB_SIZES;

export default function AcademyPulseLab() {
  const [params, setParams] = useSearchParams();
  const scene = params.get("scene") ?? PULSE_FIXTURE_ITEMS[0].id;
  const size = (params.get("size") as SizeKey) in LAB_SIZES ? (params.get("size") as SizeKey) : "desktop";
  const zoom = params.get("zoom") === "2" ? 2 : 1;
  const paused = params.get("paused") !== "0";
  // DEV lab only: a global switch, set before the device mounts
  MotionGlobalConfig.skipAnimations = params.get("still") === "1";
  useEffect(() => () => { MotionGlobalConfig.skipAnimations = false; }, []);
  const dims = LAB_SIZES[size];
  const set = (k: string, v: string) => { const next = new URLSearchParams(params); next.set(k, v); setParams(next, { replace: true }); };
  const key = useMemo(() => `${scene}:${size}:${paused}`, [scene, size, paused]);
  const provider = useMemo(() => labProvider(scene), [scene]);

  return (
    <div style={{ minHeight: "100vh", background: "#050a14", color: "#c3cbe0", padding: 16, fontFamily: "Inter, system-ui, sans-serif" }} data-testid="pulse-lab">
      <p style={{ margin: "0 0 8px", fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#f0d78c" }}>
        Academy Pulse lab · development fixtures only
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {PULSE_FIXTURE_ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => set("scene", it.id)}
            style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #334", background: it.id === scene ? "#c9a84c" : "#0c1830", color: it.id === scene ? "#111" : "#c3cbe0" }}
          >
            {CATEGORY_LABEL[it.category]} · {it.id.replace(/^fx-/, "")}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, fontSize: 11 }}>
        {(Object.keys(LAB_SIZES) as SizeKey[]).map((k) => (
          <button key={k} type="button" onClick={() => set("size", k)} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #334", background: k === size ? "#7ad6ff" : "#0c1830", color: k === size ? "#111" : "#c3cbe0" }}>
            {k} {LAB_SIZES[k].w}x{LAB_SIZES[k].h}
          </button>
        ))}
        <button type="button" onClick={() => set("zoom", zoom === 2 ? "1" : "2")} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #334", background: "#0c1830", color: "#c3cbe0" }}>zoom {zoom}x</button>
        <button type="button" onClick={() => set("paused", paused ? "0" : "1")} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid #334", background: "#0c1830", color: "#c3cbe0" }}>{paused ? "paused" : "rotating"}</button>
      </div>
      <div style={{ zoom, width: dims.w, height: dims.h, position: "relative", margin: "12px 0 0 12px" }} data-testid="pulse-lab-frame">
        <AcademyPulse key={key} provider={provider} startAt={scene} startPaused={paused} variant={size === "mobile" ? "mobile" : "desktop"} />
      </div>
      <p style={{ marginTop: 16, fontSize: 11, color: "#8e98b3" }}>{dims.note}</p>
    </div>
  );
}
