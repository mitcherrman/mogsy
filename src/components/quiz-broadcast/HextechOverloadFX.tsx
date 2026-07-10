/**
 * HextechOverloadFX — countdown energy-overload environment layer.
 *
 * Mounted at broadcast level (BroadcastStage), behind the scene content.
 * During the final ~5 s of the question phase the environment reacts to the
 * Knowledge Core's growing power:
 *
 *   - Localized radial vignette centered on the core (NOT a full-screen fade)
 *     that strengthens as the countdown approaches zero.
 *   - Procedural glowing energy cracks that propagate outward from the core
 *     anchor — regenerated every countdown episode so they are never identical.
 *   - A soft blue energy buildup glow at the anchor.
 *
 * On reveal: brief flash, then cracks rapidly dissipate and the environment
 * stabilizes. Cracks are confined to roughly the inner 60–70% of the stage.
 *
 * Implementation notes:
 *   - Pure SVG + CSS. No WebGL — a full-stage transparent canvas compositing
 *     24/7 would cost real GPU; stroke-dashoffset animation is ~free.
 *   - Fixed pool of 7 main cracks + 7 branches. Path data is regenerated per
 *     episode via setAttribute; growth/opacity animated via dashoffset/style.
 *   - Single RAF loop reading props through refs; zero React re-renders.
 *   - viewBox 0 0 1000 1000 with preserveAspectRatio slice → uniform scaling
 *     (no jagged-line distortion) on both 16:9 and 9:16 stages.
 */

import { useEffect, useRef } from "react";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";

const MAIN_CRACKS = 7;
const BRANCHES = 7;
const MAX_RADIUS = 330; // square units — confines cracks to inner ~2/3 region

/* Small deterministic RNG so each episode is fully procedural but coherent */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CrackDef {
  /** Overload level at which this crack starts growing (progressive). */
  threshold: number;
  /** Current smoothed growth 0–1. */
  growth: number;
  strokeWidth: number;
}

interface Props {
  phase: BroadcastPhase;
  phaseStartedAt: number;
  phaseDurationMs: number;
  /** Crack/vignette origin as stage fractions (0–1). */
  anchorX: number;
  anchorY: number;
  /** Stage aspect ratio (w/h) — maps anchor into the slice-square viewBox. */
  aspect: number;
}

export function HextechOverloadFX({
  phase,
  phaseStartedAt,
  phaseDurationMs,
  anchorX,
  anchorY,
  aspect,
}: Props) {
  const phaseRef           = useRef(phase);
  const phaseStartedAtRef  = useRef(phaseStartedAt);
  const phaseDurationMsRef = useRef(phaseDurationMs);
  const anchorRef          = useRef({ x: anchorX, y: anchorY, aspect });
  phaseRef.current           = phase;
  phaseStartedAtRef.current  = phaseStartedAt;
  phaseDurationMsRef.current = phaseDurationMs;
  anchorRef.current          = { x: anchorX, y: anchorY, aspect };

  const mainRefs   = useRef<(SVGPathElement | null)[]>([]);
  const branchRefs = useRef<(SVGPathElement | null)[]>([]);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const glowRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mains: CrackDef[] = Array.from({ length: MAIN_CRACKS }, (_, i) => ({
      threshold: 0.10 + i * 0.11,
      growth: 0,
      strokeWidth: 2.2,
    }));
    const branches: CrackDef[] = Array.from({ length: BRANCHES }, (_, i) => ({
      threshold: 0.30 + i * 0.09,
      growth: 0,
      strokeWidth: 1.3,
    }));

    let episodeActive = false;
    let prevPhase = phaseRef.current;
    let burstStartMs = 0;
    let lastNow = performance.now();
    let raf = 0;

    /** Map stage-fraction anchor into slice-square (1000×1000) coordinates,
     *  and return the visible bounds for crack clamping. */
    const squareSpace = () => {
      const { x, y, aspect } = anchorRef.current;
      let ox: number, oy: number, minX: number, maxX: number, minY: number, maxY: number;
      if (aspect >= 1) {
        const visH = 1000 / aspect;
        ox = x * 1000;
        oy = 500 + (y - 0.5) * visH;
        minX = 40; maxX = 960;
        minY = 500 - visH / 2 + 30; maxY = 500 + visH / 2 - 30;
      } else {
        const visW = 1000 * aspect;
        ox = 500 + (x - 0.5) * visW;
        oy = y * 1000;
        minX = 500 - visW / 2 + 30; maxX = 500 + visW / 2 - 30;
        minY = 40; maxY = 960;
      }
      return { ox, oy, minX, maxX, minY, maxY };
    };

    /** Regenerate the whole crack network for a new overload episode. */
    const regenerate = () => {
      const rng = mulberry32(Date.now() & 0xffffffff);
      const { ox, oy, minX, maxX, minY, maxY } = squareSpace();

      // Points of each main crack, kept for branch starts
      const mainPoints: [number, number][][] = [];

      mains.forEach((c, i) => {
        c.growth = 0;
        // Bias start angles: slightly favor downward ("beneath the crystal")
        let heading =
          (i / MAIN_CRACKS) * Math.PI * 2 + rng() * 0.9 +
          (rng() < 0.4 ? Math.PI * 0.25 : 0);
        const curve = (rng() - 0.5) * 0.22; // per-crack drift
        let px = ox + Math.cos(heading) * (14 + rng() * 22);
        let py = oy + Math.sin(heading) * (14 + rng() * 22) + 10;
        const pts: [number, number][] = [[px, py]];
        const segs = 9 + Math.floor(rng() * 5);
        for (let s = 0; s < segs; s++) {
          heading += (rng() - 0.5) * 1.0 + curve;
          const step = 20 + rng() * 22;
          px += Math.cos(heading) * step;
          py += Math.sin(heading) * step;
          // Stop at radius / bounds limits (truncation looks organic)
          const dx = px - ox, dy = py - oy;
          if (dx * dx + dy * dy > MAX_RADIUS * MAX_RADIUS) break;
          if (px < minX || px > maxX || py < minY || py > maxY) break;
          pts.push([px, py]);
        }
        mainPoints.push(pts);
        const el = mainRefs.current[i];
        if (el) {
          el.setAttribute(
            "d",
            pts.length > 1
              ? `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ")}`
              : "M 0,0",
          );
          el.style.strokeDashoffset = "1";
          el.style.opacity = "0";
        }
      });

      branches.forEach((c, i) => {
        c.growth = 0;
        const parent = mainPoints[i % mainPoints.length];
        const el = branchRefs.current[i];
        if (!el) return;
        if (parent.length < 4) { el.setAttribute("d", "M 0,0"); return; }
        const startIdx = 1 + Math.floor(rng() * (parent.length - 2));
        let [px, py] = parent[startIdx];
        const [qx, qy] = parent[Math.max(0, startIdx - 1)];
        let heading = Math.atan2(py - qy, px - qx) + (rng() < 0.5 ? 1 : -1) * (0.6 + rng() * 0.6);
        const pts: [number, number][] = [[px, py]];
        const segs = 4 + Math.floor(rng() * 3);
        for (let s = 0; s < segs; s++) {
          heading += (rng() - 0.5) * 1.1;
          const step = 14 + rng() * 16;
          px += Math.cos(heading) * step;
          py += Math.sin(heading) * step;
          const dx = px - ox, dy = py - oy;
          if (dx * dx + dy * dy > MAX_RADIUS * MAX_RADIUS) break;
          if (px < minX || px > maxX || py < minY || py > maxY) break;
          pts.push([px, py]);
        }
        el.setAttribute(
          "d",
          pts.length > 1
            ? `M ${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L ")}`
            : "M 0,0",
        );
        el.style.strokeDashoffset = "1";
        el.style.opacity = "0";
      });
    };

    const tick = (now: number) => {
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;

      const phase          = phaseRef.current;
      const phaseStartedAt = phaseStartedAtRef.current;
      const phaseDurationMs= phaseDurationMsRef.current;

      if (phase === "reveal" && prevPhase !== "reveal") burstStartMs = now;
      prevPhase = phase;
      const burstElapsed = burstStartMs > 0 ? now - burstStartMs : Infinity;

      // ── Overload curve: builds over final 5 s of the question ─────────
      // 5s→3s: slow instability ramp 0→0.35. 3s→0: steep 0.35→1.
      let overload = 0;
      if (phase === "question" && phaseDurationMs > 0) {
        const rem = Math.max(0, phaseDurationMs - (Date.now() - phaseStartedAt));
        if (rem < 3000) overload = 0.35 + (1 - rem / 3000) * 0.65;
        else if (rem < 5000) overload = ((5000 - rem) / 2000) * 0.35;
      } else if (phase === "reveal") {
        // Flash then rapid dissipation
        overload = burstElapsed < 250 ? 1 : Math.max(0, 1 - (burstElapsed - 250) / 700);
      }

      // New episode begins → regenerate the crack network
      if (overload > 0 && phase === "question" && !episodeActive) {
        episodeActive = true;
        regenerate();
      } else if (overload === 0 && phase !== "question") {
        episodeActive = false;
      }

      // Master fade: full during buildup, rapid dissipation after reveal
      const master =
        phase === "reveal"
          ? (burstElapsed < 250 ? 1 : Math.max(0, 1 - (burstElapsed - 250) / 700))
          : Math.min(1, overload * 1.6);

      // ── Cracks: progressive growth + flicker ──────────────────────────
      const growCrack = (c: CrackDef, el: SVGPathElement | null, i: number) => {
        if (!el) return;
        const target =
          phase === "reveal"
            ? c.growth // freeze length after reveal; only fade
            : Math.max(0, Math.min(1, (overload - c.threshold) / 0.28));
        c.growth += (target - c.growth) * Math.min(1, dt * 7);
        el.style.strokeDashoffset = String((1 - c.growth).toFixed(3));
        const flicker = 0.60 + Math.sin(now / 92 + i * 2.7) * 0.25 + Math.sin(now / 41 + i) * 0.15;
        const burstBoost = burstElapsed < 250 ? 0.35 : 0;
        // 0.82 master scale — cracks support the crystal, never compete with it
        el.style.opacity = String(
          Math.max(0, Math.min(1, (c.growth * flicker * master + burstBoost * master) * 0.82)).toFixed(3),
        );
      };
      mains.forEach((c, i) => growCrack(c, mainRefs.current[i], i));
      branches.forEach((c, i) => growCrack(c, branchRefs.current[i], i + 3));

      // ── Vignette + energy glow ─────────────────────────────────────────
      if (vignetteRef.current) {
        vignetteRef.current.style.opacity = String((master * 0.62).toFixed(3));
      }
      if (glowRef.current) {
        const throb = 0.75 + Math.sin(now / 210) * 0.25 * overload;
        glowRef.current.style.opacity = String((master * 0.55 * throb).toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []); // mount once — reads all props through refs

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Localized vignette — soft dark halo around the core, transparent
          center so the countdown stays readable, fades out well before the
          question/answer panels. */}
      <div
        ref={vignetteRef}
        className="absolute rounded-full overflow-hidden will-change-[opacity] [mask-image:radial-gradient(circle,black_0%,black_58%,transparent_76%)]"
        style={{
          left: `${anchorX * 100}%`,
          top: `${anchorY * 100}%`,
          width: "85%",
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, transparent 0%, transparent 9%, rgba(2,6,20,0.55) 22%, rgba(2,6,20,0.30) 38%, transparent 55%)",
          opacity: 0,
        }}
      />

      {/* Energy buildup glow at the anchor */}
      <div
        ref={glowRef}
        className="absolute rounded-full overflow-hidden will-change-[opacity] [mask-image:radial-gradient(circle,black_0%,black_62%,transparent_80%)]"
        style={{
          left: `${anchorX * 100}%`,
          top: `${anchorY * 100}%`,
          width: "34%",
          aspectRatio: "1",
          transform: "translate(-50%, -50%)",
          background:
            "radial-gradient(circle, rgba(80,170,255,0.30) 0%, rgba(40,110,255,0.12) 40%, transparent 68%)",
          opacity: 0,
        }}
      />

      {/* Procedural energy cracks */}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full [mask-image:radial-gradient(circle_at_var(--fx-x,50%)_var(--fx-y,50%),black_0%,black_44%,transparent_72%)]"
        style={
          {
            "--fx-x": `${anchorX * 100}%`,
            "--fx-y": `${anchorY * 100}%`,
          } as React.CSSProperties
        }
      >
        <g style={{ filter: "drop-shadow(0 0 5px rgba(90,185,255,0.70))" }}>
          {Array.from({ length: MAIN_CRACKS }, (_, i) => (
            <path
              key={`m${i}`}
              ref={(el) => { mainRefs.current[i] = el; }}
              d="M 0,0"
              pathLength={1}
              fill="none"
              stroke="#9fd8ff"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1"
              style={{ strokeDashoffset: 1, opacity: 0 }}
            />
          ))}
          {Array.from({ length: BRANCHES }, (_, i) => (
            <path
              key={`b${i}`}
              ref={(el) => { branchRefs.current[i] = el; }}
              d="M 0,0"
              pathLength={1}
              fill="none"
              stroke="#7fc4ff"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1"
              style={{ strokeDashoffset: 1, opacity: 0 }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
