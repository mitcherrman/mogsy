/**
 * MC-UX1 — each bonus game's decorative preview, drawn from its own mechanic.
 *
 * Static SVG compositions plus a few of Mogzy's real assets (rune, item,
 * champion and role icons). Purely decorative: `aria-hidden`, no question
 * content, no answers — a recipe preview shows components, never a real
 * item's recipe; a draft preview seats no historical draft.
 *
 * GEOMETRY. Every composition is drawn on one 240×100 canvas whose CORE is the
 * centred 100×100 square (x 70–170). The canvas always fills the art box's
 * height and is centred horizontally, so a wide card shows the whole scene and
 * a square phone thumbnail shows exactly the core. Anything that must read at
 * thumbnail size lives in the core; the sides are atmosphere.
 *
 * MOTION. Hover/focus on the card animates one element per scene (gallery.css,
 * `.mc-anim-*`). Reduced motion turns all of it off.
 */
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { RUNE_TREE_HUE, RuneTreeGlyph } from "@/components/match-grid/RuneTreeGlyph";
import { resolveAssetUrl } from "@/hooks/useChampionAssets";
import type { PublicModeId } from "@/lib/public-modes/contracts";
import { MODE_ACCENT } from "@/lib/public-modes/gallery";
import { cn } from "@/lib/utils";


const GOLD = "#f0d78c";
const INK = "#efe8d6";
const NAVY = "#0a1626";

const backend = (path: string) => resolveAssetUrl(path) ?? "";

/** An image on the canvas, in canvas units (x, y, size of a square). */
function Pic({ src, x, y, s, className, round = false, style }: {
  src: string; x: number; y: number; s: number; className?: string; round?: boolean; style?: CSSProperties;
}) {
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cn("mc-art-pic", round && "rounded-full", className)}
      style={{ left: `${x / 2.4}%`, top: `${y}%`, width: `${s / 2.4}%`, height: `${s}%`, ...style }}
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
    />
  );
}

function Scene({ children, pics }: { children: ReactNode; pics?: ReactNode }) {
  return (
    <div className="mc-art-canvas">
      <svg viewBox="0 0 240 100" className="absolute inset-0 h-full w-full" focusable="false">
        {children}
      </svg>
      {pics}
    </div>
  );
}

// ── Daily Extras ─────────────────────────────────────────────────────────────

function TimeTrialArt() {
  const ticks = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <Scene>
      {[0, 1, 2].map((i) => (
        <g key={i} opacity={0.35 - i * 0.09} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1={40 - i * 8} y1={38 + i * 12} x2={66 - i * 8} y2={38 + i * 12} />
          <line x1={174 + i * 8} y1={38 + i * 12} x2={200 + i * 8} y2={38 + i * 12} />
        </g>
      ))}
      <rect x="113" y="9" width="14" height="7" rx="2" fill={GOLD} opacity="0.9" />
      <rect x="117" y="15" width="6" height="5" fill={GOLD} opacity="0.7" />
      <circle cx="120" cy="56" r="36" fill={NAVY} stroke={GOLD} strokeWidth="2.5" />
      <circle cx="120" cy="56" r="30" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="6" />
      {/* three quarters of the clock still to run */}
      <circle cx="120" cy="56" r="30" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${2 * Math.PI * 30 * 0.75} 999`} transform="rotate(-90 120 56)" />
      {ticks.map((a) => (
        <line key={a} x1="120" y1="31" x2="120" y2={a % 90 === 0 ? 36 : 34} stroke={INK} strokeOpacity="0.7"
          strokeWidth="1.4" transform={`rotate(${a} 120 56)`} />
      ))}
      <g className="mc-anim-spin" style={{ transformOrigin: "120px 56px" }}>
        <line x1="120" y1="56" x2="120" y2="33" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <circle cx="120" cy="56" r="3.4" fill={GOLD} />
      <text x="120" y="76" textAnchor="middle" fontSize="9" fontWeight="700" fill={INK} letterSpacing="1">90s</text>
    </Scene>
  );
}

function SurvivalArt() {
  const shield = "M0 -17 L15 -11 L13 6 Q8 15 0 19 Q-8 15 -13 6 L-15 -11 Z";
  return (
    <Scene>
      {[44, 196].map((x) => (
        <path key={x} d={shield} transform={`translate(${x} 52) scale(0.8)`} fill="none" stroke="currentColor"
          strokeOpacity="0.18" strokeWidth="2" />
      ))}
      {[90, 120].map((x) => (
        <g key={x} transform={`translate(${x} 50)`}>
          <path d={shield} fill="currentColor" fillOpacity="0.9" stroke={GOLD} strokeWidth="1.6" />
          <path d="M-8 -8 L8 -8" stroke={INK} strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <g transform="translate(150 50)" className="mc-anim-shake">
        <path d={shield} fill={NAVY} stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.6" strokeDasharray="3 2" />
        <path d="M-3 -16 L2 -4 L-4 4 L3 17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <g fill={INK} fontSize="8" fontWeight="700" textAnchor="middle" opacity="0.8" letterSpacing="1.5">
        <text x="120" y="88">3 STRIKES</text>
      </g>
    </Scene>
  );
}

// ── Knowledge Arena ──────────────────────────────────────────────────────────

const ROLES = ["top", "jungle", "mid", "bot", "support"] as const;
const roleIcon = (r: (typeof ROLES)[number]) => `/assets/ranked/mogzy-role-icons/${r}.svg`;

function RosterLockArt() {
  return (
    <Scene pics={ROLES.map((r, i) => (
      <Pic key={r} src={roleIcon(r)} x={73 + i * 20} y={62} s={12} className="opacity-90" />
    ))}>
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i < 2 ? 18 + i * 22 : 182 + (i - 2) * 22} y={50} width="16" height="22" rx="3"
          fill="currentColor" fillOpacity="0.08" stroke="currentColor" strokeOpacity="0.22" />
      ))}
      {/* the lock over the five seats */}
      <g transform="translate(120 24)">
        <path d="M-7 0 V-5 A7 7 0 0 1 7 -5 V0" fill="none" stroke={GOLD} strokeWidth="2.4" className="mc-anim-lift" />
        <rect x="-10" y="-1" width="20" height="15" rx="3" fill={GOLD} />
        <circle cx="0" cy="5" r="2.2" fill={NAVY} />
      </g>
      {ROLES.map((r, i) => (
        <g key={r}>
          <rect x={71 + i * 20} y="45" width="16" height="36" rx="3" fill={NAVY} stroke="currentColor"
            strokeOpacity={i === 2 ? 1 : 0.55} strokeWidth={i === 2 ? 1.8 : 1.2} />
          <rect x={74 + i * 20} y="49" width="10" height="9" rx="4.5" fill="currentColor" fillOpacity={i < 3 ? 0.85 : 0.25} />
        </g>
      ))}
      <line x1="66" y1="88" x2="174" y2="88" stroke={GOLD} strokeOpacity="0.45" />
    </Scene>
  );
}

const CHAMP = (name: string) => backend(`assets/champions/${name}/icon.png`);

function DraftMemoryArt() {
  return (
    <Scene pics={<>
      <Pic src={CHAMP("Ahri")} x={101} y={30} s={38} round className="mc-art-ring mc-anim-lift" />
      <Pic src={CHAMP("Jinx")} x={74.5} y={10.5} s={14} />
      <Pic src={CHAMP("Thresh")} x={74.5} y={27.5} s={14} />
    </>}>
      {/* the two draft sides: blue picks left, red picks right */}
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x="73.5" y={9.5 + i * 17} width="16" height="16" rx="2" fill={NAVY}
            stroke="#5ab8ee" strokeOpacity={i < 2 ? 0.9 : 0.45} />
          <rect x="150.5" y={9.5 + i * 17} width="16" height="16" rx="2" fill="#e05a5a" fillOpacity="0.1"
            stroke="#e05a5a" strokeOpacity="0.45" />
        </g>
      ))}
      {[2, 3, 4].map((i) => (
        <text key={i} x="81.5" y={21 + i * 17} textAnchor="middle" fontSize="9" fontWeight="700" fill="#5ab8ee" opacity="0.7">?</text>
      ))}
      <circle cx="120" cy="49" r="21" fill={NAVY} stroke={GOLD} strokeWidth="2" />
      <circle cx="120" cy="49" r="25" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeDasharray="2 3" />
      <path d="M96 49 H92" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M95 46 L91.5 49 L95 52" fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={22 + (i % 2) * 22} y={14 + i * 14} width="18" height="10" rx="2" fill="#5ab8ee" fillOpacity="0.08" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={180 + (i % 2) * 22} y={14 + i * 14} width="18" height="10" rx="2" fill="#e05a5a" fillOpacity="0.08" />
      ))}
    </Scene>
  );
}

function ChronoscopeArt() {
  const waves = Array.from({ length: 13 }, (_, i) => 24 + i * 16);
  return (
    <Scene pics={<>
      <Pic src={backend("assets/minions/caster.png")} x={78} y={36} s={14} round className="opacity-80" />
      <Pic src={backend("assets/minions/melee.png")} x={146} y={36} s={14} round className="opacity-80" />
    </>}>
      <line x1="16" y1="66" x2="224" y2="66" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2" />
      {waves.map((x, i) => (
        <g key={x}>
          <line x1={x} y1="60" x2={x} y2="72" stroke={INK} strokeOpacity={i % 3 === 0 ? 0.6 : 0.3} strokeWidth="1.4" />
          <circle cx={x} cy="66" r={i === 6 ? 0 : 2} fill="currentColor" fillOpacity="0.55" />
        </g>
      ))}
      {/* the scrubber, stopped on a wave */}
      <g className="mc-anim-slide">
        <line x1="120" y1="20" x2="120" y2="78" stroke={GOLD} strokeWidth="2" />
        <path d="M120 58 L127 66 L120 74 L113 66 Z" fill={GOLD} stroke={NAVY} strokeWidth="1.2" />
        <rect x="104" y="12" width="32" height="14" rx="7" fill={GOLD} />
        <text x="120" y="22" textAnchor="middle" fontSize="8.5" fontWeight="800" fill={NAVY}>WAVE</text>
      </g>
      {/* the lane's XP, filling wave by wave */}
      <rect x="40" y="84" width="160" height="5" rx="2.5" fill="currentColor" fillOpacity="0.15" />
      <rect x="40" y="84" width="80" height="5" rx="2.5" fill="currentColor" fillOpacity="0.85" />
    </Scene>
  );
}

/** Rune-tree colours: the Match Grid board's own seal hues. */
const treeColor = (glyph: string) => `hsl(${RUNE_TREE_HUE[glyph]} 62% 64%)`;
const TREE = {
  precision: treeColor("precision"), domination: treeColor("domination"), sorcery: treeColor("sorcery"),
  resolve: treeColor("resolve"), inspiration: treeColor("inspiration"),
};

function MatchGridArt() {
  const rune = (n: string) => backend(`assets/runes/${n}.png`);
  const cols = [
    { x: 86, c: TREE.precision, g: "precision" }, { x: 120, c: TREE.domination, g: "domination" },
    { x: 154, c: TREE.sorcery, g: "sorcery" },
  ];
  return (
    <Scene pics={<>
      <Pic src={rune("Conqueror")} x={74} y={34} s={24} />
      <Pic src={rune("Electrocute")} x={108} y={34} s={24} />
      <Pic src={rune("Arcane_Comet")} x={130} y={62} s={24} className="mc-anim-lift" />
    </>}>
      {cols.map(({ x, c, g }) => (
        <g key={x}>
          <rect x={x - 15} y="28" width="30" height="66" rx="4" fill={c} fillOpacity="0.07" stroke={c} strokeOpacity="0.4" />
          <circle cx={x} cy="15" r="10" fill={NAVY} stroke={c} strokeWidth="1.8" />
          {/* the board's own seal face for the tree */}
          <svg x={x - 6.5} y="8.5" width="13" height="13" viewBox="0 0 64 64" style={{ color: c }}>
            <RuneTreeGlyph glyph={g} />
          </svg>
        </g>
      ))}
      {/* the empty seat the third rune is headed for */}
      <rect x="143" y="34" width="22" height="22" rx="11" fill="none" stroke={TREE.sorcery} strokeDasharray="3 2.5" />
      {[[30, 30, TREE.resolve], [48, 64, TREE.inspiration], [200, 34, TREE.resolve], [214, 70, TREE.precision]].map(([x, y, c]) => (
        <circle key={`${x}`} cx={x as number} cy={y as number} r="7" fill="none" stroke={c as string} strokeOpacity="0.35" strokeWidth="1.5" />
      ))}
    </Scene>
  );
}

const ITEM = (id: number) => backend(`assets/items/${id}.png`);

function ReconstructArt() {
  return (
    <Scene pics={<>
      <Pic src={ITEM(1036)} x={77} y={66} s={20} />
      <Pic src={ITEM(1052)} x={110} y={66} s={20} />
      <Pic src={ITEM(1028)} x={143} y={66} s={20} className="mc-anim-lift" />
      <Pic src={ITEM(1018)} x={26} y={40} s={16} className="opacity-35" />
      <Pic src={ITEM(1037)} x={198} y={40} s={16} className="opacity-35" />
    </>}>
      {/* the legendary slot, still to be built */}
      <rect x="104" y="8" width="32" height="32" rx="3" fill={NAVY} stroke={GOLD} strokeWidth="2" />
      <rect x="107" y="11" width="26" height="26" rx="2" fill="currentColor" fillOpacity="0.12" />
      <text x="120" y="30" textAnchor="middle" fontSize="15" fontWeight="800" fill={GOLD}>?</text>
      <path d="M120 40 V52 M87 52 H153 M87 52 V64 M120 52 V64 M153 52 V64" fill="none" stroke="currentColor"
        strokeOpacity="0.75" strokeWidth="1.6" />
      {[87, 120, 153].map((x) => (
        <rect key={x} x={x - 11.5} y="64.5" width="23" height="23" rx="2" fill="none" stroke={GOLD} strokeOpacity="0.8" />
      ))}
      {[24, 196].map((x) => (
        <rect key={x} x={x - 0.5} y="38.5" width="20" height="20" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.25" />
      ))}
    </Scene>
  );
}

function OrderForgeArt() {
  const heights = [18, 28, 38, 50, 62];
  return (
    <Scene>
      {/* sparks off the forge */}
      {[[38, 30], [50, 18], [196, 26], [208, 44], [186, 14]].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y} l3 -3 M${x} ${y} l-3 -3 M${x} ${y} l3 3 M${x} ${y} l-3 3`}
          stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.3" strokeLinecap="round" />
      ))}
      {heights.map((h, i) => {
        const lifted = i === 3;
        return (
          <g key={h} className={lifted ? "mc-anim-settle" : undefined}
            transform={lifted ? "translate(0 -8) rotate(-4 142 60)" : undefined}>
            <rect x={73 + i * 19.5} y={86 - h} width="16" height={h} rx="2.5" fill={i === 4 ? GOLD : "currentColor"}
              fillOpacity={i === 4 ? 0.9 : 0.25 + i * 0.12} stroke={lifted ? GOLD : "none"} strokeWidth="1.4" />
            <text x={81 + i * 19.5} y="83" textAnchor="middle" fontSize="8" fontWeight="800" fill={i >= 3 ? NAVY : INK}>{i + 1}</text>
          </g>
        );
      })}
      <path d="M134 18 L142 10 L150 18" fill="none" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
      <line x1="66" y1="90" x2="174" y2="90" stroke={GOLD} strokeOpacity="0.5" strokeWidth="1.4" />
    </Scene>
  );
}

// ── Precision & Recall ───────────────────────────────────────────────────────

function RangefinderArt() {
  return (
    <Scene>
      {/* the 25-unit ruler */}
      {Array.from({ length: 41 }, (_, i) => 20 + i * 5).map((x, i) => (
        <line key={x} x1={x} y1="92" x2={x} y2={i % 4 === 0 ? 84 : 88} stroke={INK} strokeOpacity={i % 4 === 0 ? 0.5 : 0.25} />
      ))}
      <circle cx="104" cy="48" r="38" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 4" />
      <circle cx="104" cy="48" r="26" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="3 3" />
      <circle cx="104" cy="48" r="13" fill="none" stroke="currentColor" strokeOpacity="0.6" />
      <path d="M104 30 V40 M104 56 V66 M86 48 H96 M112 48 H122" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="104" cy="48" r="2.6" fill={GOLD} />
      {/* the range line out to the target */}
      <line x1="104" y1="48" x2="148" y2="48" stroke={GOLD} strokeWidth="1.6" strokeDasharray="4 2" />
      <g className="mc-anim-pulse" style={{ transformOrigin: "152px 48px" }}>
        <circle cx="152" cy="48" r="8" fill="none" stroke={GOLD} strokeWidth="2" />
        <circle cx="152" cy="48" r="3" fill={GOLD} />
      </g>
      <line x1="152" y1="58" x2="152" y2="84" stroke={GOLD} strokeOpacity="0.6" strokeDasharray="2 2" />
    </Scene>
  );
}

function GlyphPressArt() {
  const letters = ["G", "", "Y", "P", ""];
  return (
    <Scene>
      {/* faint carved letters in the stone */}
      <g fill="currentColor" fillOpacity="0.1" fontSize="22" fontWeight="800" fontFamily="Cinzel, Georgia, serif">
        <text x="22" y="40">A</text><text x="44" y="76">R</text><text x="196" y="44">E</text><text x="210" y="80">K</text>
      </g>
      {letters.map((l, i) => {
        const x = 71 + i * 20;
        const open = l === "";
        return (
          <g key={i}>
            <rect x={x} y="32" width="18" height="26" rx="2.5" fill={open ? NAVY : "#2a2418"}
              stroke={open ? GOLD : "currentColor"} strokeOpacity={open ? 1 : 0.55} strokeWidth={open ? 1.6 : 1.1} />
            {open ? (
              <rect x={x + 5} y="51" width="8" height="2" fill={GOLD} className="mc-anim-blink" />
            ) : (
              <>
                <text x={x + 9} y="51" textAnchor="middle" fontSize="15" fontWeight="800" fill="#0a0806" opacity="0.7"
                  fontFamily="Cinzel, Georgia, serif">{l}</text>
                <text x={x + 9} y="50" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor"
                  fontFamily="Cinzel, Georgia, serif">{l}</text>
              </>
            )}
          </g>
        );
      })}
      {/* three soundings */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={110 + i * 10} cy="74" r="3.2" fill={i === 0 ? GOLD : "none"} stroke={GOLD} strokeOpacity="0.8" />
      ))}
    </Scene>
  );
}

function PerfectTimingArt() {
  // The sweep a League cooldown draws over its icon, 35% still to run.
  const r = 30;
  const a = 0.35 * 2 * Math.PI;
  const ex = 120 + r * Math.sin(a);
  const ey = 50 - r * Math.cos(a);
  return (
    <Scene pics={<>
      <Pic src={backend("assets/champions/Lux/R_LuxR.png")} x={102} y={32} s={36} />
      {/* the cooldown overlay sits ABOVE the icon */}
      <div className="mc-pt-sweep" style={{ left: `${102 / 2.4}%`, top: "32%", width: `${36 / 2.4}%`, height: "36%" }} />
    </>}>
      {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => (
        <line key={deg} x1="120" y1="8" x2="120" y2={deg % 90 === 0 ? 15 : 12} stroke={INK}
          strokeOpacity={deg % 90 === 0 ? 0.7 : 0.3} strokeWidth="1.3" transform={`rotate(${deg} 120 50)`} />
      ))}
      <circle cx="120" cy="50" r="34" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <rect x="100.5" y="30.5" width="39" height="39" rx="3" fill={NAVY} stroke={GOLD} strokeWidth="1.8" />
      <g className="mc-anim-sweep" style={{ transformOrigin: "120px 50px" }}>
        <line x1="120" y1="50" x2={ex} y2={ey} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path d="M38 50 h10 M192 50 h10" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
      <g fontSize="7.5" fontWeight="800" letterSpacing="1" textAnchor="middle">
        <text x="43" y="64" fill="currentColor" opacity="0.75">START</text>
        <text x="197" y="64" fill="currentColor" opacity="0.75">STOP</text>
      </g>
    </Scene>
  );
}

function StatDropArt() {
  return (
    <Scene>
      <defs>
        <linearGradient id="mc-statdrop" x1="0" x2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.15" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <rect x="26" y="66" width="188" height="8" rx="4" fill="url(#mc-statdrop)" />
      {Array.from({ length: 11 }, (_, i) => 30 + i * 18).map((x, i) => (
        <line key={x} x1={x} y1="78" x2={x} y2={i % 5 === 0 ? 86 : 82} stroke={INK} strokeOpacity="0.5" />
      ))}
      {/* the marker, dropping onto the scale */}
      <g className="mc-anim-drop">
        <line x1="112" y1="14" x2="112" y2="56" stroke={GOLD} strokeOpacity="0.55" strokeDasharray="2 3" />
        <path d="M112 64 C104 54 102 48 102 44 A10 10 0 0 1 122 44 C122 48 120 54 112 64 Z" fill={GOLD} stroke={NAVY} strokeWidth="1.2" />
        <circle cx="112" cy="44" r="3.6" fill={NAVY} />
      </g>
      {/* where the real value lands, and the gap between */}
      <line x1="134" y1="58" x2="134" y2="80" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
      <path d="M114 92 H132 M114 89 V95 M132 89 V95" stroke="currentColor" strokeOpacity="0.8" strokeWidth="1.3" />
    </Scene>
  );
}

function CombatEstimateArt() {
  return (
    <Scene pics={<>
      <Pic src={ITEM(1036)} x={79} y={50} s={20} className="mc-anim-tilt-l" />
      <Pic src={ITEM(1028)} x={141} y={40} s={20} className="mc-anim-tilt-r" />
    </>}>
      <path d="M108 94 L120 78 L132 94 Z" fill={GOLD} fillOpacity="0.85" />
      <line x1="120" y1="80" x2="120" y2="22" stroke={GOLD} strokeWidth="2.4" />
      <circle cx="120" cy="20" r="3.6" fill={GOLD} />
      {/* the beam, settling toward the hit's damage */}
      <line x1="84" y1="27" x2="156" y2="17" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M89 27 L83 50 M89 27 L95 50" stroke={INK} strokeOpacity="0.55" strokeWidth="1" />
      <path d="M151 17 L145 40 M151 17 L157 40" stroke={INK} strokeOpacity="0.55" strokeWidth="1" />
      <path d="M77 70 Q89 80 101 70 Z" fill="currentColor" fillOpacity="0.7" />
      <path d="M139 60 Q151 70 163 60 Z" fill="currentColor" fillOpacity="0.7" />
      {/* the fine beam below */}
      <line x1="40" y1="86" x2="96" y2="86" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      <line x1="144" y1="86" x2="200" y2="86" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
      <circle cx="70" cy="86" r="3" fill="currentColor" fillOpacity="0.8" />
      <circle cx="176" cy="86" r="3" fill="currentColor" fillOpacity="0.8" />
    </Scene>
  );
}

const ART: Readonly<Record<PublicModeId, ComponentType>> = {
  time_trial: TimeTrialArt,
  survival: SurvivalArt,
  roster_lock: RosterLockArt,
  draft_memory: DraftMemoryArt,
  chronoscope: ChronoscopeArt,
  match_grid: MatchGridArt,
  reconstruct: ReconstructArt,
  order_forge: OrderForgeArt,
  rangefinder: RangefinderArt,
  glyph_press: GlyphPressArt,
  perfect_timing: PerfectTimingArt,
  stat_drop: StatDropArt,
  combat_estimate: CombatEstimateArt,
};

export function GameArt({ modeId, className }: { modeId: PublicModeId; className?: string }) {
  const Art = ART[modeId];
  return (
    <div className={cn("mc-art", className)} aria-hidden="true" data-testid="mode-card-art" data-art={modeId}>
      <Art />
    </div>
  );
}
