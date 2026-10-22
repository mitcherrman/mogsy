/**
 * ROG1-D1 — shared pieces of the Worlds Dynasty page: the provenance banner,
 * the phase rail, rarity frames, proficiency bars, player cards and the roster
 * rail. Visual language follows the Worlds experience (`worlds-experience/parts`:
 * navy plate, gold hairlines) with Mogzy's role emblems and monogram portraits.
 */
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { PlayerPortraitSlot } from "@/components/pro-play/media/EntityCrest";
import { Eyebrow, GOLD_TEXT, SURFACE } from "@/components/pro-play/worlds-experience/parts";
import type { ChampionEntry, DynastyPhase, DynastyPlayer, DynastyRole, DynastySnapshot } from "@/lib/dynasty/contracts";
import { DYNASTY_ROLES } from "@/lib/dynasty/contracts";
import { RANKED_ROLE_OF, ROLE_LABEL, championName, fixed, sortedPool } from "@/lib/dynasty/model";
import { cn } from "@/lib/utils";
import { rarityStyle } from "./rarity";

export { Eyebrow, GOLD_TEXT, SURFACE };

// ───────────────────────────────────────────────────────────── provenance

export function SyntheticBanner({ snapshot }: { snapshot: DynastySnapshot | null }) {
  const label = snapshot?.catalog.label
    ?? "Worlds Dynasty runs on a labelled synthetic catalog: invented players, not real people or historical statistics.";
  return (
    <div
      role="note"
      data-testid="dynasty-synthetic-banner"
      className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] px-3 py-2 text-[11.5px] leading-snug text-amber-100/90"
    >
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
      <span>
        <strong className="font-semibold text-amber-200">Owner prototype · </strong>
        {label}
        {snapshot ? <span className="text-amber-100/60"> Catalog {snapshot.catalog.id}.</span> : null}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── phases

const PHASES: { id: DynastyPhase; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "relic", label: "Relic" },
  { id: "lineup", label: "Lineup" },
  { id: "completed", label: "Match" },
];

export function PhaseRail({ phase }: { phase: DynastyPhase | null }) {
  const at = phase ? PHASES.findIndex((p) => p.id === phase) : -1;
  return (
    <ol className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" aria-label="Run progress">
      {PHASES.map((p, i) => {
        const state = i < at ? "done" : i === at ? "current" : "todo";
        return (
          <li key={p.id} className="flex items-center gap-1.5" aria-current={state === "current" ? "step" : undefined}>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 transition-colors",
                state === "current" && "bg-[#e3c66f] text-[#1a1406]",
                state === "done" && "bg-white/[0.08] text-[#e3c66f]",
                state === "todo" && "text-white/35",
              )}
            >
              {p.label}
            </span>
            {i < PHASES.length - 1 ? <span aria-hidden className="h-px w-3 bg-white/15 sm:w-5" /> : null}
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────────────────────────────────────────── rarity


export function RarityChip({ rarity }: { rarity: string }) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]", rarityStyle(rarity).chip)}
      title="Rarity is cosmetic: the simulation never reads it."
    >
      {rarity}
    </span>
  );
}

// ───────────────────────────────────────────────────────────── small parts

export function RoleTag({ role, className }: { role: DynastyRole; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70", className)}>
      <RoleEmblem role={RANKED_ROLE_OF[role]} size="sm" decorative />
      {ROLE_LABEL[role]}
    </span>
  );
}

export function ProficiencyBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2" data-testid="proficiency-row">
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/80">{label}</span>
      <span
        className="relative h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label={`${label} proficiency`}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-400 to-emerald-300" style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-white/70">{value.toFixed(2)}</span>
    </div>
  );
}

export function StatFigure({ value, label, tone = "plain" }: { value: ReactNode; label: string; tone?: "plain" | "gold" }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-[24px] font-bold leading-none tabular-nums tracking-tight", tone === "gold" ? GOLD_TEXT : "text-white")}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── player card

export interface PlayerCardProps {
  player: DynastyPlayer;
  champions: readonly ChampionEntry[];
  selected?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Extra lines under the card: comparisons, synergy facts. */
  notes?: ReactNode;
  badge?: ReactNode;
  compact?: boolean;
  testId?: string;
}

export function PlayerCard({ player, champions, selected, disabled, onSelect, notes, badge, compact, testId }: PlayerCardProps) {
  const r = rarityStyle(player.rarity);
  const pool = sortedPool(player).slice(0, compact ? 2 : 3);
  const body = (
    <>
      <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b to-transparent opacity-80", r.glow)} />
      <span className="relative flex items-start gap-3">
        <PlayerPortraitSlot name={player.name} size={compact ? "sm" : "md"} className="border-white/15 bg-white/[0.06] text-white/70" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <RoleTag role={player.role} />
            <RarityChip rarity={player.rarity} />
            {badge}
          </span>
          <span className="mt-1 block truncate text-[15px] font-bold tracking-tight text-white">{player.name}</span>
        </span>
        <span className="relative shrink-0 text-right">
          <span className={cn("block text-[26px] font-bold leading-none tabular-nums", GOLD_TEXT)}>{fixed(player.rating)}</span>
          <span className="mt-1 block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/45">Rating</span>
        </span>
      </span>
      <span className="relative mt-2 flex flex-wrap gap-1" aria-label="Affiliation">
        {[player.org, player.region].filter(Boolean).map((a) => (
          <span key={a} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] text-white/65">{a}</span>
        ))}
        {!player.org && !player.region ? <span className="text-[10.5px] text-white/40">No affiliation</span> : null}
      </span>
      <span className="relative mt-3 block space-y-1.5">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/40">Best champions</span>
        {pool.map((e) => (
          <ProficiencyBar key={e.champion_key} value={e.proficiency} label={championName(e.champion_key, champions)} />
        ))}
      </span>
      {notes ? <span className="relative mt-3 block space-y-1 border-t border-white/[0.07] pt-2 text-[11.5px] leading-snug text-white/70">{notes}</span> : null}
    </>
  );
  const cls = cn(
    "relative block w-full rounded-2xl border bg-[linear-gradient(180deg,hsl(213_48%_12%),hsl(214_52%_8%))] p-3.5 text-left transition",
    r.ring,
    selected && "ring-2 ring-[#e3c66f] ring-offset-2 ring-offset-[#07101c] motion-safe:-translate-y-0.5",
    onSelect && !disabled && "hover:border-[#e3c66f]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e3c66f]",
    disabled && "opacity-50",
  );
  if (onSelect) {
    return (
      <button type="button" className={cls} aria-pressed={Boolean(selected)} disabled={disabled} onClick={onSelect} data-testid={testId}>
        {body}
      </button>
    );
  }
  return <div className={cls} data-testid={testId}>{body}</div>;
}

// ───────────────────────────────────────────────────────────── roster rail

export function RosterRail({ snapshot, champions }: { snapshot: DynastySnapshot; champions: readonly ChampionEntry[] }) {
  const { starters, substitutes } = snapshot.roster;
  const subsLeft = Math.max(0, 2 - substitutes.length);
  return (
    <section className={cn(SURFACE, "p-3.5")} aria-label="Your roster" data-testid="dynasty-roster">
      <div className="flex items-center justify-between">
        <Eyebrow>Your roster</Eyebrow>
        <span className="text-[11px] tabular-nums text-white/50">{snapshot.draft.picks.length}/{snapshot.draft.total_picks} drafted</span>
      </div>
      <ul className="mt-3 space-y-1.5">
        {DYNASTY_ROLES.map((role) => {
          const p = starters[role];
          const champ = snapshot.champions[role];
          return (
            <li key={role} className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2 py-1.5" data-testid={`roster-starter-${role}`}>
              <RoleEmblem role={RANKED_ROLE_OF[role]} size="md" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[13px] font-semibold", p ? "text-white" : "text-white/30")}>{p ? p.name : "Open"}</span>
                {champ ? <span className="block truncate text-[11px] text-teal-200/80">{championName(champ, champions)}</span> : null}
              </span>
              {p ? <span className={cn("text-[13px] font-bold tabular-nums", GOLD_TEXT)}>{fixed(p.rating)}</span> : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/40">Substitutes</p>
      <ul className="mt-1.5 space-y-1.5">
        {substitutes.map((p) => (
          <li key={p.player_id} className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 px-2 py-1.5" data-testid="roster-sub">
            <RoleEmblem role={RANKED_ROLE_OF[p.role]} size="sm" />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-white/85">{p.name}</span>
            <span className="text-[12px] tabular-nums text-white/60">{fixed(p.rating)}</span>
          </li>
        ))}
        {Array.from({ length: subsLeft }, (_, i) => (
          <li key={`open-${i}`} className="rounded-lg border border-dashed border-white/[0.07] px-2 py-1.5 text-[12px] text-white/25">Open bench slot</li>
        ))}
      </ul>
      {snapshot.relic ? (
        <div className="mt-3 rounded-lg border border-[#e3c66f]/25 bg-[#e3c66f]/[0.06] px-2.5 py-2" data-testid="roster-relic">
          <p className="text-[9.5px] font-semibold uppercase tracking-[0.16em] text-[#c9a84c]">Relic</p>
          <p className="text-[13px] font-semibold text-white">
            {snapshot.relic.name}
            {snapshot.relic.target_role ? <span className="font-normal text-white/60"> · {ROLE_LABEL[snapshot.relic.target_role]}</span> : null}
          </p>
          <p className="text-[11px] leading-snug text-white/60">{snapshot.relic.description}</p>
        </div>
      ) : null}
    </section>
  );
}
