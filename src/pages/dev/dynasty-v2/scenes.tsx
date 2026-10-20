/**
 * VIS-F2 — locations. A `Scene` paints one of seven spaces behind the screen
 * content: Team HQ, practice room, war room, arena tunnel, main stage,
 * backstage and the trophy hall. Each is a fixed layer made of the VIS-F1
 * mood light plus a scene-specific painting: a Mogzy asset where one fits
 * (HQ, practice) and inline SVG / CSS everywhere else. Scenes never move on
 * their own except the stadium's slow light sweep, which the reduced-motion
 * rules freeze. Content sits on top, untouched.
 */
import type { CSSProperties, ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { MEDIA_SLOTS, SCENE_META, type SceneId } from "./media";
import { Eyebrow } from "./parts";

function Crowd({ className }: { className?: string }) {
  // Crowd silhouettes: three staggered rows of heads, as repeating radial gradients.
  return <div aria-hidden className={cn("dyn-crowd absolute inset-x-0 bottom-0 h-[26%]", className)} />;
}

function Rig() {
  // Stage light rig: a truss line and five beams fanning down.
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.28" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></linearGradient>
      </defs>
      <rect x="60" y="18" width="880" height="6" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.35" />
      {[140, 320, 500, 680, 860].map((x, i) => (
        <g key={x} className="dyn-beam" style={{ "--i": i } as CSSProperties}>
          <circle cx={x} cy="24" r="7" fill="#f6dd8f" fillOpacity="0.9" />
          <path d={`M${x - 10} 30 L${x - 170} 600 L${x + 170} 600 L${x + 10} 30 Z`} fill="url(#beam)" />
        </g>
      ))}
    </svg>
  );
}

function Tunnel() {
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <radialGradient id="tunnel-light" cx="50%" cy="48%" r="30%"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.9" /><stop offset="0.5" stopColor="#e3c66f" stopOpacity="0.25" /><stop offset="1" stopColor="#e3c66f" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#tunnel-light)" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const k = 1 - i * 0.16;
        return <rect key={i} x={500 - 480 * k} y={290 - 270 * k} width={960 * k} height={540 * k} fill="none" stroke="#e3c66f" strokeOpacity={0.06 + i * 0.03} strokeWidth="1.2" />;
      })}
      <path d="M20 20 L500 290 M980 20 L500 290 M20 580 L500 290 M980 580 L500 290" stroke="#e3c66f" strokeOpacity="0.12" strokeWidth="1" />
    </svg>
  );
}

function WarRoom() {
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0 H0 V50" fill="none" stroke="#5cc8ea" strokeOpacity="0.12" strokeWidth="1" /></pattern>
        <radialGradient id="table" cx="50%" cy="75%" r="55%"><stop offset="0" stopColor="#5cc8ea" stopOpacity="0.18" /><stop offset="1" stopColor="#5cc8ea" stopOpacity="0" /></radialGradient>
      </defs>
      <path d="M0 600 L0 330 L1000 330 L1000 600 Z" fill="url(#table)" />
      <path d="M-200 600 L300 330 L700 330 L1200 600 Z" fill="url(#grid)" opacity="0.8" />
      <ellipse cx="500" cy="460" rx="230" ry="70" fill="none" stroke="#e3c66f" strokeOpacity="0.25" />
      <ellipse cx="500" cy="460" rx="120" ry="36" fill="none" stroke="#e3c66f" strokeOpacity="0.35" />
      <circle cx="500" cy="460" r="5" fill="#e3c66f" fillOpacity="0.8" />
    </svg>
  );
}

function Backstage() {
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMin slice" className="absolute inset-0 h-full w-full">
      {[80, 200, 320, 440, 560, 680, 800, 920].map((x) => (
        <g key={x}><circle cx={x} cy="40" r="22" fill="#ffb86b" fillOpacity="0.10" /><circle cx={x} cy="40" r="7" fill="#ffd9a3" fillOpacity="0.85" /></g>
      ))}
      <rect x="0" y="60" width="1000" height="2" fill="#e3c66f" fillOpacity="0.25" />
      <rect x="60" y="430" width="260" height="170" rx="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.18" />
      <rect x="700" y="470" width="220" height="130" rx="8" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.18" />
    </svg>
  );
}

function Trophy() {
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" stopOpacity="0.35" /><stop offset="1" stopColor="#fff3c4" stopOpacity="0" /></linearGradient>
      </defs>
      <path d="M470 0 L250 600 L750 600 L530 0 Z" fill="url(#cone)" />
      <ellipse cx="500" cy="560" rx="170" ry="26" fill="#e3c66f" fillOpacity="0.12" />
      <rect x="430" y="470" width="140" height="90" rx="6" fill="#0b1727" stroke="#e3c66f" strokeOpacity="0.45" />
      {[120, 860, 300, 700].map((x, i) => <circle key={x} cx={x} cy={120 + i * 60} r="2" fill="#f6dd8f" fillOpacity="0.6" />)}
    </svg>
  );
}

function Practice() {
  return (
    <svg aria-hidden viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      {[120, 300, 480, 660, 840].map((x, i) => (
        <g key={x}>
          <rect x={x - 60} y="300" width="120" height="76" rx="4" fill="#5cc8ea" fillOpacity={0.10 + (i % 2) * 0.04} stroke="#5cc8ea" strokeOpacity="0.3" />
          <rect x={x - 70} y="376" width="140" height="120" fill="#5cc8ea" fillOpacity="0.05" />
        </g>
      ))}
    </svg>
  );
}

export function Scene({ id, children, className, caption = true }: { id: SceneId; children?: ReactNode; className?: string; caption?: boolean }) {
  const motion = useMotionAllowed();
  const slot = MEDIA_SLOTS[`scene.${id}`];
  const meta = SCENE_META[id];
  return (
    <div className={cn("relative", className)} data-scene={id} data-testid="scene">
      <div aria-hidden className={cn("dyn-scene pointer-events-none fixed inset-0 -z-[1] overflow-hidden", `dyn-scene--${id}`, motion && "dyn-scene--motion")}>
        {slot?.src ? <img src={slot.src} alt="" decoding="async" loading="lazy" className="dyn-scene-art absolute inset-0 h-full w-full object-cover" /> : null}
        {id === "stadium" ? <><Rig /><Crowd /></> : null}
        {id === "tunnel" ? <><Tunnel /><Crowd className="opacity-40" /></> : null}
        {id === "warroom" ? <WarRoom /> : null}
        {id === "backstage" ? <Backstage /> : null}
        {id === "trophy" ? <Trophy /> : null}
        {id === "practice" ? <Practice /> : null}
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
