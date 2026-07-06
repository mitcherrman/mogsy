/**
 * HextechCore3D — React Three Fiber 3D Hextech crystal core.
 *
 * Replaces the central SVG crystal of BroadcastKnowledgeCore with a
 * physically-deep faceted 3D crystal. The gold crest, rings, auras, burst
 * shockwave, and outer particles remain SVG/DOM around this canvas.
 *
 * Scene structure:
 *   Root group (scaled to match the SVG crest's min-dimension sizing)
 *   └── Spin group (slow idle Y rotation, charge acceleration, reveal impulse)
 *       └── Tilt group (corner-up isometric orientation)
 *           ├── Outer crystal: beveled cube, flat-shaded, dark transparent blue
 *           ├── Edge highlights: cyan line segments on the cube edges
 *           ├── Inner cube: emissive blue, second depth shell
 *           └── (tilt-independent, inside spin group:)
 *   ├── Core sphere: white-hot, breathing/flickering, toneMapped off → blooms
 *   ├── Core point light: illuminates the crystal interior from within
 *   ├── Energy arcs: 3 thin torus rings on different axes
 *   └── Particles: single THREE.Points buffer (80), spiral/burst/settle
 *
 * Performance:
 *   - dpr capped at 1.5, no shadows, no transmission/refraction
 *   - one Points draw call for all particles
 *   - Bloom with mipmapBlur, multisampling 0, threshold 0.55 so only the
 *     core/edges/arcs bloom — facet contrast is preserved
 *   - all animation in useFrame via refs; zero React re-renders per frame
 *
 * 24/7 safety:
 *   - webglcontextlost → onFail() so the parent swaps to the SVG fallback
 */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { BroadcastPhase } from "@/lib/quiz-broadcast/types";
import { lerpCycleVisuals } from "./KnowledgeCoreConfig";

/* ────────────────────────────────────────────────────────────────────────
   Constants
   ──────────────────────────────────────────────────────────────────────── */

// Corner-up isometric tilt: 45° yaw then atan(1/√2) pitch.
const TILT_X = Math.atan(Math.SQRT1_2);
const TILT_Y = Math.PI / 4;

const CUBE_SIZE = 1.6;
// Corner-up silhouette height = edge · √3. The SVG crystal spanned 45% of
// the crest's min dimension; ROOT_SCALE maps world units to match.
const SILHOUETTE = CUBE_SIZE * Math.sqrt(3);
const TARGET_FRACTION = 0.46;

const PARTICLE_COUNT = 80;

const ARC_CONFIGS = [
  { radius: 0.62, tube: 0.012, axis: [1, 0.3, 0.2] as const,  speed: 0.7  },
  { radius: 0.78, tube: 0.010, axis: [0.2, 1, -0.4] as const, speed: -0.5 },
  { radius: 0.94, tube: 0.008, axis: [-0.5, 0.4, 1] as const, speed: 0.35 },
];

/* ────────────────────────────────────────────────────────────────────────
   Particle orbit data — precomputed once per mount
   ──────────────────────────────────────────────────────────────────────── */

interface ParticleData {
  positions: Float32Array;
  // Orthonormal basis (u, v) per particle defining its orbit plane
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
    // Random orbit plane: random axis → orthonormal basis in that plane
    axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize();
    uVec.crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : ref).normalize();
    vVec.crossVectors(axis, uVec).normalize();

    u[i * 3] = uVec.x; u[i * 3 + 1] = uVec.y; u[i * 3 + 2] = uVec.z;
    v[i * 3] = vVec.x; v[i * 3 + 1] = vVec.y; v[i * 3 + 2] = vVec.z;

    baseR[i] = 0.18 + Math.random() * 0.55;          // inside the crystal volume
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
  // Props → refs so useFrame always reads latest values without re-renders
  const phaseRef           = useRef(phase);
  const phaseStartedAtRef  = useRef(phaseStartedAt);
  const phaseDurationMsRef = useRef(phaseDurationMs);
  const questionIndexRef   = useRef(questionIndex);
  phaseRef.current           = phase;
  phaseStartedAtRef.current  = phaseStartedAt;
  phaseDurationMsRef.current = phaseDurationMs;
  questionIndexRef.current   = questionIndex;

  const rootRef      = useRef<THREE.Group>(null);
  const spinRef      = useRef<THREE.Group>(null);
  const outerMatRef  = useRef<THREE.MeshStandardMaterial>(null);
  const edgeMatRef   = useRef<THREE.LineBasicMaterial>(null);
  const innerMatRef  = useRef<THREE.MeshStandardMaterial>(null);
  const coreRef      = useRef<THREE.Mesh>(null);
  const coreMatRef   = useRef<THREE.MeshBasicMaterial>(null);
  const lightRef     = useRef<THREE.PointLight>(null);
  const arcRefs      = useRef<(THREE.Group | null)[]>([]);
  const arcMatRefs   = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const pointsRef    = useRef<THREE.Points>(null);
  const pointsMatRef = useRef<THREE.PointsMaterial>(null);

  const particles = useMemo(buildParticleData, []);

  const edgesGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)),
    [],
  );
  useEffect(() => () => edgesGeometry.dispose(), [edgesGeometry]);

  // Mutable animation state kept out of React
  const animState = useRef({
    prevPhase: phase,
    burstStartMs: 0,
    spinAngle: 0,
    arcAngles: [0, 2.1, 4.2],
  });

  const { viewport } = useThree();

  useFrame((state, dt) => {
    const now = performance.now();
    const s = animState.current;
    const cappedDt = Math.min(dt, 0.05);

    const currentPhase   = phaseRef.current;
    const startedAt      = phaseStartedAtRef.current;
    const durationMs     = phaseDurationMsRef.current;
    const v              = lerpCycleVisuals(questionIndexRef.current);

    // Detect reveal → trigger burst
    if (currentPhase === "reveal" && s.prevPhase !== "reveal") s.burstStartMs = now;
    s.prevPhase = currentPhase;
    const burstElapsed = s.burstStartMs > 0 ? now - s.burstStartMs : Infinity;

    // ── Countdown pulse: identical curve to the 2D core ────────────────
    let pulse = 0;
    if (currentPhase === "question" && durationMs > 0) {
      const remaining = Math.max(0, durationMs - (Date.now() - startedAt));
      if (remaining < 3000) pulse = 1 - remaining / 3000;
    } else if (currentPhase === "reveal") {
      pulse = burstElapsed < 350 ? 1.0 : Math.max(0, 1 - (burstElapsed - 350) / 1400);
    } else if (currentPhase === "explanation" || currentPhase === "transition") {
      const elapsed = Date.now() - startedAt;
      pulse = Math.max(0, 0.38 - elapsed / 5000);
    }

    // ── Root scale: track the crest's min-dimension sizing ─────────────
    if (rootRef.current) {
      const minDim = Math.min(viewport.width, viewport.height);
      const scale = (minDim * TARGET_FRACTION) / SILHOUETTE;
      rootRef.current.scale.setScalar(scale);
      // Gentle float
      rootRef.current.position.y = Math.sin(now / 2900) * 0.035 * scale;
    }

    // ── Spin: idle rotation, charge acceleration, reveal impulse ───────
    const impulse = burstElapsed < 900 ? Math.exp(-burstElapsed / 300) * 4.2 : 0;
    const spinSpeed = 0.22 + v.ringSpeed * 0.10 + pulse * 0.9 + impulse;
    s.spinAngle += spinSpeed * cappedDt;
    if (spinRef.current) {
      spinRef.current.rotation.y = s.spinAngle;
      // Subtle wobble so the rotation never reads as mechanical
      spinRef.current.rotation.x = Math.sin(now / 4700) * 0.07;
      spinRef.current.rotation.z = Math.sin(now / 6100) * 0.05;
      // Reveal punch: quick scale pop that settles
      const punch = burstElapsed < 500
        ? 1 + Math.sin((burstElapsed / 500) * Math.PI) * 0.10
        : 1;
      spinRef.current.scale.setScalar(punch);
    }

    // ── Materials: brightness follows charge ───────────────────────────
    const flicker =
      (Math.sin(now / 87) * 0.5 + Math.sin(now / 133) * 0.5) *
      (0.02 + pulse * 0.07);
    const breath = Math.sin(now / 2800) * 0.5 + 0.5; // 0..1

    if (outerMatRef.current) {
      outerMatRef.current.opacity = 0.88;
      outerMatRef.current.emissiveIntensity = 0.12 + v.crystalBrightness * 0.22 + pulse * 0.35;
    }
    if (edgeMatRef.current) {
      edgeMatRef.current.opacity = Math.min(0.9, 0.30 + v.crystalBrightness * 0.30 + pulse * 0.45 + flicker);
    }
    if (innerMatRef.current) {
      innerMatRef.current.emissiveIntensity =
        0.5 + v.crystalBrightness * 0.7 + pulse * 1.4 + flicker * 2;
      innerMatRef.current.opacity = 0.42 + pulse * 0.18;
    }

    // ── Core: breathing idle, compression on charge, flash on reveal ───
    if (coreRef.current && coreMatRef.current) {
      // Countdown compresses the core (smaller but hotter)
      const compress = currentPhase === "question" ? 1 - pulse * 0.28 : 1;
      const flash = burstElapsed < 450 ? 1 + (1 - burstElapsed / 450) * 1.15 : 1;
      const coreScale = (0.9 + breath * 0.18) * compress * flash;
      coreRef.current.scale.setScalar(coreScale);

      // Brightness: >1 RGB with toneMapped off drives bloom intensity
      const heat = 1.0 + v.crystalBrightness * 0.5 + pulse * 1.3 +
        (burstElapsed < 450 ? (1 - burstElapsed / 450) * 2.2 : 0) + flicker;
      coreMatRef.current.color.setRGB(heat, heat * 1.02, heat * 1.10);
    }

    if (lightRef.current) {
      lightRef.current.intensity = 1.4 + v.crystalBrightness * 1.2 + pulse * 3.2 +
        (burstElapsed < 450 ? (1 - burstElapsed / 450) * 5 : 0);
    }

    // ── Energy arcs: independent axes, accelerate on charge ────────────
    ARC_CONFIGS.forEach((cfg, i) => {
      const g = arcRefs.current[i];
      const m = arcMatRefs.current[i];
      s.arcAngles[i] += cfg.speed * (1 + pulse * 2.2 + impulse * 0.4) * cappedDt;
      if (g) g.rotation.set(cfg.axis[0] + s.arcAngles[i] * 0.15, s.arcAngles[i], cfg.axis[2]);
      if (m) {
        const flare = burstElapsed < 600 ? (1 - burstElapsed / 600) * 0.9 : 0;
        const base = 0.16 + v.crystalBrightness * 0.22 + pulse * 0.40 + flare;
        m.opacity = Math.min(0.95, base * (0.7 + Math.sin(now / 1600 + i * 2.1) * 0.3));
      }
    });

    // ── Particles: drift / spiral inward / burst outward / settle ──────
    if (pointsRef.current) {
      const pos = particles.positions;
      const t = now / 1000;

      // Radius modulation shared logic
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
      {/* Lighting — cool key from upper-right, deep blue fill, inner glow */}
      <ambientLight intensity={0.30} color="#4a6db8" />
      <directionalLight position={[2.5, 3, 2]} intensity={1.5} color="#bfe0ff" />
      <directionalLight position={[-2, -1.5, -1]} intensity={0.45} color="#2a55cc" />
      <pointLight ref={lightRef} position={[0, 0, 0]} intensity={1.6} color="#66aaff" distance={4} decay={1.6} />

      <group ref={spinRef}>
        {/* Corner-up tilted crystal shells */}
        <group rotation={[TILT_X, TILT_Y, 0]}>
          {/* Outer crystal: beveled cube, flat-shaded dark sapphire glass */}
          <RoundedBox args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} radius={0.16} smoothness={2}>
            <meshStandardMaterial
              ref={outerMatRef}
              color="#0a2a66"
              emissive="#123a8c"
              emissiveIntensity={0.15}
              metalness={0.25}
              roughness={0.22}
              transparent
              opacity={0.88}
              flatShading
            />
          </RoundedBox>

          {/* Cyan edge highlights on the cube frame */}
          <lineSegments geometry={edgesGeometry}>
            <lineBasicMaterial
              ref={edgeMatRef}
              color="#5ec8ff"
              transparent
              opacity={0.4}
              toneMapped={false}
            />
          </lineSegments>

          {/* Inner cube: emissive second depth shell */}
          <mesh scale={0.60}>
            <boxGeometry args={[CUBE_SIZE, CUBE_SIZE, CUBE_SIZE]} />
            <meshStandardMaterial
              ref={innerMatRef}
              color="#0d3888"
              emissive="#2a70ff"
              emissiveIntensity={0.7}
              transparent
              opacity={0.45}
              depthWrite={false}
              flatShading
            />
          </mesh>
        </group>

        {/* Core sphere: white-hot energy source (blooms) */}
        <mesh ref={coreRef}>
          <sphereGeometry args={[0.22, 24, 24]} />
          <meshBasicMaterial ref={coreMatRef} color="#ffffff" toneMapped={false} />
        </mesh>

        {/* Energy arcs: thin glowing orbit rings, different axes */}
        {ARC_CONFIGS.map((cfg, i) => (
          <group key={i} ref={(el) => { arcRefs.current[i] = el; }}>
            <mesh>
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

        {/* Internal particles: one Points buffer, one draw call */}
        <points ref={pointsRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particles.positions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            ref={pointsMatRef}
            color="#aee6ff"
            size={0.035}
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
