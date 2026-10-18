/**
 * UX-1 — small presentational pieces for the synthetic Dynasty prototype.
 * Visual language is the Worlds experience's (navy plate, gold hairline) via
 * the shared `SURFACE` / `Eyebrow` tokens; role art is the Ranked `RoleEmblem`.
 */
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, FlaskConical, Minus } from "lucide-react";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { Eyebrow, GOLD_TEXT, SURFACE } from "@/components/pro-play/worlds-experience/parts";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, STAGE_LABEL, type Player, type Role, type Stage } from "./fixtures";
import type { StageLabel } from "./engine";
import type { Effect } from "./objectives";

export { Eyebrow, GOLD_TEXT, SURFACE };

export const RANKED_ROLE: Record<Role, "top" | "jungle" | "mid" | "adc" | "support"> = { top: "top", jng: "jungle", mid: "mid", bot: "adc", sup: "support" };

export function ProtoBanner() {
  return (
    <div role="note" data-testid="proto-banner"
      className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11.5px] leading-snug text-amber-100/90">
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
      <span>
        <strong className="font-semibold text-amber-200">UX-1 synthetic prototype · </strong>
        Invented players, champions and events. Not connected to the Combat v2 / Event E0 simulator and not real data. Every number is a placeholder.
      </span>
    </div>
  );
}

export function Btn({ children, onClick, primary, disabled, className, testId, type = "button", ariaLabel }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; className?: string; testId?: string; type?: "button" | "submit"; ariaLabel?: string;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} data-testid={testId} aria-label={ariaLabel}
      className={cn(
        "min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#07111f] disabled:cursor-not-allowed disabled:opacity-40",
        primary ? "bg-[#e3c66f] text-[#1a1406] hover:bg-[#edd488]" : "border border-white/15 bg-white/[0.04] text-white/85 hover:bg-white/[0.08]",
        className,
      )}>
      {children}
    </button>
  );
}

export function Pips({ n, max, label, tone = "gold" }: { n: number; max: number; label: string; tone?: "gold" | "red" | "blue" }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${label} ${n} of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} aria-hidden className={cn("h-2 w-2.5 rounded-[2px]",
          i < n ? (tone === "gold" ? "bg-[#e3c66f]" : tone === "red" ? "bg-[#e0777c]" : "bg-sky-400") : "bg-white/25")} />
      ))}
    </span>
  );
}

export function ConfidenceDiamonds({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Confidence ${n} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} aria-hidden className={cn("h-2.5 w-2.5 rotate-45 rounded-[2px]", i < n ? "bg-[#e3c66f]" : "bg-white/25")} />
      ))}
    </span>
  );
}

export function PhaseBars({ phase }: { phase: Record<Stage, number> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-white/60">
      {(["early", "mid", "late"] as Stage[]).map((s) => (
        <span key={s} className="inline-flex items-center gap-1">
          <span className="font-semibold uppercase tracking-wider">{STAGE_LABEL[s][0]}</span>
          <Pips n={phase[s]} max={5} label={`${STAGE_LABEL[s]} skill`} tone="blue" />
        </span>
      ))}
    </span>
  );
}

export function Delta({ v, invert }: { v: number; invert?: boolean }) {
  if (v === 0) return <span className="inline-flex items-center text-white/45"><Minus className="h-3 w-3" aria-hidden /><span className="sr-only">no change</span></span>;
  const good = invert ? v < 0 : v > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold", good ? "text-emerald-300" : "text-rose-300")}>
      {v > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
      {v > 0 ? "+" : ""}{v}<span className="sr-only">{good ? " better" : " worse"}</span>
    </span>
  );
}

export function PlayerRow({ p, children, testId, compact }: { p: Player; children?: ReactNode; testId?: string; compact?: boolean }) {
  return (
    <div data-testid={testId} className={cn(SURFACE, "flex flex-col gap-1.5 p-3")}>
      <div className="flex items-center gap-2">
        <RoleEmblem role={RANKED_ROLE[p.role]} size="md" decorative />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{p.name}</p>
          <p className="text-[10.5px] uppercase tracking-wider text-white/45">{ROLE_LABEL[p.role]} · {p.kind === "academy" ? "Academy stand-in" : p.kind === "star" ? "Star" : "Signed"}</p>
        </div>
        {p.traits.map((t) => (
          <span key={t} className="rounded-full border border-[#e3c66f]/35 bg-[#e3c66f]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#e3c66f]">{t}</span>
        ))}
      </div>
      <PhaseBars phase={p.phase} />
      {compact ? null : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/65">
          <span className="inline-flex items-center gap-1.5">Confidence <ConfidenceDiamonds n={p.conf} /></span>
          <span className="inline-flex items-center gap-1.5">Fatigue <Pips n={p.fatigue} max={5} label="Fatigue" tone="red" /></span>
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
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold", m[kind][1])}>{m[kind][0]}</span>;
}

const LABEL_ICON: Record<StageLabel, string> = { "Losing": "▼▼", "Kinda losing": "▼", "Even": "＝", "Kinda winning": "▲", "Winning": "▲▲" };
export function StateLabel({ label }: { label: StageLabel }) {
  const tone = label === "Winning" || label === "Kinda winning" ? "text-emerald-300 border-emerald-400/40 bg-emerald-400/10"
    : label === "Even" ? "text-white/80 border-white/25 bg-white/[0.06]" : "text-rose-300 border-rose-400/40 bg-rose-400/10";
  return <span data-testid="state-label" className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wider", tone)}><span aria-hidden>{LABEL_ICON[label]}</span>{label}</span>;
}

/** Seven pips: five 1-point lanes + a double-width 2-point team tile. */
export function SevenPips({ lanes, team }: { lanes: (boolean | null)[]; team: boolean | null }) {
  const pip = (v: boolean | null, w: string, label: string) => (
    <span aria-hidden className={cn("block h-3 rounded-[3px]", w, v === null ? "bg-white/20" : v ? "bg-[#e3c66f]" : "bg-rose-400/60")} title={label} />
  );
  const won = lanes.filter(Boolean).length + (team ? 2 : 0);
  const known = lanes.every((x) => x !== null) && team !== null;
  return (
    <span className="flex items-center gap-1" role="img" aria-label={known ? `${won} of 7 points` : "stage score pending"}>
      {lanes.map((v, i) => <span key={i}>{pip(v, "w-5", `lane ${i + 1}`)}</span>)}
      {pip(team, "w-10", "team (2 points)")}
    </span>
  );
}

export function LeadMeter({ lead, cap = 4 }: { lead: number; cap?: number }) {
  const pct = ((lead + cap) / (2 * cap)) * 100;
  return (
    <div data-testid="lead-meter" data-lead={lead} className="flex items-center gap-2 text-[11px] text-white/60">
      <span className="uppercase tracking-wider">Advantage</span>
      <span className="relative h-2 flex-1 rounded-full bg-white/10" role="img" aria-label={`Carried advantage ${lead > 0 ? "+" : ""}${lead} (not points)`}>
        <span aria-hidden className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/30" />
        <span aria-hidden className="absolute top-[-3px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-[#07111f] bg-[#e3c66f] motion-safe:transition-[left] motion-safe:duration-300" style={{ left: `${pct}%` }} />
      </span>
      <span className="w-14 text-right font-semibold text-white/80">{lead > 0 ? "+" : ""}{lead} <span className="font-normal text-white/40">not points</span></span>
    </div>
  );
}

export function Screen({ eyebrow, title, children, actions, testId }: { eyebrow: string; title: string; children: ReactNode; actions?: ReactNode; testId: string }) {
  return (
    <section data-testid={testId} aria-labelledby={`${testId}-h`} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={`${testId}-h`} tabIndex={-1} className="font-display text-2xl font-semibold text-white outline-none">{title}</h2>
      </header>
      {children}
      {actions ? <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-white/10 bg-[#07111f]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">{actions}</div> : null}
    </section>
  );
}

export function RolePill({ role }: { role: Role }) {
  return <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-white/60"><RoleEmblem role={RANKED_ROLE[role]} size="sm" decorative />{ROLE_LABEL[role]}</span>;
}
