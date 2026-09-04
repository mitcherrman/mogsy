import { Link } from "react-router-dom";
import { ArrowLeft, Trophy, Brain, BarChart3, Radio } from "lucide-react";
import SEOHead from "@/components/SEOHead";
import HexPanelLink from "@/components/lol/HexPanelLink";
import {
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
} from "@/lib/pro-play/routes";

/**
 * Pro Play hub — the landing page behind the academy hub's Pro Play book.
 *
 * The array below is the extension point: a Pro Play module is a further entry
 * and the page needs no other change. Every entry is something that is BUILT —
 * no placeholder "coming soon" tiles, because an empty promise is worse than a
 * short page.
 *
 * NOT to be confused with /lol/premium, which is the paid-subscription page. This
 * area is professional-play content and lives at /lol/pro-play.
 */

// Route identity lives in `@/lib/pro-play/routes` so the router can import it
// without pulling this page into the main bundle. Re-exported here because
// this module was their original home and several call sites import from it.
export {
  LEGACY_ESPORTS_LIVE_ROUTE,
  PRO_PLAY_GRAPHS_ROUTE,
  PRO_PLAY_LIVE_ROUTE,
  PRO_PLAY_QUIZ_ROUTE,
  PRO_PLAY_ROUTE,
} from "@/lib/pro-play/routes";

type ProPlayModule = {
  to: string;
  title: string;
  description: string;
  Icon: React.ElementType;
};

const MODULES: ProPlayModule[] = [
  {
    to: PRO_PLAY_LIVE_ROUTE,
    title: "Live & Recent Matches",
    // "Live &" is earned: the ingestion poller runs continuously and the page
    // shows a live scoreboard when a supported competition is playing. It is
    // NOT a promise that something is always on — most of the time the page
    // opens on games that just finished, which is why recency is named too.
    description:
      "Scoreboards, players, objectives and gold from pro games in progress — and the ones that just finished.",
    Icon: Radio,
  },
  {
    to: PRO_PLAY_QUIZ_ROUTE,
    title: "Pro Play Quiz",
    description: "Ten questions on champions, players and teams from pro play.",
    Icon: Brain,
  },
  {
    to: PRO_PLAY_GRAPHS_ROUTE,
    title: "Explore Pro Data",
    description:
      "Build graphs from real pro match history — players, teams, champions, picks and bans.",
    Icon: BarChart3,
  },
];

export default function ProPlayHub() {
  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Pro Play | Mogzy"
        description="Professional League of Legends play — live and recent match scoreboards, quizzes and data graphs drawn from real pro match history."
        path={PRO_PLAY_ROUTE}
      />
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link
          to="/lol"
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to the Academy
        </Link>

        <header className="mb-8">
          <div className="mb-2 flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#c9a84c]/30 bg-[#c9a84c]/10"
              aria-hidden="true"
            >
              <Trophy className="h-5 w-5 text-[#c9a84c]" />
            </span>
            <h1 className="text-3xl font-bold tracking-tight">Pro Play</h1>
          </div>
          <p className="text-muted-foreground">
            Professional League of Legends — drawn from real pro match history.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3">
          {MODULES.map((m) => (
            <HexPanelLink
              key={m.to}
              to={m.to}
              title={m.title}
              description={m.description}
              Icon={m.Icon}
              accent="gold"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
