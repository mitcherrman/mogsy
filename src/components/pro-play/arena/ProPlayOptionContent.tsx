/**
 * PPQ2-C — the CONTENT of a premium Pro Play answer tablet.
 *
 * Not a tablet and not a grid. Mogzy has exactly one answer-rendering path
 * (InteractiveScenarioSurface → AnswerGrid → QuizAnswerOptions, guarded by
 * `AnswerGrid.elimination.test.tsx`), and these pieces stay inside it: the
 * canonical button keeps the selection, gating, letter keycap, every state
 * (selected / locked / correct / incorrect / eliminated), the verdict icons,
 * "Your pick" and the academy theme. What this module supplies is what goes
 * INSIDE that button, positionally, through the proposed `optionContent`
 * seam (docs/handoffs/PPQ2-C.md §4): a champion icon, a role crest or a team
 * shield, the name in large type, and the contract's identity facts.
 *
 * ANSWER SAFETY.
 *  - One node per option, in the order given; nothing is sorted or filtered.
 *  - Symmetric: rich for every option or `content: null` for all of them
 *    (`alignTabletIdentities`), the canonical label-only tablet then stands.
 *    Every rich node draws the same rows, "—" for an absent value, and the
 *    media box is mounted on every node.
 *  - Reveal slots (PPQ2-D) are mounted only when `revealed` is true, which a
 *    caller may set only after the server graded the answer. They share one
 *    cell with the identity facts, so they replace them in place instead of
 *    growing the tablet.
 *  - Nothing in a node is interactive (it lives inside a button); full names
 *    ride on `title`.
 */
import { useState, type ReactNode } from "react";

import { RoleEmblem } from "@/components/ranked-arena/RoleEmblem";
import { getChampionIcon, useChampionAssets } from "@/hooks/useChampionAssets";
import type { ProPlayQuestionContext, ProPlaySubject } from "@/lib/pro-play/contract";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";
import { cn } from "@/lib/utils";
import { TeamShield } from "./ProPlayAnchorPlate";
import {
  EMPTY_VALUE,
  alignTabletIdentities,
  leagueChips,
  monogram,
  rankedRoleFor,
  roleLabel,
  seasonsLabel,
  tabletLayout,
  teamChips,
  type TabletIdentities,
  type TabletIdentity,
  type TabletLayout,
} from "./proPlayArenaModel";

// ─── Identity pieces (non-interactive: they live inside a button) ─────────

const META = "text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] sm:text-[11px]";

/**
 * ONE LINE OF CODES, NEVER A CLIPPED CHIP. The row wraps, but is exactly one
 * chip tall with its overflow hidden, so a chip that does not fit drops onto
 * the hidden second line whole instead of being cut in half or overlapping
 * the facts beside it. Every code is still in the row's `title`.
 */
const CODE_ROW = "flex h-4 min-w-0 flex-wrap items-center gap-1 overflow-hidden";

/** Compact facts: stacked in the 2x2 grid, one line in the single column. */
const COMPACT_FACTS = "items-start max-lg:flex-row max-lg:items-center max-lg:gap-x-2.5";

/** A short code chip as plain text; the full name is its `title`. */
function CodeChip({ label, title }: { label: string; title?: string | null }) {
  return (
    <span title={title ?? undefined}
      className="inline-flex shrink-0 rounded-[3px] border border-white/15 bg-white/[0.06] px-1 py-px text-[9px] font-bold leading-none tracking-[0.06em] opacity-90 sm:text-[10px]">
      {label}
    </span>
  );
}

function TeamCodes({ subject }: { subject: ProPlaySubject }) {
  const { shown, hidden } = teamChips(subject);
  if (!shown.length) return <span className="opacity-60">{EMPTY_VALUE}</span>;
  return (
    <span data-pp-tablet-teams title={shown.map((t) => t.label).join(" · ")} className={CODE_ROW}>
      {shown.map((t) => (
        <CodeChip key={t.id ?? t.label} label={t.short ?? t.label} title={t.short ? t.label : null} />
      ))}
      {hidden > 0 ? <span className="shrink-0 text-[10px] opacity-70">+{hidden}</span> : null}
    </span>
  );
}

function LeagueCodes({ subject }: { subject: ProPlaySubject }) {
  const { shown, hidden } = leagueChips(subject);
  if (!shown.length) return <span className="opacity-60">{EMPTY_VALUE}</span>;
  return (
    <span data-pp-tablet-leagues title={shown.map((l) => l.tooltip ?? l.label).join(" · ")} className={CODE_ROW}>
      {shown.map((l) => (
        <CodeChip key={l.id} label={l.label} title={l.tooltip !== l.label ? l.tooltip : null} />
      ))}
      {hidden > 0 ? <span className="shrink-0 text-[10px] opacity-70">+{hidden}</span> : null}
    </span>
  );
}

/** Role mark for a player tablet. FLEX/unknown keeps the same box, empty. */
function RoleMark({ subject, large }: { subject: ProPlaySubject; large: boolean }) {
  const role = rankedRoleFor(subject);
  return (
    <span data-pp-tablet-role={role ?? "none"}
      className={cn("inline-flex shrink-0 items-center justify-center",
        large ? "h-8 w-8 rounded-md border border-[#c9a84c]/45 bg-black/25" : "h-3.5 w-3.5")}>
      {role ? <RoleEmblem role={role} size={large ? "md" : "sm"} decorative />
        // FLEX / unknown: a quiet neutral mark in the same box, so the row
        // keeps its rhythm without inventing a lane.
        : <span className={cn("rounded-full border border-dashed border-[#e8c97a]/60", large ? "h-4 w-4" : "h-2.5 w-2.5")} />}
    </span>
  );
}

/** Fixed champion icon box. The box never depends on whether the art loaded. */
function ChampionIcon({ championKey, label, large }: { championKey: string | null; label: string; large: boolean }) {
  const { data: manifest } = useChampionAssets();
  const [failed, setFailed] = useState(false);
  const url = failed ? null : getChampionIcon(manifest, championKey ?? undefined);
  return (
    <span aria-hidden data-option-media data-option-media-state={url ? "ok" : failed ? "error" : "empty"}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#050b14]",
        "shadow-[0_0_0_1px_rgba(201,168,76,0.55),0_0_14px_-4px_rgba(201,168,76,0.5)]",
        large ? "h-14 w-14 lg:h-16 lg:w-16" : "h-9 w-9",
      )}>
      {url ? (
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}
          className="h-full w-full scale-[1.08] object-cover" />
      ) : (
        <span className="ranked-title text-[11px] font-bold text-[#e8c97a]/80">{monogram(label)}</span>
      )}
    </span>
  );
}

/** The media box for one tablet, by identity kind. Same box on every tablet. */
function TabletMedia({ identity, large }: { identity: TabletIdentity; large: boolean }) {
  switch (identity.kind) {
    case "champion":
      return <ChampionIcon championKey={identity.championKey} label={identity.label} large={large} />;
    case "player":
      return large ? <RoleMark subject={identity.subject} large /> : null;
    case "team":
      return <TeamShield label={identity.label} short={identity.subject.short} size="sm"
        className={large ? "h-11 w-10" : undefined} />;
    default:
      return null;
  }
}

/**
 * The identity facts under the name. Same rows, same order, for every tablet
 * of a kind. `compact` (grid/stack) collapses them to one line.
 */
function TabletFacts({ identity, compact }: { identity: TabletIdentity; compact: boolean }) {
  if (identity.kind === "player") {
    const s = identity.subject;
    return (
      // The codes take their own line in the 2x2 grid, where beside the facts
      // the row would have no room. Below `lg` that grid is ONE full-width
      // column (PPQ2-INT density), so a compact tablet puts them beside the
      // facts; the row still drops whole chips, never half of one.
      <span className={cn("flex min-w-0 flex-col gap-1", compact ? COMPACT_FACTS : "items-center")}>
        <span className={cn("flex shrink-0 items-center gap-1.5", META)}>
          {compact ? <RoleMark subject={s} large={false} /> : null}
          <span data-pp-fact="role" className="shrink-0 text-[#e8c97a]">{roleLabel(s)}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span data-pp-fact="seasons" className="shrink-0">{seasonsLabel(s)}</span>
        </span>
        <TeamCodes subject={s} />
      </span>
    );
  }
  if (identity.kind === "team") {
    const s = identity.subject;
    return (
      // The codes take their own line in the 2x2 grid, where beside the facts
      // the row would have no room. Below `lg` that grid is ONE full-width
      // column (PPQ2-INT density), so a compact tablet puts them beside the
      // facts; the row still drops whole chips, never half of one.
      <span className={cn("flex min-w-0 flex-col gap-1", compact ? COMPACT_FACTS : "items-center")}>
        <span className={cn("flex shrink-0 items-center gap-1.5", META)}>
          <span data-pp-fact="region" className="shrink-0 text-[#e8c97a]">{s.region?.trim() || EMPTY_VALUE}</span>
          <span aria-hidden className="opacity-40">·</span>
          <span data-pp-fact="seasons" className="shrink-0">{seasonsLabel(s)}</span>
        </span>
        <LeagueCodes subject={s} />
      </span>
    );
  }
  return null;
}

// ─── One option's content ─────────────────────────────────────────────────

export interface ProPlayOptionContentProps {
  identity: TabletIdentity;
  /** "facing" = a two-way comparison (centred column); otherwise a compact row. */
  layout: TabletLayout;
  /** PPQ2-D reveal content; pass it ONLY after grading. */
  revealSlot?: ReactNode | null;
}

export function ProPlayOptionContent({ identity, layout, revealSlot = null }: ProPlayOptionContentProps) {
  const facing = layout === "facing";
  const hasFacts = identity.kind === "player" || identity.kind === "team";
  const facts = hasFacts ? <TabletFacts identity={identity} compact={!facing} /> : null;
  // Facts and the reveal slot share ONE grid cell: the slot replaces the
  // facts in place, and the facts stay (invisible) to hold the box.
  const factCell = facts || revealSlot ? (
    <span className={cn("grid min-w-0 [grid-template-areas:'cell']", facing && "justify-items-center")}>
      {facts ? (
        <span data-pp-tablet-facts aria-hidden={revealSlot ? true : undefined}
          className={cn("min-w-0 [grid-area:cell]", revealSlot ? "invisible" : undefined)}>
          {facts}
        </span>
      ) : null}
      {revealSlot ? <span data-pp-reveal-slot className="min-w-0 [grid-area:cell]">{revealSlot}</span> : null}
    </span>
  ) : null;
  const media = <TabletMedia identity={identity} large={facing} />;
  return facing ? (
    <span data-pp-option-content={identity.kind} data-pp-layout="facing"
      className="flex w-full min-w-0 flex-col items-center gap-1 text-center lg:gap-1.5">
      {media}
      <span data-pp-tablet-name title={identity.label}
        className="line-clamp-2 w-full break-words text-[15px] font-bold leading-tight sm:text-base lg:text-[1.0625rem]">
        {identity.label}
      </span>
      {factCell}
    </span>
  ) : (
    <span data-pp-option-content={identity.kind} data-pp-layout="compact"
      className="flex w-full min-w-0 items-center gap-2 sm:gap-2.5">
      {media}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span data-pp-tablet-name title={identity.label}
          className="truncate text-sm font-bold leading-tight sm:text-[15px]">
          {identity.label}
        </span>
        {factCell}
      </span>
    </span>
  );
}

// ─── The positional slots for one question ───────────────────────────────

/** The canonical grid's column strategy this question asks for. */
export type ProPlayAnswerColumns = "pair" | "wide-2" | "auto";

export interface ProPlayAnswerSlots {
  identities: TabletIdentities;
  layout: TabletLayout;
  /** "pair" for two options (side by side at every width), "wide-2" for 3–4. */
  columns: ProPlayAnswerColumns;
  /** One node per option, or null → the canonical label-only tablets. */
  optionContent: ReactNode[] | null;
  /** The VS seam between a pair, or null. */
  pairDivider: ReactNode | null;
}

/**
 * Everything the canonical grid needs from Pro Play for one question, from
 * the options and the pre-answer context alone. `revealSlots` are attached
 * only when `revealed` is true.
 */
export function proPlayAnswerSlots({ options, context, revealed = false, revealSlots }: {
  options: AnswerOptionView[];
  context: ProPlayQuestionContext | null;
  revealed?: boolean;
  revealSlots?: ReadonlyArray<ReactNode | null>;
}): ProPlayAnswerSlots {
  const identities = alignTabletIdentities(options, context);
  const layout = tabletLayout(options.length);
  const columns: ProPlayAnswerColumns = layout === "facing" ? "pair" : layout === "grid" ? "wide-2" : "auto";
  const optionContent = identities.kind === "plain"
    ? null
    : identities.items.map((identity, i) => (
      <ProPlayOptionContent key={`${i}:${identity.label}`} identity={identity} layout={layout}
        revealSlot={revealed ? (revealSlots?.[i] ?? null) : null} />
    ));
  return {
    identities,
    layout,
    columns,
    optionContent,
    pairDivider: layout === "facing" ? <ProPlayVersusSeam /> : null,
  };
}

/** The small seam medallion between two facing tablets. Pairwise only. */
export function ProPlayVersusSeam() {
  return (
    <div aria-hidden data-pp-seam className="pointer-events-none relative flex h-full w-5 flex-col items-center justify-center sm:w-7">
      <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2"
        style={{ background: "linear-gradient(180deg, transparent, rgba(185,147,76,0.55), transparent)" }} />
      <span className="ranked-title relative flex h-6 w-6 items-center justify-center rounded-full border border-[#b9934c]/70 bg-[#0b1727] text-[8px] font-black tracking-wide text-[#e8c97a] shadow-[0_0_10px_-2px_rgba(185,147,76,0.6)] sm:h-7 sm:w-7 sm:text-[9px]">
        VS
      </span>
    </div>
  );
}
