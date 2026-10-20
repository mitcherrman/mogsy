/**
 * VIS-F2 — story beats: comic-panel strips for the special moments (new run,
 * a signing, the finals intro, the championship, the run's end). A beat is
 * NEVER modal: it renders at the top of the screen it belongs to, the screen
 * below stays interactive, and it can be skipped at any time. With motion
 * allowed the panels arrive one after another and the strip folds into a
 * single caption after a short hold; with reduced motion every panel is
 * shown at once, static, and stays until the player folds it.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { Btn, Eyebrow } from "./parts";

export interface StoryPanel { art: ReactNode; caption: string; kicker?: string }
export interface StoryBeatProps { id: string; title: string; panels: StoryPanel[]; tone?: "gold" | "cold"; holdMs?: number; onDone?: () => void; className?: string }

export function StoryBeat({ id, title, panels, tone = "gold", holdMs = 4200, onDone, className }: StoryBeatProps) {
  const motion = useMotionAllowed();
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!motion || folded) return;
    const t = window.setTimeout(() => { setFolded(true); onDone?.(); }, holdMs + panels.length * 420);
    return () => window.clearTimeout(t);
  }, [motion, folded, holdMs, panels.length, onDone]);
  if (folded) {
    return (
      <button type="button" data-testid="story-beat" data-beat={id} data-folded="true" onClick={() => setFolded(false)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-left text-[11px] text-white/60 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]">
        <span aria-hidden className="h-1.5 w-1.5 rotate-45 bg-[#e3c66f]/70" /><span className="truncate">{title} · {panels[panels.length - 1].caption}</span><span className="ml-auto shrink-0 text-[10px] uppercase tracking-wider text-white/40">Replay</span>
      </button>
    );
  }
  return (
    <section data-testid="story-beat" data-beat={id} data-folded="false" aria-label={title}
      className={cn("dyn-story relative overflow-hidden rounded-2xl border p-3", tone === "gold" ? "border-[#e3c66f]/40" : "border-sky-300/25", className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <Eyebrow>{title}</Eyebrow>
        <Btn testId="story-skip" className="min-h-[32px] px-3 py-1 text-[11px]" onClick={() => { setFolded(true); onDone?.(); }}>Skip</Btn>
      </div>
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${panels.length}, minmax(0, 1fr))` }}>
        {panels.map((p, i) => (
          <li key={i} style={{ "--i": i } as CSSProperties} className={cn("dyn-panel relative flex min-h-[120px] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#07111f]/70 sm:min-h-[150px]", motion && "dyn-panel--in")}>
            <div className="relative flex flex-1 items-center justify-center overflow-hidden">{p.art}</div>
            <p className="dyn-panel-caption relative border-t border-white/10 bg-[#0b1727]/90 px-2 py-1.5 text-[11px] leading-snug text-white/85 sm:text-[12px]">
              {p.kicker ? <span className="mr-1 font-bold uppercase tracking-wider text-[#f2dc98]">{p.kicker}</span> : null}{p.caption}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Panel art helpers: simple, strong silhouettes in the house style. */
export function PanelArt({ kind, accent = "#e3c66f" }: { kind: "house" | "handshake" | "tunnel" | "stage" | "trophy" | "rain" | "crest" | "draft"; accent?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 200 120" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`pa-${kind}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={accent} stopOpacity="0.35" /><stop offset="1" stopColor={accent} stopOpacity="0" /></linearGradient>
      </defs>
      <rect width="200" height="120" fill="#07111f" />
      {kind === "house" ? (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        <path d="M20 110 V60 L60 35 L100 60 V110 Z" fill="#0b1727" stroke={accent} strokeOpacity="0.6" />
        <rect x="40" y="70" width="14" height="14" fill={accent} fillOpacity="0.8" /><rect x="66" y="70" width="14" height="14" fill={accent} fillOpacity="0.5" />
        <rect x="120" y="40" width="60" height="70" fill="#0b1727" stroke={accent} strokeOpacity="0.4" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={128 + (i % 2) * 24} y={48 + Math.floor(i / 2) * 26} width="16" height="16" fill={accent} fillOpacity={0.25 + 0.2 * (i % 3)} />)}
        <circle cx="170" cy="18" r="6" fill="#fff3c4" fillOpacity="0.9" />
      </g>) : kind === "handshake" ? (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        {/* a contract on the table, a pen, and two crests meeting over it */}
        <rect x="55" y="62" width="90" height="46" rx="3" fill="#f5ecd3" fillOpacity="0.92" transform="rotate(-4 100 85)" />
        {[0, 1, 2, 3].map((i) => <rect key={i} x="66" y={72 + i * 8} width={i === 3 ? 30 : 64} height="2" fill="#0b1727" fillOpacity="0.45" transform="rotate(-4 100 85)" />)}
        <path d="M118 98 L140 76" stroke="#0b1727" strokeWidth="4" strokeLinecap="round" /><path d="M140 76 L146 70" stroke={accent} strokeWidth="4" strokeLinecap="round" />
        <path d="M46 14 L70 26 V48 L46 60 L22 48 V26 Z" fill="#0b1727" stroke={accent} strokeWidth="2" />
        <path d="M154 14 L178 26 V48 L154 60 L130 48 V26 Z" fill="#0b1727" stroke="#e3c66f" strokeWidth="2" />
        <path d="M74 37 H126" stroke="#fff3c4" strokeWidth="2" strokeDasharray="4 4" />
        <circle cx="100" cy="37" r="4" fill="#fff3c4" />
      </g>) : kind === "tunnel" ? (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        <path d="M0 0 L100 60 L200 0 M0 120 L100 60 L200 120" stroke={accent} strokeOpacity="0.5" fill="none" />
        <circle cx="100" cy="60" r="18" fill="#fff3c4" fillOpacity="0.9" />
        {[60, 80, 100, 120, 140].map((x, i) => <rect key={x} x={x - 5} y={74 + Math.abs(i - 2) * 2} width="10" height="22" rx="3" fill="#0b1727" stroke={accent} strokeOpacity="0.7" />)}
      </g>) : kind === "stage" ? (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        <rect x="10" y="8" width="180" height="3" fill={accent} fillOpacity="0.6" />
        {[40, 100, 160].map((x) => <path key={x} d={`M${x - 3} 11 L${x - 30} 100 L${x + 30} 100 L${x + 3} 11 Z`} fill="#fff3c4" fillOpacity="0.12" />)}
        <rect x="0" y="100" width="200" height="20" fill="#0b1727" />
        {Array.from({ length: 20 }, (_, i) => <circle key={i} cx={5 + i * 10} cy={104 + (i % 3)} r="4" fill="#0b1727" stroke={accent} strokeOpacity="0.35" />)}
      </g>) : kind === "trophy" ? (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        <path d="M80 20 H120 V50 C120 68 108 78 100 78 C92 78 80 68 80 50 Z" fill="#f6dd8f" stroke="#b8913f" />
        <path d="M80 28 C62 28 62 52 80 52 M120 28 C138 28 138 52 120 52" fill="none" stroke="#e3c66f" strokeWidth="3" />
        <rect x="92" y="78" width="16" height="12" fill="#b8913f" /><rect x="78" y="90" width="44" height="8" rx="2" fill="#e3c66f" />
        <path d="M100 2 L104 12 L100 10 L96 12 Z" fill="#fff3c4" />
      </g>) : kind === "rain" ? (<g>
        <rect width="200" height="120" fill="#081321" />
        {Array.from({ length: 24 }, (_, i) => <line key={i} x1={8 * i + 4} y1={(i * 13) % 60} x2={8 * i} y2={(i * 13) % 60 + 26} stroke="#5cc8ea" strokeOpacity="0.35" />)}
        <circle cx="100" cy="70" r="14" fill="#0b1727" stroke="#5cc8ea" strokeOpacity="0.6" strokeWidth="2" />
        <path d="M70 118 C75 95 125 95 130 118 Z" fill="#0b1727" stroke="#5cc8ea" strokeOpacity="0.4" />
      </g>) : kind === "draft" ? (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={14 + i * 36} y={30 + (i % 2) * 6} width="28" height="40" rx="3" fill="#0b1727" stroke={accent} strokeOpacity={i === 2 ? 1 : 0.4} strokeWidth={i === 2 ? 2 : 1} />)}
        <rect x="14" y="86" width="172" height="6" rx="3" fill={accent} fillOpacity="0.6" />
      </g>) : (<g>
        <rect width="200" height="120" fill={`url(#pa-${kind})`} />
        <path d="M100 12 L150 40 V84 L100 112 L50 84 V40 Z" fill="#0b1727" stroke={accent} strokeWidth="2" />
        <path d="M100 24 L138 46 V80 L100 102 L62 80 V46 Z" fill="none" stroke={accent} strokeOpacity="0.4" />
      </g>)}
    </svg>
  );
}
