/**
 * PLAY1 — `/dev/play-scroll`: the match-entry record in every state it has.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Most of the record's states cannot be reached by looking at it. "Searching
 * for an opponent" needs a live queue; "Opponent found" needs a SECOND player
 * and a pairing pass landing between two polls; "Ranked is closed right now"
 * needs the backend switch thrown. A state nobody can look at is a state
 * nobody has checked, so this page renders the real `PlayScrollRecord` — the
 * same component `/quiz` mounts — against a fabricated queue controller and
 * lets each beat be selected.
 *
 * ISOLATION, as a rule rather than an intention:
 *  - it fetches nothing and writes nothing. The controller below is a plain
 *    object; its `join`/`cancel` only move this page's own selector;
 *  - the real `useRankedQueue` is never mounted here, so no poll, no join and
 *    no cancel can reach the Ranked service from this route;
 *  - the roster inside Invite & Play is the one thing that IS real, because
 *    it is read by `useFriends` inside that view — it is a read of the
 *    signed-in account's own friendships and nothing else;
 *  - `/dev/*` is a `developer_route` under the ads policy and is linked from
 *    no navigation.
 *
 * Deleting this directory and its route line removes the preview completely.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import PlayScrollRecord from "@/components/quiz/play-scroll/PlayScrollRecord";
import InvitePlayView from "@/components/quiz/play-scroll/InvitePlayView";
import type { FriendRow } from "@/hooks/useFriends";
import type { QueueController, QueueState } from "@/pages/quiz-ranked/useRankedQueue";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";

/** The beats worth looking at, in the order a player meets them. */
const BEATS: { id: QueueState; label: string }[] = [
  { id: "selecting_class", label: "Ready" },
  { id: "joining", label: "Joining" },
  { id: "waiting", label: "Searching" },
  { id: "pairing", label: "Opponent found" },
  { id: "matched", label: "Preparing" },
  { id: "unavailable", label: "Closed" },
  { id: "fatal", label: "Error" },
];

const ROLES: RankedRole[] = ["top", "jungle", "mid", "adc", "support"];

/** A representative standing, so the record's Ranked line has something in it. */
const PROGRESSION = {
  schemaVersion: "ranked_duel.progression.v1",
  serverTime: "2026-08-21T00:00:00Z",
  rating: 1320,
  tier: "silver",
  nextTier: "gold",
  tierFloorRating: 1200,
  nextTierRating: 1450,
  ratingToNext: 130,
  progressPercent: 46,
  rated: true,
  matchesRated: 40,
} as unknown as RankedProgressionView;

const DAILY = {
  date: "2026-08-21", answered: 2, correct: 2, target: 5, xpBonus: 250,
  dailyStreak: 4, lastCompletedDate: null, completed: false, remaining: 3,
  themeTitle: "Item Knowledge", themeBlurb: "Recipes and component paths.",
};

/** The same day, finished. The completed clause is otherwise only reachable
 *  by actually answering the day's set, which is not a thing a preview can
 *  do — and a state nobody can look at is a state nobody has checked. */
const DAILY_DONE = {
  ...DAILY, answered: 5, correct: 4, completed: true, remaining: 0,
  lastCompletedDate: "2026-08-21",
};

/**
 * A roster, so the POPULATED and CHOSEN states of Invite & Play can be
 * looked at.
 *
 * They are otherwise unreachable without an account that already has Academy
 * connections, which is the same reason the queue controller above is
 * fabricated. These names are obvious inventions on purpose — nobody should
 * be able to mistake this panel for real data — and they are handed to the
 * view through its own `roster` seam, so nothing here writes a friendship or
 * reaches Supabase.
 */
const PREVIEW_ROSTER: FriendRow[] = [
  // SIX or more, deliberately: the roster's search only appears above five
  // rows (a filter over three names is furniture), so a shorter fixture would
  // leave that control unreviewable too.
  "Preview Summoner", "Scribe of the Archive", "Rift Cartographer",
  "Baron Steward", "Poro Archivist", "Warden of the Hexgates",
].map((display_name, i) => ({
  id: `preview-friendship-${i}`,
  requester_id: "preview-self",
  addressee_id: `preview-friend-${i}`,
  status: "accepted",
  created_at: "2026-08-21T00:00:00Z",
  profile: {
    id: `preview-friend-${i}`,
    display_name,
    avatar_url: null,
    is_pro: false,
  },
}));

function noop() {}

export default function PlayScrollPreviewPage() {
  const [beat, setBeat] = useState<QueueState>("selecting_class");
  const [role, setRole] = useState<RankedRole>("jungle");
  const [open, setOpen] = useState(true);
  const [dailyDone, setDailyDone] = useState(false);

  /** A plain object with the controller's shape. Nothing behind it. */
  const queue: QueueController = {
    state: beat,
    status: beat === "waiting" || beat === "pairing"
      ? ({ role } as unknown as QueueController["status"])
      : null,
    matchId: beat === "matched" ? "rkm_preview" : null,
    selectedClass: "tank",
    unavailableReason: beat === "unavailable"
      ? "Ranked matchmaking is paused right now. Check back soon."
      : null,
    error: beat === "fatal"
      ? "Could not reach the ranked service."
      : beat === "pairing"
        ? "Pairing has already started — finding your match…"
        : null,
    canCancel: beat === "waiting",
    setSelectedClass: noop,
    join: () => setBeat("waiting"),
    joinAs: () => setBeat("waiting"),
    joinWithoutClass: () => setBeat("waiting"),
    cancel: () => setBeat("selecting_class"),
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Plain chrome on purpose — nothing here should read as part of the
          record it is previewing. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-card/70 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/80">
          Play scroll preview
        </span>
        <span className="text-[11px] text-muted-foreground">
          Fabricated queue — nothing here reaches the Ranked service.
        </span>
        <Link to="/dev/lobby-preview" className="text-[11px] underline-offset-4 hover:underline">
          Lobby preview
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-primary/10 px-4 py-2">
        {BEATS.map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid={`play-scroll-preview-${b.id}`}
            aria-pressed={beat === b.id}
            onClick={() => { setBeat(b.id); setOpen(true); }}
            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
              beat === b.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-primary/25 text-muted-foreground hover:border-primary/60"
            }`}
          >
            {b.label}
          </button>
        ))}
        <span className="mx-2 h-4 w-px bg-primary/20" aria-hidden />
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => setRole(r)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              role === r
                ? "border-primary bg-primary/15 text-primary"
                : "border-primary/25 text-muted-foreground hover:border-primary/60"
            }`}
          >
            {r}
          </button>
        ))}
        <button
          type="button"
          data-testid="play-scroll-preview-daily-done"
          aria-pressed={dailyDone}
          onClick={() => { setDailyDone((v) => !v); setOpen(true); }}
          className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
            dailyDone
              ? "border-primary bg-primary/15 text-primary"
              : "border-primary/25 text-muted-foreground hover:border-primary/60"
          }`}
        >
          Daily done
        </button>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto rounded-full border border-primary px-3 py-1 text-[11px] font-semibold text-primary"
          >
            Reopen record
          </button>
        )}
      </div>

      {/* Something for the record to sit ON, so the veil can be judged. */}
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        <p className="mx-auto max-w-prose">
          The record opens over the Leaguecraft lobby. This page stands in for
          it so each matchmaking beat can be reviewed on its own; open
          <Link to="/dev/lobby-preview" className="mx-1 underline">
            /dev/lobby-preview
          </Link>
          to see the record over the real composition.
        </p>
      </div>

      {/*
       * WHAT HAPPENED WHEN YOU PRESSED DAILY CHALLENGE.
       *
       * Nothing, on this page — and that is the harness, not the feature.
       * `selectMode("daily")` closes the record and then calls
       * `onPlayDailyChallenge`, which this page deliberately wires to `noop`
       * because the real one starts a quiz `Quiz.tsx` hosts and this route has
       * no quiz to host. So the record simply vanished and left the page
       * underneath it on screen — the beat chips, and the roster fixture
       * below — with no sign that anything had been decided.
       *
       * That reads as a broken Daily Challenge, and it was reported as one.
       * It is not: on `/quiz` the same press runs `handlePlayDailyChallenge`,
       * which starts a history session, fetches the day's set and swaps the
       * whole lobby out for the questions. This banner is the missing half of
       * the harness — it says what the real host would have done.
       */}
      {!open && (
        <div
          data-testid="play-scroll-preview-handoff"
          className="mx-auto mb-6 max-w-md rounded-sm border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center"
        >
          <p className="text-[12px] font-semibold text-amber-200">
            The record is closed.
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            On <code>/quiz</code> this is where the host takes over — Daily
            Challenge would now be loading today's set in place of the lobby.
            This route has no host, so nothing follows.
          </p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-2 rounded-full border border-primary px-3 py-1 text-[11px] font-semibold text-primary"
          >
            Reopen record
          </button>
        </div>
      )}

      {/* Invite with a roster in it. Rendered on the page rather than in the
          record, because the record's own Invite view reads the SIGNED-IN
          account's friendships and a reviewer's account will usually have
          none — see PREVIEW_ROSTER.

          IT IS ON THE PAGE, NOT IN THE RECORD, and that is exactly how it
          managed to look like the result of pressing Daily Challenge: it is
          always here, hidden behind the record's overlay until the record
          closes. Its own Back is `noop` — this panel is a fixture, not a
          view with anywhere to go back to — which is the "Back that did not
          work". Both are now said out loud on the panel itself. */}
      <div className="mx-auto max-w-md px-4 pb-10">
        <div className="rounded-sm border border-primary/20 bg-card/60 p-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary/80">
            Fixture · Invite with a populated roster
          </p>
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
            Always on this page, behind the record. Fake names; its own Back
            and Challenge do nothing.
          </p>
          {/* A patch of parchment to stand on. The record's ink is derived
              against the sheet, so on this page's dark card it would be
              unreadable — this is the same beige it is measured against. */}
          <div
            className="flex flex-col rounded-sm p-3"
            style={{ height: 430, background: "#d1bb9e" }}
          >
            <InvitePlayView signedIn onBack={noop} roster={PREVIEW_ROSTER} />
          </div>
        </div>
      </div>

      {open && (
        <PlayScrollRecord
          queue={queue}
          onClose={() => setOpen(false)}
          role={role}
          progression={PROGRESSION}
          modes={{ ranked: true, daily: true, invite: true }}
          daily={dailyDone ? DAILY_DONE : DAILY}
          signedIn
          onEnterMatch={noop}
          onPlayDailyChallenge={noop}
          onPlayPractice={noop}
          /* The handoff would otherwise fire a beat after the "Preparing"
             state is selected. Held below 2^31-1: a larger delay overflows
             `setTimeout`'s 32-bit field and fires on the NEXT tick, which is
             the opposite of what a big number here is asking for. */
          handoffDelayMs={2_000_000_000}
        />
      )}
    </div>
  );
}
