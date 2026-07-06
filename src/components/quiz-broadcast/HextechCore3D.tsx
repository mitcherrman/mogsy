/**
 * HextechCore3D — React Three Fiber 3D Hextech crystal core (V3).
 *
 * A multi-faceted hexagonal gem replacing the V2 cube. The gold crest, rings,
 * auras, burst shockwave, and outer particles remain SVG/DOM around this
 * canvas; environment overload FX (cracks/vignette) live at broadcast level
 * in HextechOverloadFX.
 *
 * Geometry:
 *   Procedural hexagonal gem — prism body + beveled frustum caps + apex
 *   points (48 triangles). Non-indexed with per-face vertex colors so every
 *   facet catches light differently ("carved, not modeled"). All vertices
 *   carry small seeded jitter so the crystal is asymmetric like a real cut
 *   stone. Prism axis faces the camera → the silhouette reads as the
 *   concentric-hexagon face from the concept art.
 *
 * Construction (out → in):
 *   Outer shell (deep sapphire) → mid shell (electric blue) → inner shell
 *   (cyan) → white-hot nucleus + crossed star flares → internal particles.
 *   Shells counter-rotate at different speeds — nested parallax sells volume.
 *
 * Phase behavior:
 *   idle       slow spin, breathing nucleus, drifting particles, rare flicker
 *   countdown  spin accelerates, particles spiral in, nucleus compresses and
 *              brightens, orbit arcs speed up; in the final ~5 s the crystal
 *              STRUGGLES — shells misalign with irregular jitter, discharge
 *              arcs crackle off the surface, pulses turn erratic
 *   reveal     white-hot flash, particle burst, rotation impulse, then the
 *              shells SNAP back into perfect alignment
 *   recovery   brightness settles, particles return, breathing resumes
 *
 * Performance: dpr ≤ 1.5, no shadows, no transmission; ~16 draw calls; one
 * Points buffer for 80 particles; 3 pooled discharge-arc lines with
 * preallocated buffers; Bloom mipmapBlur threshold 0.55, multisampling 0.
 * 24/7 safety: webglcontextlost → onFail() → parent swaps to SVG fallback.
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import { lerpCycleVisuals } from "./KnowledgeCoreConfig";

/* ────────────────────────────────────────────────────────────────────────
   Seeded RNG — deterministic procedural asymmetry
   ──────────────────────────────────────────────────────────────────────── */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ────────────────────────────────────────────────────────────────────────
   Gem geometry — hexagonal prism + beveled caps + apex, jittered, per-face
   vertex colors. Unit scale: ring radius 1.
   ──────────────────────────────────────────────────────────────────────── */

const GEM_R = 1.0;    // hex ring radius
const GEM_H = 0.42;   // prism half-length (z axis, toward camera)
const CAP_R = 0.56;   // bevel ring radius
const CAP_H = 0.26;   // bevel ring z beyond prism
const APEX_H = 0.20;  // apex point z beyond bevel ring

type Vec3 = [number, number, number];

interface GemTemplate {
  ringTop: Vec3[]; ringBot: Vec3[];
  capTop: Vec3[];  capBot: Vec3[];
  apexTop: Vec3;   apexBot: Vec3;
}

/** Jittered vertex template shared by all shells so their facets stay
 *  parallel (nested-carved look) while never being mathematically perfect. */
function makeGemTemplate(seed: number, jitter: number): GemTemplate {
  const rng = mulberry32(seed);
  const j = () => (rng() * 2 - 1) * jitter;
  const ring = (r: number, z: number): Vec3[] =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      return [
        Math.cos(a) * r + j(),
        Math.sin(a) * r + j(),
        z + j(),
      ] as Vec3;
    });
  return {
    ringTop: ring(GEM_R, GEM_H),
    ringBot: ring(GEM_R, -GEM_H),
    capTop:  ring(CAP_R, GEM_H + CAP_H),
    capBot:  ring(CAP_R, -(GEM_H + CAP_H)),
    apexTop: [j() * 0.4, j() * 0.4, GEM_H + CAP_H + APEX_H],
    apexBot: [j() * 0.4, j() * 0.4, -(GEM_H + CAP_H + APEX_H)],
  };
}

/** Non-indexed gem geometry with per-face brightness/tint vertex colors. */
function buildGemGeometry(
  tpl: GemTemplate,
  colorSeed: number,
  bMin: number,
  bMax: number,
): THREE.BufferGeometry {
  const rng = mulberry32(colorSeed);
  const positions: number[] = [];
  const colors: number[] = [];

  const tri = (a: Vec3, b: Vec3, c: Vec3) => {
    positions.push(...a, ...b, ...c);
    // One color per face — every facet catches light differently
    const br = bMin + rng() * (bMax - bMin);
    const r = br * (0.78 + rng() * 0.22);
    const g = br * (0.90 + rng() * 0.10);
    for (let k = 0; k < 3; k++) colors.push(r, g, br);
  };
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3) => { tri(a, b, c); tri(a, c, d); };

  const { ringTop, ringBot, capTop, capBot, apexTop, apexBot } = tpl;
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6;
    quad(ringBot[i], ringBot[n], ringTop[n], ringTop[i]); // prism side
    quad(ringTop[i], ringTop[n], capTop[n], capTop[i]);   // top bevel
    tri(capTop[i], capTop[n], apexTop);                   // top cap
    quad(ringBot[n], ringBot[i], capBot[i], capBot[n]);   // bottom bevel
    tri(capBot[n], capBot[i], apexBot);                   // bottom cap
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/* ────────────────────────────────────────────────────────────────────────
   Star flare texture — tiny one-time canvas radial gradient
   ──────────────────────────────────────────────────────────────────────── */

function makeFlareTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(200,235,255,0.55)");
  g.addColorStop(1, "rgba(120,180,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ────────────────────────────────────────────────────────────────────────
   Shell / arc / particle configuration
   ──────────────────────────────────────────────────────────────────────── */

const SHELLS = [
  // Deep sapphire outer → electric blue mid → cyan inner
  { scale: 1.00, color: "#10336e", emissive: "#0d2f80", opacity: 0.92, spin:  0.05, bMin: 0.55, bMax: 1.15 },
  { scale: 0.66, color: "#1a5ad8", emissive: "#2468ff", opacity: 0.50, spin: -0.08, bMin: 0.65, bMax: 1.25 },
  { scale: 0.40, color: "#3b96f2", emissive: "#55c0ff", opacity: 0.46, spin:  0.12, bMin: 0.75, bMax: 1.35 },
] as const;

// Corner-up silhouette width at unit scale (hex diameter)
const SILHOUETTE = GEM_R * 2;
const TARGET_FRACTION = 0.46;

const ORBIT_ARC_CONFIGS = [
  { radius: 0.55, tube: 0.012, axis: [1, 0.3, 0.2] as const,  speed: 0.7  },
  { radius: 0.72, tube: 0.010, axis: [0.2, 1, -0.4] as const, speed: -0.5 },
  { radius: 0.88, tube: 0.008, axis: [-0.5, 0.4, 1] as const, speed: 0.35 },
];

const PARTICLE_COUNT = 80;
const DISCHARGE_ARCS = 3;
const DISCHARGE_POINTS = 20;

interface ParticleData {
  positions: Float32Array;
  u: Float32Array;
  v: Float32Array;
  baseR: Float32Array;
  speed: Float32Array;
  offset: Float32Array;
}

function buildParticleData(): ParticleData {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const u = new Float32Array(PARTICLE_COUNT * 3);
  const v = new Float32Array(PARTICLE_COUNT * 3);
  const baseR = new Float32Array(PARTICLE_COUNT);
  const speed = new Float32Array(PARTICLE_COUNT);
  const offset = new Float32Array(PARTICLE_COUNT);

  const axis = new THREE.Vector3();
  const uVec = new THREE.Vector3();
  const vVec = new THREE.Vector3();
  const ref = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    uVec.crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : ref).normalize();
    vVec.crossVectors(axis, uVec).normalize();

    u[i * 3] = uVec.x; u[i * 3 + 1] = uVec.y; u[i * 3 + 2] = uVec.z;
    v[i * 3] = vVec.x; v[i * 3 + 1] = vVec.y; v[i * 3 + 2] = vVec.z;

    baseR[i] = 0.14 + Math.random() * 0.58;
    speed[i] = (0.25 + Math.random() * 0.5) * (Math.random() > 0.5 ? 1 : -1);
    offset[i] = Math.random() * Math.PI * 2;
  }

  return { positions, u, v, baseR, speed, offset };
}

/* ────────────────────────────────────────────────────────────────────────
   Scene — all animation lives here in one useFrame
   ──────────────────────────────────────────────────────────────────────── */

interface SceneProps {
  phase: BroadcastPhase;
  questionIndex: number;
  phaseStartedAt: number;
  phaseDurationMs: number;
}

function CoreScene({ phase, questionIndex, phaseStartedAt, phaseDurationMs }: SceneProps) {
  const phaseRef           = useRef(phase);
  const phaseStartedAtRef  = useRef(phaseStartedAt);
  const phaseDurationMsRef = useRef(phaseDurationMs);
  const questionIndexRef   = useRef(questionIndex);
  phaseRef.current           = phase;
  phaseStartedAtRef.current  = phaseStartedAt;
  phaseDurationMsRef.current = phaseDurationMs;
  questionIndexRef.current   = questionIndex;

  const rootRef      = useRef<THREE.Group>(null);
  const assemblyRef  = useRef<THREE.Group>(null);
  const shellRefs    = useRef<(THREE.Group | null)[]>([]);
  const shellMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const edgeMatRef   = useRef<THREE.LineBasicMaterial>(null);
  const nucleusRef   = useRef<THREE.Mesh>(null);
  const nucleusMatRef= useRef<THREE.MeshBasicMaterial>(null);
  const flareRefs    = useRef<(THREE.Mesh | null)[]>([]);
  const flareMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const lightRef     = useRef<THREE.PointLight>(null);
  const arcRefs      = useRef<(THREE.Group | null)[]>([]);
  const arcMatRefs   = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const pointsRef    = useRef<THREE.Points>(null);
  const pointsMatRef = useRef<THREE.PointsMaterial>(null);

  const particles = useMemo(buildParticleData, []);

  // Gem geometries: one jittered template shared by all shells (parallel
  // facets), independent per-shell face-color randomization.
  const gemGeometries = useMemo(() => {
    const tpl = makeGemTemplate(0x51ab, 0.045);
    return SHELLS.map((s, i) =>
      buildGemGeometry(tpl, 0x1000 + i * 0x333, s.bMin, s.bMax),
    );
  }, []);
  const edgesGeometry = useMemo(
    () => new THREE.EdgesGeometry(gemGeometries[0], 10),
    [gemGeometries],
  );
  const flareTexture = useMemo(makeFlareTexture, []);

  // Pooled discharge arcs: THREE.Line with preallocated buffers
  const dischargeArcs = useMemo(() => {
    return Array.from({ length: DISCHARGE_ARCS }, () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(DISCHARGE_POINTS * 3), 3),
      );
      const mat = new THREE.LineBasicMaterial({
        color: "#d6f2ff",
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      return new THREE.Line(geo, mat);
    });
  }, []);

  useEffect(() => {
    return () => {
      gemGeometries.forEach((g) => g.dispose());
      edgesGeometry.dispose();
      flareTexture.dispose();
      dischargeArcs.forEach((l) => {
        l.geometry.dispose();
        (l.material as THREE.Material).dispose();
      });
    };
  }, [gemGeometries, edgesGeometry, flareTexture, dischargeArcs]);

  const animState = useRef({
    prevPhase: phase,
    burstStartMs: 0,
    spinAngle: 0,
    shellAngles: [0, 0, 0],
    struggle: 0,
    arcActiveUntil: [0, 0, 0],
    arcNextAt: [0, 0, 0],
  });

  const { viewport } = useThree();

  /** Regenerate a discharge arc: a curved magical energy filament from the
   *  crystal surface outward — not a straight lightning zigzag. */
  const regenerateArc = (index: number, intensity: number) => {
    const line = dischargeArcs[index];
    const pos = line.geometry.attributes.position.array as Float32Array;

    const dir1 = new THREE.Vector3(
      Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1,
    ).normalize();
    const start = dir1.clone().multiplyScalar(0.85 + Math.random() * 0.25);
    const outDir = dir1.clone()
      .add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.7))
      .normalize();
    const len = (0.6 + Math.random() * 0.8) * (0.5 + intensity * 0.8);

    // Perpendicular basis for lateral wander
    const p1 = new THREE.Vector3().crossVectors(outDir, dir1).normalize();
    if (p1.lengthSq() < 0.01) p1.set(0, 1, 0);
    const p2 = new THREE.Vector3().crossVectors(outDir, p1).normalize();

    const f1 = 2 + Math.random() * 3, f2 = 3 + Math.random() * 4;
    const ph1 = Math.random() * Math.PI * 2, ph2 = Math.random() * Math.PI * 2;
    const a1 = (Math.random() - 0.5) * 0.5, a2 = (Math.random() - 0.5) * 0.5;

    for (let k = 0; k < DISCHARGE_POINTS; k++) {
      const t = k / (DISCHARGE_POINTS - 1);
      const envelope = Math.sin(t * Math.PI) * 0.22 * len;
      const x = start.x + outDir.x * len * t +
        (p1.x * Math.sin(t * f1 * Math.PI + ph1) * a1 + p2.x * Math.sin(t * f2 * Math.PI + ph2) * a2) * envelope +
        (Math.random() - 0.5) * 0.03;
      const y = start.y + outDir.y * len * t +
        (p1.y * Math.sin(t * f1 * Math.PI + ph1) * a1 + p2.y * Math.sin(t * f2 * Math.PI + ph2) * a2) * envelope +
        (Math.random() - 0.5) * 0.03;
      const z = start.z + outDir.z * len * t +
        (p1.z * Math.sin(t * f1 * Math.PI + ph1) * a1 + p2.z * Math.sin(t * f2 * Math.PI + ph2) * a2) * envelope +
        (Math.random() - 0.5) * 0.03;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
    }
    line.geometry.attributes.position.needsUpdate = true;
  };

  useFrame((_, dt) => {
    const now = performance.now();
    const s = animState.current;
    const cappedDt = Math.min(dt, 0.05);

    const currentPhase = phaseRef.current;
    const startedAt    = phaseStartedAtRef.current;
    const durationMs   = phaseDurationMsRef.current;
    const v            = lerpCycleVisuals(questionIndexRef.current);

    if (currentPhase === "reveal" && s.prevPhase !== "reveal") s.burstStartMs = now;
    s.prevPhase = currentPhase;
    const burstElapsed = s.burstStartMs > 0 ? now - s.burstStartMs : Infinity;

    // ── Pulse (3 s) + overload (5 s) curves ────────────────────────────
    let pulse = 0;
    let overload = 0;
    if (currentPhase === "question" && durationMs > 0) {
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      if (remaining < 3000) pulse = 1 - remaining / 3000;
      if (remaining < 3000) overload = 0.35 + (1 - remaining / 3000) * 0.65;
      else if (remaining < 5000) overload = ((5000 - remaining) / 2000) * 0.35;
    } else if (currentPhase === "reveal") {
      pulse = burstElapsed < 350 ? 1.0 : Math.max(0, 1 - (burstElapsed - 350) / 1400);
    } else if (currentPhase === "explanation" || currentPhase === "transition") {
      const elapsed = Date.now() - startedAt;
      pulse = Math.max(0, 0.38 - elapsed / 5000);
    }

    // ── Struggle: shells fight the overload, then snap back after reveal
    const struggleTarget = currentPhase === "question" ? Math.pow(overload, 1.6) : 0;
    // Slow build during charge; very fast release after reveal = the "snap"
    const smoothing = currentPhase === "question" ? 4 : 14;
    s.struggle += (struggleTarget - s.struggle) * Math.min(1, cappedDt * smoothing);

    // ── Root scale: track the crest's min-dimension sizing ─────────────
    if (rootRef.current) {
      const minDim = Math.min(viewport.width, viewport.height);
      const scale = (minDim * TARGET_FRACTION) / SILHOUETTE;
      rootRef.current.scale.setScalar(scale);
      rootRef.current.position.y = Math.sin(now / 2900) * 0.03 * scale;
    }

    // ── Assembly: tilt wobble + spin around the view axis ──────────────
    const impulse = burstElapsed < 900 ? Math.exp(-burstElapsed / 300) * 3.4 : 0;
    const spinSpeed = 0.10 + v.ringSpeed * 0.05 + pulse * 0.55 + impulse * 0.4;
    s.spinAngle += spinSpeed * cappedDt;
    if (assemblyRef.current) {
      assemblyRef.current.rotation.set(
        0.40 + Math.sin(now / 4700) * 0.06,
        Math.sin(now / 5300) * 0.10,
        s.spinAngle,
      );
      const punch = burstElapsed < 500
        ? 1 + Math.sin((burstElapsed / 500) * Math.PI) * 0.09
        : 1;
      assemblyRef.current.scale.setScalar(punch);
    }

    // ── Shells: counter-rotation + struggle misalignment ───────────────
    const flicker =
      (Math.sin(now / 87) * 0.5 + Math.sin(now / 133) * 0.5) *
      (0.02 + pulse * 0.06 + s.struggle * 0.10);

    SHELLS.forEach((cfg, i) => {
      s.shellAngles[i] += cfg.spin * (1 + pulse * 1.5) * cappedDt;
      const g = shellRefs.current[i];
      if (g) {
        // Layered noise per shell — irregular, never synchronized
        const n1 = Math.sin(now / 143 + i * 2.3) + Math.sin(now / 89 + i * 1.1) * 0.5;
        const n2 = Math.cos(now / 171 + i * 3.1) + Math.sin(now / 113 + i * 0.7) * 0.5;
        g.rotation.z = s.shellAngles[i] + s.struggle * 0.07 * n1;
        g.position.x = s.struggle * 0.05 * n1;
        g.position.y = s.struggle * 0.05 * n2;
      }
      const m = shellMatRefs.current[i];
      if (m) {
        m.emissiveIntensity =
          (0.15 + i * 0.25) + v.crystalBrightness * (0.25 + i * 0.2) +
          pulse * (0.4 + i * 0.35) + flicker * (1 + i);
        m.opacity = SHELLS[i].opacity + pulse * 0.06;
      }
    });

    if (edgeMatRef.current) {
      edgeMatRef.current.opacity = Math.min(
        0.95,
        0.34 + v.crystalBrightness * 0.30 + pulse * 0.40 + flicker,
      );
    }

    // ── Nucleus: compressed magical star ───────────────────────────────
    const breath = Math.sin(now / 2800) * 0.5 + 0.5;
    if (nucleusRef.current && nucleusMatRef.current) {
      const compress = currentPhase === "question" ? 1 - pulse * 0.30 : 1;
      const flash = burstElapsed < 450 ? 1 + (1 - burstElapsed / 450) * 1.5 : 1;
      nucleusRef.current.scale.setScalar((0.88 + breath * 0.20) * compress * flash);

      const heat = 1.1 + v.crystalBrightness * 0.5 + pulse * 1.5 +
        (burstElapsed < 450 ? (1 - burstElapsed / 450) * 2.6 : 0) +
        flicker * (1 + s.struggle * 3);
      nucleusMatRef.current.color.setRGB(heat, heat * 1.02, heat * 1.10);
    }

    // Star flares: cross streaks scale/fade with core heat
    flareRefs.current.forEach((fl, i) => {
      const m = flareMatRefs.current[i];
      if (!fl || !m) return;
      const heat = 0.35 + v.crystalBrightness * 0.25 + pulse * 0.5 +
        (burstElapsed < 500 ? (1 - burstElapsed / 500) * 0.7 : 0);
      m.opacity = Math.min(1, heat * (0.8 + Math.sin(now / 640 + i * 1.7) * 0.2));
      const stretch = 1 + pulse * 0.5 + (burstElapsed < 500 ? (1 - burstElapsed / 500) * 0.8 : 0);
      fl.scale.set(1.15 * stretch, 0.16, 1);
    });

    if (lightRef.current) {
      lightRef.current.intensity = 1.4 + v.crystalBrightness * 1.2 + pulse * 3.2 +
        (burstElapsed < 450 ? (1 - burstElapsed / 450) * 5 : 0);
    }

    // ── Orbit arcs: independent axes, accelerate on charge ─────────────
    ORBIT_ARC_CONFIGS.forEach((cfg, i) => {
      const g = arcRefs.current[i];
      const m = arcMatRefs.current[i];
      const angle = (now / 1000) * cfg.speed * (1 + pulse * 2.2 + impulse * 0.4);
      if (g) g.rotation.set(cfg.axis[0] + angle * 0.15, angle, cfg.axis[2]);
      if (m) {
        const flare = burstElapsed < 600 ? (1 - burstElapsed / 600) * 0.9 : 0;
        const base = 0.14 + v.crystalBrightness * 0.20 + pulse * 0.40 + flare;
        m.opacity = Math.min(0.9, base * (0.7 + Math.sin(now / 1600 + i * 2.1) * 0.3));
      }
    });

    // ── Discharge arcs: unstable energy crackling off the surface ──────
    for (let i = 0; i < DISCHARGE_ARCS; i++) {
      const line = dischargeArcs[i];
      const mat = line.material as THREE.LineBasicMaterial;
      const forceBurst = burstElapsed < 300;

      if (now > s.arcNextAt[i] && (overload > 0.15 || forceBurst)) {
        regenerateArc(i, forceBurst ? 1 : overload);
        s.arcActiveUntil[i] = now + 110 + Math.random() * 140;
        const interval = forceBurst
          ? 80
          : 180 + (1 - overload) * 1100 + Math.random() * 300;
        s.arcNextAt[i] = s.arcActiveUntil[i] + interval;
      }

      if (now < s.arcActiveUntil[i]) {
        const strength = forceBurst ? 1 : 0.35 + overload * 0.65;
        mat.opacity = strength * (0.55 + Math.sin(now / 23 + i * 4) * 0.45);
      } else {
        mat.opacity = 0;
      }
    }

    // ── Particles: drift / spiral inward / burst outward / settle ──────
    if (pointsRef.current) {
      const pos = particles.positions;
      const t = now / 1000;
      const spiral = currentPhase === "question" ? 1 - pulse * 0.55 : 1;
      const burst = burstElapsed < 650 ? Math.sin((burstElapsed / 650) * Math.PI) * 0.85 : 0;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const a = t * particles.speed[i] * (1 + pulse * 1.6) + particles.offset[i];
        const r = particles.baseR[i] * spiral + burst * particles.baseR[i];
        const cos = Math.cos(a) * r;
        const sin = Math.sin(a) * r;
        const i3 = i * 3;
        pos[i3]     = particles.u[i3]     * cos + particles.v[i3]     * sin;
        pos[i3 + 1] = particles.u[i3 + 1] * cos + particles.v[i3 + 1] * sin;
        pos[i3 + 2] = particles.u[i3 + 2] * cos + particles.v[i3 + 2] * sin;
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
    if (pointsMatRef.current) {
      pointsMatRef.current.opacity = Math.min(
        0.95,
        0.30 + v.particleBrightness * 0.45 + pulse * 0.30,
      );
    }
  });

  return (
    <group ref={rootRef}>
      {/* Lighting — cool key upper-right, deep blue fill, inner point glow */}
      <ambientLight intensity={0.30} color="#4a6db8" />
      <directionalLight position={[2.5, 3, 2]} intensity={1.5} color="#bfe0ff" />
      <directionalLight position={[-2, -1.5, -1]} intensity={0.45} color="#2a55cc" />
      <pointLight ref={lightRef} position={[0, 0, 0]} intensity={1.6} color="#66aaff" distance={4} decay={1.6} />

      <group ref={assemblyRef}>
        {/* Nested faceted shells — counter-rotating, misalign under struggle */}
        {SHELLS.map((cfg, i) => (
          <group key={i} ref={(el) => { shellRefs.current[i] = el; }}>
            <mesh geometry={gemGeometries[i]} scale={cfg.scale} renderOrder={i + 1}>
              <meshStandardMaterial
                ref={(el) => { shellMatRefs.current[i] = el; }}
                color={cfg.color}
                emissive={cfg.emissive}
                emissiveIntensity={0.3}
                metalness={0.28}
                roughness={0.20}
                transparent
                opacity={cfg.opacity}
                depthWrite={false}
                flatShading
                vertexColors
              />
            </mesh>
          </group>
        ))}

        {/* Sharp cyan edge highlights on the outer shell */}
        <lineSegments geometry={edgesGeometry} renderOrder={5}>
          <lineBasicMaterial
            ref={edgeMatRef}
            color="#5ec8ff"
            transparent
            opacity={0.4}
            toneMapped={false}
          />
        </lineSegments>

        {/* Nucleus: compressed white-hot star (blooms) */}
        <mesh ref={nucleusRef} renderOrder={6}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshBasicMaterial ref={nucleusMatRef} color="#ffffff" toneMapped={false} />
        </mesh>

        {/* Crossed star flares — camera-facing streaks */}
        {[0, Math.PI / 2].map((rot, i) => (
          <mesh
            key={i}
            ref={(el) => { flareRefs.current[i] = el; }}
            rotation={[0, 0, rot]}
            scale={[1.15, 0.16, 1]}
            renderOrder={7}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              ref={(el) => { flareMatRefs.current[i] = el; }}
              map={flareTexture}
              transparent
              opacity={0.5}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              toneMapped={false}
            />
          </mesh>
        ))}

        {/* Orbit energy arcs: thin glowing rings, different axes */}
        {ORBIT_ARC_CONFIGS.map((cfg, i) => (
          <group key={i} ref={(el) => { arcRefs.current[i] = el; }}>
            <mesh renderOrder={4}>
              <torusGeometry args={[cfg.radius, cfg.tube, 8, 64]} />
              <meshBasicMaterial
                ref={(el) => { arcMatRefs.current[i] = el; }}
                color="#7fd4ff"
                transparent
                opacity={0.2}
                toneMapped={false}
                depthWrite={false}
              />
            </mesh>
          </group>
        ))}

        {/* Pooled discharge arcs — unstable magical energy filaments */}
        {dischargeArcs.map((line, i) => (
          <primitive key={i} object={line} renderOrder={8} />
        ))}

        {/* Internal particles: one Points buffer, one draw call */}
        <points ref={pointsRef} renderOrder={3}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particles.positions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={pointsMatRef}
            color="#aee6ff"
            size={0.032}
            sizeAttenuation
            transparent
            opacity={0.5}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      </group>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Canvas wrapper — default export for React.lazy
   ──────────────────────────────────────────────────────────────────────── */

interface Props extends SceneProps {
  /** Called on WebGL context loss so the parent can swap to the SVG fallback. */
  onFail?: () => void;
}

export default function HextechCore3D({ onFail, ...sceneProps }: Props) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 4], fov: 45 }}
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            onFail?.();
          });
        }}
        style={{ pointerEvents: "none", background: "transparent" }}
      >
        <CoreScene {...sceneProps} />
        <EffectComposer multisampling={0}>
          <Bloom
            mipmapBlur
            intensity={0.9}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.25}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
