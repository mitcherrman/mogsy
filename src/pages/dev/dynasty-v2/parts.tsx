/**
 * UX-1 / VIS-F1 — presentational pieces for the synthetic Dynasty prototype.
 *
 * VIS-F1 keeps every UX-1 export and signature (tests, screens and the game
 * view import them by name) and gives them the Worlds Dynasty broadcast look:
 * navy plates with gold hairlines, Cinzel display type, org crests, player
 * monograms, objective sigils and a small set of signature motions defined in
 * `vis.css`. Every motion is gated by `useMotionAllowed()` or by the CSS
 * reduced-motion rules; the resting frame is always the full design.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowDown, ArrowUp, FlaskConical, Minus } from "lucide-react";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { Eyebrow, GOLD_TEXT, SURFACE } from "@/components/pro-play/worlds-experience/parts";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, STAGE_LABEL, type Org, type Player, type Role, type Stage } from "./fixtures";
import type { StageLabel } from "./engine";
import type { Effect, ObjectiveKind } from "./objectives";

export { Eyebrow, GOLD_TEXT, SURFACE };

export const RANKED_ROLE: Record<Role, "top" | "jungle" | "mid" | "adc" | "support"> = { top: "top", jng: "jungle", mid: "mid", bot: "adc", sup: "support" };

/** The premium plate class: SURFACE plus VIS-F1's hairline treatment. */
export const PLATE = "dyn-plate";

// ───────────────────────────────────────────────────────────── identity

/** Org accents are a VISUAL property of the prototype, kept out of the fixtures. */
export const ORG_ACCENT: Record<string, { hex: string; rgb: string; mono: string; motto: string }> = {
  ember: { hex: "#ff8f63", rgb: "255 143 99", mono: "EW", motto: "Hold the line. Win the fight." },
  tide: { hex: "#5cc8ea", rgb: "92 200 234", mono: "TF", motto: "First to the river. First to the fight." },
  gale: { hex: "#b99cff", rgb: "185 156 255", mono: "GC", motto: "Find the pick. End the game." },
};
export const accentStyle = (orgId?: string | null): CSSProperties => {
  const a = orgId ? ORG_ACCENT[orgId] : undefined;
  return a ? ({ "--dyn-accent": a.hex, "--dyn-accent-rgb": a.rgb } as CSSProperties) : {};
};

/** An organization crest: a hex shield with the monogram, in the org accent. */
export function Crest({ org, size = 56, className }: { org: Org; size?: number; className?: string }) {
  const a = ORG_ACCENT[org.id] ?? ORG_ACCENT.ember;
  const id = `crest-${org.id}`;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)} style={{ width: size, height: size }} aria-hidden data-testid="org-crest">
      <svg viewBox="0 0 64 64" width={size} height={size} className="absolute inset-0">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a.hex} stopOpacity="0.55" />
            <stop offset="1" stopColor="#07111f" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id={`${id}-r`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3c4" />
            <stop offset="0.5" stopColor="#e3c66f" />
            <stop offset="1" stopColor="#9a7a2f" />
          </linearGradient>
        </defs>
        <path d="M32 3 L57 17 V47 L32 61 L7 47 V17 Z" fill={`url(#${id}-g)`} stroke={`url(#${id}-r)`} strokeWidth="1.6" />
        <path d="M32 9 L51 20 V44 L32 55 L13 44 V20 Z" fill="none" stroke={a.hex} strokeOpacity="0.35" strokeWidth="0.8" />
      </svg>
      <span className="dyn-title relative font-bold" style={{ fontSize: size * 0.3, color: "#f5ecd3" }}>{a.mono}</span>
    </span>
  );
}

const initials = (name: string) => name.replace(/^SYN-?\s?/, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

/** A player's portrait slot: a monogram in a ring whose style says star / academy / signed. */
export function Monogram({ p, size = 40 }: { p: Player; size?: number }) {
  const ring = p.kind === "star" ? "border-[#e3c66f]/80 shadow-[0_0_16px_-4px_rgba(227,198,111,0.7)]" : p.kind === "signed" ? "border-[rgb(var(--dyn-accent-rgb)/0.7)]" : "border-dashed border-white/30";
  return (
    <span aria-hidden data-kind={p.kind} className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full border bg-[radial-gradient(60%_60%_at_50%_35%,rgba(255,255,255,0.08),rgba(7,17,31,0.9))]", ring)} style={{ width: size, height: size }}>
      <span className="dyn-title font-bold text-[#f5ecd3]" style={{ fontSize: size * 0.34 }}>{initials(p.name)}</span>
      {p.kind === "star" ? <span className="absolute -right-1 -top-1 rounded-full bg-[#e3c66f] px-1 text-[8px] font-black leading-[12px] text-[#1a1406]">★</span> : null}
    </span>
  );
}

/** Objective sigils: Dragon (ember), Baron (violet), Elder (ice), Teamfight (gold). Inline SVG, no external art. */
export const SIGIL_COLOR: Record<ObjectiveKind | "teamfight", string> = { dragon: "#ff9a5c", baron: "#b39cff", elder: "#7ee6ff", teamfight: "#e3c66f" };
export function Sigil({ kind, size = 44, breathe = false, className }: { kind: ObjectiveKind | "teamfight"; size?: number; breathe?: boolean; className?: string }) {
  const c = SIGIL_COLOR[kind];
  const motion = useMotionAllowed();
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden data-testid="sigil" data-kind={kind}
      className={cn("dyn-sigil shrink-0", breathe && motion && "dyn-sigil--breathe", className)}>
      <circle cx="24" cy="24" r="21" fill={c} fillOpacity="0.08" stroke={c} strokeOpacity="0.45" strokeWidth="1" />
      {kind === "dragon" ? (
        <g fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M24 9 L33 21 L30 30 L24 39 L18 30 L15 21 Z" fill={c} fillOpacity="0.25" />
          <path d="M24 16 L28 23 L24 30 L20 23 Z" fill={c} />
          <path d="M9 20 C13 16 16 16 18 18" /><path d="M39 20 C35 16 32 16 30 18" />
        </g>
      ) : kind === "baron" ? (
        <g fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M12 14 C14 24 18 30 24 33 C30 30 34 24 36 14" />
          <path d="M12 14 L8 10" /><path d="M36 14 L40 10" />
          <path d="M18 22 C20 20 28 20 30 22" />
          <ellipse cx="24" cy="25" rx="4" ry="2.6" fill={c} />
          <path d="M20 36 L24 41 L28 36" />
        </g>
      ) : kind === "elder" ? (
        <g fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M11 33 L13 18 L19 26 L24 11 L29 26 L35 18 L37 33 Z" fill={c} fillOpacity="0.25" />
          <path d="M14 38 H34" />
          <circle cx="24" cy="30" r="2" fill={c} />
        </g>
      ) : (
        <g fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
          <path d="M13 35 L33 13" /><path d="M35 35 L15 13" />
          <path d="M11 31 L17 37" /><path d="M37 31 L31 37" />
          <path d="M30 12 L36 10 L34 16" /><path d="M18 12 L12 10 L14 16" />
        </g>
      )}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────── chrome

export function ProtoBanner({ compact }: { compact?: boolean }) {
  return (
    <div role="note" data-testid="proto-banner"
      className={cn("flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 text-[11px] leading-snug text-amber-100/85", compact ? "py-1" : "py-1.5")}>
      <FlaskConical className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
      <span className={cn(compact && "truncate")}>
        <strong className="font-semibold text-amber-200">VIS-F1 synthetic prototype · </strong>
        Invented players, champions and events; not real data.<span className={cn("hidden", compact ? "md:inline" : "sm:inline")}> Not connected to the Combat v2 / Event E0 simulator. Every number is a placeholder.</span>
      </span>
    </div>
  );
}

export function Btn({ children, onClick, primary, disabled, className, testId, type = "button", ariaLabel, beckon }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; className?: string; testId?: string; type?: "button" | "submit"; ariaLabel?: string;
  /** A slow light sweep on the primary: the one thing to tap next. */
  beckon?: boolean;
}) {
  const motion = useMotionAllowed();
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} aria-label={ariaLabel}
      className={cn(
        "dyn-btn focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f]",
        primary ? "dyn-btn--primary" : "dyn-btn--ghost",
        primary && beckon && !disabled && motion && "dyn-btn--beckon overflow-hidden",
        className,
      )}>
      {children}
    </button>
  );
}

/** The plate with optional gold corner marks and org accent. */
export function Plate({ children, className, ornate, accent, selected, testId, style, ...rest }: {
  children: ReactNode; className?: string; ornate?: boolean; accent?: boolean; selected?: boolean; testId?: string; style?: CSSProperties;
} & Record<`data-${string}`, string | number | boolean | undefined>) {
  return (
    <div data-testid={testId} style={style} className={cn(PLATE, ornate && "dyn-plate--ornate", accent && "dyn-plate--accent", selected && "dyn-plate--selected", className)} {...rest}>
      {children}
    </div>
  );
}

export function Rule({ className }: { className?: string }) { return <div aria-hidden className={cn("dyn-rule my-1", className)} />; }

// ───────────────────────────────────────────────────────────── gauges

export function Pips({ n, max, label, tone = "gold", tick }: { n: number; max: number; label: string; tone?: "gold" | "red" | "blue"; tick?: boolean }) {
  const on = tone === "gold" ? "bg-[#e3c66f] text-[#e3c66f]" : tone === "red" ? "bg-[#e0777c] text-[#e0777c]" : "bg-sky-400 text-sky-400";
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label} ${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} aria-hidden style={{ "--i": i } as CSSProperties}
          className={cn("dyn-pip h-2 w-2.5 rounded-[2px]", i < n ? cn(on, "dyn-pip--on", tick && "dyn-pip--tick") : "bg-white/20")} />
      ))}
    </span>
  );
}

/** Confidence as five diamonds. `from` animates a before→after fill in place. */
export function ConfidenceDiamonds({ n, from, size = "sm" }: { n: number; from?: number; size?: "sm" | "md" }) {
  const motion = useMotionAllowed();
  const [shown, setShown] = useState(from ?? n);
  useEffect(() => {
    if (from === undefined || !motion) { setShown(n); return; }
    setShown(from);
    const t = window.setTimeout(() => setShown(n), 520);
    return () => window.clearTimeout(t);
  }, [n, from, motion]);
  const px = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={`Confidence ${n} of 5`} data-shown={shown}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden className={cn("dyn-diamond rotate-45 rounded-[2px]", px, i < shown ? "bg-[#e3c66f] shadow-[0_0_8px_-1px_rgba(227,198,111,0.9)]" : "bg-white/20")} />
      ))}
    </span>
  );
}

/** Fatigue as five bars that go from cool to hot. */
export function FatigueBars({ n, from }: { n: number; from?: number }) {
  const motion = useMotionAllowed();
  const [shown, setShown] = useState(from ?? n);
  useEffect(() => {
    if (from === undefined || !motion) { setShown(n); return; }
    setShown(from);
    const t = window.setTimeout(() => setShown(n), 520);
    return () => window.clearTimeout(t);
  }, [n, from, motion]);
  const heat = ["bg-sky-300/80", "bg-sky-300/80", "bg-amber-300/80", "bg-orange-400/85", "bg-rose-400/90"];
  return (
    <span className="inline-flex items-end gap-[3px]" role="img" aria-label={`Fatigue ${n} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden className={cn("dyn-pip w-2 rounded-[1.5px]", i < shown ? heat[i] : "bg-white/15")} style={{ height: 6 + i * 2 }} />
      ))}
    </span>
  );
}

export function PhaseBars({ phase }: { phase: Record<Stage, number> }) {
  return (
    <span className="grid grid-cols-3 gap-x-2 gap-y-1 text-[10px] text-white/60">
      {(["early", "mid", "late"] as Stage[]).map((s) => (
        <span key={s} className="flex flex-col gap-1">
          <span className="flex items-baseline justify-between"><span className="font-semibold uppercase tracking-[0.14em]">{STAGE_LABEL[s]}</span><span className="dyn-num text-white/45">{phase[s]}</span></span>
          <span className="relative h-1 overflow-hidden rounded-full bg-white/10" role="img" aria-label={`${STAGE_LABEL[s]} skill ${phase[s]} of 5`}>
            <span aria-hidden className="absolute inset-y-0 left-0 rounded-full bg-[linear-gradient(90deg,#8fb8ff,#cfe3ff)]" style={{ width: `${(phase[s] / 5) * 100}%` }} />
          </span>
        </span>
      ))}
    </span>
  );
}

export function Delta({ v, invert }: { v: number; invert?: boolean }) {
  if (v === 0) return <span className="inline-flex items-center text-white/40"><Minus className="h-3 w-3" aria-hidden /><span className="sr-only">no change</span></span>;
  const good = invert ? v < 0 : v > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1 text-[11px] font-bold", good ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300")}>
      {v > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
      {v > 0 ? "+" : ""}{v}<span className="sr-only">{good ? " better" : " worse"}</span>
    </span>
  );
}

export function KindRibbon({ kind }: { kind: Player["kind"] }) {
  const m = { star: ["Star", "border-[#e3c66f]/50 bg-[#e3c66f]/15 text-[#f2dc98]"], academy: ["Academy stand-in", "border-white/20 bg-white/[0.05] text-white/60"], signed: ["Signed", "border-[rgb(var(--dyn-accent-rgb)/0.5)] bg-[rgb(var(--dyn-accent-rgb)/0.12)] text-[var(--dyn-accent)]"] } as const;
  return <span className={cn("rounded-sm border px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-[0.14em]", m[kind][1])}>{m[kind][0]}</span>;
}

/** The player card. `compact` hides the live condition row (used in pickers). */
export function PlayerRow({ p, children, testId, compact, selected }: { p: Player; children?: ReactNode; testId?: string; compact?: boolean; selected?: boolean }) {
  return (
    <div data-testid={testId} className={cn(PLATE, "flex flex-col gap-2 p-3 transition-colors", selected && "dyn-plate--selected")}>
      <div className="flex items-center gap-2.5">
        <Monogram p={p} size={compact ? 38 : 44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-white">{p.name.replace(/^SYN-/, "")}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-white/50">
            <RoleEmblem role={RANKED_ROLE[p.role]} size="xs" decorative /> {ROLE_LABEL[p.role]} <KindRibbon kind={p.kind} />
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {p.traits.map((t) => (
            <span key={t} className="rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/10 px-2 py-0.5 text-[10px] font-semibold text-[#e3c66f]">{t}</span>
          ))}
        </div>
      </div>
      <PhaseBars phase={p.phase} />
      {compact ? null : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10.5px] uppercase tracking-wider text-white/55">
          <span className="inline-flex items-center gap-1.5">Confidence <ConfidenceDiamonds n={p.conf} /></span>
          <span className="inline-flex items-center gap-1.5">Fatigue <FatigueBars n={p.fatigue} /></span>
        </div>
      )}
      {children}
    </div>
  );
}

export function EffectChip({ e }: { e: Effect }) {
  const pos = e.amount > 0;
  const good = e.kind === "fatigue" ? e.amount < 0 : e.amount > 0;
  const scope = e.scope === "stage" ? "This stage" : e.scope === "next_stage" ? "Next stage" : "Later games";
  return (
    <span data-testid="effect-chip" data-sign={good ? "+" : "-"}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        good ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "border-rose-400/30 bg-rose-400/10 text-rose-200")}>
      {pos ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
      <span className="sr-only">{good ? "Positive: " : "Negative: "}</span>
      {e.label} <span className="text-white/45">· {scope}</span>
    </span>
  );
}

export type SourceKind = "verified" | "rules" | "event" | "synthetic";
export function SourceChip({ kind }: { kind: SourceKind }) {
  const m: Record<SourceKind, [string, string]> = {
    verified: ["Verified real-world evidence", "border-sky-400/35 bg-sky-400/10 text-sky-200"],
    rules: ["Dynasty rules", "border-[#e3c66f]/35 bg-[#e3c66f]/10 text-[#e3c66f]"],
    event: ["Generated in-run event", "border-teal-300/35 bg-teal-300/10 text-teal-200"],
    synthetic: ["Synthetic fixture", "border-amber-400/35 bg-amber-400/10 text-amber-200"],
  };
  return <span className={cn("inline-flex self-start rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide", m[kind][1])}>{m[kind][0]}</span>;
}

const LABEL_ICON: Record<StageLabel, string> = { "Losing": "▼▼", "Kinda losing": "▼", "Even": "＝", "Kinda winning": "▲", "Winning": "▲▲" };
export const LABEL_TONE: Record<StageLabel, string> = {
  "Winning": "text-[#1a1406] border-[#e3c66f] bg-[linear-gradient(180deg,#f6dd8f,#d9b85a)] shadow-[0_0_28px_-6px_rgba(227,198,111,0.8)]",
  "Kinda winning": "text-emerald-200 border-emerald-400/50 bg-emerald-400/12",
  "Even": "text-white/85 border-white/30 bg-white/[0.07]",
  "Kinda losing": "text-rose-200 border-rose-400/50 bg-rose-400/12",
  "Losing": "text-rose-100 border-rose-400/70 bg-rose-500/25 shadow-[0_0_24px_-8px_rgba(244,63,94,0.7)]",
};
export function StateLabel({ label, stamp, size = "sm" }: { label: StageLabel; stamp?: boolean; size?: "sm" | "lg" }) {
  const motion = useMotionAllowed();
  return (
    <span data-testid="state-label" data-label={label}
      className={cn("inline-flex items-center gap-1.5 rounded-full border font-bold uppercase tracking-[0.14em]", size === "lg" ? "px-4 py-1.5 text-[13px]" : "px-3 py-1 text-[11px]", LABEL_TONE[label], stamp && motion && "dyn-stamp")}>
      <span aria-hidden>{LABEL_ICON[label]}</span>{label}
    </span>
  );
}

/** Seven pips: five 1-point lanes + a double-width 2-point team tile. */
export function SevenPips({ lanes, team, size = "md" }: { lanes: (boolean | null)[]; team: boolean | null; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-2.5" : "h-3.5";
  const pip = (v: boolean | null, w: string, label: string, i: number) => (
    <span aria-hidden title={label} style={{ "--i": i } as CSSProperties}
      className={cn("dyn-pip block rounded-[3px]", h, w,
        v === null ? "bg-white/15" : v ? "dyn-pip--on bg-[linear-gradient(180deg,#f6dd8f,#d9b85a)] text-[#e3c66f]" : "bg-rose-400/55")} />
  );
  const won = lanes.filter(Boolean).length + (team ? 2 : 0);
  const known = lanes.every((x) => x !== null) && team !== null;
  return (
    <span className="flex items-center gap-1" role="img" aria-label={known ? `${won} of 7 points` : "stage score pending"}>
      {lanes.map((v, i) => <span key={i}>{pip(v, size === "sm" ? "w-4" : "w-6", `lane ${i + 1}`, i)}</span>)}
      {pip(team, size === "sm" ? "w-8" : "w-12", "team (2 points)", 5)}
    </span>
  );
}

export function LeadMeter({ lead, cap = 4, into }: { lead: number; cap?: number; into?: string }) {
  const raw = ((lead + cap) / (2 * cap)) * 100;
  const pct = 4 + raw * 0.92; // keep the marker inside the track at the caps
  const left = Math.min(50, pct), width = Math.abs(pct - 50);
  return (
    <div data-testid="lead-meter" data-lead={lead} className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/55">
      <span className="hidden sm:inline">Advantage{into ? ` into ${into}` : ""}</span>
      <span className="sm:hidden">Adv.</span>
      <span className="relative h-2 flex-1 rounded-full bg-white/10" role="img" aria-label={`Carried advantage ${lead > 0 ? "+" : ""}${lead} (not points)`}>
        <span aria-hidden className={cn("dyn-lead-fill absolute inset-y-0 rounded-full", lead >= 0 ? "bg-[#e3c66f]/55" : "bg-rose-400/55")} style={{ left: `${left}%`, width: `${width}%` }} />
        <span aria-hidden className="absolute left-1/2 top-[-3px] h-3.5 w-px bg-white/35" />
        <span aria-hidden className={cn("dyn-lead-marker absolute top-[-3px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 rounded-[3px]", lead >= 0 ? "bg-[#e3c66f]" : "bg-rose-300")} style={{ left: `${pct}%` }} />
      </span>
      <span className="dyn-num whitespace-nowrap text-right text-[12px] font-bold normal-case tracking-normal text-white/85">{lead > 0 ? "+" : ""}{lead} <span className="text-[10px] font-normal uppercase tracking-wider text-white/35">not pts</span></span>
    </div>
  );
}

/** A number that counts up to its value (tabular, reduced-motion = instant). */
export function useCountUp(value: number, ms = 520): number {
  const motion = useMotionAllowed();
  const [v, setV] = useState(motion ? 0 : value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!motion) { setV(value); return; }
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, ms, motion]);
  return v;
}

export function Screen({ eyebrow, title, children, actions, testId, kicker, hero }: {
  eyebrow: string; title: string; children: ReactNode; actions?: ReactNode; testId: string;
  /** Small line under the title. */
  kicker?: ReactNode;
  /** A large Cinzel title in gold (home, endings). */
  hero?: boolean;
}) {
  const motion = useMotionAllowed();
  return (
    <section data-testid={testId} aria-labelledby={`${testId}-h`} className={cn("flex flex-col gap-4", motion && "dyn-enter")}>
      <header className="flex flex-col gap-1.5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={`${testId}-h`} tabIndex={-1} className={cn("dyn-title outline-none", hero ? "dyn-title--gold text-[30px] font-bold leading-[1.05] sm:text-[40px]" : "text-[22px] font-semibold leading-tight sm:text-[26px]")}>{title}</h2>
        {kicker ? <p className="text-[13px] text-white/60">{kicker}</p> : null}
      </header>
      {children}
      {actions ? <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-white/10 bg-[#07111f]/92 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-0">{actions}</div> : null}
    </section>
  );
}

export function RolePill({ role, label = true }: { role: Role; label?: boolean }) {
  return <span className="inline-flex items-center gap-1 text-[10.5px] uppercase tracking-[0.14em] text-white/60"><RoleEmblem role={RANKED_ROLE[role]} size="sm" decorative />{label ? ROLE_LABEL[role] : null}</span>;
}
