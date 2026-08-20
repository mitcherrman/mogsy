/**
 * Compact, fixed-height summary of the last resolved round (Phase 2 compact
 * layout). The full RevealPanel pushed the next active round's controls below
 * the fold; this banner keeps the settlement readable in one reserved row and
 * makes the complete authoritative breakdown an opt-in expansion instead.
 *
 * Stateless about the data: every value is the same backend pass-through the
 * RevealPanel renders — nothing is recomputed here. The expansion mounts the
 * unchanged RevealPanel, so no detail is lost, only deferred.
 *
 * The one-row summary has a reserved min-height and the toggle sits in the
 * same slot in both states, so collapsing/expanding never reflows content
 * above it. A NEW settlement always starts collapsed.
 *
 * The expansion may be CONTROLLED (`open` + `onOpenChange`). The live arena
 * needs that because it only mounts this banner for the settlement reveal beat
 * — a banner that vanished out from under an open Details would be losing the
 * breakdown, not deferring it — so the arena keeps it mounted for as long as
 * the player has it open. A controlled parent owns the collapse-on-new-round
 * reset; uncontrolled callers keep doing it here.
 */
import { useState } from "react";
import { CheckCircle2, ChevronDown, Hourglass, Swords, XCircle } from "lucide-react";
import type { PlayerSlot } from "@/lib/ranked-core/viewTypes";
import {
  ResolvedCombatantView,
  ResolvedRoundView,
} from "@/lib/ranked-core/viewTypes";
import { RevealPanel } from "./RevealPanel";

const OUTCOME_COPY: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "Correct",
  incorrect: "Incorrect",
  timed_out: "Timed out",
};

/** RA10 combat-log glyphs: decorative, the copy beside them is unchanged. */
const OUTCOME_ICON: Record<ResolvedCombatantView["outcome"], React.JSX.Element> = {
  correct: <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-emerald-400" />,
  incorrect: <XCircle aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#e2757b]" />,
  timed_out: <Hourglass aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />,
};

/**
 * QUIZ1 Phase 11 — the RESULT HEADLINE.
 *
 * The banner used to say everything it knew in one 12px line
 * ("You Correct · Opponent Timed out"), which is technically complete and
 * practically unreadable in the 1.5s it is on screen. This promotes the two
 * facts a player actually needs — did I get it right, and what did that cost
 * — into one dominant sentence, and leaves every other value exactly where it
 * was: the per-side chips below, and the full breakdown behind Details.
 *
 * Reads the settlement and nothing else. No correctness is recomputed, no
 * damage is summed, and nothing here can disagree with the arena columns
 * because both render the same two `ResolvedCombatantView`s.
 */
export function resultHeadline(
  viewer: ResolvedCombatantView, opponent: ResolvedCombatantView,
): { verdict: string; detail: string | null; tone: ResolvedCombatantView["outcome"] } {
  const verdict = viewer.outcome === opponent.outcome
    ? ({ correct: "Both correct", incorrect: "Both incorrect",
         timed_out: "Both timed out" } as const)[viewer.outcome]
    : ({ correct: "Correct", incorrect: "Incorrect",
         timed_out: "Timed out" } as const)[viewer.outcome];
  // Dealt and taken are kept SEPARATE and both shown when both happened: a
  // round where each player answers differently produces exactly one of them,
  // but a shared-damage round produces both and collapsing them to a net
  // number would invent a value the settlement does not contain.
  const parts: string[] = [];
  if (viewer.finalDamageDealt > 0) parts.push(`${viewer.finalDamageDealt} damage dealt`);
  if (viewer.finalDamageReceived > 0) parts.push(`${viewer.finalDamageReceived} damage taken`);
  if (parts.length === 0 && viewer.shieldAbsorbed > 0) {
    parts.push(`${viewer.shieldAbsorbed} absorbed`);
  }
  return { verdict, detail: parts.length ? parts.join(" · ") : null, tone: viewer.outcome };
}

/**
 * The same result, compressed for the TOP match HUD.
 *
 * Built ON `resultHeadline` rather than beside it, so there is still exactly
 * one place that decides what a round was called: the header chip and the
 * banner can disagree about how much room they have, never about the verdict.
 *
 * The only thing added is a SHORTER damage clause. `resultHeadline`'s
 * "14 damage dealt · 12 damage taken" is the right sentence for a banner and
 * far too long for a strip that also carries the live round and the clock.
 */
export function compactResultHeadline(
  viewer: ResolvedCombatantView, opponent: ResolvedCombatantView,
): { verdict: string; detail: string | null; tone: ResolvedCombatantView["outcome"] } {
  const { verdict, tone } = resultHeadline(viewer, opponent);
  const parts: string[] = [];
  if (viewer.finalDamageDealt > 0) parts.push(`${viewer.finalDamageDealt} dmg`);
  if (viewer.finalDamageReceived > 0) parts.push(`took ${viewer.finalDamageReceived}`);
  if (parts.length === 0 && viewer.shieldAbsorbed > 0) {
    parts.push(`${viewer.shieldAbsorbed} absorbed`);
  }
  return { verdict, detail: parts.length ? parts.join(" · ") : null, tone };
}

const VERDICT_TONE: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "text-emerald-300",
  incorrect: "text-[#e2757b]",
  timed_out: "text-muted-foreground",
};

const VERDICT_ICON: Record<ResolvedCombatantView["outcome"], React.JSX.Element> = {
  correct: <CheckCircle2 aria-hidden className="h-6 w-6 shrink-0 text-emerald-400" />,
  incorrect: <XCircle aria-hidden className="h-6 w-6 shrink-0 text-[#e2757b]" />,
  timed_out: <Hourglass aria-hidden className="h-6 w-6 shrink-0 text-muted-foreground" />,
};

export interface RevealBannerProps {
  settlement: ResolvedRoundView;
  viewerSlot: "p1" | "p2";
  namesByPlayerId?: Record<string, string>;
  /** R1: does this match have an ability layer? Defaults to true; forwarded
   * to the embedded RevealPanel so the Details expansion agrees with the
   * live HUD about whether abilities exist at all. */
  showAbilities?: boolean;
  /** Controlled expansion. Omit for the original self-managed behaviour. */
  open?: boolean;
  /** Fired on every toggle, controlled or not. */
  onOpenChange?: (open: boolean) => void;
}

function SideSummary({
  player,
  name,
}: {
  player: ResolvedCombatantView;
  name: string;
}) {
  return (
    <span
      data-testid={`reveal-side-${player.playerId}`}
      className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground sm:border-l sm:border-white/10 sm:pl-3"
    >
      {OUTCOME_ICON[player.outcome]}
      <span>
        <span className="font-semibold text-foreground">{name}</span>{" "}
        {OUTCOME_COPY[player.outcome]}
        {player.finalDamageDealt > 0 && (
          <span className="tabular-nums text-[#e8c97a]"> · {player.finalDamageDealt} dmg</span>
        )}
        {player.leveledUp && " · Level up"}
      </span>
    </span>
  );
}

export function RevealBanner({
  settlement,
  viewerSlot,
  namesByPlayerId,
  // R1: forwarded verbatim to the Details expansion. Defaults to true, so the
  // banner is unchanged for every legacy caller.
  showAbilities = true,
  open: controlledOpen,
  onOpenChange,
}: RevealBannerProps) {
  const [selfOpen, setSelfOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : selfOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setSelfOpen(next);
    onOpenChange?.(next);
  };
  // A NEW settlement always starts collapsed (render-time reset, no effect
  // tick): the expanded breakdown never carries over to a later round. Only
  // for the UNCONTROLLED shape — calling a parent's setter during render is
  // not allowed, so a controlled parent owns its own reset.
  const [seen, setSeen] = useState(settlement);
  if (seen !== settlement) {
    setSeen(settlement);
    if (!controlled) setSelfOpen(false);
  }
  const opponentSlot: PlayerSlot = viewerSlot === "p1" ? "p2" : "p1";
  const viewer = settlement.players[viewerSlot];
  const opponent = settlement.players[opponentSlot];
  const nameOf = (p: ResolvedCombatantView) =>
    namesByPlayerId?.[p.playerId] ?? p.playerId;
  const { verdict, detail, tone } = resultHeadline(viewer, opponent);

  return (
    <section
      aria-label="Round result"
      data-testid="reveal-panel"
      className="ranked-panel px-3 py-2 sm:px-4"
    >
      {/* The dominant line. Reserved height so the Details toggle and the
          per-side row never move between a verdict with a damage clause and
          one without. */}
      <div
        data-testid="reveal-verdict"
        data-outcome={viewer.outcome}
        className="flex min-h-[3rem] items-center gap-3"
      >
        {VERDICT_ICON[viewer.outcome]}
        <div className="min-w-0">
          <p className={`text-lg font-black uppercase leading-tight tracking-[0.04em] sm:text-xl ${VERDICT_TONE[tone]}`}>
            {verdict}
          </p>
          <p
            data-testid="reveal-verdict-detail"
            className="min-h-[1rem] text-xs font-semibold tabular-nums text-[#e8c97a]"
          >
            {detail ?? ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          data-testid="reveal-details-toggle"
          className="ml-auto inline-flex min-h-[1.75rem] shrink-0 items-center gap-1 rounded px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Details
          <ChevronDown
            aria-hidden
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>
      {/* Both players' outcomes stay visible in the banner as well as in the
          arena columns — §10: the opponent's result must not live only in one
          of the two places. */}
      <div className="flex min-h-[2.25rem] flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          role="status"
          data-testid="reveal-headline"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
        >
          <Swords aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#d5b66f]" />
          <span>
            Round {settlement.roundNumber} resolved
            {settlement.endReason === "deadline_expired" && " — time expired"}
          </span>
        </span>
        <SideSummary player={viewer} name={nameOf(viewer)} />
        <SideSummary player={opponent} name={nameOf(opponent)} />
        {settlement.matchOver && (
          <span className="font-semibold" data-testid="reveal-match-over">
            Match over
          </span>
        )}
      </div>
      {open && (
        <div className="mt-2 border-t border-border pt-2">
          <RevealPanel
            settlement={settlement}
            viewerSlot={viewerSlot}
            namesByPlayerId={namesByPlayerId}
            testId="reveal-panel-details"
            showAbilities={showAbilities}
          />
        </div>
      )}
    </section>
  );
}
