/**
 * The previous round's result, in the TOP match HUD.
 *
 * WHY THIS EXISTS. The arena's four regions each answer one question — the top
 * strip is "where are we in this match", the centre is the question, the two
 * rails are the duelists, and the bottom is reserved for a round timeline. The
 * last settled round is match STATE, so it belongs in the top strip; it used
 * to live at the bottom of the page as a full-width banner that stayed
 * visually dominant for the whole of the next round ("ROUND 6 · Thinking…"
 * above, "CORRECT · 14 damage dealt · Round 5 resolved" below). This is the
 * compact, permanently-resident form of that; the banner is now transient (see
 * the reveal beat in `QuizRankedMatch`).
 *
 * SECONDARY BY CONSTRUCTION. The strip still leads with the live round, the
 * clock and the connection state, so this chip is small, quiet, one line, and
 * carries no control. It is hidden below `md`, where the strip has no room to
 * spare — the duelist columns' round ledgers carry the same history at every
 * width, so nothing is only here.
 *
 * Every value is authoritative settlement pass-through, read through
 * `compactResultHeadline` so the chip and the banner can never disagree about
 * what a round was called. Nothing is recomputed here.
 */
import { CheckCircle2, Hourglass, XCircle } from "lucide-react";
import type { PlayerSlot, ResolvedRoundView } from "@/lib/ranked-core/viewTypes";
import type { ResolvedCombatantView } from "@/lib/ranked-core/viewTypes";
import { compactResultHeadline } from "./RevealBanner";

const TONE: Record<ResolvedCombatantView["outcome"], string> = {
  correct: "text-emerald-300",
  incorrect: "text-[#e2757b]",
  timed_out: "text-muted-foreground",
};

const ICON: Record<ResolvedCombatantView["outcome"], typeof CheckCircle2> = {
  correct: CheckCircle2,
  incorrect: XCircle,
  timed_out: Hourglass,
};

export function RoundResultChip({
  settlement,
  viewerSlot,
  className = "",
}: {
  settlement: ResolvedRoundView;
  viewerSlot: PlayerSlot;
  className?: string;
}) {
  const opponentSlot: PlayerSlot = viewerSlot === "p1" ? "p2" : "p1";
  const viewer = settlement.players[viewerSlot];
  const opponent = settlement.players[opponentSlot];
  const { verdict, detail, tone } = compactResultHeadline(viewer, opponent);
  const Icon = ICON[tone];
  return (
    <div
      // `role="status"` and not `aria-live`: the reveal beat already announces
      // the verdict once, through the duelist columns' own status regions.
      // Announcing it a second time from the header would double up on every
      // single round.
      role="status"
      aria-label={`Round ${settlement.roundNumber} result: ${verdict}${detail ? `, ${detail}` : ""}`}
      data-testid="ranked-last-result"
      data-outcome={tone}
      data-round={settlement.roundNumber}
      className={`items-center gap-1.5 rounded-md border border-[#b9934c]/25 bg-white/[0.03] px-2 py-0.5 text-[11px] leading-tight ${className}`}
    >
      <span aria-hidden className="shrink-0 tabular-nums text-muted-foreground/70">
        R{settlement.roundNumber}
      </span>
      <Icon aria-hidden className={`h-3.5 w-3.5 shrink-0 ${TONE[tone]}`} />
      <span aria-hidden className={`font-bold uppercase tracking-[0.08em] ${TONE[tone]}`}>
        {verdict}
      </span>
      {detail && (
        <span aria-hidden className="whitespace-nowrap tabular-nums font-semibold text-[#e8c97a]">
          · {detail}
        </span>
      )}
    </div>
  );
}
