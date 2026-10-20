/**
 * VIS-F3 — objective spectacles. The encounter banner becomes a pit: a layered,
 * original (code-drawn) composition of the place on the map where the call
 * happens, with a tension build before the stakes and an outcome treatment.
 *
 *   Baron   — the pit at the top of the river on Summoner's Rift: jungle walls,
 *             the river glint, violet mist, and the worm rising with lit eyes.
 *             The only encounter under the E1 3Q contract.
 *   Dragon  — the lower pit, ember light from below, a drake unfolding.
 *             PROTOTYPE-ONLY (E1's Dragon is skill-free and post-stage).
 *   Elder   — the same pit in ice light, a crowned silhouette, frost in the air.
 *             PROTOTYPE-ONLY (no Elder in the backend catalog).
 *
 * No Riot artwork is used; every shape is drawn here. Motion is slow mist,
 * a blink, rising embers / frost, and one rise-in; reduced motion freezes it.
 * The `phase` shrinks the pit while questions are open so the options fit a
 * 360 px phone, and `tone` paints the outcome.
 */
import type { CSSProperties, ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import type { ObjectiveKind, ObjectiveOutcome } from "./objectives";

export const PIT_LIGHT: Record<ObjectiveKind, string> = { dragon: "22 90% 56%", baron: "262 70% 64%", elder: "190 85% 62%" };
export const PIT_PLACE: Record<ObjectiveKind, string> = { dragon: "Summoner's Rift · Dragon pit", baron: "Summoner's Rift · Baron pit", elder: "Summoner's Rift · Dragon pit, Elder" };

type Phase = "stakes" | "ask" | "outcome";

function BaronPit({ phase, tone }: { phase: Phase; tone: ObjectiveOutcome["tone"] | null }) {
  const eye = tone === "bad" ? "#ff5d6c" : tone === "great" ? "#f6dd8f" : "#c9a7ff";
  const fallen = tone === "great" || tone === "good";
  return (
    <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="bp-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a0a1e" /><stop offset="1" stopColor="#1a1030" /></linearGradient>
        <radialGradient id="bp-glow" cx="50%" cy="80%" r="55%"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0.55" /><stop offset="0.5" stopColor="#6d3fd1" stopOpacity="0.18" /><stop offset="1" stopColor="#6d3fd1" stopOpacity="0" /></radialGradient>
        <radialGradient id="bp-eye" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={eye} stopOpacity="1" /><stop offset="0.3" stopColor={eye} stopOpacity="0.7" /><stop offset="1" stopColor={eye} stopOpacity="0" /></radialGradient>
        <linearGradient id="bp-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4a3a7a" /><stop offset="0.5" stopColor="#2a1d4d" /><stop offset="1" stopColor="#120c28" /></linearGradient>
        <linearGradient id="bp-river" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5cc8ea" stopOpacity="0" /><stop offset="0.5" stopColor="#5cc8ea" stopOpacity="0.55" /><stop offset="1" stopColor="#5cc8ea" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="1000" height="400" fill="url(#bp-sky)" />
      {Array.from({ length: 26 }, (_, i) => <circle key={i} cx={(i * 193) % 1000} cy={(i * 71) % 150} r={i % 3 ? 1 : 1.6} fill="#fff" opacity={0.2 + ((i * 17) % 40) / 100} />)}
      {/* far jungle wall */}
      <path d="M0 220 C80 170 160 190 240 160 C300 140 340 170 400 150 L400 400 L0 400 Z" fill="#0b0920" />
      <path d="M1000 210 C920 170 860 190 780 160 C720 140 680 170 600 150 L600 400 L1000 400 Z" fill="#0b0920" />
      {/* brush and trees as silhouettes */}
      {[40, 120, 200, 300, 700, 800, 880, 960].map((x, i) => <g key={x} fill="#07061a"><ellipse cx={x} cy={200 + (i % 3) * 10} rx={34 + (i % 2) * 10} ry={26} /><ellipse cx={x + 24} cy={214} rx={26} ry={20} /></g>)}
      {[150, 850].map((x) => <g key={x} fill="#06051a"><rect x={x - 5} y="90" width="10" height="120" /><path d={`M${x - 46} 130 L${x} 60 L${x + 46} 130 Z`} /><path d={`M${x - 56} 170 L${x} 95 L${x + 56} 170 Z`} /></g>)}
      {/* the pit: rim and floor */}
      <ellipse cx="500" cy="330" rx="330" ry="80" fill="#120c28" />
      <ellipse cx="500" cy="330" rx="330" ry="80" fill="url(#bp-glow)" />
      <ellipse cx="500" cy="335" rx="300" ry="60" fill="none" stroke="#a78bfa" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="8 10" />
      <ellipse cx="500" cy="340" rx="180" ry="34" fill="none" stroke="#c4b5fd" strokeOpacity="0.35" />
      {/* river glint at the pit mouth */}
      <path d="M0 395 C200 370 400 385 1000 372" stroke="url(#bp-river)" strokeWidth="3" fill="none" />
      {/* Baron: the worm rising, original silhouette */}
      <g className={cn("dyn-rise", fallen && "opacity-40")} style={{ transform: fallen ? "translateY(40px)" : undefined, transition: "transform 900ms ease, opacity 900ms ease" }}>
        {/* body coils */}
        <path d="M260 330 C280 250 360 250 380 300 C395 340 440 340 450 290" fill="none" stroke="url(#bp-body)" strokeWidth="46" strokeLinecap="round" />
        <path d="M740 330 C720 250 640 250 620 300 C605 340 560 340 550 290" fill="none" stroke="url(#bp-body)" strokeWidth="46" strokeLinecap="round" />
        {/* neck + head */}
        <path d="M430 340 C440 230 460 150 500 110 C540 150 560 230 570 340 Z" fill="url(#bp-body)" />
        <path d="M455 150 C470 100 530 100 545 150 C560 190 555 230 500 236 C445 230 440 190 455 150 Z" fill="#2e2152" stroke="#c4b5fd" strokeOpacity="0.45" strokeWidth="2.5" />
        {/* crest horns, three a side */}
        {[0, 1, 2].map((i) => <g key={i}><path d={`M${478 - i * 12} ${150 - i * 4} L${430 - i * 28} ${70 - i * 18} L${468 - i * 8} ${140 - i * 2} Z`} fill="#3b2b66" stroke="#c4b5fd" strokeOpacity="0.35" /><path d={`M${522 + i * 12} ${150 - i * 4} L${570 + i * 28} ${70 - i * 18} L${532 + i * 8} ${140 - i * 2} Z`} fill="#3b2b66" stroke="#c4b5fd" strokeOpacity="0.35" /></g>)}
        {/* mandibles */}
        <path d="M470 220 L455 262 L482 236 Z" fill="#3b2b66" /><path d="M530 220 L545 262 L518 236 Z" fill="#3b2b66" />
        {/* eyes: two lit slits with halos */}
        <g className="dyn-eye">
          <circle cx="480" cy="178" r={phase === "ask" ? 26 : 20} fill="url(#bp-eye)" /><circle cx="520" cy="178" r={phase === "ask" ? 26 : 20} fill="url(#bp-eye)" />
          <path d="M466 178 Q480 170 494 178 Q480 186 466 178 Z" fill={eye} /><path d="M506 178 Q520 170 534 178 Q520 186 506 178 Z" fill={eye} />
          <circle cx="500" cy="200" r="6" fill={eye} fillOpacity="0.8" />
        </g>
        {/* spine ridges */}
        {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${500 - 8} ${250 + i * 18} L500 ${236 + i * 18} L${500 + 8} ${250 + i * 18} Z`} fill="#5a4790" />)}
      </g>
      {/* rune circles on the pit floor */}
      <ellipse cx="500" cy="352" rx="90" ry="16" fill="none" stroke="#c4b5fd" strokeOpacity="0.5" strokeWidth="1.5" />
      {[-70, -35, 0, 35, 70].map((dx) => <rect key={dx} x={500 + dx - 3} y="348" width="6" height="8" fill="#c4b5fd" fillOpacity="0.6" />)}
    </svg>
  );
}

function DragonPit({ elder, phase, tone }: { elder: boolean; phase: Phase; tone: ObjectiveOutcome["tone"] | null }) {
  const light = elder ? "#7ee6ff" : "#ff9a5c";
  const deep = elder ? "#06202b" : "#2a0d05";
  const body = elder ? "#0a2634" : "#1a0905";
  const eye = tone === "bad" ? "#ff5d6c" : elder ? "#dffcff" : "#ffd27a";
  const fallen = tone === "great" || tone === "good";
  return (
    <svg viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`dp-sky-${elder ? "e" : "d"}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={elder ? "#030a14" : "#0a0508"} /><stop offset="1" stopColor={deep} /></linearGradient>
        <radialGradient id={`dp-glow-${elder ? "e" : "d"}`} cx="50%" cy="100%" r="60%"><stop offset="0" stopColor={light} stopOpacity="0.6" /><stop offset="0.5" stopColor={light} stopOpacity="0.16" /><stop offset="1" stopColor={light} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="400" fill={`url(#dp-sky-${elder ? "e" : "d"})`} />
      {elder ? <path d="M0 120 C200 40 400 160 600 70 C750 10 900 90 1000 50 L1000 140 C900 180 750 100 600 160 C400 250 200 130 0 210 Z" fill="#5cc8ea" fillOpacity="0.07" /> : null}
      <path d="M0 230 C90 180 170 200 250 170 C310 150 350 180 410 160 L410 400 L0 400 Z" fill={elder ? "#04141c" : "#0c0507"} />
      <path d="M1000 220 C910 180 850 200 770 170 C710 150 670 180 590 160 L590 400 L1000 400 Z" fill={elder ? "#04141c" : "#0c0507"} />
      {[60, 160, 260, 740, 840, 940].map((x, i) => <g key={x} fill={elder ? "#031016" : "#070305"}><ellipse cx={x} cy={205 + (i % 3) * 10} rx={36} ry={26} /><ellipse cx={x + 28} cy={218} rx={26} ry={18} /></g>)}
      <ellipse cx="500" cy="340" rx="340" ry="70" fill={body} />
      <ellipse cx="500" cy="340" rx="340" ry="70" fill={`url(#dp-glow-${elder ? "e" : "d"})`} />
      {/* the drake */}
      <g className={cn("dyn-rise", fallen && "opacity-40")} style={{ transform: fallen ? "translateY(40px)" : undefined, transition: "transform 900ms ease, opacity 900ms ease" }}>
        {/* wings */}
        <path d="M500 230 C420 190 330 120 230 110 C300 170 330 220 300 250 C370 240 430 250 500 290 Z" fill={body} />
        <path d="M500 230 C580 190 670 120 770 110 C700 170 670 220 700 250 C630 240 570 250 500 290 Z" fill={body} />
        <path d="M500 230 C420 190 330 120 230 110" fill="none" stroke={light} strokeOpacity="0.5" strokeWidth="2" />
        <path d="M500 230 C580 190 670 120 770 110" fill="none" stroke={light} strokeOpacity="0.5" strokeWidth="2" />
        {/* neck + head */}
        <path d="M470 330 C470 260 480 200 500 150 C520 200 530 260 530 330 Z" fill={body} />
        <path d="M468 160 C470 115 530 115 532 160 C534 190 520 206 500 206 C480 206 466 190 468 160 Z" fill={body} />
        {elder ? [0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${476 + i * 12} 128 L${470 + i * 15} ${72 - Math.abs(i - 2) * 14} L${488 + i * 12} 126 Z`} fill={body} stroke={light} strokeOpacity="0.4" />) : <><path d="M476 130 L446 80 L492 124 Z" fill={body} /><path d="M524 130 L554 80 L508 124 Z" fill={body} /></>}
        <g className="dyn-eye"><ellipse cx="486" cy="160" rx="7" ry="4" fill={eye} /><ellipse cx="514" cy="160" rx="7" ry="4" fill={eye} /><circle cx="486" cy="160" r="14" fill={eye} opacity="0.25" /><circle cx="514" cy="160" r="14" fill={eye} opacity="0.25" /></g>
        {phase !== "outcome" ? <path d="M488 186 L500 200 L512 186" fill="none" stroke={light} strokeOpacity="0.7" strokeWidth="2" /> : null}
      </g>
      {/* embers or frost */}
      {Array.from({ length: 10 }, (_, i) => <circle key={i} cx={300 + i * 44} cy={360 - (i % 3) * 20} r={elder ? 2.2 : 2.8} fill={light} className={elder ? "dyn-frost" : "dyn-ember"} style={{ "--i": i } as CSSProperties} opacity={elder ? 0.6 : 0} />)}
      <ellipse cx="500" cy="356" rx="110" ry="18" fill="none" stroke={light} strokeOpacity="0.45" strokeWidth="1.5" />
    </svg>
  );
}

export function ObjectiveSpectacle({ kind, phase, tone = null, children, className }: { kind: ObjectiveKind; phase: Phase; tone?: ObjectiveOutcome["tone"] | null; children?: ReactNode; className?: string }) {
  const motion = useMotionAllowed();
  return (
    <div data-testid="objective-pit" data-spectacle={kind} data-phase={phase}
      className={cn("dyn-spect -mx-4 -mt-4 mb-0.5", motion && "dyn-spect--motion", phase === "ask" ? "h-[84px] sm:h-[128px]" : phase === "outcome" ? "h-[120px] sm:h-[200px]" : "h-[118px] sm:h-[264px]", className)}
      style={{ "--dyn-light": PIT_LIGHT[kind], transition: motion ? "height 500ms var(--dyn-ease)" : undefined } as CSSProperties}>
      {kind === "baron" ? <BaronPit phase={phase} tone={tone} /> : <DragonPit elder={kind === "elder"} phase={phase} tone={tone} />}
      <span aria-hidden className="dyn-spect-mist" />
      {tone ? <span aria-hidden className={cn("absolute inset-0", `dyn-spect-wash--${tone}`)} /> : null}
      {tone ? <span aria-hidden key={tone} className={cn("dyn-spect-flash absolute inset-0 bg-white/60 opacity-0")} /> : null}
      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(7,17,31,0),rgba(7,17,31,0.85)_55%,rgba(7,17,31,0.96))] px-4 pb-2.5 pt-8">
        {children}
        {phase === "stakes" ? <div className="dyn-tension mt-2" aria-hidden><span /></div> : null}
      </div>
    </div>
  );
}
