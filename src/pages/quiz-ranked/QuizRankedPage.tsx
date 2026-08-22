/**
 * Public Ranked route (/quiz/ranked) — THE LIVE-MATCH HOST.
 *
 * WHAT THIS ROUTE IS, AFTER PLAY1
 * ───────────────────────────────
 * It hosts a live Ranked match and nothing else. `QuizRankedMatch` renders
 * here, inside the full-bleed `ranked-academy` frame that the arena's layout
 * depends on, and this is still where a reconnect, a refresh, or a
 * direct-navigation lands. That has not changed and must not: the route is
 * the match's home.
 *
 * WHAT WAS RETIRED
 * ────────────────
 * Its PRE-MATCH MENU. That screen re-asked everything the Leaguecraft lobby
 * had just answered — a duplicated rank summary, a duplicated selected role,
 * a Change Role control, a duplicated Recent Matches list — and then asked
 * for two things the player has no way to reason about: a Tank/Mage/Marksman
 * combat class, and an Easy/Standard/Hard bot difficulty behind a PLAYTEST
 * badge, described with copy ("Placeholder questions") that had not been true
 * for some time. Entry now belongs to the lobby's match-entry scroll, which
 * carries the role forward and runs the same queue.
 *
 * The role picker, the tier panel and the history list all still exist; they
 * are simply no longer this route's job.
 *
 * The bot survived too, as an ADMIN TESTING lever rather than a mode: the
 * match-entry scroll offers an admin a Match-with-Bot switch on the ordinary
 * Ranked join, and the backend creates a real unrated Ranked match. Its old
 * standalone client and endpoint are gone — one join, one authorization
 * point. Nothing about it is reachable from this route or from an ordinary
 * player's record.
 *
 * WHERE A MENULESS VISITOR GOES
 * ─────────────────────────────
 * Back to the lobby, with the record opened for them. A player who reaches
 * this route with no active match wanted to play — sending them to a dead end
 * (or to the retired menu) would be the wrong answer to a right intention, so
 * they are returned to `/quiz` and the match-entry scroll is opened there.
 * That is a one-way trip: the lobby never sends anyone back here without a
 * match, so it cannot loop.
 *
 * HOW THE MATCH IS FOUND, IN ORDER
 * ────────────────────────────────
 *   1. Router state. The scroll hands the match id over directly, so the
 *      handoff does not wait on a round trip and cannot flash the fallback.
 *   2. Account-bound discovery (`getActiveMatch`). The refresh/reconnect path
 *      and the only one that can find a BOT match, which is never in the
 *      queue. Still authoritative: the id in step 1 is a hint from this
 *      client, and the endpoint is the server's own answer.
 *
 * Requires a verified non-anonymous account; a signed-out visitor gets the
 * account gate rather than a redirect, because sending them to the lobby to
 * be told the same thing is a longer way round to the same sentence.
 */
import { useEffect, useState } from "react";
import { authHref } from "@/lib/auth/auth-destination";
import { Link, Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getActiveMatch } from "@/lib/ranked-public/client";
import { QuizRankedMatch } from "./QuizRankedMatch";

/**
 * Ordinary document-flow frame. There is no pinned-height / internal-scroll
 * variant any more: Ranked scrolls with the page like every other route, so the
 * browser scrollbar is the only one on screen.
 *
 * `ranked-academy` (RA4 Slice A) is the ONE place the Mogzy academy theme is
 * switched on. It is a presentation class only — every rule it carries lives in
 * index.css, it is applied nowhere else in the app, and no shared component
 * (question surface, quiz answer grid, arena primitives) knows it exists. The
 * background it paints is a fixed layer inside <main>, so it adds no height and
 * cannot reach the navbar or any floating control.
 */
function Frame({ children, size = "default" }:
{ children: React.ReactNode; size?: "default" | "wide" }) {
  return (
    <div className={`ranked-shell ranked-academy mx-auto w-full space-y-3 px-4 py-3 ${
      // RA10 widened the live-match frame a step at xl; RA11 lets it take the
      // full stage at large desktops (the route is full-bleed now, so main's
      // reading column no longer caps it). The centre question track — not the
      // fixed duelist rails — absorbs every extra pixel.
      size === "wide" ? "max-w-6xl xl:max-w-[76rem] min-[1500px]:max-w-[90rem]" : "max-w-3xl"}`}
      data-testid="quiz-ranked">
      {/* md:pl clears the shell's fixed "League Hub" pill (left-4, ~7rem wide),
          which sits on this row now that the heading is one line. The default
          frame's own left margin clears it from 1440px; the wide frame runs
          nearly stage-wide from 1500px, so it keeps the padding until its
          margin genuinely exceeds the pill (~1700px). */}
      <header className={`flex min-h-7 items-center justify-between gap-3 ${
        size === "wide"
          ? "md:pl-28 min-[1440px]:pl-0 min-[1500px]:pl-28 min-[1700px]:pl-0"
          : "md:pl-28 min-[1440px]:pl-0"}`}>
        <div className="flex items-baseline gap-2.5">
          <h1 className="ranked-title text-lg font-bold leading-tight">Ranked Duel</h1>
          <span className="ranked-eyebrow hidden sm:inline">Competitive Mode</span>
        </div>
        <Link to="/quiz" className="text-sm text-muted-foreground underline">Back to Quiz</Link>
      </header>
      {children}
    </div>
  );
}

/** This page's own route — the destination auth must return the user to. */
const RANKED_ROUTE = "/quiz/ranked";

export default function QuizRankedPage() {
  const { user } = useAuth();
  const account = user && !(user as { is_anonymous?: boolean }).is_anonymous ? user : null;

  if (!account) {
    return (
      <Frame>
        <section data-testid="ranked-account-required" className="ranked-panel p-5">
          <div className="ranked-eyebrow ranked-eyebrow--cyan">Account required</div>
          <h2 className="mt-1 font-semibold">Sign in to play Ranked</h2>
          <p className="text-sm text-muted-foreground">Ranked Duel requires a signed-in account.</p>
          {/* AUTH1: both actions carry this route as returnTo. Without it the
              Auth page fell back to its default (the League hub), which is the
              exact reported bug — start Ranked, get prompted, sign up, land in
              the hub instead of back in Ranked. */}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild data-testid="ranked-signup-link">
              <Link to={authHref(RANKED_ROUTE, { mode: "signup" })}>Create account</Link>
            </Button>
            <Button asChild variant="outline" data-testid="ranked-signin-link">
              <Link to={authHref(RANKED_ROUTE)}>Sign in</Link>
            </Button>
          </div>
        </section>
      </Frame>
    );
  }
  return <RankedMatchHost viewerUserId={account.id} />;
}

function RankedMatchHost({ viewerUserId }: { viewerUserId: string }) {
  const location = useLocation();
  // The handoff hint from the lobby's match-entry scroll. Read once: a later
  // re-render must not resurrect an id the account has since finished with.
  const [handoffMatchId] = useState<string | null>(() => {
    const state = location.state as { matchId?: unknown } | null;
    return typeof state?.matchId === "string" ? state.matchId : null;
  });
  const [discoveredMatchId, setDiscoveredMatchId] = useState<string | null>(null);
  const [discoveryDone, setDiscoveryDone] = useState(false);

  // Reconnect after a full page reload, and the ONLY way to rediscover an
  // active bot match (never in the queue, so queue status alone loses it).
  // Best-effort: a disabled or unreachable backend simply resolves to "no
  // match", and the route then returns the player to the lobby.
  useEffect(() => {
    const controller = new AbortController();
    getActiveMatch(controller.signal)
      .then((found) => { if (found) setDiscoveredMatchId(found.matchId); })
      .catch(() => { /* not recoverable — fall through to the lobby */ })
      .finally(() => setDiscoveryDone(true));
    return () => controller.abort();
  }, []);

  const liveMatchId = handoffMatchId ?? discoveredMatchId;

  if (liveMatchId) {
    return (
      <Frame size="wide">
        <QuizRankedMatch matchId={liveMatchId} viewerUserId={viewerUserId} />
      </Frame>
    );
  }

  // Don't decide there is nothing here until discovery has actually answered.
  if (!discoveryDone) {
    return (
      <Frame>
        <p data-testid="ranked-loading" className="text-sm text-muted-foreground">Loading Ranked…</p>
      </Frame>
    );
  }

  // No match, and no menu to show any more. Back to the modern lobby, with
  // the match-entry record opened — see WHERE A MENULESS VISITOR GOES.
  return <Navigate to="/quiz" replace state={{ openPlay: true }} />;
}
