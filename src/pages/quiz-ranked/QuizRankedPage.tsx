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
 * THE RANKED STAGE FRAME (RG1).
 *
 * Two things changed here, and they are the same change: the route now owns a
 * STABLE VIEWPORT REGION instead of being an ordinary flow document whose
 * height is whatever the current question happens to need.
 *
 * 1. THE RECLAIMED HUD BAND
 * ─────────────────────────
 * The shell reserves `--app-header-h` at the top of every page (Layout's
 * `pt-[var(--app-header-h)]`). That reservation is older than the chrome it
 * reserves for: the traditional navbar was retired and replaced by
 * `GlobalHud`, which is `position: fixed`, `pointer-events: none`, and paints
 * exactly two corner chips — measured at 1440px, a 44px hat at x 12–56 and a
 * 224px identity cluster at x 1204–1428. The other ~80% of that full-width
 * strip is empty, and on this route it pushed the arena down 56px for nothing.
 *
 * So from `lg` up the frame pulls itself back up into the band, the same way
 * `/lol` and `/quiz` already do (`md:-mt-[var(--app-header-h)]`) — the shell's
 * established idiom for a page that paints its own top edge, not an ad-hoc
 * nudge, and Layout is untouched so every other route keeps the reservation
 * (and with it the RA1 1.1 route-loading overflow fix).
 *
 * What moves INTO the band is the title row, which is the only thing here
 * short enough to share it. It is inset on BOTH sides — `pl` clears the hat,
 * `pr` clears the identity cluster — so the row lives in the strip's empty
 * middle and collides with neither chip. The arena starts immediately below
 * it, roughly 68px higher than before.
 *
 * 2. THE STAGE FLOOR
 * ──────────────────
 * From `lg` up the frame is a flex column with `min-h: --ranked-stage-h` — a
 * FLOOR, deliberately not a cap. Two things follow, and both are the point:
 *
 *  * the stage always fills the viewport, so the arena is as large as the
 *    screen allows rather than as small as the current question needs; and
 *  * content the floor cannot seat GROWS the stage instead of being clipped
 *    or handed a scrollbar of its own.
 *
 * The first draft of this phase capped the stage (`h-` rather than `min-h-`)
 * and gave the question card `overflow-y-auto`. That held the anchors, but it
 * bought them with a scrollbar inside the parchment — and the content audit
 * that followed showed the trade was never necessary. Every question Ranked
 * can currently serve (928 rows, all four-option) has a prompt of at most 108
 * characters and options of at most 63; the synthetic probe that forced the
 * scrollbar was 4.4x and 2.1x those bounds. So the floor is sized to seat real
 * content whole, and the pathological case is allowed to do the honest thing:
 * push the page and let the browser's own scrollbar handle it.
 *
 * Below `lg` the floor is deliberately NOT applied. There the arena stacks
 * into one column whose natural height genuinely exceeds any phone or tablet
 * viewport, and a floor would only add empty space above a page that is going
 * to scroll anyway.
 *
 * `ranked-academy` (RA4 Slice A) is the ONE place the Mogzy academy theme is
 * switched on. It is a presentation class only — every rule it carries lives in
 * index.css, it is applied nowhere else in the app, and no shared component
 * (question surface, quiz answer grid, arena primitives) knows it exists. The
 * background it paints is a fixed layer inside <main>, so it adds no height and
 * cannot reach the navbar or any floating control.
 */
export function Frame({ children, size = "default" }:
{ children: React.ReactNode; size?: "default" | "wide" }) {
  return (
    <div className={`ranked-shell ranked-academy mx-auto flex w-full flex-col gap-2 px-4 pt-3 pb-3
      lg:-mt-[var(--app-header-h)] lg:gap-1 lg:pb-2 lg:pt-1
      lg:min-h-[var(--ranked-stage-h)] ${
      // RA10 widened the live-match frame a step at xl; RA11 lets it take the
      // full stage at large desktops (the route is full-bleed now, so main's
      // reading column no longer caps it). The centre question track — not the
      // fixed duelist rails — absorbs every extra pixel.
      size === "wide" ? "max-w-6xl xl:max-w-[76rem] min-[1500px]:max-w-[90rem]" : "max-w-3xl"}`}
      data-testid="quiz-ranked">
      {/* THE TITLE ROW — from `lg`, INSIDE THE RECLAIMED HUD BAND.
          The left inset clears `GlobalHud`'s hat chip and the right inset
          clears its identity cluster, so the row occupies the strip's empty
          middle and collides with neither. The insets are `lg:` for a measured
          reason and not for tidiness: the two chips together are ~290px of
          chrome, and at 379px they leave the band with no free middle at all —
          the cluster alone spans x 147–371 there, straight through where this
          row's title would be. So narrow widths keep the shell's reservation
          and this row stays below it, exactly as before.
          `shrink-0` keeps the row out of the stage budget's flex distribution:
          the row is chrome, and only the match below it may take the rest. */}
      {/* The row is sized to its TEXT (one 28px line), not to the band it now
          sits in. Filling `--app-header-h` here spent 24px holding a strip
          open for chrome that is `position: fixed` and does not need it — the
          insets are what keep this row clear of the two chips, not its
          height. Those 24px went to the question. */}
      <header className="flex min-h-7 shrink-0 items-center justify-between gap-3
        lg:min-h-8 lg:pl-14 lg:pr-56">
        <div className="flex items-baseline gap-2.5">
          <h1 className="ranked-title text-lg font-bold leading-tight">Ranked Duel</h1>
          <span className="ranked-eyebrow hidden sm:inline">Competitive Mode</span>
        </div>
        <Link to="/quiz" className="text-sm text-muted-foreground underline">Back to Quiz</Link>
      </header>
      {/* The one region the match is given. `flex-1` grows it into everything
          the title row leaves; there is deliberately no `min-h-0`, because
          that is exactly the switch that lets a flex child be shorter than its
          content — which is what would clip a question or force it to scroll.
          Without it the automatic minimum size holds, so an oversized round
          grows this box, grows the stage, and scrolls the PAGE. */}
      <div className="flex flex-1 flex-col">{children}</div>
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
