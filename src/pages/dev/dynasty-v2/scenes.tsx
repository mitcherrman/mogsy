/**
 * VIS-F2/F3 — locations. A `Scene` paints one of seven spaces behind the
 * screen content. VIS-F3 turns the three HQ rooms and the stadium into layered
 * illustrations with depth (back wall → furniture and screens → foreground
 * silhouettes), composed in inline SVG so they scale to any viewport, carry
 * the org accent, and need no raster rights. The Mogzy chamber and classroom
 * art remain available as a faint far layer behind HQ and practice.
 *
 * The stadium has three variants: `normal`, `elimination` (red ribbon, harder
 * rim light) and `finals` (violet-gold, more rigs, flag wall). Motion is
 * limited to slow beam sweeps and screen flicker; reduced motion freezes it.
 *
 * `Scene` also drives the ambient sound: entering a scene moves the Dynasty
 * audio engine to that room's loop (400 ms crossfade).
 */
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { setScene as setAudioScene } from "./audio";
import { MEDIA_SLOTS, SCENE_META, type SceneId } from "./media";
import { Eyebrow } from "./parts";

export type StadiumVariant = "normal" | "elimination" | "finals";

const VB = "0 0 1000 600";
const A = "var(--dyn-accent, #e3c66f)";

/* ───────────────────────────── Team HQ: the gaming house common room */
function HQ() {
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="hq-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c1a2e" /><stop offset="1" stopColor="#060d18" /></linearGradient>
        <linearGradient id="hq-win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1a2f55" /><stop offset="1" stopColor="#0a1426" /></linearGradient>
        <linearGradient id="hq-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1322" /><stop offset="1" stopColor="#04080f" /></linearGradient>
        <radialGradient id="hq-lamp" cx="50%" cy="0%" r="70%"><stop offset="0" stopColor="#ffd9a3" stopOpacity="0.32" /><stop offset="1" stopColor="#ffd9a3" stopOpacity="0" /></radialGradient>
        <linearGradient id="hq-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fb6ff" stopOpacity="0.9" /><stop offset="1" stopColor="#2b5f9e" stopOpacity="0.9" /></linearGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#hq-wall)" />
      {/* city window */}
      <rect x="560" y="60" width="380" height="250" rx="6" fill="url(#hq-win)" stroke="#1f3558" strokeWidth="6" />
      <line x1="750" y1="60" x2="750" y2="310" stroke="#1f3558" strokeWidth="6" /><line x1="560" y1="185" x2="940" y2="185" stroke="#1f3558" strokeWidth="5" />
      {Array.from({ length: 48 }, (_, i) => <rect key={i} x={575 + (i % 12) * 30} y={120 + Math.floor(i / 12) * 42 + ((i * 7) % 9)} width={6} height={10 + ((i * 13) % 16)} fill={i % 5 === 0 ? "#ffd27a" : "#6a8dbf"} opacity={0.25 + ((i * 31) % 50) / 100} />)}
      <rect x="560" y="300" width="380" height="14" fill="#101c30" />
      {/* team banner with crest hex in the accent */}
      <path d="M90 40 H260 V300 L175 350 L90 300 Z" fill="#0b1727" stroke={A} strokeOpacity="0.55" strokeWidth="3" />
      <path d="M175 110 L225 138 V194 L175 222 L125 194 V138 Z" fill="none" stroke={A} strokeWidth="4" strokeOpacity="0.9" />
      <path d="M175 128 L210 148 V186 L175 206 L140 186 V148 Z" fill={A} fillOpacity="0.25" />
      <rect x="120" y="245" width="110" height="6" fill={A} fillOpacity="0.5" /><rect x="135" y="262" width="80" height="4" fill={A} fillOpacity="0.3" />
      {/* trophy shelf */}
      <rect x="300" y="150" width="220" height="8" fill="#15243c" /><rect x="300" y="230" width="220" height="8" fill="#15243c" />
      {[320, 370, 420, 470].map((x, i) => <g key={x}><rect x={x} y={118 - (i % 2) * 6} width="22" height={32 + (i % 2) * 6} rx="3" fill={i === 1 ? "#e3c66f" : "#5a6b85"} fillOpacity={i === 1 ? 0.9 : 0.6} /><rect x={x - 4} y="150" width="30" height="4" fill="#1b2d49" /></g>)}
      {[315, 360, 405, 450, 495].map((x, i) => <rect key={x} x={x} y="206" width="14" height="24" rx="2" fill={["#b85f73", "#5a8ab0", "#7fa16b", "#c9a84c", "#8a7fb5"][i]} fillOpacity="0.6" />)}
      {/* pendant lamps */}
      {[380, 700].map((x) => <g key={x}><line x1={x} y1="0" x2={x} y2="70" stroke="#2a3a55" strokeWidth="2" /><path d={`M${x - 36} 70 L${x + 36} 70 L${x + 22} 98 L${x - 22} 98 Z`} fill="#1a2740" stroke="#3a4d6e" /><ellipse cx={x} cy="100" rx="22" ry="5" fill="#ffd9a3" fillOpacity="0.8" /><path d={`M${x - 24} 100 L${x - 160} 600 L${x + 160} 600 L${x + 24} 100 Z`} fill="url(#hq-lamp)" /></g>)}
      {/* floor */}
      <rect x="0" y="420" width="1000" height="180" fill="url(#hq-floor)" />
      <path d="M0 420 L1000 420" stroke="#1b2d49" />
      {/* desk row with five stations, monitors lit */}
      <path d="M120 470 L880 470 L920 520 L80 520 Z" fill="#0f1b2f" stroke="#223755" />
      {[200, 340, 480, 620, 760].map((x, i) => (
        <g key={x}>
          <rect x={x - 48} y="395" width="96" height="60" rx="4" fill="#0a1424" stroke="#2a4066" />
          <rect x={x - 42} y="401" width="84" height="48" fill="url(#hq-screen)" opacity="0.85" className="dyn-screen" style={{ "--i": i } as CSSProperties} />
          <rect x={x - 30} y="410" width="36" height="3" fill="#dff1ff" opacity="0.6" /><rect x={x - 30} y="418" width="52" height="3" fill="#dff1ff" opacity="0.35" /><rect x={x - 30} y="426" width="24" height="3" fill="#dff1ff" opacity="0.35" />
          <rect x={x - 6} y="455" width="12" height="12" fill="#1b2d49" /><rect x={x - 40} y="474" width="80" height="10" rx="2" fill="#132238" stroke="#2a4066" />
          <ellipse cx={x} cy="548" rx="34" ry="8" fill="#000" opacity="0.5" />
          <path d={`M${x - 22} 548 C${x - 22} 505 ${x + 22} 505 ${x + 22} 548 Z`} fill="#0d1a2c" stroke="#223755" />
          <rect x={x - 26} y="520" width="52" height="8" rx="3" fill={A} fillOpacity="0.35" />
        </g>
      ))}
      {/* foreground sofa silhouettes */}
      <path d="M-20 600 L-20 540 Q0 520 40 520 L300 520 Q340 520 340 560 L340 600 Z" fill="#050b14" opacity="0.9" />
      <path d="M1020 600 L1020 545 Q1000 525 960 525 L720 525 Q690 525 690 565 L690 600 Z" fill="#050b14" opacity="0.9" />
    </svg>
  );
}

/* ───────────────────────────── Practice room: five scrim stations */
function Practice() {
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="pr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1627" /><stop offset="1" stopColor="#050b14" /></linearGradient>
        <linearGradient id="pr-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fd0ff" /><stop offset="1" stopColor="#2a6fb0" /></linearGradient>
        <radialGradient id="pr-glow" cx="50%" cy="100%" r="80%"><stop offset="0" stopColor="#6fb6ff" stopOpacity="0.35" /><stop offset="1" stopColor="#6fb6ff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#pr-wall)" />
      {/* whiteboard with a draft diagram */}
      <rect x="80" y="70" width="330" height="200" rx="4" fill="#dfe6ee" opacity="0.45" />
      <rect x="80" y="70" width="330" height="200" rx="4" fill="none" stroke="#2a4066" strokeWidth="6" />
      <path d="M110 110 L380 110 M110 150 L300 150 M110 190 L340 190 M110 230 L260 230" stroke="#2b4d7a" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      {[130, 190, 250, 310, 370].map((x, i) => <circle key={x} cx={x} cy={130 + (i % 2) * 30} r="9" fill="none" stroke={i < 3 ? "#b8494f" : "#2b7fb0"} strokeWidth="3" />)}
      <path d="M140 150 C200 90 260 200 330 120" fill="none" stroke="#b8494f" strokeWidth="3" strokeDasharray="6 5" />
      {/* acoustic panels + team wordmark */}
      {[480, 600, 720, 840].map((x) => <rect key={x} x={x} y="80" width="90" height="120" rx="6" fill="#0f1d33" stroke="#1f3558" />)}
      <rect x="480" y="225" width="450" height="26" fill={A} fillOpacity="0.14" /><rect x="500" y="233" width="140" height="10" fill={A} fillOpacity="0.55" /><rect x="650" y="233" width="60" height="10" fill={A} fillOpacity="0.3" />
      {/* long desk with five stations, big monitors, keyboards, headsets */}
      <rect x="0" y="400" width="1000" height="200" fill="#060d18" />
      <path d="M40 440 L960 440 L1000 500 L0 500 Z" fill="#0e1a2d" stroke="#223755" />
      {[150, 325, 500, 675, 850].map((x, i) => (
        <g key={x}>
          <rect x={x - 72} y="330" width="144" height="92" rx="4" fill="#0a1424" stroke="#2a4066" strokeWidth="2" />
          <rect x={x - 66} y="336" width="132" height="80" fill="url(#pr-screen)" opacity="0.9" className="dyn-screen" style={{ "--i": i } as CSSProperties} />
          <rect x={x - 58} y="344" width="52" height="52" fill="#0b2a44" opacity="0.8" /><path d={`M${x - 58} 396 L${x - 6} 344`} stroke="#6fd0a6" strokeWidth="2" opacity="0.7" /><circle cx={x - 20} cy={x % 2 ? 360 : 380} r="3" fill="#ffd27a" />
          <rect x={x + 2} y="350" width="56" height="4" fill="#dff1ff" opacity="0.5" /><rect x={x + 2} y="360" width="40" height="4" fill="#dff1ff" opacity="0.35" /><rect x={x + 2} y="370" width="48" height="4" fill="#dff1ff" opacity="0.35" />
          <path d={`M${x - 66} 416 L${x - 200} 600 L${x + 200} 600 L${x + 66} 416 Z`} fill="url(#pr-glow)" />
          <rect x={x - 8} y="422" width="16" height="18" fill="#1b2d49" />
          <rect x={x - 46} y="452" width="92" height="14" rx="3" fill="#132238" stroke="#2a4066" />
          {Array.from({ length: 10 }, (_, k) => <rect key={k} x={x - 42 + k * 9} y="456" width="6" height="6" fill="#2d4a73" />)}
          <path d={`M${x + 70} 470 a14 14 0 0 1 28 0 v12 h-6 v-10 a8 8 0 0 0 -16 0 v10 h-6 Z`} fill="#1b2d49" stroke="#3a5a86" />
          <path d={`M${x - 20} 600 C${x - 20} 540 ${x + 20} 540 ${x + 20} 600 Z`} fill="#0b1626" stroke="#1f3558" />
        </g>
      ))}
    </svg>
  );
}

/* ───────────────────────────── War room: map table and tactical wall */
function WarRoom() {
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="wr-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07101d" /><stop offset="1" stopColor="#04080f" /></linearGradient>
        <pattern id="wr-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#5cc8ea" strokeOpacity="0.22" strokeWidth="1" /></pattern>
        <radialGradient id="wr-table" cx="50%" cy="60%" r="60%"><stop offset="0" stopColor="#5cc8ea" stopOpacity="0.45" /><stop offset="0.6" stopColor="#5cc8ea" stopOpacity="0.08" /><stop offset="1" stopColor="#5cc8ea" stopOpacity="0" /></radialGradient>
        <linearGradient id="wr-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.28" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#wr-wall)" />
      {/* tactical wall: big screen with the opponent dossier */}
      <rect x="250" y="40" width="500" height="250" rx="6" fill="#071626" stroke="#1f3f66" strokeWidth="4" />
      <rect x="262" y="52" width="476" height="226" fill="url(#wr-grid)" />
      <path d="M262 278 L738 52" stroke="#6fd0a6" strokeOpacity="0.5" strokeWidth="2" />
      <circle cx="340" cy="210" r="20" fill="#b8494f" fillOpacity="0.35" stroke="#e0777c" /><circle cx="660" cy="120" r="20" fill="#2f8fca" fillOpacity="0.35" stroke="#7fd6ef" />
      <circle cx="500" cy="165" r="34" fill="none" stroke="#b39cff" strokeWidth="2" strokeDasharray="4 6" className="dyn-rotate" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={620} y={190 + i * 18} width={100 - i * 18} height="6" fill="#dff1ff" opacity="0.4" />)}
      {/* pinned cards either side */}
      {[90, 150, 90].map((x, i) => <rect key={i} x={x} y={70 + i * 75} width="110" height="60" rx="3" fill="#f5ecd3" opacity="0.14" transform={`rotate(${i % 2 ? 3 : -4} ${x + 55} ${100 + i * 75})`} />)}
      {[800, 860, 800].map((x, i) => <rect key={i} x={x} y={70 + i * 75} width="110" height="60" rx="3" fill="#f5ecd3" opacity="0.14" transform={`rotate(${i % 2 ? -3 : 4} ${x + 55} ${100 + i * 75})`} />)}
      {/* lamp cone */}
      <path d="M470 0 L300 600 L700 600 L530 0 Z" fill="url(#wr-cone)" />
      {/* the lit map table */}
      <ellipse cx="500" cy="480" rx="330" ry="90" fill="#0b1727" stroke="#223755" />
      <ellipse cx="500" cy="470" rx="300" ry="70" fill="url(#wr-table)" />
      <ellipse cx="500" cy="470" rx="300" ry="70" fill="url(#wr-grid)" opacity="0.6" />
      <ellipse cx="500" cy="470" rx="150" ry="36" fill="none" stroke={A} strokeOpacity="0.6" />
      {[[420, 455], [500, 440], [580, 455], [460, 490], [540, 490]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="7" fill={A} fillOpacity="0.9" /><circle cx={x} cy={y} r="12" fill="none" stroke={A} strokeOpacity="0.5" /></g>)}
      {[[380, 500], [620, 500]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" fill="#e0777c" fillOpacity="0.8" />)}
      {/* chairs as silhouettes */}
      {[260, 740].map((x) => <path key={x} d={`M${x - 30} 600 L${x - 24} 520 Q${x} 505 ${x + 24} 520 L${x + 30} 600 Z`} fill="#05090f" />)}
    </svg>
  );
}

/* ───────────────────────────── Arena tunnel */
function Tunnel() {
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <radialGradient id="tunnel-light" cx="50%" cy="48%" r="32%"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.95" /><stop offset="0.45" stopColor="#e3c66f" stopOpacity="0.3" /><stop offset="1" stopColor="#e3c66f" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="600" fill="#05090f" />
      <rect width="1000" height="600" fill="url(#tunnel-light)" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
        const k = 1 - i * 0.135;
        return <g key={i}><rect x={500 - 480 * k} y={290 - 270 * k} width={960 * k} height={540 * k} fill="none" stroke="#e3c66f" strokeOpacity={0.05 + i * 0.03} strokeWidth="1.5" />
          <rect x={500 - 480 * k} y={290 - 270 * k} width="10" height={540 * k} fill="#ffd27a" opacity={0.12 + i * 0.03} /><rect x={500 + 480 * k - 10} y={290 - 270 * k} width="10" height={540 * k} fill="#ffd27a" opacity={0.12 + i * 0.03} /></g>;
      })}
      <path d="M20 20 L500 290 M980 20 L500 290 M20 580 L500 290 M980 580 L500 290" stroke="#e3c66f" strokeOpacity="0.14" strokeWidth="1" />
      {/* five players walking out, silhouettes */}
      {[400, 450, 500, 550, 600].map((x, i) => <g key={x} opacity={0.95}><circle cx={x} cy={300 + Math.abs(i - 2) * 6} r="14" fill="#05090f" /><path d={`M${x - 18} ${340 + Math.abs(i - 2) * 6} L${x + 18} ${340 + Math.abs(i - 2) * 6} L${x + 26} ${600} L${x - 26} 600 Z`} fill="#05090f" /></g>)}
    </svg>
  );
}

/* ───────────────────────────── Stadium with variants */
function Stadium({ variant, motion }: { variant: StadiumVariant; motion: boolean }) {
  const rim = variant === "elimination" ? "#ff6b7a" : variant === "finals" ? "#c9a7ff" : "#f6dd8f";
  const beams = variant === "finals" ? [90, 240, 390, 500, 610, 760, 910] : [140, 320, 500, 680, 860];
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="st-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={rim} stopOpacity="0.22" /><stop offset="1" stopColor={rim} stopOpacity="0" /></linearGradient>
        <linearGradient id="st-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#040812" /><stop offset="1" stopColor="#0a1426" /></linearGradient>
        <linearGradient id="st-screen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0b2340" /><stop offset="0.5" stopColor="#163a66" /><stop offset="1" stopColor="#0b2340" /></linearGradient>
        <linearGradient id="st-stage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#16233a" /><stop offset="1" stopColor="#070d18" /></linearGradient>
        <radialGradient id="st-haze" cx="50%" cy="20%" r="70%"><stop offset="0" stopColor={rim} stopOpacity="0.16" /><stop offset="1" stopColor={rim} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#st-sky)" />
      <rect width="1000" height="600" fill="url(#st-haze)" />
      {/* upper bowl: three tiers of audience silhouettes with phone lights */}
      {[0, 1, 2].map((tier) => (
        <g key={tier}>
          <path d={`M0 ${120 + tier * 70} Q500 ${60 + tier * 70} 1000 ${120 + tier * 70} L1000 ${175 + tier * 70} Q500 ${115 + tier * 70} 0 ${175 + tier * 70} Z`} fill={tier === 0 ? "#070e1a" : tier === 1 ? "#0a1322" : "#0d182b"} />
          {Array.from({ length: 70 }, (_, i) => { const x = i * 14.5 + (tier * 5); const y = 150 + tier * 70 - Math.sin((x / 1000) * Math.PI) * 55 + ((i * 7) % 5); return <circle key={i} cx={x} cy={y} r={5 + (i % 3)} fill={tier === 2 ? "#101d33" : "#0c1628"} />; })}
          {Array.from({ length: 22 }, (_, i) => { const x = (i * 46 + tier * 17) % 1000; const y = 146 + tier * 70 - Math.sin((x / 1000) * Math.PI) * 55; return <circle key={i} cx={x} cy={y} r="1.6" fill="#fff" opacity={0.35 + ((i * 13) % 50) / 100} className="dyn-twinkle" style={{ "--i": i } as CSSProperties} />; })}
        </g>
      ))}
      {/* truss + rigs */}
      <rect x="40" y="14" width="920" height="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.4" />
      <path d={Array.from({ length: 23 }, (_, i) => `${i === 0 ? "M" : "L"}${40 + i * 40} 14 L${60 + i * 40} 40`).join(" ")} fill="none" stroke="#1f3558" strokeWidth="1.5" />
      {beams.map((x, i) => (
        <g key={x} className={cn(motion && "dyn-beam")} style={{ "--i": i } as CSSProperties}>
          <rect x={x - 9} y="22" width="18" height="18" rx="3" fill="#121f36" stroke="#2a4066" />
          <circle cx={x} cy="42" r="6" fill={rim} fillOpacity="0.95" />
          <path d={`M${x - 10} 46 L${x - 150} 600 L${x + 150} 600 L${x + 10} 46 Z`} fill="url(#st-beam)" />
        </g>
      ))}
      {/* the big screens: two side displays and the centre board */}
      <rect x="40" y="250" width="200" height="120" rx="4" fill="url(#st-screen)" stroke={rim} strokeOpacity="0.45" />
      <rect x="760" y="250" width="200" height="120" rx="4" fill="url(#st-screen)" stroke={rim} strokeOpacity="0.45" />
      <rect x="300" y="235" width="400" height="150" rx="4" fill="url(#st-screen)" stroke={rim} strokeOpacity="0.6" strokeWidth="2" />
      <text x="500" y="300" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="46" fill={rim} fillOpacity="0.32">{variant === "finals" ? "WORLDS FINAL" : variant === "elimination" ? "ELIMINATION" : "LIVE"}</text>
      <text x="500" y="345" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="18" letterSpacing="6" fill="#dff1ff" fillOpacity="0.22">{variant === "finals" ? "BEST OF FIVE · FEARLESS" : "WORLDS DYNASTY · SYNTHETIC"}</text>
      <path d="M60 300 L220 300 M60 320 L180 320 M60 340 L200 340" stroke="#dff1ff" strokeOpacity="0.3" strokeWidth="6" /><path d="M780 300 L940 300 M780 320 L900 320 M780 340 L920 340" stroke="#dff1ff" strokeOpacity="0.3" strokeWidth="6" />
      {variant === "finals" ? [120, 880].map((x) => <g key={x}>{[0, 1, 2, 3].map((i) => <path key={i} d={`M${x - 60 + i * 40} 60 h24 v70 l-12 10 l-12 -10 Z`} fill={i % 2 ? "#c9a7ff" : "#e3c66f"} fillOpacity="0.35" />)}</g>) : null}
      {/* stage, two player station pods with five seats each */}
      <path d="M100 440 L900 440 L1000 600 L0 600 Z" fill="url(#st-stage)" />
      <path d="M100 440 L900 440" stroke={rim} strokeOpacity="0.8" strokeWidth="3" />
      <path d="M100 440 L900 440" stroke={rim} strokeOpacity="0.35" strokeWidth="12" />
      {[260, 740].map((cx, side) => (
        <g key={cx}>
          <path d={`M${cx - 170} 460 L${cx + 170} 460 L${cx + 190} 500 L${cx - 190} 500 Z`} fill="#0d1a2c" stroke="#2a4066" />
          {[-120, -60, 0, 60, 120].map((dx) => (
            <g key={dx}>
              <rect x={cx + dx - 22} y="425" width="44" height="28" rx="3" fill="#0a1424" stroke="#2a4066" />
              <rect x={cx + dx - 18} y="429" width="36" height="20" fill={side === 0 ? A : "#7fd6ef"} fillOpacity="0.55" className="dyn-screen" />
              <circle cx={cx + dx} cy="520" r="11" fill="#070d18" /><path d={`M${cx + dx - 16} 532 Q${cx + dx} 526 ${cx + dx + 16} 532 L${cx + dx + 18} 560 L${cx + dx - 18} 560 Z`} fill="#070d18" />
            </g>
          ))}
        </g>
      ))}
      {/* front row silhouettes */}
      <path d="M0 600 L0 575 Q500 540 1000 575 L1000 600 Z" fill="#03070d" />
      {Array.from({ length: 34 }, (_, i) => <circle key={i} cx={i * 30 + 10} cy={578 - Math.sin((i / 34) * Math.PI) * 10} r="9" fill="#03070d" />)}
    </svg>
  );
}

function Backstage() {
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full">
      <rect width="1000" height="600" fill="#080c13" />
      {[80, 200, 320, 440, 560, 680, 800, 920].map((x) => (<g key={x}><circle cx={x} cy="40" r="26" fill="#ffb86b" fillOpacity="0.10" /><circle cx={x} cy="40" r="7" fill="#ffd9a3" fillOpacity="0.9" /></g>))}
      <rect x="0" y="62" width="1000" height="2" fill="#e3c66f" fillOpacity="0.3" />
      {/* corridor with a replay monitor and equipment cases */}
      <rect x="60" y="120" width="300" height="180" rx="6" fill="#071626" stroke="#1f3f66" strokeWidth="3" /><rect x="72" y="132" width="276" height="156" fill="#0b2a44" opacity="0.8" /><path d="M72 288 L348 132" stroke="#6fd0a6" strokeOpacity="0.4" strokeWidth="2" /><circle cx="150" cy="250" r="3" fill="#ffd27a" /><circle cx="240" cy="190" r="3" fill="#e0777c" />
      <rect x="640" y="200" width="280" height="24" fill="#1a2740" /><path d="M640 224 L640 320 L920 320 L920 224" fill="none" stroke="#2a4066" strokeWidth="3" />
      <rect x="60" y="430" width="260" height="170" rx="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.2" /><rect x="60" y="470" width="260" height="6" fill="#1a2740" />{[90, 150, 210, 270].map((x) => <rect key={x} x={x} y="430" width="18" height="170" fill="#121f36" />)}
      <rect x="700" y="470" width="220" height="130" rx="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.2" />
      <rect x="0" y="560" width="1000" height="40" fill="#05080e" />
    </svg>
  );
}

function Trophy() {
  return (
    <svg aria-hidden viewBox={VB} preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs><linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.4" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></linearGradient></defs>
      <rect width="1000" height="600" fill="#05080f" />
      <path d="M470 0 L250 600 L750 600 L530 0 Z" fill="url(#cone)" />
      {/* gallery walls with framed legacy cards */}
      {[60, 180, 760, 880].map((x, i) => <g key={x}><rect x={x} y="120" width="90" height="130" rx="2" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.35" /><rect x={x + 10} y="130" width="70" height="110" fill={i % 2 ? "#13223a" : "#0f1b2f"} /></g>)}
      <ellipse cx="500" cy="560" rx="200" ry="30" fill="#e3c66f" fillOpacity="0.14" />
      <rect x="420" y="450" width="160" height="110" rx="6" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.5" />
      <rect x="440" y="470" width="120" height="6" fill="#e3c66f" fillOpacity="0.4" />
      {[120, 860, 300, 700, 500].map((x, i) => <circle key={x} cx={x} cy={90 + i * 50} r="2" fill="#f6dd8f" fillOpacity="0.6" />)}
    </svg>
  );
}

function Crowd({ className }: { className?: string }) {
  return <div aria-hidden className={cn("dyn-crowd absolute inset-x-0 bottom-0 h-[26%]", className)} />;
}

export function Scene({ id, children, className, caption = true, variant = "normal", loud }: { id: SceneId; children?: ReactNode; className?: string; caption?: boolean; variant?: StadiumVariant; loud?: boolean }) {
  const motion = useMotionAllowed();
  const slot = MEDIA_SLOTS[`scene.${id}`];
  const meta = SCENE_META[id];
  useEffect(() => { setAudioScene(id, false, !!loud); }, [id, loud]);
  return (
    <div className={cn("relative", className)} data-scene={id} data-variant={id === "stadium" ? variant : undefined} data-testid="scene">
      <div aria-hidden className={cn("dyn-scene pointer-events-none fixed inset-0 -z-[1] overflow-hidden", `dyn-scene--${id}`, motion && "dyn-scene--motion")}>
        {slot?.src ? <img src={slot.src} alt="" decoding="async" loading="lazy" className="dyn-scene-art absolute inset-0 h-full w-full object-cover" /> : null}
        {id === "hq" ? <HQ /> : null}
        {id === "practice" ? <Practice /> : null}
        {id === "warroom" ? <WarRoom /> : null}
        {id === "stadium" ? <Stadium variant={variant} motion={motion} /> : null}
        {id === "tunnel" ? <><Tunnel /><Crowd className="opacity-30" /></> : null}
        {id === "backstage" ? <Backstage /> : null}
        {id === "trophy" ? <Trophy /> : null}
        <div className="dyn-scene-wash absolute inset-0" />
      </div>
      {caption ? (
        <div className="pointer-events-none mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/40" data-testid="scene-caption">
          <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#e3c66f]/70" /><Eyebrow tone="muted" className="!text-[10px] !tracking-[0.18em] !text-white/45">{meta.name}</Eyebrow><span>· {meta.caption}</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
