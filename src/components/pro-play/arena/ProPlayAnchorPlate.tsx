/**
 * PPQ2-C — the ANCHOR PLATE: what a Pro Play question is about, drawn in the
 * stage's media region.
 *
 * One plate per anchor kind, all on the same dark board (`BoardPlate`):
 *
 *   champion → cinematic loading art, the champion's name in the arena title
 *              face, and the scope line;
 *   player   → a dossier plate: role emblem in a crest box, name, role,
 *              seasons and teams in scope. NO portrait — none exists in the
 *              contract, and a silhouette would read as real art;
 *   team     → a typographic crest: the server's short code in a gold shield
 *              (no logo exists in the contract), name, region, seasons,
 *              leagues;
 *   scope    → a competition plate: the competition in large type, its full
 *              name, and the time-window facts as medallions.
 *
 * ANSWER SAFETY. A plate draws the ANCHOR only — the one entity every option
 * is compared against — plus the server's scope and metric labels. It never
 * names, orders or emphasises an option, so it is identical whichever option
 * is correct. Nothing here reads `presentation`, `result` or `evidence`.
 *
 * FAILS SOFT. No context, an unknown anchor kind, no manifest, or an image
 * that 404s all degrade to a typographic plate of the same size. A missing
 * picture never costs the question.
 */
import { useId, useState } from "react";

import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import {
  getChampionLoading,
  getChampionSplash,
  useChampionAssets,
} from "@/hooks/useChampionAssets";
import type { ProPlayQuestionContext, ProPlaySubject } from "@/lib/pro-play/contract";
import { cn } from "@/lib/utils";
import { BoardPlate, PlateChip, PlateEyebrow } from "./ArenaOrnaments";
import {
  EMPTY_VALUE,
  anchorPlateKind,
  championKey,
  competitionTags,
  isRecent,
  leagueChips,
  monogram,
  optionLetter,
  rankedRoleFor,
  roleLabel,
  scopeTags,
  seasonsLabel,
  teamChips,
  windowTags,
} from "./proPlayArenaModel";

export interface ProPlayAnchorPlateProps {
  /** The narrowed pre-answer context (`asQuestionContext`). Null → plain plate. */
  context: ProPlayQuestionContext | null;
  /**
   * Fallback headline when there is no context at all (an older backend).
   * Pass the question's topic ("Champion" | "Player" | "Team"), never the stem.
   */
  fallbackTitle?: string | null;
  className?: string;
}

/** The scope + metric chips, in the server's order. Shared by every plate. */
export function PlateScopeLine({ context, className, withRecent = true }: {
  context: ProPlayQuestionContext;
  className?: string;
  withRecent?: boolean;
}) {
  return (
    <div data-pro-play-scope-line
      className={cn("flex min-w-0 flex-wrap items-center gap-1 overflow-hidden", className)}>
      {scopeTags(context).map((tag) => (
        <PlateChip
          key={`${tag.type}:${tag.id ?? tag.label}`}
          label={tag.label}
          tooltip={tag.tooltip}
          tone={tag.type === "league" || tag.type === "tournament" || tag.type === "pro_play"
            ? "competition" : "window"}
          testId="pro-play-scope-tag"
          dataType={tag.type}
        />
      ))}
      <PlateChip
        label={context.metric.label}
        tooltip={context.metric.tooltip}
        tone="metric"
        testId="pro-play-metric-tag"
        dataType="metric"
      />
      {withRecent && isRecent(context) ? <RecentChip context={context} /> : null}
    </div>
  );
}

function RecentChip({ context }: { context: ProPlayQuestionContext }) {
  const tag = (context.editorial_tags ?? []).find((t) => t.id === "recent_esports");
  return (
    <PlateChip label="Recent" tooltip={tag?.tooltip ?? tag?.label ?? null}
      tone="recent" testId="pro-play-editorial-tag" dataType="editorial" />
  );
}

/** The relationship label ("Champion → Player") as the plate's eyebrow. */
function RelationshipEyebrow({ context }: { context: ProPlayQuestionContext }) {
  return <PlateEyebrow>{context.relationship.label}</PlateEyebrow>;
}

/** Large name in the arena's title face. Truncates; the full name is the title. */
/**
 * Three type tiers by name LENGTH (a property of the anchor, identical for
 * every option), so "Nunu & Willump" and "Nongshim RedForce Academy" seat on
 * one line where "Udyr" stays monumental. Truncation is the last resort.
 */
function nameTier(name: string, shared: boolean): string {
  const n = name.length;
  if (n <= 11) {
    return cn("text-[1.45rem] sm:text-[1.8rem]",
      shared ? "lg:text-[clamp(1.35rem,2vw,2.1rem)]" : "lg:text-[clamp(1.5rem,2.6vw,2.6rem)]");
  }
  if (n <= 18) {
    return cn("text-[1.2rem] sm:text-[1.45rem]",
      shared ? "lg:text-[clamp(1.1rem,1.6vw,1.65rem)]" : "lg:text-[clamp(1.25rem,2vw,2rem)]");
  }
  return cn("text-base sm:text-[1.15rem]",
    shared ? "lg:text-[clamp(0.95rem,1.25vw,1.3rem)]" : "lg:text-[clamp(1.05rem,1.5vw,1.5rem)]");
}

function PlateName({ children, className, shared = false }: { children: string; className?: string; shared?: boolean }) {
  return (
    <h3 title={children}
      data-pro-play-plate-name
      className={cn(
        "ranked-title min-w-0 truncate font-bold uppercase leading-[1.05]",
        nameTier(children, shared),
        className,
      )}>
      {children}
    </h3>
  );
}

/** The arena title face, for decorative type that must keep its own colour. */
const TITLE_FACE = '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif';

// ─── Champion ──────────────────────────────────────────────────────────────

function ChampionPlate({ context, anchor }: { context: ProPlayQuestionContext; anchor: ProPlaySubject }) {
  const { data: manifest } = useChampionAssets();
  const key = championKey(anchor);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [backdropFailed, setBackdropFailed] = useState(false);
  // LOADING ART is the portrait (already composed around the character);
  // the SPLASH, dimmed, is only atmosphere behind the copy.
  const portrait = portraitFailed ? null : getChampionLoading(manifest, key ?? undefined);
  const backdrop = backdropFailed ? null : getChampionSplash(manifest, key ?? undefined);
  return (
    <BoardPlate kind="champion" label={`${context.relationship.label}: ${anchor.label}`}>
      {backdrop ? (
        <img src={backdrop} alt="" aria-hidden loading="lazy" decoding="async"
          onError={() => setBackdropFailed(true)}
          data-testid="pro-play-plate-backdrop"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-[center_28%] opacity-30 [filter:saturate(1.1)]" />
      ) : null}
      {portrait ? (
        <img src={portrait} alt="" aria-hidden loading="lazy" decoding="async"
          onError={() => setPortraitFailed(true)}
          data-testid="pro-play-plate-portrait"
          className="absolute inset-y-0 right-0 -z-10 h-full w-[48%] object-cover object-[center_18%] sm:w-[42%]"
          style={{
            WebkitMaskImage: "linear-gradient(to left, #000 58%, transparent 100%)",
            maskImage: "linear-gradient(to left, #000 58%, transparent 100%)",
          }} />
      ) : null}
      {/* Opaque behind the copy, clear over the portrait. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(90deg, rgba(7,17,31,0.96) 0%, rgba(7,17,31,0.86) 40%,"
            + " rgba(7,17,31,0.25) 72%, rgba(7,17,31,0) 100%),"
            + " linear-gradient(0deg, rgba(6,13,24,0.85) 0%, rgba(6,13,24,0) 45%)",
        }} />
      <div className="relative flex h-full min-w-0 flex-col justify-between gap-1 p-3 sm:p-4 lg:p-5 [@media(min-width:1024px)_and_(max-height:820px)]:p-3">
        <RelationshipEyebrow context={context} />
        <div className="min-w-0 max-w-[64%] space-y-1.5 sm:max-w-[60%] lg:space-y-2">
          <PlateName>{anchor.label}</PlateName>
          <PlateScopeLine context={context} />
        </div>
      </div>
    </BoardPlate>
  );
}

// ─── The field: every champion option, side by side (desktop) ─────────────

/**
 * When the options are champions and the anchor is NOT, the plate's art is
 * the whole field: one loading-art slice per option, in the server's order,
 * lettered like the tablets. Every option gets the same slice — a failed or
 * missing image keeps its slot as a dark panel — so the strip is symmetric by
 * construction and says nothing about which option is right.
 *
 * Desktop only: on a phone the plate is a compact strip and the tablets
 * already carry each champion's icon.
 */
function ChampionLineup({ subjects }: { subjects: ProPlaySubject[] }) {
  const { data: manifest } = useChampionAssets();
  return (
    <div aria-hidden data-pro-play-lineup={subjects.length}
      // A hard gold edge, never a fade: a fade would dim the first slice and
      // make one option visually weaker than the others.
      className="pointer-events-none absolute inset-y-0 right-0 -z-10 hidden w-[40%] border-l border-[#c9a84c]/50 lg:flex">
      {subjects.map((s, i) => (
        <LineupSlice key={`${s.label}:${i}`} index={i}
          url={getChampionLoading(manifest, championKey(s) ?? undefined)} />
      ))}
    </div>
  );
}

function LineupSlice({ url, index }: { url: string | null; index: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <div data-lineup-slice={index} className="relative h-full min-w-0 flex-1 overflow-hidden bg-[#0b1727] [&+&]:border-l [&+&]:border-[#c9a84c]/30">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="h-full w-full object-cover object-[center_14%] opacity-90" />
      ) : null}
      <span className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(6,13,24,0.92) 0%, rgba(6,13,24,0.1) 46%)" }} />
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-[4px] bg-[#c9a84c]/20 px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#e8c97a] shadow-[inset_0_0_0_1px_rgba(201,168,76,0.4)]">
        {optionLetter(index)}
      </span>
    </div>
  );
}

/** Champion subjects for the lineup, or null when the field is not champions. */
function championField(context: ProPlayQuestionContext): ProPlaySubject[] | null {
  const subjects = context.subjects ?? [];
  return subjects.length >= 2 && subjects.every((s) => s.kind === "champion") ? subjects : null;
}

// ─── Player dossier ────────────────────────────────────────────────────────

// PPQ2-INT: on a short desktop (lg, height <= 820px) the HUD row holds the reveal
// footer's height, so the media region is ~50px shorter: plates tighten their
// padding and the crest/shield shrink there, so no chip or line is clipped.
/** Role emblem in a navy crest box; FLEX/unknown shows the role word instead. */
function RoleCrest({ subject }: { subject: ProPlaySubject }) {
  const role = rankedRoleFor(subject);
  return (
    <div data-pro-play-role-crest={role ?? "none"}
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#c9a84c]/55 bg-[#0e1c2f] shadow-[inset_0_1px_0_rgba(240,215,140,0.25),0_0_18px_-6px_rgba(201,168,76,0.45)] sm:h-14 sm:w-14 lg:h-[4.5rem] lg:w-[4.5rem] [@media(min-width:1024px)_and_(max-height:820px)]:h-14 [@media(min-width:1024px)_and_(max-height:820px)]:w-14">
      {role ? (
        <RoleEmblem role={role} size="lg" decorative className="sm:scale-110 lg:scale-125" />
      ) : (
        <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#e8c97a]">
          {roleLabel(subject) === EMPTY_VALUE ? EMPTY_VALUE : roleLabel(subject)}
        </span>
      )}
    </div>
  );
}

/** "UP · FPX · ES +2" — the server's short codes; tooltips hold full names. */
function TeamLine({ subject, className }: { subject: ProPlaySubject; className?: string }) {
  const { shown, hidden } = teamChips(subject);
  if (!shown.length) return <span className={cn("text-white/50", className)}>{EMPTY_VALUE}</span>;
  return (
    <span data-pro-play-team-line className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((team) => (
        <PlateChip key={team.id ?? team.label} label={team.short ?? team.label}
          tooltip={team.short ? (team.tooltip ?? team.label) : null} tone="window" />
      ))}
      {hidden > 0 ? <span className="text-[10px] font-semibold text-white/60">+{hidden}</span> : null}
    </span>
  );
}

function PlayerPlate({ context, anchor }: { context: ProPlayQuestionContext; anchor: ProPlaySubject }) {
  const role = rankedRoleFor(anchor);
  const field = championField(context);
  return (
    <BoardPlate kind="player" label={`${context.relationship.label}: ${anchor.label}`}>
      {field ? <ChampionLineup subjects={field} /> : null}
      {/* A large, faint role emblem: the plate's art is the ROLE, never a face. */}
      {role ? (
        <span aria-hidden className={cn("pointer-events-none absolute -right-6 top-1/2 -z-10 -translate-y-1/2 opacity-[0.09] lg:right-4", field && "lg:hidden")}>
          <RoleEmblem role={role} size="lg" decorative className="!h-40 !w-40 lg:!h-56 lg:!w-56" />
        </span>
      ) : null}
      <div className="relative flex h-full min-w-0 flex-col justify-between gap-1 p-3 sm:p-4 lg:p-5 [@media(min-width:1024px)_and_(max-height:820px)]:p-3">
        <div className="flex items-center justify-between gap-2">
          <RelationshipEyebrow context={context} />
          <PlateEyebrow className={cn("hidden text-white/45 sm:block", field && "lg:hidden")}>Player dossier</PlateEyebrow>
        </div>
        <div className={cn("flex min-w-0 items-end gap-3 lg:gap-4", field && "lg:max-w-[58%]")}>
          <RoleCrest subject={anchor} />
          <div className="min-w-0 flex-1 space-y-1 lg:space-y-1.5">
            <PlateName shared={field !== null}>{anchor.label}</PlateName>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 sm:text-xs">
              <span data-testid="pro-play-plate-role" className="text-[#e8c97a]">{roleLabel(anchor)}</span>
              <span aria-hidden className="text-white/30">·</span>
              <span data-testid="pro-play-plate-seasons">{seasonsLabel(anchor)}</span>
            </div>
            <TeamLine subject={anchor} className="hidden sm:flex" />
            <PlateScopeLine context={context} className="hidden lg:flex" />
          </div>
        </div>
        {/* Phones: the scope line drops under the identity, full width. */}
        <PlateScopeLine context={context} className="lg:hidden" />
      </div>
    </BoardPlate>
  );
}

// ─── Team crest ────────────────────────────────────────────────────────────

/** A gold-edged heraldic shield carrying the server's short code. */
export function TeamShield({ label, short, size = "md", className }: {
  label: string;
  short?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const mark = monogram(label, short);
  // Unique per instance: a gradient whose <defs> sit in a hidden subtree does
  // not paint in Chromium, so shields must never share one id.
  const uid = useId().replace(/:/g, "");
  const box = size === "lg" ? "h-[4.75rem] w-16" : size === "md" ? "h-14 w-12" : "h-9 w-8";
  const type = mark.length >= 4
    ? (size === "sm" ? "text-[8px]" : "text-[11px] lg:text-xs")
    : mark.length === 3
      ? (size === "sm" ? "text-[9px]" : "text-[13px] lg:text-sm")
      : (size === "sm" ? "text-[11px]" : "text-base lg:text-lg");
  return (
    <span aria-hidden data-pro-play-shield={mark}
      className={cn("relative inline-flex shrink-0 items-center justify-center", box, className)}>
      {/* `!` sizes: hosted inside the shared Button, whose `[&_svg]:size-4`
          would otherwise shrink the shield to an icon. */}
      <svg viewBox="0 0 48 56" className="absolute inset-0 !h-full !w-full" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#19304d" />
            <stop offset="1" stopColor="#081322" />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f0d78c" />
            <stop offset="0.5" stopColor="#c9a84c" />
            <stop offset="1" stopColor="#7a5e22" />
          </linearGradient>
        </defs>
        <path d="M24 2 L45 9 V27 C45 40 36 49 24 54 C12 49 3 40 3 27 V9 Z"
          fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="2" />
        <path d="M24 7 L40 12.5 V27 C40 37.5 33 44.5 24 48.5 C15 44.5 8 37.5 8 27 V12.5 Z"
          fill="none" stroke="rgba(232,201,122,0.28)" strokeWidth="1" />
      </svg>
      <span className={cn("ranked-title relative -mt-1 font-black leading-none tracking-wide text-[#f0dcae]", type)}>
        {mark}
      </span>
    </span>
  );
}

function LeagueLine({ subject, className }: { subject: ProPlaySubject; className?: string }) {
  const { shown, hidden } = leagueChips(subject);
  if (!shown.length) return <span className={cn("text-white/50", className)}>{EMPTY_VALUE}</span>;
  return (
    <span data-pro-play-league-line className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      {shown.map((league) => (
        <PlateChip key={league.id} label={league.label}
          tooltip={league.tooltip !== league.label ? league.tooltip : null} tone="competition" />
      ))}
      {hidden > 0 ? <span className="text-[10px] font-semibold text-white/60">+{hidden}</span> : null}
    </span>
  );
}

function TeamPlate({ context, anchor }: { context: ProPlayQuestionContext; anchor: ProPlaySubject }) {
  const field = championField(context);
  return (
    <BoardPlate kind="team" label={`${context.relationship.label}: ${anchor.label}`}>
      {field ? <ChampionLineup subjects={field} /> : null}
      {/* The monogram, huge and faint, is the plate's art. */}
      <span aria-hidden
        style={{ fontFamily: TITLE_FACE }}
        className={cn(field && "lg:hidden", "pointer-events-none absolute -right-2 top-1/2 -z-10 -translate-y-1/2 select-none text-[6.5rem] font-black leading-none text-[#e8c97a]/[0.06] lg:right-4 lg:text-[10rem]")}>
        {monogram(anchor.label, anchor.short)}
      </span>
      <div className="relative flex h-full min-w-0 flex-col justify-between gap-1 p-3 sm:p-4 lg:p-5 [@media(min-width:1024px)_and_(max-height:820px)]:p-3">
        <div className="flex items-center justify-between gap-2">
          <RelationshipEyebrow context={context} />
          <PlateEyebrow className={cn("hidden text-white/45 sm:block", field && "lg:hidden")}>Team dossier</PlateEyebrow>
        </div>
        <div className={cn("flex min-w-0 items-end gap-3 lg:gap-4", field && "lg:max-w-[58%]")}>
          <TeamShield label={anchor.label} short={anchor.short} size="md" className="lg:h-[4.75rem] lg:w-16 [@media(min-width:1024px)_and_(max-height:820px)]:h-14 [@media(min-width:1024px)_and_(max-height:820px)]:w-12" />
          <div className="min-w-0 flex-1 space-y-1 lg:space-y-1.5">
            <PlateName shared={field !== null}>{anchor.label}</PlateName>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 sm:text-xs">
              <span data-testid="pro-play-plate-region" className="text-[#e8c97a]">
                {anchor.region?.trim() || EMPTY_VALUE}
              </span>
              <span aria-hidden className="text-white/30">·</span>
              <span data-testid="pro-play-plate-seasons">{seasonsLabel(anchor)}</span>
            </div>
            <LeagueLine subject={anchor} className="hidden sm:flex" />
            <PlateScopeLine context={context} className="hidden lg:flex" />
          </div>
        </div>
        <PlateScopeLine context={context} className="lg:hidden" />
      </div>
    </BoardPlate>
  );
}

// ─── Competition (scope) ───────────────────────────────────────────────────

/** A medallion caption for a window tag, unless its label already says it. */
const WINDOW_CAPTION: Record<string, string> = { year: "Season", patch: "Patch", all_time: "Window" };
function windowCaption(type: string, label: string): string | null {
  const caption = WINDOW_CAPTION[type];
  if (!caption) return null;
  return label.toUpperCase().includes(caption.toUpperCase()) ? null : caption;
}

function CompetitionPlate({ context, anchor }: { context: ProPlayQuestionContext; anchor: ProPlaySubject | null }) {
  const competitions = competitionTags(context);
  const windows = windowTags(context);
  const field = championField(context);
  const headline = competitions.length
    ? competitions.map((t) => t.label).join(" · ")
    : (anchor?.label ?? context.relationship.label);
  // The full name the short label stands for, when the server supplied one.
  const fullName = competitions.length === 1 && competitions[0].tooltip
    && competitions[0].tooltip !== competitions[0].label
    ? competitions[0].tooltip
    : null;
  return (
    <BoardPlate kind="scope" label={`${context.relationship.label}: ${anchor?.label ?? headline}`}>
      {field ? <ChampionLineup subjects={field} /> : null}
      {/* Concentric gold rings: a trophy-room medallion, purely typographic. */}
      <span aria-hidden className={cn("pointer-events-none absolute -right-10 top-1/2 -z-10 h-56 w-56 -translate-y-1/2 rounded-full border border-[#c9a84c]/15 lg:right-6 lg:h-72 lg:w-72", field && "lg:hidden")}>
        <span className="absolute inset-5 rounded-full border border-[#c9a84c]/10" />
        <span className="absolute inset-12 rounded-full border border-[#c9a84c]/[0.07]" />
      </span>
      <div className="relative flex h-full min-w-0 flex-col justify-between gap-1 p-3 sm:p-4 lg:p-5 [@media(min-width:1024px)_and_(max-height:820px)]:p-3">
        {/* Recent sits beside the eyebrow, on the copy side, so it never
            lands on one lineup slice and favours that option. */}
        <div className="flex min-w-0 items-center gap-2">
          <RelationshipEyebrow context={context} />
          {isRecent(context) ? <RecentChip context={context} /> : null}
        </div>
        <div className={cn("min-w-0 space-y-1 lg:space-y-1.5", field && "lg:max-w-[58%]")}>
          <PlateEyebrow className="hidden text-white/50 lg:block">Competition</PlateEyebrow>
          <PlateName shared={field !== null}>{headline}</PlateName>
          {fullName ? (
            <p data-testid="pro-play-plate-fullname" title={fullName}
              className="hidden truncate text-xs font-medium text-white/75 sm:block lg:text-sm">
              {fullName}
            </p>
          ) : null}
        </div>
        {/* Time-window facts as medallions (season, patch, all-time), as
            served, then the metric. One wrapping row at every width. */}
        <div data-pro-play-window-facts
          className={cn("flex min-w-0 flex-wrap items-center gap-1.5 lg:gap-2", field && "lg:max-w-[58%]")}>
          {windows.map((tag) => (
            <span key={`${tag.type}:${tag.id ?? tag.label}`} title={tag.tooltip ?? undefined}
              data-tag-type={tag.type}
              className="inline-flex items-baseline gap-1 rounded-md border border-[#c9a84c]/40 bg-[#0e1c2f]/90 px-1.5 py-[3px] shadow-[inset_0_1px_0_rgba(240,215,140,0.2)] lg:px-2 lg:py-1">
              {windowCaption(tag.type, tag.label) ? (
                <span className="text-[8px] font-bold uppercase leading-none tracking-[0.16em] text-white/50 lg:text-[9px]">
                  {windowCaption(tag.type, tag.label)}
                </span>
              ) : null}
              <span className="whitespace-nowrap text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-[#f0dcae] lg:text-xs">
                {tag.label}
              </span>
            </span>
          ))}
          <PlateChip label={context.metric.label} tooltip={context.metric.tooltip} tone="metric"
            testId="pro-play-metric-tag" dataType="metric" />
        </div>
      </div>
    </BoardPlate>
  );
}

// ─── Fallback ──────────────────────────────────────────────────────────────

function PlainPlate({ title }: { title: string }) {
  return (
    <BoardPlate kind="none" label="Pro Play question">
      <div className="relative flex h-full min-w-0 flex-col justify-between p-3 sm:p-4 lg:p-5">
        <PlateEyebrow>Pro Play</PlateEyebrow>
        <PlateName>{title}</PlateName>
      </div>
    </BoardPlate>
  );
}

/** The anchor plate for one question. Pure presentation; no data fetching beyond the asset manifest. */
export default function ProPlayAnchorPlate({ context, fallbackTitle, className }: ProPlayAnchorPlateProps) {
  const kind = anchorPlateKind(context);
  const anchor = context?.anchor ?? null;
  let plate;
  if (!context) plate = <PlainPlate title={fallbackTitle?.trim() || "Pro Play"} />;
  else if (kind === "champion" && anchor) plate = <ChampionPlate context={context} anchor={anchor} />;
  else if (kind === "player" && anchor) plate = <PlayerPlate context={context} anchor={anchor} />;
  else if (kind === "team" && anchor) plate = <TeamPlate context={context} anchor={anchor} />;
  else plate = <CompetitionPlate context={context} anchor={anchor} />;
  return (
    <div data-pro-play-anchor-plate={context ? kind : "plain"} className={cn("flex w-full min-w-0 lg:h-full lg:min-h-0", className)}>
      {plate}
    </div>
  );
}
