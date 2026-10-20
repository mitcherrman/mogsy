/**
 * VIS-F4 — production environments. Six places drawn as layered 1000×600
 * illustrations (far wall → furniture and screens → people → foreground),
 * all original SVG, all driven by `EnvState` so the rooms show the run:
 * the org's accent and mark, the five starters at their stations, the
 * results wall, the trophy shelf, a welcome banner after a signing, Worlds
 * pennants, the opponent on the tunnel and stadium boards, and a stadium
 * whose crowd and floor light follow match momentum.
 *
 * Life is cheap CSS: monitors cycle, phone lights twinkle, a VOD scrubber
 * moves, beams sweep, the walkout silhouettes advance. Reduced motion
 * freezes all of it through the `.dyn-scene--motion` gate.
 */
import type { CSSProperties } from "react";
import type { Role } from "./fixtures";
import type { StadiumVariant } from "./scenes";

export type EnvMood = "neutral" | "win" | "loss" | "signing" | "worlds";
export interface EnvState {
  accent?: string;
  mono?: string;
  team?: string;
  opp?: string;
  roster?: { name: string; role: Role; kind: "star" | "academy" | "signed" }[];
  cohesion?: number;
  results?: ("W" | "L" | null)[];
  mood?: EnvMood;
  signed?: string;
  /** in-game: advantage −4..4, score and label for the stadium boards */
  lead?: number;
  live?: boolean;
  score?: string;
  stageLabel?: string;
  variant?: StadiumVariant;
}

const G = "#e3c66f";
const short = (n?: string) => (n ?? "").replace(/^SYN-?\s?/, "");
const ROLE_SHORT: Record<Role, string> = { top: "TOP", jng: "JNG", mid: "MID", bot: "BOT", sup: "SUP" };

/* ───────────────────────────── shared parts */

/** A seated player from behind: chair back, shoulders, head, headset, jersey in the accent. */
function Seated({ x, y, s = 1, accent = G, name, role, highlight }: { x: number; y: number; s?: number; accent?: string; name?: string; role?: string; highlight?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-30 60 C-30 12 30 12 30 60 Z" fill="#0b1626" stroke="#223755" />
      <path d="M-26 46 C-26 20 26 20 26 46 L28 70 L-28 70 Z" fill="#101c30" />
      <path d="M-22 44 L22 44 L26 70 L-26 70 Z" fill={accent} fillOpacity="0.55" />
      <rect x="-10" y="48" width="20" height="5" rx="1" fill={accent} fillOpacity="0.9" />
      <circle cx="0" cy="30" r="13" fill="#0a1322" stroke="#1f3558" />
      <path d="M-13 28 C-13 14 13 14 13 28" fill="none" stroke="#2c3a52" strokeWidth="3" />
      <rect x="-15" y="26" width="4" height="8" rx="1.5" fill="#2c3a52" /><rect x="11" y="26" width="4" height="8" rx="1.5" fill="#2c3a52" />
      <circle cx="13" cy="31" r="1.2" fill={accent} />
      {highlight ? <circle cx="0" cy="30" r="20" fill={accent} fillOpacity="0.12" /> : null}
      {name ? <text x="0" y="86" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="1.5" fill="#dfe8f5" fillOpacity="0.75">{name.toUpperCase()}</text> : null}
      {role ? <text x="0" y="97" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="7" letterSpacing="2" fill={accent} fillOpacity="0.9">{role}</text> : null}
    </g>
  );
}

/** A standing player from behind, walking. */
function Walker({ x, y, s = 1, accent = G, name, role, i = 0 }: { x: number; y: number; s?: number; accent?: string; name?: string; role?: string; i?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} className="dyn-walker" style={{ "--i": i } as CSSProperties}>
      <circle cx="0" cy="0" r="14" fill="#05090f" />
      <path d="M-20 14 L20 14 C26 40 24 70 20 110 L-20 110 C-24 70 -26 40 -20 14 Z" fill="#05090f" />
      <path d="M-18 18 L18 18 L20 56 L-20 56 Z" fill={accent} fillOpacity="0.8" />
      <text x="0" y="44" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="14" fill="#0b1727" fillOpacity="0.85">{(name ?? "").slice(0, 1).toUpperCase()}</text>
      <path d="M-22 110 L-16 150 L-6 150 L-4 112 M22 110 L16 150 L6 150 L4 112" fill="#05090f" />
      {name ? <text x="0" y="-26" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9.5" letterSpacing="1.5" fill="#f5ecd3" fillOpacity="0.9">{name.toUpperCase()}</text> : null}
      {role ? <text x="0" y="-16" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="7" letterSpacing="2" fill={accent}>{role}</text> : null}
    </g>
  );
}

function Monitor({ x, y, w, h, i, accent = G, kind = "game" }: { x: number; y: number; w: number; h: number; i: number; accent?: string; kind?: "game" | "chart" | "map" }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="3" fill="#0a1424" stroke="#2a4066" strokeWidth="1.5" />
      <g className="dyn-monitor" style={{ "--i": i } as CSSProperties}>
        <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} fill="#143c66" className="dyn-mon-a" />
        <g className="dyn-mon-b">
          <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} fill="#0b2a44" />
          {kind === "map" ? <><rect x={x + 8} y={y + 8} width={(w - 8) * 0.45} height={h - 16} fill="#0f3a3a" /><path d={`M${x + 8} ${y + h - 8} L${x + 8 + (w - 8) * 0.45} ${y + 8}`} stroke="#6fd0a6" strokeWidth="1.5" /><circle cx={x + 8 + (w - 8) * 0.2} cy={y + h * 0.5} r="2" fill="#ffd27a" /></> : null}
          {kind === "chart" ? <path d={`M${x + 8} ${y + h - 10} L${x + w * 0.3} ${y + h * 0.55} L${x + w * 0.55} ${y + h * 0.7} L${x + w - 8} ${y + 12}`} fill="none" stroke={accent} strokeWidth="2" /> : null}
          {kind === "game" ? <><rect x={x + 8} y={y + 10} width={w * 0.5} height="3" fill="#dff1ff" opacity="0.6" /><rect x={x + 8} y={y + 18} width={w * 0.35} height="3" fill="#dff1ff" opacity="0.35" /><rect x={x + w - 26} y={y + h - 16} width="18" height="8" rx="1" fill={accent} fillOpacity="0.8" /></> : null}
        </g>
        <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} fill={accent} fillOpacity="0.35" className="dyn-mon-c" />
      </g>
      <rect x={x + w / 2 - 6} y={y + h} width="12" height="10" fill="#1b2d49" /><rect x={x + w / 2 - 22} y={y + h + 9} width="44" height="4" rx="2" fill="#132238" />
    </g>
  );
}

function ResultsWall({ x, y, results = [], accent = G }: { x: number; y: number; results?: ("W" | "L" | null)[]; accent?: string }) {
  const r = [...results]; while (r.length < 8) r.push(null);
  return (
    <g>
      <rect x={x - 10} y={y - 24} width="212" height="118" rx="4" fill="#0b1727" stroke="#223755" />
      <text x={x + 96} y={y - 8} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="3" fill="#dfe8f5" fillOpacity="0.55">SEASON</text>
      {r.slice(0, 8).map((v, i) => {
        const cx = x + 14 + (i % 4) * 48, cy = y + 16 + Math.floor(i / 4) * 44;
        return <g key={i}><rect x={cx - 14} y={cy - 14} width="36" height="30" rx="3" fill={v === "W" ? accent : v === "L" ? "#b8494f" : "#132238"} fillOpacity={v ? 0.85 : 1} stroke={v ? "none" : "#223755"} />
          <text x={cx + 4} y={cy + 6} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="14" fill={v ? "#07111f" : "#3a4d6e"}>{v ?? "·"}</text></g>;
      })}
    </g>
  );
}

function TrophyShelf({ x, y, cups, accent = G }: { x: number; y: number; cups: number; accent?: string }) {
  return (
    <g>
      <rect x={x} y={y} width="200" height="7" fill="#15243c" /><rect x={x + 10} y={y + 7} width="4" height="14" fill="#0f1b2f" /><rect x={x + 186} y={y + 7} width="4" height="14" fill="#0f1b2f" />
      {Array.from({ length: 6 }, (_, i) => {
        const won = i < cups; const cx = x + 22 + i * 32;
        return <g key={i} opacity={won ? 1 : 0.25}><path d={`M${cx - 8} ${y - 30} L${cx + 8} ${y - 30} L${cx + 6} ${y - 12} L${cx - 6} ${y - 12} Z`} fill={won ? G : "#5a6b85"} /><rect x={cx - 2} y={y - 12} width="4" height="7" fill={won ? "#b8913f" : "#3a4d6e"} /><rect x={cx - 7} y={y - 5} width="14" height="4" fill={won ? accent : "#3a4d6e"} /></g>;
      })}
    </g>
  );
}

function CityWindow({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="5" fill="#0d1a33" stroke="#1f3558" strokeWidth="6" />
      <path d={`M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}`} stroke="#1f3558" strokeWidth="5" />
      {Array.from({ length: 14 }, (_, i) => <rect key={i} x={x + 12 + i * (w / 14)} y={y + h * 0.35 + ((i * 29) % 40)} width={w / 14 - 10} height={h * 0.65 - ((i * 29) % 40) - 8} fill="#0a1426" />)}
      {Array.from({ length: 60 }, (_, i) => <rect key={i} x={x + 16 + (i % 14) * (w / 14) + ((i * 7) % 9)} y={y + h * 0.45 + Math.floor(i / 14) * 22 + ((i * 11) % 7)} width="4" height="5" fill={i % 6 === 0 ? "#ffd27a" : "#9cb6dc"} opacity={0.3 + ((i * 31) % 50) / 100} className="dyn-twinkle" style={{ "--i": i } as CSSProperties} />)}
      <path d={`M${x + 20} ${y + 30} C${x + w * 0.3} ${y + 10} ${x + w * 0.6} ${y + 40} ${x + w - 20} ${y + 20}`} fill="none" stroke="#2b3f66" strokeWidth="1" />
    </g>
  );
}

/* ───────────────────────────── Team HQ */

export function HQRoom({ env }: { env: EnvState }) {
  const A = env.accent ?? G;
  const mood = env.mood ?? "neutral";
  const lamp = mood === "loss" ? "#9fc0ff" : mood === "win" ? "#ffe29a" : "#ffd9a3";
  const lampGlow = mood === "loss" ? 0.22 : 0.4 + (env.cohesion ?? 2) * 0.03;
  const roster = env.roster ?? [];
  const cups = (env.results ?? []).filter((r) => r === "W").length;
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" data-mood={mood}>
      <defs>
        <linearGradient id="hq4-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={mood === "loss" ? "#091221" : "#0e1c32"} /><stop offset="1" stopColor="#060c17" /></linearGradient>
        <linearGradient id="hq4-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1526" /><stop offset="1" stopColor="#03070e" /></linearGradient>
        <radialGradient id="hq4-lamp" cx="50%" cy="0%" r="70%"><stop offset="0" stopColor={lamp} stopOpacity={lampGlow} /><stop offset="1" stopColor={lamp} stopOpacity="0" /></radialGradient>
        <linearGradient id="hq4-wood" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1a2234" /><stop offset="0.5" stopColor="#222c40" /><stop offset="1" stopColor="#1a2234" /></linearGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#hq4-wall)" />
      {/* wall band + giant wordmark */}
      <rect x="0" y="40" width="1000" height="300" fill="url(#hq4-wood)" opacity="0.5" />
      <text x="500" y="250" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="900" fontSize="170" fill={A} fillOpacity="0.07" stroke={A} strokeOpacity="0.18" strokeWidth="1">{env.mono ?? "WD"}</text>
      <CityWindow x={620} y={60} w={330} h={230} />
      {/* banner */}
      <path d="M60 40 H230 V290 L145 340 L60 290 Z" fill="#0b1727" stroke={A} strokeOpacity="0.6" strokeWidth="3" />
      <path d="M145 100 L198 130 V192 L145 222 L92 192 V130 Z" fill="none" stroke={A} strokeWidth="4" />
      <text x="145" y="172" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="34" fill="#f5ecd3">{env.mono ?? "WD"}</text>
      <text x="145" y="258" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" letterSpacing="4" fill={A} fillOpacity="0.85">{short(env.team).toUpperCase() || "DYNASTY"}</text>
      <ResultsWall x={300} y={90} results={env.results} accent={A} />
      <TrophyShelf x={300} y={300} cups={cups} accent={A} />
      <rect x="300" y="226" width="200" height="40" fill="#0b1727" stroke="#223755" />
      <text x="400" y="251" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" letterSpacing="3" fill="#dfe8f5" fillOpacity="0.6">COHESION {"◆".repeat(Math.max(0, env.cohesion ?? 0))}{"◇".repeat(Math.max(0, 5 - (env.cohesion ?? 0)))}</text>
      {/* signing banner / worlds pennants */}
      {env.signed ? <g data-slot="recruit.sign_reveal"><path d="M250 112 L760 112 L750 162 L260 162 Z" fill={A} fillOpacity="0.9" /><path d="M250 112 L245 182 L262 162 Z M760 112 L765 182 L748 162 Z" fill={A} fillOpacity="0.6" /><text x="505" y="145" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="24" letterSpacing="4" fill="#07111f">WELCOME {short(env.signed).toUpperCase()}</text></g> : null}
      {mood === "worlds" ? <g>{Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${40 + i * 80} 10 l16 0 l-8 30 Z`} fill={i % 2 ? "#c9a7ff" : G} fillOpacity="0.8" />)}<path d="M40 10 Q500 40 1000 10" fill="none" stroke="#c9a7ff" strokeOpacity="0.5" /><text x="500" y="44" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="16" letterSpacing="8" fill="#c9a7ff" fillOpacity="0.9">WORLDS</text></g> : null}
      {/* lamps */}
      {[330, 660].map((x) => <g key={x}><line x1={x} y1="0" x2={x} y2="60" stroke="#2a3a55" strokeWidth="2" /><path d={`M${x - 40} 60 L${x + 40} 60 L${x + 24} 92 L${x - 24} 92 Z`} fill="#1a2740" stroke="#3a4d6e" /><ellipse cx={x} cy="94" rx="24" ry="5" fill={lamp} fillOpacity="0.9" className="dyn-lamp" /><path d={`M${x - 26} 94 L${x - 190} 600 L${x + 190} 600 L${x + 26} 94 Z`} fill="url(#hq4-lamp)" /></g>)}
      {/* floor + rug */}
      <rect x="0" y="420" width="1000" height="180" fill="url(#hq4-floor)" />
      <path d="M0 420 L1000 420" stroke="#1b2d49" />
      <path d="M150 520 L850 520 L960 600 L40 600 Z" fill={A} fillOpacity="0.06" />
      {/* desk row + LED strip */}
      <path d="M90 470 L910 470 L950 522 L50 522 Z" fill="#101c30" stroke="#223755" />
      <path d="M50 522 L950 522" stroke={A} strokeOpacity="0.8" strokeWidth="3" />
      <path d="M50 524 L950 524" stroke={A} strokeOpacity="0.25" strokeWidth="10" />
      {[170, 335, 500, 665, 830].map((x, i) => (
        <g key={x}>
          <Monitor x={x - 52} y={392} w={104} h={64} i={i} accent={A} kind={i % 3 === 0 ? "game" : i % 3 === 1 ? "map" : "chart"} />
          <rect x={x - 38} y="476" width="76" height="9" rx="2" fill="#132238" stroke="#2a4066" />{Array.from({ length: 9 }, (_, k) => <rect key={k} x={x - 34 + k * 8} y="478" width="5" height="5" fill="#2d4a73" />)}
          <ellipse cx={x + 52} cy="481" rx="5" ry="7" fill="#132238" stroke="#2a4066" />
          <Seated x={x} y={470} s={0.78} accent={A} name={short(roster[i]?.name)} role={roster[i] ? ROLE_SHORT[roster[i].role] : undefined} highlight={roster[i]?.kind === "star"} />
        </g>
      ))}
      {/* foreground */}
      <path d="M-20 600 L-20 548 Q0 526 40 526 L280 526 Q320 526 320 566 L320 600 Z" fill="#040910" />
      <path d="M1020 600 L1020 552 Q1000 530 960 530 L740 530 Q710 530 710 570 L710 600 Z" fill="#040910" />
      <path d="M560 600 C560 560 600 560 600 600 Z M580 560 C570 540 590 520 600 540 C610 520 630 540 620 560 Z" fill="#06101b" />
    </svg>
  );
}

/* ───────────────────────────── Practice room */

export function PracticeRoom({ env }: { env: EnvState }) {
  const A = env.accent ?? G;
  const roster = env.roster ?? [];
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="pr4-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1627" /><stop offset="1" stopColor="#050b14" /></linearGradient>
        <radialGradient id="pr4-glow" cx="50%" cy="100%" r="80%"><stop offset="0" stopColor="#6fb6ff" stopOpacity="0.3" /><stop offset="1" stopColor="#6fb6ff" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#pr4-wall)" />
      {/* acoustic panels */}
      {[20, 130, 240, 350, 460, 570, 680, 790, 900].map((x) => <rect key={x} x={x} y="40" width="80" height="60" rx="5" fill="#0f1d33" stroke="#1f3558" />)}
      {env.signed ? <g data-slot="recruit.sign_reveal"><path d="M250 112 L760 112 L750 162 L260 162 Z" fill={A} fillOpacity="0.9" /><path d="M250 112 L245 182 L262 162 Z M760 112 L765 182 L748 162 Z" fill={A} fillOpacity="0.6" /><text x="505" y="145" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="24" letterSpacing="4" fill="#07111f">WELCOME {short(env.signed).toUpperCase()}</text></g> : null}
      {/* whiteboard */}
      <rect x="40" y="130" width="300" height="190" rx="4" fill="#d9e1ea" opacity="0.5" /><rect x="40" y="130" width="300" height="190" rx="4" fill="none" stroke="#2a4066" strokeWidth="6" />
      <path d="M70 170 L300 170 M70 205 L240 205 M70 240 L280 240 M70 275 L200 275" stroke="#2b4d7a" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      {[90, 150, 210, 270].map((x, i) => <circle key={x} cx={x} cy={190 + (i % 2) * 36} r="9" fill="none" stroke={i < 2 ? "#b8494f" : "#2b7fb0"} strokeWidth="3" />)}
      <path d="M100 215 C150 150 220 250 300 180" fill="none" stroke="#b8494f" strokeWidth="3" strokeDasharray="6 5" />
      {[60, 110, 160].map((x, i) => <rect key={x} x={x} y="300" width="34" height="26" fill={["#ffd27a", "#7fd6ef", "#f6a5c0"][i]} opacity="0.8" transform={`rotate(${i % 2 ? 4 : -5} ${x + 17} 313)`} />)}
      {/* schedule board */}
      <rect x="380" y="130" width="240" height="120" rx="4" fill="#0b1727" stroke="#223755" />
      <text x="500" y="156" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" letterSpacing="4" fill={A}>SCRIM BLOCK</text>
      {[0, 1, 2].map((i) => <g key={i}><rect x="398" y={170 + i * 22} width="14" height="14" rx="2" fill={i < 2 ? A : "#132238"} fillOpacity={i < 2 ? 0.8 : 1} stroke="#2a4066" /><rect x="420" y={175 + i * 22} width={150 - i * 30} height="5" fill="#dff1ff" opacity="0.4" /></g>)}
      <text x="600" y="240" textAnchor="end" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="2" fill="#dfe8f5" fillOpacity="0.6">{short(env.opp) ? `NEXT · ${short(env.opp).toUpperCase()}` : "NEXT · TBD"}</text>
      {/* VOD review wall */}
      <rect x="660" y="120" width="300" height="180" rx="6" fill="#071626" stroke="#1f3f66" strokeWidth="4" />
      <rect x="672" y="132" width="276" height="130" fill="#0b2a44" opacity="0.9" />
      <rect x="672" y="132" width="120" height="130" fill="#0f3a3a" opacity="0.7" /><path d="M672 262 L792 132" stroke="#6fd0a6" strokeWidth="2" opacity="0.7" />
      {[0, 1, 2, 3].map((i) => <rect key={i} x={810} y={150 + i * 24} width={120 - i * 20} height="6" fill="#dff1ff" opacity="0.35" />)}
      <rect x="672" y="270" width="276" height="6" rx="3" fill="#132238" /><rect x="672" y="270" width="276" height="6" rx="3" fill={A} fillOpacity="0.5" className="dyn-vod" style={{ transformOrigin: "672px 273px" } as CSSProperties} />
      {[0.2, 0.45, 0.7].map((p) => <rect key={p} x={672 + 276 * p} y="266" width="3" height="14" fill="#ffd27a" />)}
      <text x="810" y="292" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="3" fill="#dfe8f5" fillOpacity="0.5">VOD REVIEW</text>
      {/* desk, stations, players */}
      <rect x="0" y="400" width="1000" height="200" fill="#060d18" />
      <path d="M30 440 L970 440 L1000 500 L0 500 Z" fill="#0e1a2d" stroke="#223755" />
      {[130, 315, 500, 685, 870].map((x, i) => (
        <g key={x}>
          <Monitor x={x - 72} y={330} w={144} h={92} i={i + 2} accent={A} kind="map" />
          <path d={`M${x - 66} 416 L${x - 200} 600 L${x + 200} 600 L${x + 66} 416 Z`} fill="url(#pr4-glow)" />
          <rect x={x - 46} y="452" width="92" height="14" rx="3" fill="#132238" stroke="#2a4066" />{Array.from({ length: 10 }, (_, k) => <rect key={k} x={x - 42 + k * 9} y="456" width="6" height="6" fill="#2d4a73" />)}
          <path d={`M${x + 64} 470 a14 14 0 0 1 28 0 v12 h-6 v-10 a8 8 0 0 0 -16 0 v10 h-6 Z`} fill="#1b2d49" stroke="#3a5a86" />
          <Seated x={x} y={452} s={0.9} accent={A} name={short(roster[i]?.name)} role={roster[i] ? ROLE_SHORT[roster[i].role] : undefined} />
        </g>
      ))}
    </svg>
  );
}

/* ───────────────────────────── War room */

export function WarRoomScene({ env }: { env: EnvState }) {
  const A = env.accent ?? G;
  const opp = short(env.opp) || "OPPONENT";
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="wr4-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07101d" /><stop offset="1" stopColor="#04080f" /></linearGradient>
        <pattern id="wr4-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0 H0 V40" fill="none" stroke="#5cc8ea" strokeOpacity="0.2" strokeWidth="1" /></pattern>
        <radialGradient id="wr4-table" cx="50%" cy="60%" r="60%"><stop offset="0" stopColor="#5cc8ea" stopOpacity="0.45" /><stop offset="0.6" stopColor="#5cc8ea" stopOpacity="0.08" /><stop offset="1" stopColor="#5cc8ea" stopOpacity="0" /></radialGradient>
        <linearGradient id="wr4-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.24" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#wr4-wall)" />
      {/* dossier screen */}
      <rect x="60" y="40" width="400" height="250" rx="6" fill="#071626" stroke="#1f3f66" strokeWidth="4" />
      <rect x="72" y="52" width="376" height="226" fill="url(#wr4-grid)" />
      <path d="M100 100 L135 120 V160 L100 180 L65 160 V120 Z" transform="translate(30 0)" fill="#0b1727" stroke="#9fb0c8" strokeWidth="2" />
      <text x="130" y="147" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="16" fill="#dfe8f5">{opp.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()}</text>
      <text x="190" y="118" fontFamily="Cinzel, serif" fontWeight="700" fontSize="20" fill="#dfe8f5">{opp.toUpperCase()}</text>
      <text x="190" y="140" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="3" fill="#7fd6ef">OPPONENT DOSSIER</text>
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x="190" y={160 + i * 18} width={200 - (i * 37) % 120} height="6" fill="#dff1ff" opacity="0.35" />)}
      <rect x="72" y="52" width="376" height="3" fill="#7fd6ef" fillOpacity="0.8" className="dyn-scan" style={{ transformOrigin: "260px 52px" } as CSSProperties} />
      {/* draft board */}
      <rect x="540" y="40" width="400" height="250" rx="6" fill="#071626" stroke="#1f3f66" strokeWidth="4" />
      <text x="740" y="74" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" letterSpacing="4" fill={A}>DRAFT PLAN · {short(env.team).toUpperCase() || "US"}</text>
      {(["TOP", "JNG", "MID", "BOT", "SUP"] as const).map((r, i) => <g key={r}><rect x={562 + i * 74} y="92" width="62" height="150" rx="4" fill="#0b1727" stroke={A} strokeOpacity="0.4" /><text x={593 + i * 74} y="112" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="2" fill={A}>{r}</text><circle cx={593 + i * 74} cy="160" r="20" fill={A} fillOpacity="0.15" stroke={A} strokeOpacity="0.5" /><rect x={570 + i * 74} y="200" width="46" height="5" fill="#dff1ff" opacity="0.35" /><rect x={570 + i * 74} y="212" width="30" height="5" fill="#dff1ff" opacity="0.25" /></g>)}
      <text x="740" y="270" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="3" fill="#dfe8f5" fillOpacity="0.5">FEARLESS · NO REPEATS</text>
      {/* cork board */}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={480 + (i % 2) * 2} y={60 + i * 55} width="44" height="40" rx="2" fill="#f5ecd3" opacity="0.12" transform={`rotate(${i % 2 ? 5 : -4} ${502} ${80 + i * 55})`} />)}
      {/* lamp cone + table */}
      <path d="M470 0 L300 600 L700 600 L530 0 Z" fill="url(#wr4-cone)" />
      <ellipse cx="500" cy="480" rx="340" ry="92" fill="#0b1727" stroke="#223755" />
      <ellipse cx="500" cy="470" rx="310" ry="72" fill="url(#wr4-table)" /><ellipse cx="500" cy="470" rx="310" ry="72" fill="url(#wr4-grid)" opacity="0.6" />
      <path d="M260 500 L740 440" stroke="#6fd0a6" strokeOpacity="0.5" strokeWidth="2" /><path d="M300 440 L700 500" stroke="#6fd0a6" strokeOpacity="0.3" strokeWidth="2" />
      <ellipse cx="500" cy="470" rx="150" ry="36" fill="none" stroke={A} strokeOpacity="0.6" />
      <circle cx="500" cy="470" r="30" fill="none" stroke="#b39cff" strokeWidth="2" strokeDasharray="4 6" className="dyn-rotate" style={{ transformOrigin: "500px 470px" } as CSSProperties} />
      {[[420, 455], [500, 440], [580, 455], [460, 492], [540, 492]].map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="7" fill={A} /><circle cx={x} cy={y} r="12" fill="none" stroke={A} strokeOpacity="0.5" /></g>)}
      {[[380, 500], [620, 500], [500, 505]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7" fill="#e0777c" fillOpacity="0.85" />)}
      {/* coach standing, chairs */}
      <g fill="#05090f"><circle cx="840" cy="300" r="16" /><path d="M818 318 L862 318 L870 420 L810 420 Z" /><path d="M862 330 L905 360" stroke="#05090f" strokeWidth="10" strokeLinecap="round" /></g>
      {[250, 750].map((x) => <path key={x} d={`M${x - 30} 600 L${x - 24} 520 Q${x} 505 ${x + 24} 520 L${x + 30} 600 Z`} fill="#05090f" />)}
    </svg>
  );
}

/* ───────────────────────────── Arena tunnel */

export function TunnelScene({ env, walking = true }: { env: EnvState; walking?: boolean }) {
  const A = env.accent ?? G;
  const roster = env.roster ?? [];
  const rim = env.variant === "finals" ? "#c9a7ff" : env.variant === "elimination" ? "#ff6b7a" : G;
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <radialGradient id="tn4-light" cx="50%" cy="42%" r="30%"><stop offset="0" stopColor="#fff3c4" stopOpacity="1" /><stop offset="0.5" stopColor={rim} stopOpacity="0.35" /><stop offset="1" stopColor={rim} stopOpacity="0" /></radialGradient>
        <linearGradient id="tn4-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a0f18" /><stop offset="1" stopColor="#03060b" /></linearGradient>
      </defs>
      <rect width="1000" height="600" fill="#04070d" />
      <rect width="1000" height="600" fill="url(#tn4-light)" />
      {/* ribbed corridor */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const k = 1 - i * 0.115;
        const x = 500 - 480 * k, y = 250 - 230 * k, w = 960 * k, h = 460 * k;
        return <g key={i}>
          <rect x={x} y={y} width={w} height={h} fill="none" stroke={rim} strokeOpacity={0.05 + i * 0.03} strokeWidth="1.5" />
          <rect x={x} y={y} width={12 * k + 2} height={h} fill={rim} opacity={0.1 + i * 0.03} /><rect x={x + w - 12 * k - 2} y={y} width={12 * k + 2} height={h} fill={rim} opacity={0.1 + i * 0.03} />
          <rect x={x} y={y} width={w} height={6 * k + 1} fill="#ffd27a" opacity={0.08 + i * 0.03} />
        </g>;
      })}
      <path d="M20 20 L500 250 M980 20 L500 250 M20 480 L500 250 M980 480 L500 250" stroke={rim} strokeOpacity="0.14" strokeWidth="1" />
      {/* floor with light strips */}
      <path d="M0 600 L0 480 L500 250 L1000 480 L1000 600 Z" fill="url(#tn4-floor)" />
      <path d="M120 600 L500 250 M880 600 L500 250" stroke={rim} strokeOpacity="0.35" strokeWidth="2" />
      {/* stage mouth: crowd silhouettes + phone lights + opponent board */}
      <path d="M380 210 Q500 180 620 210 L620 240 Q500 215 380 240 Z" fill="#070b12" />
      {Array.from({ length: 30 }, (_, i) => <circle key={i} cx={385 + i * 8} cy={224 - Math.sin((i / 30) * Math.PI) * 10} r="1" fill="#fff" opacity={0.3 + ((i * 13) % 60) / 100} className="dyn-twinkle" style={{ "--i": i } as CSSProperties} />)}
      <rect x="440" y="150" width="120" height="30" rx="2" fill="#0b2340" stroke={rim} strokeOpacity="0.6" />
      <text x="500" y="170" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="13" fill={rim}>{short(env.team).toUpperCase() || "US"} · VS · {short(env.opp).toUpperCase() || "THEM"}</text>
      {/* flight cases + cables */}
      <rect x="40" y="430" width="120" height="110" rx="6" fill="#0b1727" stroke={G} strokeOpacity="0.2" /><rect x="40" y="470" width="120" height="5" fill="#1a2740" />
      <rect x="840" y="440" width="120" height="100" rx="6" fill="#0b1727" stroke={G} strokeOpacity="0.2" />
      <path d="M160 540 C300 560 400 520 520 560 C640 600 760 540 840 560" fill="none" stroke="#111a2a" strokeWidth="4" />
      {/* the five, walking out */}
      <g className={walking ? "dyn-walk" : undefined}>
        {[0, 1, 2, 3, 4].map((i) => {
          const p = roster[i];
          const x = 330 + i * 85, d = Math.abs(i - 2);
          return <Walker key={i} x={x} y={300 + d * 20} s={0.9 - d * 0.08} accent={A} name={short(p?.name) || ROLE_SHORT[(["top", "jng", "mid", "bot", "sup"] as Role[])[i]]} role={p ? ROLE_SHORT[p.role] : undefined} i={i} />;
        })}
      </g>
    </svg>
  );
}

/* ───────────────────────────── Worlds stadium */

export function StadiumScene({ env, motion }: { env: EnvState; motion: boolean }) {
  const A = env.accent ?? G;
  const variant = env.variant ?? "normal";
  const rim = variant === "elimination" ? "#ff6b7a" : variant === "finals" ? "#c9a7ff" : "#f6dd8f";
  const lead = env.lead ?? 0;
  const floor = lead > 0 ? A : lead < 0 ? "#ff6b7a" : "#dfe8f5";
  const crowd = Math.min(1, 0.35 + Math.abs(lead) * 0.12 + (variant === "finals" ? 0.25 : variant === "elimination" ? 0.12 : 0));
  const beams = variant === "finals" ? [80, 220, 360, 500, 640, 780, 920] : [140, 320, 500, 680, 860];
  const roster = env.roster ?? [];
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full" style={{ "--crowd": crowd } as CSSProperties} data-variant={variant}>
      <defs>
        <linearGradient id="st4-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={rim} stopOpacity="0.26" /><stop offset="1" stopColor={rim} stopOpacity="0" /></linearGradient>
        <linearGradient id="st4-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#03060d" /><stop offset="1" stopColor="#0a1426" /></linearGradient>
        <linearGradient id="st4-screen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0b2340" /><stop offset="0.5" stopColor="#163a66" /><stop offset="1" stopColor="#0b2340" /></linearGradient>
        <linearGradient id="st4-stage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#18263f" /><stop offset="1" stopColor="#070d18" /></linearGradient>
        <radialGradient id="st4-haze" cx="50%" cy="25%" r="70%"><stop offset="0" stopColor={rim} stopOpacity="0.18" /><stop offset="1" stopColor={rim} stopOpacity="0" /></radialGradient>
        <radialGradient id="st4-floor" cx="50%" cy="100%" r="60%"><stop offset="0" stopColor={floor} stopOpacity="0.35" /><stop offset="1" stopColor={floor} stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#st4-sky)" /><rect width="1000" height="600" fill="url(#st4-haze)" />
      {/* roof trusses */}
      <path d={Array.from({ length: 25 }, (_, i) => `${i === 0 ? "M" : "L"}${i * 42} 8 L${21 + i * 42} 34`).join(" ")} fill="none" stroke="#1f3558" strokeWidth="1.5" />
      {/* audience: three tiers of seat rows */}
      {[0, 1, 2].map((tier) => (
        <g key={tier}>
          <path d={`M0 ${100 + tier * 75} Q500 ${30 + tier * 75} 1000 ${100 + tier * 75} L1000 ${165 + tier * 75} Q500 ${95 + tier * 75} 0 ${165 + tier * 75} Z`} fill={["#060c17", "#091221", "#0c172a"][tier]} />
          {Array.from({ length: 4 }, (_, row) => Array.from({ length: 60 }, (_, i) => { const x = i * 16.8 + row * 4 + tier * 3; const y = 112 + tier * 75 + row * 13 - Math.sin((x / 1000) * Math.PI) * 60; return <rect key={`${row}-${i}`} x={x} y={y} width="9" height="7" rx="1.5" fill={["#0d1a2e", "#101f36", "#13243c"][tier]} />; }))}
          {Array.from({ length: 34 }, (_, i) => { const x = (i * 29.4 + tier * 11) % 1000; const y = 118 + tier * 75 + ((i * 7) % 40) - Math.sin((x / 1000) * Math.PI) * 60; return <circle key={i} cx={x} cy={y} r="1.5" fill="#fff" className="dyn-phone" style={{ "--i": i } as CSSProperties} />; })}
        </g>
      ))}
      {/* rigs + beams */}
      <rect x="30" y="12" width="940" height="8" fill="#0b1727" stroke={G} strokeOpacity="0.4" />
      {beams.map((x, i) => <g key={x} className={motion ? "dyn-beam" : undefined} style={{ "--i": i } as CSSProperties}><rect x={x - 9} y="20" width="18" height="18" rx="3" fill="#121f36" stroke="#2a4066" /><circle cx={x} cy="40" r="6" fill={rim} /><path d={`M${x - 10} 44 L${x - 150} 600 L${x + 150} 600 L${x + 10} 44 Z`} fill="url(#st4-beam)" /></g>)}
      {/* camera crane */}
      <path d="M40 330 L200 260 L205 266 L45 336 Z" fill="#0b1221" /><rect x="190" y="248" width="22" height="16" rx="2" fill="#0b1221" /><circle cx="214" cy="256" r="3" fill="#ff5d6c" className="dyn-phone" />
      {/* screens */}
      <rect x="30" y="245" width="210" height="125" rx="4" fill="url(#st4-screen)" stroke={rim} strokeOpacity="0.5" />
      <rect x="760" y="245" width="210" height="125" rx="4" fill="url(#st4-screen)" stroke={rim} strokeOpacity="0.5" />
      <path d="M135 275 L170 295 V335 L135 355 L100 335 V295 Z" fill="#0b1727" stroke={A} strokeWidth="2" /><text x="135" y="322" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="18" fill="#f5ecd3">{env.mono ?? "WD"}</text>
      <path d="M865 275 L900 295 V335 L865 355 L830 335 V295 Z" fill="#0b1727" stroke="#9fb0c8" strokeWidth="2" /><text x="865" y="322" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="18" fill="#dfe8f5">{short(env.opp).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "??"}</text>
      <rect x="280" y="225" width="440" height="160" rx="5" fill="url(#st4-screen)" stroke={rim} strokeOpacity="0.7" strokeWidth="2" />
      <text x="500" y="262" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="13" letterSpacing="6" fill={rim} fillOpacity="0.9">{variant === "finals" ? "WORLDS FINAL" : variant === "elimination" ? "ELIMINATION" : env.live ? "LIVE" : "WORLDS DYNASTY"}</text>
      <text x="395" y="312" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="26" fill="#f5ecd3">{(short(env.team) || "US").toUpperCase().slice(0, 12)}</text>
      <text x="500" y="314" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="900" fontSize="30" fill={rim}>{env.score ?? "VS"}</text>
      <text x="605" y="312" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="26" fill="#dfe8f5">{(short(env.opp) || "THEM").toUpperCase().slice(0, 12)}</text>
      <text x="500" y="350" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="12" letterSpacing="4" fill="#dff1ff" fillOpacity="0.6">{(env.stageLabel ?? "BEST OF FIVE · FEARLESS").toUpperCase()}</text>
      <rect x="300" y="362" width="400" height="6" fill="#0b1727" /><rect x={500 - Math.min(4, Math.max(-4, lead)) * 0 + (lead < 0 ? 500 + lead * 50 : 500) - 300} y="362" width={Math.abs(lead) * 50} height="6" fill={floor} fillOpacity="0.9" transform={`translate(${lead >= 0 ? 300 : 0} 0)`} />
      {variant === "finals" ? [60, 940].map((x) => <g key={x}>{[0, 1, 2, 3].map((i) => <path key={i} d={`M${x - 70 + i * 40} 50 h22 v70 l-11 10 l-11 -10 Z`} fill={i % 2 ? "#c9a7ff" : G} fillOpacity="0.4" />)}</g>) : null}
      {/* stage */}
      <path d="M90 430 L910 430 L1000 600 L0 600 Z" fill="url(#st4-stage)" />
      <rect x="0" y="430" width="1000" height="170" fill="url(#st4-floor)" />
      <path d="M90 430 L910 430" stroke={floor} strokeOpacity="0.9" strokeWidth="3" /><path d="M90 432 L910 432" stroke={floor} strokeOpacity="0.3" strokeWidth="12" />
      {[255, 745].map((cx, side) => (
        <g key={cx}>
          <path d={`M${cx - 175} 452 L${cx + 175} 452 L${cx + 195} 494 L${cx - 195} 494 Z`} fill="#0d1a2c" stroke="#2a4066" />
          {[-124, -62, 0, 62, 124].map((dx, i) => (
            <g key={dx}>
              <rect x={cx + dx - 22} y="416" width="44" height="28" rx="3" fill="#0a1424" stroke="#2a4066" /><rect x={cx + dx - 18} y="420" width="36" height="20" fill={side === 0 ? A : "#7fd6ef"} fillOpacity="0.55" className="dyn-screen" style={{ "--i": i + side * 5 } as CSSProperties} />
              <Seated x={cx + dx} y={478} s={0.5} accent={side === 0 ? A : "#9fb0c8"} name={side === 0 ? short(roster[i]?.name) : undefined} />
            </g>
          ))}
        </g>
      ))}
      {variant === "finals" ? [150, 850].map((x) => <g key={x} className="dyn-pyro"><path d={`M${x} 430 L${x - 14} 380 L${x} 300 L${x + 14} 380 Z`} fill="#fff1b8" fillOpacity="0.8" /><path d={`M${x} 430 L${x - 6} 390 L${x} 340 L${x + 6} 390 Z`} fill="#ffd27a" /></g>) : null}
      {/* front row */}
      <path d="M0 600 L0 572 Q500 536 1000 572 L1000 600 Z" fill="#03070d" />
      {Array.from({ length: 34 }, (_, i) => <circle key={i} cx={i * 30 + 10} cy={576 - Math.sin((i / 34) * Math.PI) * 10} r="9" fill="#03070d" />)}
    </svg>
  );
}

/* ───────────────────────────── Trophy hall */

export function TrophyHall({ env, champion }: { env: EnvState; champion: boolean }) {
  const A = env.accent ?? G;
  const roster = env.roster ?? [];
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs><linearGradient id="th4-cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" stopOpacity={champion ? 0.45 : 0.15} /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></linearGradient><linearGradient id="th4-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff1b8" /><stop offset="0.5" stopColor={G} /><stop offset="1" stopColor="#8a6a1f" /></linearGradient></defs>
      <rect width="1000" height="600" fill="#04070e" />
      <rect x="0" y="40" width="1000" height="300" fill="#0a1222" opacity="0.6" />
      <path d="M470 0 L250 600 L750 600 L530 0 Z" fill="url(#th4-cone)" />
      {/* legacy frames with roster plaques */}
      {roster.slice(0, 5).map((p, i) => { const x = 70 + i * 185; return <g key={i}><rect x={x} y="90" width="110" height="140" rx="3" fill="#0b1727" stroke={G} strokeOpacity="0.4" /><rect x={x + 10} y="100" width="90" height="95" fill="#0f1b2f" /><circle cx={x + 55} cy="135" r="20" fill="#13223a" /><path d={`M${x + 25} 195 C${x + 25} 160 ${x + 85} 160 ${x + 85} 195 Z`} fill="#13223a" /><rect x={x + 15} y="202" width="80" height="22" rx="2" fill={A} fillOpacity="0.2" /><text x={x + 55} y="217" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" letterSpacing="2" fill="#f5ecd3">{short(p.name).toUpperCase()}</text></g>; })}
      <path d="M380 40 H620 V120 L500 150 L380 120 Z" fill="#0b1727" stroke={A} strokeOpacity="0.6" strokeWidth="2" /><text x="500" y="96" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="700" fontSize="34" fill="#f5ecd3">{env.mono ?? "WD"}</text>
      {/* pedestal + cup */}
      <ellipse cx="500" cy="560" rx="220" ry="30" fill={G} fillOpacity={champion ? 0.18 : 0.06} />
      <path d="M400 470 L600 470 L620 560 L380 560 Z" fill="#0b1727" stroke={G} strokeOpacity="0.5" /><rect x="420" y="486" width="160" height="6" fill={G} fillOpacity="0.4" />
      {champion ? <g className="dyn-cup"><path d="M455 330 L545 330 L537 410 C532 436 515 450 500 450 C485 450 468 436 463 410 Z" fill="url(#th4-gold)" /><path d="M455 340 C425 340 420 385 455 395 L460 382 C442 378 442 352 458 352 Z M545 340 C575 340 580 385 545 395 L540 382 C558 378 558 352 542 352 Z" fill="url(#th4-gold)" /><rect x="493" y="450" width="14" height="14" fill="url(#th4-gold)" /><path d="M470 464 L530 464 L540 476 L460 476 Z" fill="url(#th4-gold)" /><path d="M500 318 L504 328 L514 328 L506 334 L509 344 L500 338 L491 344 L494 334 L486 328 L496 328 Z" fill="#fff1b8" /></g> : <path d="M470 380 L530 380 L525 440 L475 440 Z" fill="#1a2740" opacity="0.6" />}
      {champion ? Array.from({ length: 40 }, (_, i) => <rect key={i} x={(i * 97) % 1000} y={560 + ((i * 13) % 30)} width="6" height="3" fill={i % 3 ? G : A} opacity="0.7" transform={`rotate(${(i * 37) % 90} ${(i * 97) % 1000} ${560 + ((i * 13) % 30)})`} />) : null}
    </svg>
  );
}
