/**
 * VIS-F3/F4 — objective spectacles. The encounter banner is a place on the
 * map with a tension build and an outcome treatment.
 *
 *   Baron  — the hero scene (`baron.tsx`): the pit on the Rift, both teams at
 *            the edge, the worm rising; escalates with every question and
 *            plays four distinct outcome cinematics. The only encounter under
 *            the E1 3Q contract.
 *   Dragon — tempo: ember pit, a drake beating its wings, speed chevrons
 *            racing across the pit. PROTOTYPE-ONLY (E1's Dragon is skill-free
 *            and post-stage).
 *   Elder  — the last confrontation: moonlit ice, a crowned silhouette twice
 *            the size, both teams lined up. PROTOTYPE-ONLY (no Elder in the
 *            backend catalog).
 *
 * `intensity` 0..3 (stakes, then one per question) drives the escalation;
 * `tone` paints the outcome; `crowd` feeds the broadcast crowd meter. The pit
 * shrinks while questions are open so the options fit a 360 px phone.
 */
import type { CSSProperties, ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { BaronPit } from "./baron";
import { CrowdMeter } from "./broadcast";
import type { ObjectiveKind, ObjectiveOutcome } from "./objectives";

export const PIT_LIGHT: Record<ObjectiveKind, string> = { dragon: "22 90% 56%", baron: "262 70% 64%", elder: "190 85% 62%" };
export const PIT_PLACE: Record<ObjectiveKind, string> = { dragon: "Summoner's Rift · Dragon pit", baron: "Summoner's Rift · Baron pit", elder: "Summoner's Rift · Dragon pit, Elder" };

type Phase = "stakes" | "ask" | "outcome";

function Squad({ x, y, accent, fallen = 0, mirror = false }: { x: number; y: number; accent: string; fallen?: number; mirror?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) ${mirror ? "scale(-1 1)" : ""}`}>
      {[0, 1, 2, 3, 4].map((i) => <g key={i} transform={`translate(${i * 26} ${(i % 2) * 6}) ${i < fallen ? "rotate(80 10 30)" : ""}`} opacity={i < fallen ? 0.55 : 1}><circle cx="10" cy="8" r="6" fill="#05090f" /><path d="M2 16 L18 16 L20 40 L0 40 Z" fill="#05090f" /><path d="M3 18 L17 18 L18 28 L2 28 Z" fill={accent} fillOpacity="0.85" /></g>)}
    </g>
  );
}

function DragonPit({ intensity, tone, accent }: { intensity: number; tone: ObjectiveOutcome["tone"] | null; accent: string }) {
  const t = intensity;
  const eye = tone === "bad" ? "#ff5d6c" : "#ffd27a";
  const gone = tone === "great" || tone === "good";
  return (
    <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden style={{ "--tense": t } as CSSProperties} data-tone={tone ?? "none"}>
      <defs>
        <linearGradient id="dp4-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a0508" /><stop offset="1" stopColor="#3a1206" /></linearGradient>
        <radialGradient id="dp4-glow" cx="50%" cy="100%" r="60%"><stop offset="0" stopColor="#ff9a5c" stopOpacity={0.6 + t * 0.1} /><stop offset="0.5" stopColor="#ff6a2c" stopOpacity="0.18" /><stop offset="1" stopColor="#ff6a2c" stopOpacity="0" /></radialGradient>
        <linearGradient id="dp4-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a1c0e" /><stop offset="1" stopColor="#1a0905" /></linearGradient>
      </defs>
      <rect width="1000" height="500" fill="url(#dp4-sky)" />
      {Array.from({ length: 26 }, (_, i) => <circle key={i} cx={(i * 193) % 1000} cy={(i * 71) % 150} r="1.2" fill="#fff" opacity={0.2 + ((i * 17) % 40) / 100} />)}
      <path d="M0 260 C90 210 170 230 250 200 C310 180 350 210 410 190 L410 500 L0 500 Z" fill="#120507" />
      <path d="M1000 250 C910 210 850 230 770 200 C710 180 670 210 590 190 L590 500 L1000 500 Z" fill="#120507" />
      <g className="dyn-tempo" opacity={0.25 + t * 0.15}>{Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${80 + i * 120} 300 l30 20 l-30 20 l10 0 l30 -20 l-30 -20 Z`} fill="#ffb27a" />)}</g>
      <ellipse cx="500" cy="400" rx="340" ry="70" fill="#1a0905" /><ellipse cx="500" cy="400" rx="340" ry="70" fill="url(#dp4-glow)" />
      <path d="M160 400 C300 360 700 360 840 400" fill="none" stroke="#ff6a2c" strokeOpacity="0.5" strokeWidth="3" />
      <g className={gone ? "dyn-out-fall" : tone === "bad" ? "dyn-out-roar" : t === 0 ? "dyn-baron-rise" : "dyn-baron-loom"}>
        <g className="dyn-wing" style={{ transformOrigin: "500px 300px" } as CSSProperties}>
          <path d="M500 300 C410 250 320 170 210 160 C290 230 320 290 290 330 C370 318 430 322 500 360 Z" fill="url(#dp4-body)" /><path d="M500 300 C410 250 320 170 210 160" fill="none" stroke="#ff9a5c" strokeOpacity="0.6" strokeWidth="2" />
          <path d="M500 300 C590 250 680 170 790 160 C710 230 680 290 710 330 C630 318 570 322 500 360 Z" fill="url(#dp4-body)" /><path d="M500 300 C590 250 680 170 790 160" fill="none" stroke="#ff9a5c" strokeOpacity="0.6" strokeWidth="2" />
        </g>
        <path d="M466 410 C466 330 478 270 500 215 C522 270 534 330 534 410 Z" fill="url(#dp4-body)" />
        <path d="M466 225 C470 170 530 170 534 225 C536 258 522 276 500 276 C478 276 464 258 466 225 Z" fill="#2a0d05" stroke="#ff9a5c" strokeOpacity="0.5" strokeWidth="2" />
        <path d="M476 190 L440 130 L494 182 Z M524 190 L560 130 L506 182 Z" fill="#2a0d05" />
        <g className="dyn-baron-eye"><ellipse cx="486" cy="226" rx={8 + t} ry="4" fill={eye} /><ellipse cx="514" cy="226" rx={8 + t} ry="4" fill={eye} /><circle cx="486" cy="226" r={16 + t * 3} fill={eye} opacity="0.25" /><circle cx="514" cy="226" r={16 + t * 3} fill={eye} opacity="0.25" /></g>
        <path d="M486 258 L500 274 L514 258" fill="none" stroke="#ff9a5c" strokeOpacity="0.8" strokeWidth="2" />
      </g>
      {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={260 + i * 44} cy={420 - (i % 3) * 16} r="2.6" fill="#ffb27a" className="dyn-ember" style={{ "--i": i } as CSSProperties} opacity="0" />)}
      {tone === "great" ? <circle cx="500" cy="280" r="150" fill="#ffd27a" className="dyn-out-burst" opacity="0.5" /> : null}
      {tone === "bad" ? <rect width="1000" height="500" fill="#ff3b4e" opacity="0.14" /> : null}
      <Squad x={60} y={440} accent={accent} fallen={tone === "bad" ? 3 : tone === "mixed" ? 1 : 0} />
      <g fill="#05040f"><ellipse cx="40" cy="500" rx="110" ry="40" /><ellipse cx="960" cy="500" rx="110" ry="40" /></g>
    </svg>
  );
}

function ElderPit({ intensity, tone, accent }: { intensity: number; tone: ObjectiveOutcome["tone"] | null; accent: string }) {
  const t = intensity;
  const eye = tone === "bad" ? "#ff5d6c" : "#eafcff";
  const gone = tone === "great" || tone === "good";
  return (
    <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden style={{ "--tense": t } as CSSProperties} data-tone={tone ?? "none"}>
      <defs>
        <linearGradient id="el4-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#020710" /><stop offset="1" stopColor="#062030" /></linearGradient>
        <radialGradient id="el4-glow" cx="50%" cy="100%" r="60%"><stop offset="0" stopColor="#7ee6ff" stopOpacity={0.55 + t * 0.1} /><stop offset="0.5" stopColor="#5cc8ea" stopOpacity="0.15" /><stop offset="1" stopColor="#5cc8ea" stopOpacity="0" /></radialGradient>
        <radialGradient id="el4-moon" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#eafcff" /><stop offset="0.6" stopColor="#bfefff" stopOpacity="0.9" /><stop offset="1" stopColor="#bfefff" stopOpacity="0" /></radialGradient>
        <linearGradient id="el4-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b4a5e" /><stop offset="1" stopColor="#06202b" /></linearGradient>
      </defs>
      <rect width="1000" height="500" fill="url(#el4-sky)" />
      <path d="M0 120 C200 40 400 160 600 70 C750 10 900 90 1000 50 L1000 140 C900 180 750 100 600 160 C400 250 200 130 0 210 Z" fill="#5cc8ea" fillOpacity={0.08 + t * 0.02} />
      <circle cx="500" cy="120" r="90" fill="url(#el4-moon)" opacity="0.9" />
      {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={(i * 173) % 1000} cy={(i * 59) % 180} r="1.4" fill="#fff" opacity={0.3 + ((i * 17) % 40) / 100} />)}
      <path d="M0 260 C90 210 170 230 250 200 C310 180 350 210 410 190 L410 500 L0 500 Z" fill="#031018" />
      <path d="M1000 250 C910 210 850 230 770 200 C710 180 670 210 590 190 L590 500 L1000 500 Z" fill="#031018" />
      {[140, 860].map((x) => <path key={x} d={`M${x - 40} 330 L${x} 200 L${x + 40} 330 Z M${x - 70} 340 L${x - 40} 250 L${x - 10} 340 Z`} fill="#0a2f3d" stroke="#7ee6ff" strokeOpacity="0.4" />)}
      <ellipse cx="500" cy="400" rx="340" ry="70" fill="#06202b" /><ellipse cx="500" cy="400" rx="340" ry="70" fill="url(#el4-glow)" />
      <g className={gone ? "dyn-out-fall" : tone === "bad" ? "dyn-out-roar" : t === 0 ? "dyn-baron-rise" : "dyn-baron-loom"}>
        <path d="M500 250 C380 190 260 100 110 90 C230 180 270 260 230 310 C340 300 420 300 500 350 Z" fill="url(#el4-body)" /><path d="M500 250 C380 190 260 100 110 90" fill="none" stroke="#7ee6ff" strokeOpacity="0.6" strokeWidth="2" />
        <path d="M500 250 C620 190 740 100 890 90 C770 180 730 260 770 310 C660 300 580 300 500 350 Z" fill="url(#el4-body)" /><path d="M500 250 C620 190 740 100 890 90" fill="none" stroke="#7ee6ff" strokeOpacity="0.6" strokeWidth="2" />
        <path d="M456 410 C456 320 470 240 500 160 C530 240 544 320 544 410 Z" fill="url(#el4-body)" />
        <path d="M454 180 C460 110 540 110 546 180 C550 224 530 246 500 246 C470 246 450 224 454 180 Z" fill="#0a2634" stroke="#7ee6ff" strokeOpacity="0.55" strokeWidth="2" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M${462 + i * 12} 136 L${452 + i * 16} ${50 - Math.abs(i - 3) * 16} L${476 + i * 12} 134 Z`} fill="#0a2634" stroke="#7ee6ff" strokeOpacity="0.5" />)}
        <g className="dyn-baron-eye"><ellipse cx="484" cy="188" rx={9 + t} ry="5" fill={eye} /><ellipse cx="516" cy="188" rx={9 + t} ry="5" fill={eye} /><circle cx="484" cy="188" r={18 + t * 3} fill={eye} opacity="0.25" /><circle cx="516" cy="188" r={18 + t * 3} fill={eye} opacity="0.25" /></g>
      </g>
      {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={200 + i * 46} cy={360 - (i % 4) * 30} r="2" fill="#dffcff" className="dyn-frost" style={{ "--i": i } as CSSProperties} />)}
      {tone === "great" ? <circle cx="500" cy="260" r="160" fill="#dffcff" className="dyn-out-burst" opacity="0.5" /> : null}
      {tone === "bad" ? <rect width="1000" height="500" fill="#ff3b4e" opacity="0.14" /> : null}
      <Squad x={60} y={440} accent={accent} fallen={tone === "bad" ? 5 : tone === "mixed" ? 2 : 0} />
      <Squad x={940} y={440} accent="#9fb0c8" fallen={gone ? 5 : 0} mirror />
      <g fill="#05040f"><ellipse cx="40" cy="500" rx="110" ry="40" /><ellipse cx="960" cy="500" rx="110" ry="40" /></g>
    </svg>
  );
}

export function ObjectiveSpectacle({ kind, phase, tone = null, intensity, crowd, accent = "#e3c66f", children, className }: {
  kind: ObjectiveKind; phase: Phase; tone?: ObjectiveOutcome["tone"] | null; intensity?: number; crowd?: number; accent?: string; children?: ReactNode; className?: string;
}) {
  const motion = useMotionAllowed();
  const t = intensity ?? (phase === "stakes" ? 0 : phase === "ask" ? 1 : 3);
  const level = crowd ?? (phase === "outcome" ? (tone === "great" ? 1 : tone === "bad" ? 0.9 : 0.6) : 0.4 + t * 0.15);
  return (
    <div data-testid="objective-pit" data-spectacle={kind} data-phase={phase} data-intensity={t}
      className={cn("dyn-spect -mx-4 -mt-4 mb-0.5", motion && "dyn-spect--motion", phase === "ask" ? "h-[96px] sm:h-[140px]" : phase === "outcome" ? "h-[150px] sm:h-[230px]" : "h-[132px] sm:h-[290px]", className)}
      style={{ "--dyn-light": PIT_LIGHT[kind], "--tense": t, transition: motion ? "height 500ms var(--dyn-ease)" : undefined } as CSSProperties}>
      {kind === "baron" ? <BaronPit intensity={t} tone={tone} accent={accent} /> : kind === "dragon" ? <DragonPit intensity={t} tone={tone} accent={accent} /> : <ElderPit intensity={t} tone={tone} accent={accent} />}
      {tone ? <span aria-hidden className={cn("absolute inset-0", `dyn-spect-wash--${tone}`)} /> : null}
      {tone ? <span aria-hidden key={tone} className="dyn-spect-flash absolute inset-0 bg-white/60 opacity-0" /> : null}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-2.5">
        <span className="rounded-full border border-white/15 bg-[#07111f]/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70">{PIT_PLACE[kind]}</span>
        <CrowdMeter level={level} label="Crowd" className="hidden rounded-full bg-[#07111f]/60 px-2 py-0.5 sm:flex" />
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(7,17,31,0),rgba(7,17,31,0.85)_55%,rgba(7,17,31,0.96))] px-4 pb-2.5 pt-8">
        {children}
        {phase !== "outcome" ? <div className="dyn-tense-ring mt-2" aria-hidden data-testid="tension-ring"><span style={{ transform: `scaleX(${0.12 + t * 0.29})` }} /></div> : null}
      </div>
    </div>
  );
}
