/**
 * VIS-F4 — the Baron hero pit. An original 1000×500 composition of the pit at
 * the top of the river on Summoner's Rift: night sky and moon, far jungle,
 * two rock masses with violet rim light, the glowing floor runes, the river
 * at the pit mouth, both teams posturing at the edge, and the Baron rising
 * out of the fog. `intensity` (0 stakes … 3 last question) tightens the loop:
 * the mist breathes faster, the eyes burn larger, the rune pulse quickens,
 * the worm rises higher. `tone` plays one of four outcome cinematics:
 *   great  — the Baron falls, a gold burst and shards, the allies step in
 *   good   — the Baron sinks, calm violet glow
 *   mixed  — the Baron stays, embers, two allies down
 *   bad    — the Baron roars and rears, red eyes, five allies down, a shake
 * No Riot artwork: every shape is drawn here.
 */
import type { CSSProperties } from "react";
import type { ObjectiveOutcome } from "./objectives";

export type BaronTone = ObjectiveOutcome["tone"] | null;

function Team({ x, y, accent, fallen = 0, step = 0, mirror = false }: { x: number; y: number; accent: string; fallen?: number; step?: number; mirror?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) ${mirror ? "scale(-1 1)" : ""}`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const down = i < fallen;
        const dx = i * 26 - step * 10, dy = (i % 2) * 6;
        return (
          <g key={i} transform={`translate(${dx} ${dy}) ${down ? "rotate(80 10 30)" : ""}`} opacity={down ? 0.55 : 1}>
            <circle cx="10" cy="8" r="6" fill="#05090f" />
            <path d="M2 16 L18 16 L20 40 L0 40 Z" fill="#05090f" />
            <path d="M3 18 L17 18 L18 28 L2 28 Z" fill={accent} fillOpacity="0.85" />
            <path d="M18 20 L30 10" stroke="#05090f" strokeWidth="3" strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
}

export function BaronPit({ intensity = 0, tone = null, accent = "#e3c66f" }: { intensity?: number; tone?: BaronTone; accent?: string }) {
  const t = Math.max(0, Math.min(3, intensity));
  const eye = tone === "bad" ? "#ff5d6c" : tone === "great" ? "#f6dd8f" : "#d8c6ff";
  const eyeR = 14 + t * 5 + (tone === "bad" ? 10 : 0);
  const baronClass = tone === "great" ? "dyn-out-fall" : tone === "good" ? "dyn-out-sink" : tone === "bad" ? "dyn-out-roar" : t === 0 ? "dyn-baron-rise" : "dyn-baron-loom";
  const fallen = tone === "bad" ? 5 : tone === "mixed" ? 2 : tone === "good" ? 1 : 0;
  const step = tone === "great" ? 3 : tone === "good" ? 1 : 0;
  return (
    <svg viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid slice" aria-hidden className={tone === "bad" ? "dyn-out-shake" : undefined} style={{ "--tense": t } as CSSProperties} data-intensity={t} data-tone={tone ?? "none"}>
      <defs>
        <linearGradient id="bh-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07061a" /><stop offset="0.6" stopColor="#140d2e" /><stop offset="1" stopColor="#1d1240" /></linearGradient>
        <radialGradient id="bh-floor" cx="50%" cy="85%" r="55%"><stop offset="0" stopColor="#9b7bff" stopOpacity={0.5 + t * 0.12} /><stop offset="0.5" stopColor="#6d3fd1" stopOpacity="0.2" /><stop offset="1" stopColor="#6d3fd1" stopOpacity="0" /></radialGradient>
        <radialGradient id="bh-eye" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={eye} /><stop offset="0.35" stopColor={eye} stopOpacity="0.75" /><stop offset="1" stopColor={eye} stopOpacity="0" /></radialGradient>
        <linearGradient id="bh-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5a4a8c" /><stop offset="0.45" stopColor="#30225a" /><stop offset="1" stopColor="#120c28" /></linearGradient>
        <linearGradient id="bh-rock" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1a1333" /><stop offset="1" stopColor="#09061a" /></linearGradient>
        <linearGradient id="bh-river" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#5cc8ea" stopOpacity="0" /><stop offset="0.5" stopColor="#7fd6ef" stopOpacity="0.6" /><stop offset="1" stopColor="#5cc8ea" stopOpacity="0" /></linearGradient>
        <radialGradient id="bh-moon" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#f5ecd3" /><stop offset="0.7" stopColor="#f5ecd3" stopOpacity="0.9" /><stop offset="1" stopColor="#f5ecd3" stopOpacity="0" /></radialGradient>
        <radialGradient id="bh-burst" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff1b8" /><stop offset="0.4" stopColor="#f6dd8f" stopOpacity="0.6" /><stop offset="1" stopColor="#f6dd8f" stopOpacity="0" /></radialGradient>
      </defs>
      {/* sky, stars, moon */}
      <rect width="1000" height="500" fill="url(#bh-sky)" />
      {Array.from({ length: 40 }, (_, i) => <circle key={i} cx={(i * 211) % 1000} cy={(i * 67) % 170} r={i % 4 ? 1 : 1.8} fill="#fff" opacity={0.2 + ((i * 17) % 50) / 100} />)}
      <circle cx="830" cy="80" r="34" fill="url(#bh-moon)" opacity="0.85" /><circle cx="842" cy="72" r="30" fill="#0b0820" opacity="0.92" />
      {/* rays behind the pit */}
      <g className="dyn-baron-rays" opacity={0.08 + t * 0.03}>{Array.from({ length: 12 }, (_, i) => <path key={i} d="M500 300 L470 -200 L530 -200 Z" fill="#b39cff" transform={`rotate(${i * 30} 500 300)`} />)}</g>
      {/* far jungle */}
      <path d="M0 250 C70 200 140 230 220 190 C280 160 330 200 400 180 L400 500 L0 500 Z" fill="#0b0920" />
      <path d="M1000 240 C930 200 860 230 780 190 C720 160 670 200 600 180 L600 500 L1000 500 Z" fill="#0b0920" />
      {[120, 300, 700, 880].map((x, i) => <g key={x} fill="#07061a"><rect x={x - 5} y="120" width="10" height="120" /><path d={`M${x - 50} 160 L${x} 80 L${x + 50} 160 Z`} /><path d={`M${x - 62} 210 L${x} 125 L${x + 62} 210 Z`} opacity={0.9 - (i % 2) * 0.1} /></g>)}
      <rect x="0" y="230" width="1000" height="80" fill="#8b5cf6" opacity={0.05 + t * 0.02} />
      {/* rock masses with rim light */}
      <path d="M0 500 L0 300 C40 280 90 300 120 250 C160 190 230 220 260 270 C290 320 240 380 300 420 C330 450 280 500 280 500 Z" fill="url(#bh-rock)" />
      <path d="M120 250 C160 190 230 220 260 270" fill="none" stroke="#b39cff" strokeOpacity="0.45" strokeWidth="2" />
      <path d="M1000 500 L1000 300 C960 280 910 300 880 250 C840 190 770 220 740 270 C710 320 760 380 700 420 C670 450 720 500 720 500 Z" fill="url(#bh-rock)" />
      <path d="M880 250 C840 190 770 220 740 270" fill="none" stroke="#b39cff" strokeOpacity="0.45" strokeWidth="2" />
      {/* pit floor, runes, river */}
      <ellipse cx="500" cy="400" rx="300" ry="70" fill="#120c28" />
      <ellipse cx="500" cy="400" rx="300" ry="70" fill="url(#bh-floor)" />
      <g className="dyn-baron-pulse"><ellipse cx="500" cy="405" rx="200" ry="42" fill="none" stroke="#c4b5fd" strokeOpacity="0.6" strokeWidth="2" strokeDasharray="10 12" /><ellipse cx="500" cy="408" rx="120" ry="24" fill="none" stroke="#e9ddff" strokeOpacity="0.7" strokeWidth="1.5" /></g>
      {[-90, -45, 0, 45, 90].map((dx) => <path key={dx} d={`M${500 + dx - 5} 422 L${500 + dx} 410 L${500 + dx + 5} 422 Z`} fill="#c4b5fd" fillOpacity="0.8" />)}
      <path d="M0 485 C250 455 450 470 1000 455" stroke="url(#bh-river)" strokeWidth="4" fill="none" />
      <path d="M60 492 C250 466 450 480 940 464" stroke="url(#bh-river)" strokeWidth="1.5" fill="none" opacity="0.6" />
      {/* the Baron */}
      <g className={baronClass}>
        <path d="M250 405 C270 320 350 310 380 360 C400 400 450 400 460 350" fill="none" stroke="url(#bh-body)" strokeWidth="52" strokeLinecap="round" />
        <path d="M750 405 C730 320 650 310 620 360 C600 400 550 400 540 350" fill="none" stroke="url(#bh-body)" strokeWidth="52" strokeLinecap="round" />
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M${292 + i * 36} ${372 - i * 18} l-6 -22 l16 10 Z M${708 - i * 36} ${372 - i * 18} l6 -22 l-16 10 Z`} fill="#4a3a7a" />)}
        <path d="M430 410 C440 280 460 190 500 140 C540 190 560 280 570 410 Z" fill="url(#bh-body)" />
        <path d="M448 180 C462 118 538 118 552 180 C568 228 562 270 500 278 C438 270 432 228 448 180 Z" fill="#33255f" stroke="#c4b5fd" strokeOpacity="0.5" strokeWidth="2.5" />
        {[0, 1, 2, 3, 4].map((i) => <g key={i}><path d={`M${470 - i * 10} ${182 - i * 6} L${420 - i * 30} ${92 - i * 22} L${462 - i * 7} ${170 - i * 3} Z`} fill="#3d2d6b" stroke="#c4b5fd" strokeOpacity="0.4" /><path d={`M${530 + i * 10} ${182 - i * 6} L${580 + i * 30} ${92 - i * 22} L${538 + i * 7} ${170 - i * 3} Z`} fill="#3d2d6b" stroke="#c4b5fd" strokeOpacity="0.4" /></g>)}
        <path d="M468 258 L450 302 L482 272 Z" fill="#3d2d6b" /><path d="M532 258 L550 302 L518 272 Z" fill="#3d2d6b" />
        <path d="M480 262 L520 262 L512 274 L488 274 Z" fill="#1a1333" />
        <g className="dyn-baron-eye">
          <circle cx="478" cy="212" r={eyeR} fill="url(#bh-eye)" /><circle cx="522" cy="212" r={eyeR} fill="url(#bh-eye)" />
          <path d="M462 212 Q478 202 494 212 Q478 222 462 212 Z" fill={eye} /><path d="M506 212 Q522 202 538 212 Q522 222 506 212 Z" fill={eye} />
          <circle cx="500" cy="238" r={6 + t} fill={eye} fillOpacity="0.9" />
        </g>
        {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${492} ${292 + i * 18} L500 ${278 + i * 18} L${508} ${292 + i * 18} Z`} fill="#6a5aa0" />)}
      </g>
      {/* mist */}
      <g className="dyn-baron-mist" opacity={0.5 + t * 0.12}>{[0, 1, 2, 3, 4, 5].map((i) => <ellipse key={i} cx={240 + i * 105} cy={430 + (i % 2) * 14} rx="90" ry="22" fill="#b39cff" fillOpacity="0.14" />)}</g>
      {/* outcome effects */}
      {tone === "great" ? <><circle cx="500" cy="260" r="160" fill="url(#bh-burst)" className="dyn-out-burst" />{Array.from({ length: 14 }, (_, i) => <path key={i} d="M500 260 l-6 -16 l12 0 Z" fill="#fff1b8" className="dyn-out-shard" style={{ "--i": i, "--dx": `${Math.cos((i / 14) * Math.PI * 2) * 180}px`, "--dy": `${Math.sin((i / 14) * Math.PI * 2) * 120 - 40}px`, "--r": `${i * 40}deg` } as CSSProperties} />)}</> : null}
      {tone === "mixed" ? Array.from({ length: 10 }, (_, i) => <circle key={i} cx={320 + i * 40} cy={420} r="2.6" fill="#fbbf24" className="dyn-out-ember" style={{ "--i": i } as CSSProperties} />) : null}
      {tone === "bad" ? <rect width="1000" height="500" fill="#ff3b4e" opacity="0.14" /> : null}
      {/* both teams at the pit edge */}
      <Team x={60} y={440} accent={accent} fallen={fallen} step={step} />
      <Team x={940} y={440} accent="#9fb0c8" fallen={tone === "great" ? 4 : tone === "good" ? 2 : 0} mirror />
      {/* foreground brush */}
      <g fill="#05040f"><ellipse cx="40" cy="500" rx="110" ry="40" /><ellipse cx="150" cy="505" rx="70" ry="28" /><ellipse cx="960" cy="500" rx="110" ry="40" /><ellipse cx="850" cy="505" rx="70" ry="28" /></g>
    </svg>
  );
}
