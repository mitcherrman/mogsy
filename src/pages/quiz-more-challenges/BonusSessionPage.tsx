/**
 * PGM2 — `/quiz/more-challenges/:mode`, the page a specialized bonus game is
 * played on (Rangefinder, Glyph Press, Perfect Timing, Stat Drop, Combat
 * Estimate). Public: the game's own session route decides who may play (any
 * verified player; a guest identity is minted on the first deal).
 *
 * The catalog decides whether the mode is open; a mode it does not open as a
 * session (unknown, coming soon, paused, or a Ranked-backed mode) is never
 * dealt here — the page says so and points back to More Challenges. The mode's
 * Rules ride in Mogzy's scroll beside the game.
 */
import { lazy, Suspense, type ComponentType } from "react";
import { Link, useParams } from "react-router-dom";
import SEOHead from "@/components/SEOHead";
import { BonusModeRules } from "@/components/public-modes/BonusModeRules";
import { usePublicModeCatalog } from "@/lib/public-modes/client";
import { isPublicModeId, type PublicModeEntry, type PublicModeId } from "@/lib/public-modes/contracts";
import { MORE_CHALLENGES_ROUTE } from "@/lib/public-modes/launch";
import { GameState } from "./games/publicGame";

type GameProps = { entry: PublicModeEntry | null };

const GAMES: Partial<Record<PublicModeId, ComponentType<GameProps>>> = {
  rangefinder: lazy(() => import("./games/RangefinderGame")),
  glyph_press: lazy(() => import("./games/GlyphPressGame")),
  perfect_timing: lazy(() => import("./games/PerfectTimingGame")),
  stat_drop: lazy(() => import("./games/StatDropGame")),
  combat_estimate: lazy(() => import("./games/CombatEstimateGame")),
};

export function isSessionGame(id: unknown): id is PublicModeId {
  return isPublicModeId(id) && id in GAMES;
}

function Closed({ title, message }: { title: string; message: string }) {
  return (
    <div data-testid="bonus-session-closed" className="min-h-screen w-full bg-[#050b15] px-4 pb-10 pt-20 text-[#efe8d6]">
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 text-center">
        <p className="ranked-eyebrow">{title}</p>
        <p className="text-sm text-[#a9b3c1]">{message}</p>
        <Link to={MORE_CHALLENGES_ROUTE} data-testid="bonus-session-back"
          className="min-h-[44px] rounded border border-[#d5b66f] bg-[#2a2110] px-4 py-3 text-xs uppercase tracking-[0.14em] text-[#f6e6bb]">
          Back to More Challenges
        </Link>
      </div>
    </div>
  );
}

export default function BonusSessionPage() {
  const { mode } = useParams();
  const catalog = usePublicModeCatalog();
  if (!isSessionGame(mode)) return <Closed title="More Challenges" message="That game isn't here." />;
  const Game = GAMES[mode]!;
  const entry = catalog.data?.modes.find((m) => m.id === mode) ?? null;
  const title = entry?.title ?? "Bonus game";

  if (catalog.isPending) return <GameState title={title} state="loading" />;
  if (!entry || entry.launch?.kind !== "session") {
    const message = entry?.availability.message
      ?? (catalog.isError ? "More Challenges could not be loaded." : "This game isn't open right now.");
    return <Closed title={title} message={message} />;
  }
  return (
    <>
      <SEOHead title={`${entry.title} — More Challenges | Mogzy`} description={entry.summary}
        path={`${MORE_CHALLENGES_ROUTE}/${entry.id}`} noindex />
      <Suspense fallback={<GameState title={entry.title} state="loading" />}>
        <Game entry={entry} />
      </Suspense>
      <BonusModeRules gameModeId={entry.id} />
    </>
  );
}
