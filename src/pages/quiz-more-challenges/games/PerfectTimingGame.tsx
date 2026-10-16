/**
 * PGM2 — Perfect Timing, the public bonus game: the PT4.4 page itself, on the
 * PUBLIC player-scoped run (`bonusTimingApi`) with a player host — the way
 * back to More Challenges, player-facing deal errors, and a report per round.
 * Timing is measured in the browser (owner decision: public practice, no
 * integrity claim); the page's own "Unverified timing" chip says so.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PerfectTimingPage from "@/pages/admin/perfect-timing/PerfectTimingPage";
import type { PtDealRound } from "@/lib/perfect-timing/contract";
import type { PtRevealView } from "@/lib/perfect-timing/viewModel";
import { MORE_CHALLENGES_ROUTE } from "@/lib/public-modes/launch";
import { bonusTimingApi } from "@/lib/public-modes/sessionsApi";
import type { PublicModeEntry } from "@/lib/public-modes/contracts";
import { GameLead, useBonusRoundReport } from "./publicGame";

const TITLE = "Perfect Timing";

export function timingDealErrorText(status: number | null, _message: string): string {
  if (status === null) return "Could not reach Mogzy. Check your connection and try again.";
  if (status === 503) return "Perfect Timing can't be played right now. Please try again later.";
  if (status === 429) return "Too many requests in a row. Wait a moment and try again.";
  if (status === 401 || status === 403) return "Your session ended. Reload the page to keep playing.";
  return "This game could not be dealt. Please try again.";
}

export default function PerfectTimingGame({ entry, api: injected }: {
  entry: PublicModeEntry | null;
  api?: ReturnType<typeof bonusTimingApi>;
}) {
  const navigate = useNavigate();
  const api = useMemo(() => injected ?? bonusTimingApi(), [injected]);
  const [shown, setShown] = useState<{ round: PtDealRound | null; reveal: PtRevealView | null; index: number }>(
    { round: null, reveal: null, index: 0 });

  const round = shown.round;
  useBonusRoundReport(entry, round ? {
    runtimeQuestionId: round.round_id,
    prompt: `Time the base cooldown of ${round.ability_name} (${round.champion} ${round.slot}`
      + `${round.rank !== null ? `, rank ${round.rank} of ${round.rank_count}` : ""}) at 0 ability haste.`,
    selectedAnswer: shown.reveal ? `${(shown.reveal.elapsedMs / 1000).toFixed(2)} s` : null,
    roundNumber: shown.index + 1,
    moduleType: "perfect_timing",
  } : null, shown.reveal ? {
    revealed: true,
    canonicalAnswer: `${(shown.reveal.targetMs / 1000).toFixed(2)} s`,
    evidence: `Cooldown by rank: ${shown.reveal.cooldownRaw}`,
  } : { revealed: false });

  const publicHost = useMemo(() => ({
    dealErrorText: timingDealErrorText,
    exitLabel: "Back to More Challenges",
    onExit: () => navigate(MORE_CHALLENGES_ROUTE),
    onRound: (r: PtDealRound | null, reveal: PtRevealView | null, index: number) => setShown({ round: r, reveal, index }),
  }), [navigate]);

  return (
    <div data-testid="perfect-timing-game">
      <PerfectTimingPage api={api} exitTo={MORE_CHALLENGES_ROUTE} lead={<GameLead title={TITLE} />}
        publicHost={publicHost} />
    </div>
  );
}
