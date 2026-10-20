/**
 * VIS-F2 — player and champion presentation.
 *
 * `PlayerCard` is the roster-grade card: a portrait plate (monogram slot, see
 * media slot `player.portrait`), a name plaque, the role and tier ribbon, a
 * form ring that reads confidence at a glance, fatigue heat, and a pressure /
 * trait badge (Overconfident, Honeymoon). `hierarchy` scales stars up and
 * academy stand-ins down so a roster reads top to bottom.
 *
 * `ChampionCard` replaces the draft chips: class glyph, phase curve, tags and
 * proficiency, with a lock treatment and a Fearless strike state.
 */
import type { CSSProperties, ReactNode } from "react";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { useMotionAllowed } from "@/lib/motion/useReveal";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, STAGE_LABEL, TAG_LABEL, type Champion, type Player, type Stage } from "./fixtures";
import { ConfidenceDiamonds, FatigueBars, KindRibbon, Monogram, PLATE, PhaseBars, RANKED_ROLE } from "./parts";

// ───────────────────────────────────────────────────────────── class glyphs

export type ChampClass = Champion["cls"];
export const CLASS_COLOR: Record<ChampClass, string> = { Tank: "#9fc7ff", Fighter: "#ffb27a", Assassin: "#ff7aa8", Marksman: "#f6dd8f", Mage: "#b99cff", Enchanter: "#7ee6d2" };

export function ClassGlyph({ cls, size = 18, className }: { cls: ChampClass; size?: number; className?: string }) {
  const c = CLASS_COLOR[cls];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden data-testid="class-glyph" data-class={cls} className={cn("shrink-0", className)} fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {cls === "Tank" ? <path d="M12 3 L20 6 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V6 Z M12 8 V16" />
        : cls === "Fighter" ? <path d="M5 19 L15 9 M13 5 L19 11 M4 20 L7 17 M17 7 L20 4 M9 15 L5 11" />
        : cls === "Assassin" ? <path d="M12 3 L14 10 L12 21 L10 10 Z M6 14 L12 12 L18 14" />
        : cls === "Marksman" ? <path d="M5 19 L19 5 M19 5 H13 M19 5 V11 M4 12 C4 7 8 4 12 4" />
        : cls === "Mage" ? <path d="M12 3 L13.5 9 L19 10 L14.5 13.5 L16 20 L12 16.5 L8 20 L9.5 13.5 L5 10 L10.5 9 Z" />
        : <path d="M12 21 C8 17 4 14 4 9 A4 4 0 0 1 12 7 A4 4 0 0 1 20 9 C20 14 16 17 12 21 Z M12 7 V3" />}
    </svg>
  );
}

/** A tiny E → M → L curve: where this champion peaks. */
export function PhaseCurve({ phase, color = "#e3c66f", width = 54, height = 22 }: { phase: Record<Stage, number>; color?: string; width?: number; height?: number }) {
  const pts = (["early", "mid", "late"] as Stage[]).map((s, i) => [6 + i * ((width - 12) / 2), height - 3 - ((phase[s] - 1) / 4) * (height - 8)] as const);
  const d = `M${pts[0][0]} ${pts[0][1]} Q${pts[1][0]} ${pts[1][1]} ${pts[2][0]} ${pts[2][1]}`;
  const peak = pts.reduce((a, p) => (p[1] < a[1] ? p : a), pts[0]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={color} strokeOpacity="0.9" strokeWidth="1.6" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={p === peak ? 2.6 : 1.6} fill={p === peak ? color : "#efe8d6"} fillOpacity={p === peak ? 1 : 0.5} />)}
    </svg>
  );
}

// ───────────────────────────────────────────────────────────── player card

export type PlayerSize = "star" | "regular" | "bench";

export function PlayerCard({ p, size = "regular", selected, testId, children, hierarchy, spotlight, showCondition = true, compactMeta }: {
  p: Player; size?: PlayerSize; selected?: boolean; testId?: string; children?: ReactNode;
  /** Let the player's kind decide the size (stars up, academy down). */
  hierarchy?: boolean; spotlight?: boolean; showCondition?: boolean; compactMeta?: boolean;
}) {
  const motion = useMotionAllowed();
  const sz: PlayerSize = hierarchy ? (p.kind === "star" ? "star" : p.kind === "academy" ? "bench" : "regular") : size;
  const over = p.traits.includes("Overconfident");
  const honey = p.traits.includes("Honeymoon");
  const tilt = p.conf <= 1 || p.fatigue >= 4;
  const formTone = p.conf >= 4 ? "ring-[#e3c66f]/70" : p.conf <= 2 ? "ring-rose-400/50" : "ring-white/15";
  return (
    <div data-testid={testId} data-size={sz} data-kind={p.kind}
      className={cn(PLATE, "dyn-pcard relative flex gap-3 overflow-hidden p-3", sz === "star" && "dyn-plate--ornate", sz === "bench" && "opacity-90", selected && "dyn-plate--selected", spotlight && motion && "dyn-spotlight")}>
      {sz === "star" ? <span aria-hidden className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(227,198,111,0.22),rgba(227,198,111,0))]" /> : null}
      {/* portrait plate */}
      <div className={cn("relative flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(7,17,31,0.6))] ring-2", formTone, sz === "star" ? "h-[76px] w-[64px]" : sz === "bench" ? "h-[56px] w-[48px]" : "h-[64px] w-[56px]")} data-slot="player.portrait">
        <Monogram p={p} size={sz === "star" ? 44 : sz === "bench" ? 32 : 38} />
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-sm border border-white/15 bg-[#07111f] px-1"><RoleEmblem role={RANKED_ROLE[p.role]} size="xs" decorative /></span>
        {tilt ? <span aria-hidden className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-[0_0_10px_rgba(244,63,94,0.8)]" title="Under pressure">!</span> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("dyn-title truncate font-semibold leading-tight text-white", sz === "star" ? "text-[17px]" : sz === "bench" ? "text-[13.5px]" : "text-[15px]")}>{p.name.replace(/^SYN-/, "")}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">{ROLE_LABEL[p.role]} <KindRibbon kind={p.kind} /></p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {over ? <span className="rounded-full border border-amber-400/50 bg-amber-400/12 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber-200" title="Early and Late weaker next game">⚡ Overconfident</span> : null}
            {honey ? <span className="rounded-full border border-[#e3c66f]/40 bg-[#e3c66f]/10 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-[#f2dc98]">♥ Honeymoon</span> : null}
            {p.traits.filter((t) => t !== "Overconfident" && t !== "Honeymoon").map((t) => <span key={t} className="rounded-full border border-white/20 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white/70">{t}</span>)}
          </div>
        </div>
        {compactMeta ? null : <div className="mt-2"><PhaseBars phase={p.phase} /></div>}
        {showCondition ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[10px] uppercase tracking-wider text-white/55">
            <span className="inline-flex items-center gap-1.5">Confidence <ConfidenceDiamonds n={p.conf} /></span>
            <span className="inline-flex items-center gap-1.5">Fatigue <FatigueBars n={p.fatigue} /></span>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── champion card

export function ChampionCard({ c, prof, picked, used, onPick, testId, name, relevance }: {
  c: Champion; prof: number; picked: boolean; used: boolean; onPick: () => void; testId: string; name: string;
  /** A one-word reason this champion matters now (scouted matchup, rare play). */
  relevance?: string | null;
}) {
  const color = CLASS_COLOR[c.cls];
  const short = c.name.replace("SynChamp-", "Syn ");
  return (
    <label className={cn("relative shrink-0", used && "opacity-45")} data-testid={`champ-card-${c.id}`}>
      <input type="radio" name={name} className="peer sr-only" disabled={used} checked={picked} onChange={onPick} data-testid={testId} />
      <span style={{ "--cls": color } as CSSProperties}
        className={cn("dyn-ccard flex w-[128px] cursor-pointer flex-col gap-1.5 rounded-xl border p-2 text-left text-[11px] text-white/85 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#e3c66f] peer-disabled:cursor-not-allowed sm:w-[136px]",
          picked ? "border-[#e3c66f] bg-[linear-gradient(180deg,rgba(227,198,111,0.22),rgba(227,198,111,0.05))] shadow-[0_0_22px_-6px_rgba(227,198,111,0.75)]" : "border-white/14 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(7,17,31,0.4))] hover:border-white/35")}>
        <span className="flex items-center justify-between gap-1">
          <span className="flex items-center gap-1.5"><ClassGlyph cls={c.cls} size={16} /><span className="font-semibold text-white">{short}</span></span>
          {used ? <span className="text-[9px] font-bold uppercase text-white/50">used</span> : prof === 2 ? <span className="text-[#f2dc98]" title="Great">★</span> : prof === 0 ? <span className="text-[9px] font-bold uppercase text-white/40">off</span> : null}
        </span>
        <span className="flex items-center justify-between gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color }}>{c.cls}</span>
          <PhaseCurve phase={c.phase} color={color} />
        </span>
        <span className="flex flex-wrap gap-1">{c.tags.slice(0, 2).map((t) => <span key={t} className="rounded-sm border border-white/12 px-1 text-[9px] uppercase tracking-wider text-white/55">{TAG_LABEL[t]}</span>)}</span>
        <span className="flex items-center justify-between text-[9.5px] text-white/45">
          <span>{prof === 2 ? "Great" : prof === 1 ? "Fine" : "Off-pool"}</span>
          <span className="dyn-num">{(["early", "mid", "late"] as Stage[]).map((s) => `${STAGE_LABEL[s][0]}${c.phase[s]}`).join(" ")}</span>
        </span>
        {relevance ? <span className="dyn-relevance rounded-md border border-[#e3c66f]/50 bg-[#e3c66f]/10 px-1.5 py-0.5 text-center text-[9.5px] font-bold uppercase tracking-wider text-[#f2dc98]">{relevance}</span> : null}
        {picked ? <span className="dyn-title absolute right-1.5 top-1.5 rounded-sm bg-[#e3c66f] px-1 text-[8px] font-black uppercase tracking-wider text-[#1a1406]">Locked</span> : null}
      </span>
    </label>
  );
}
