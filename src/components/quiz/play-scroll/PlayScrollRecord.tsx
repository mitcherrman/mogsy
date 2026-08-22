/**
 * PLAY1 — the match-entry scroll, as a pure view.
 *
 * The lobby renders `RankedPlayScroll`, which is this component with the real
 * `useRankedQueue` attached. Everything the record LOOKS like and everything
 * it decides lives here; the queue arrives as a prop.
 *
 * Pressing PLAY on the Ranked lobby no longer navigates. The academy opens
 * your match-entry record over the desk you are already at: one large sheet of
 * the same parchment the three lobby columns are printed on, unrolled on top
 * of them, with the lobby still visible and merely dimmed behind it.
 *
 * WHY IT IS NOT A SECOND SETUP PAGE
 * ─────────────────────────────────
 * The old `/quiz/ranked` pre-match menu re-asked everything the lobby had
 * just answered — the rank, the role, a Change Role control — and then asked
 * for a combat class the player has no way to reason about. The record asks
 * for exactly one thing the lobby has not already been told: which of the
 * three ways in you want. Everything else is carried forward.
 *
 * THE ROUTE STILL EXISTS. `/quiz/ranked` is the LIVE-MATCH HOST — it renders
 * `QuizRankedMatch` and is configured full-bleed for it — and this scroll
 * hands off to it once the server has a match. What was retired is its menu,
 * not the route.
 *
 * WHAT THIS COMPONENT OWNS
 * ────────────────────────
 * Which view of the record is open, and nothing else. The queue is
 * `useRankedQueue` — the one queue implementation, unchanged in its
 * authority. The roster is `useFriends`. The daily set is the host's own
 * existing handler. The three entries' visibility is admin policy, resolved
 * by the host. This file fetches nothing of its own.
 *
 * CLOSING IS NOT ALWAYS SAFE, AND IS NOT ALWAYS OFFERED
 * ────────────────────────────────────────────────────
 * Once the server holds a queue entry for this account, dismissing the record
 * would hide a live queue: the player would be sitting in the lobby, matched,
 * with nothing on screen saying so. So ESC, the veil and the close control are
 * all withheld from `joining` onward, and the only ways out are the queue's
 * own Cancel (offered only while cancelling is a legal answer) or the handoff
 * into the match. See `closeIsSafe`.
 *
 * MOUNTED ONLY WHILE OPEN. The host renders this component when the record is
 * opened and drops it when it closes, so the queue is polled and the roster is
 * read only while the player is actually looking at them — never on every
 * lobby load.
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { QueueController } from "@/pages/quiz-ranked/useRankedQueue";
import { visiblePlayModes, type PlayModeId, type PlayModeVisibility } from "@/lib/quiz/playModes";
import type { RankedProgressionView } from "@/lib/ranked-public/contracts";
import type { RankedRole } from "@/lib/ranked-public/roles";
import type { DailyChallengeState } from "@/lib/quiz/featured-mock";
import { isDailyChallengeComplete } from "@/lib/quiz/dailyChallengeStatus";
import PlayScrollRoleSelector, {
  DEFAULT_PREVIEW_ROLE,
} from "./PlayScrollRoleSelector";
import PlayModeMenu, {
  type PlayModeCompletion,
  type PlayModeDetail,
} from "./PlayModeMenu";
import RankedQueueView from "./RankedQueueView";
import InvitePlayView from "./InvitePlayView";
import { PLAY_INK as INK } from "./ink";

type ScrollView = "menu" | "ranked" | "invite";

/**
 * How long the "opponent found" beat is held before the handoff.
 *
 * A real beat, not a fake one: the match already exists on the server by the
 * time this runs. It exists so the transition is legible rather than a
 * flicker. A prop so tests can take it to zero instead of waiting on it.
 */
const DEFAULT_HANDOFF_MS = 800;

export default function PlayScrollRecord({
  queue,
  onClose,
  role,
  progression = null,
  modes,
  daily = null,
  onSelectRole,
  onCommitRole,
  onEnterMatch,
  onPlayDailyChallenge,
  onPlayPractice,
  signedIn = false,
  returnFocusTo,
  handoffDelayMs = DEFAULT_HANDOFF_MS,
}: {
  /**
   * The queue, supplied by the caller rather than read here.
   *
   * `RankedPlayScroll` — the component the lobby actually renders — passes
   * the real `useRankedQueue`. Keeping the hook OUT of this file is what lets
   * `/dev/play-scroll` drive every matchmaking beat from a fabricated
   * controller without a dev-only branch inside the production component, and
   * without the preview quietly polling the live queue.
   */
  queue: QueueController;
  onClose: () => void;
  /** The role already chosen on the lobby's role scroll. Never re-asked. */
  role: RankedRole | null;
  progression?: RankedProgressionView | null;
  /** Which entries the admin policy allows. Resolved by the host. */
  modes: PlayModeVisibility;
  /** Today's real Daily Challenge state, for the clause's figure. */
  daily?: DailyChallengeState | null;
  /**
   * Persist the role the player settled on, and say whether it held.
   *
   * The ONE canonical write — the host's own `rankedRole.selectRole`, reached
   * through `Quiz.tsx`. This component has no role API of its own and must
   * never grow one: `PUT /api/ranked/role` is rate limited (`role_set`, ten a
   * minute) and a second write path is a second way to spend that budget.
   *
   * Called exactly once, when the player chooses RANKED MATCH — see
   * `selectMode`. Nothing else on the record commits: Daily Challenge, Invite
   * and Practice do not queue, so none of them needs the account's stored
   * role to be anything in particular, and writing on the way past would
   * spend a rate-limited write on a player who never entered Ranked.
   */
  /**
   * Move the page's ONE local role selection.
   *
   * The host's own setter — the same one the lobby's carousel is given — so
   * the record and the stage behind it are two renderings of one value. Local
   * only: this writes nothing to the account, however far the player steps.
   */
  onSelectRole: (role: RankedRole) => void;
  onCommitRole: (role: RankedRole) => boolean | Promise<boolean>;
  /** Hand the player into the live-match host at `/quiz/ranked`. */
  onEnterMatch: (matchId: string) => void;
  /** The host's OWN existing Daily Challenge entry. */
  onPlayDailyChallenge: () => void;
  /**
   * Take the player to the lobby's Practice section.
   *
   * Offered by the Daily Challenge clause once the day is finished, which is
   * the one moment the record has something to say and nothing to start. The
   * record closes first (the host owns the page underneath), and the host
   * does the moving — this component knows nothing about where Practice is.
   */
  onPlayPractice: () => void;
  signedIn?: boolean;
  /**
   * Where focus goes when the record closes — the PLAY seal it was opened
   * from. Radix restores focus to whatever was active when the dialog
   * MOUNTED, which is `document.body` on every browser (and in jsdom) that
   * does not focus a button on click, so the return target is named
   * explicitly rather than inferred. See `onCloseAutoFocus` below.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  handoffDelayMs?: number;
}) {
  const [view, setView] = useState<ScrollView>("menu");
  /**
   * The role on screen — the HOST's, not a copy of it.
   *
   * There is exactly ONE local role selection on this page and the record
   * does not own it. `role` is the host's `effectiveRankedRole`, the same
   * value the lobby's own carousel is rendering behind this sheet, and
   * `onSelectRole` is the same setter that carousel calls. Stepping an arrow
   * here therefore moves the lobby's stage too, in its own existing
   * transition — the record is manipulating the Leaguecraft role state, not
   * keeping a second opinion about it.
   *
   * It used to keep a `previewRole` of its own, seeded from this prop and
   * never propagated back. Two independently mutable selections is one more
   * than a page can be right about: the lobby went on showing whatever it had
   * while the record showed something else, and closing the record threw the
   * player's choice away.
   *
   * THERE IS STILL NO "NO ROLE CHOSEN". An account that has never picked
   * renders the first canonical role — which is also what the lobby's own
   * stage shows for a null value, so the two agree on the first frame without
   * anything being written to make them. Nothing is persisted by that: the
   * fallback is a rendering decision, and the account only gains a role when
   * the first step calls `onSelectRole` or Ranked commits.
   */
  const displayRole = role ?? DEFAULT_PREVIEW_ROLE;
  /** True while the role write for a Ranked entry is in flight. */
  const [committing, setCommitting] = useState(false);
  const recordRef = useRef<HTMLDivElement | null>(null);
  const [busyMode, setBusyMode] = useState<PlayModeId | null>(null);

  // The handoff fires exactly once per match, however many renders the
  // matched state survives.
  const handedOffRef = useRef<string | null>(null);

  /**
   * Set when the record is closing because the player asked to be taken
   * somewhere, rather than because they dismissed it.
   *
   * It changes exactly one thing: where focus lands. Normally the record
   * hands focus back to the PLAY seal it was opened from, which is right for
   * a dismissal — but wrong for a handoff, where the player has asked to be
   * moved and focus must follow them to the destination the HOST chooses. It
   * also matters mechanically: Radix restoring focus to the seal would scroll
   * the seal back into view and fight the host's own scroll.
   */
  const handingOffRef = useRef(false);

  const visible = visiblePlayModes(modes);

  /**
   * Whether dismissing the record right now would hide something live.
   *
   * `selecting_class` is idle, `unavailable`/`fatal` have nothing running,
   * and `recovering` has not yet learned whether there is an entry — but it
   * is only reached before the player has done anything, so leaving is safe.
   * Everything else means the server has, or is about to have, an entry.
   */
  const closeIsSafe =
    view !== "ranked" ||
    queue.state === "selecting_class" ||
    queue.state === "recovering" ||
    queue.state === "unavailable" ||
    queue.state === "fatal";

  const requestClose = useCallback(() => {
    if (!closeIsSafe) return;
    onClose();
  }, [closeIsSafe, onClose]);

  // ── The handoff ────────────────────────────────────────────────────────
  useEffect(() => {
    if (queue.state !== "matched" || !queue.matchId) return;
    if (handedOffRef.current === queue.matchId) return;
    handedOffRef.current = queue.matchId;
    const id = queue.matchId;
    if (handoffDelayMs <= 0) {
      onEnterMatch(id);
      return;
    }
    const timer = window.setTimeout(() => onEnterMatch(id), handoffDelayMs);
    return () => window.clearTimeout(timer);
  }, [queue.state, queue.matchId, handoffDelayMs, onEnterMatch]);

  /**
   * Today's Daily Challenge, already finished.
   *
   * Known from state the record was HANDED — see `isDailyChallengeComplete`.
   * Resolved before the clause is drawn, which is the whole point: the clause
   * must never offer a day with nothing left in it and then discover that
   * only after the player has pressed it.
   */
  const dailyComplete = isDailyChallengeComplete(daily);

  /**
   * Close the record, then let the host move the player to Practice.
   *
   * Same order as the Daily Challenge entry below and for the same reason:
   * the host owns the page underneath, and a dialog left open over a page
   * that is scrolling somewhere else is a trap.
   */
  const goToPractice = useCallback(() => {
    handingOffRef.current = true;
    onClose();
    onPlayPractice();
  }, [onClose, onPlayPractice]);

  const selectMode = useCallback(
    (id: PlayModeId) => {
      if (busyMode !== null) return;
      // Belt to the panel's braces. A completed Daily Challenge is drawn as a
      // panel with no button, so nothing can reach this — but the day being
      // over is a fact about the DAY, and the one thing that must never
      // happen is starting a set with nothing in it.
      if (id === "daily" && dailyComplete) return;
      if (id === "ranked") {
        /*
         * THE COMMIT POINT. Ranked is the only entry that queues, and the
         * queue join sends no role at all — `POST /api/ranked/queue` reads the
         * player's STORED preference off the account inside its own
         * transaction. So the previewed role has to reach the backend before
         * matchmaking can be entered, or the player queues as whoever they
         * used to be.
         *
         * A REFUSAL STAYS ON THE MENU. An active match, a live queue entry or
         * a rate limit means the write did not land; carrying the player into
         * matchmaking anyway would queue them under the wrong role with
         * nothing on screen saying so. The host surfaces its own notice (one
         * reused toast id), and the record simply does not move.
         */
        setBusyMode("ranked");
        setCommitting(true);
        void (async () => {
          let held = false;
          try {
            held = await onCommitRole(displayRole);
          } finally {
            setCommitting(false);
            setBusyMode(null);
          }
          if (held) setView("ranked");
        })();
        return;
      }
      if (id === "invite") {
        setView("invite");
        return;
      }
      // Daily Challenge is hosted in-page by `Quiz.tsx`. Close the record
      // first: the host swaps the whole lobby out for the question view, and
      // an open dialog over a page that no longer exists is a trap.
      setBusyMode("daily");
      onClose();
      onPlayDailyChallenge();
    },
    [busyMode, dailyComplete, onClose, onCommitRole, onPlayDailyChallenge, displayRole],
  );

  /**
   * The one line of real state each clause carries.
   *
   * THE RANKED LINE IS "Rating 1320  Silver", as written text rather than as
   * bordered tags. It says two things and neither is repeated anywhere else
   * on the sheet: the account's position on the ladder, and the tier it has
   * earned — the tier as a WORD, in its own metal, because the emblem in the
   * band above is a picture and a picture is not a name.
   *
   * There is no "130 to Gold". The distance to the next rung is a target, not
   * a standing, and putting a second number beside the first turned a written
   * line into a progress readout.
   *
   * Both are withheld entirely for an unrated account. `rated: false` means
   * the account has never had a rated match, so its `rating` is the ladder's
   * starting number and its `tier` is the ladder's floor rather than anything
   * it has won; printing either would present a default as a result.
   *
   * THE DAILY LINE IS THE STREAK, AND ONLY THE STREAK. Today's progress and
   * today's theme were both real and both true, and three marks under a
   * two-line note still read as a dashboard. The streak is the one figure a
   * player is actually keeping.
   */
  /**
   * What a finished clause says instead of its usual copy.
   *
   * It reads as DONE, not as broken: the day was completed, the streak it
   * fed is still on the card, and the one thing still worth doing is offered
   * as an ordinary action. Nothing here says "unavailable".
   */
  const completed: Partial<Record<PlayModeId, PlayModeCompletion>> = dailyComplete
    ? {
        daily: {
          heading: "Today's Challenge Complete",
          note: "Come back tomorrow.",
          action: {
            label: "Play practice questions to improve",
            onSelect: goToPractice,
          },
        },
      }
    : {};

  const details: Partial<Record<PlayModeId, PlayModeDetail>> = {
    ranked:
      progression !== null && progression.rated
        ? {
            label: "Rating",
            figure: String(Math.round(progression.rating)),
            tier: progression.tier,
          }
        : {},
    daily: daily ? { streak: daily.dailyStreak } : {},
    // No figure. The roster is not read until the player opens Invite (see
    // `InvitePlayView`), so a connection count here would either be a guess or
    // a reason to query every account's friendships on open.
    invite: {},
  };

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="play-scroll-overlay" />
        <div className="play-scroll-frame">
          {/* The sizer. It is the sheet's width, so `.lc-scroll`'s
              percentage margins mean here what they mean in the lobby — see
              THE SIZER in index.css. */}
          <div className="play-scroll-sizer">
          <DialogPrimitive.Content
            ref={recordRef}
            data-testid="play-scroll"
            data-view={view}
            /* No hand-written `aria-labelledby`/`aria-describedby` here.
               Radix generates both ids and wires them to `Dialog.Title` and
               `Dialog.Description` itself; supplying our own ids replaces
               them, which is what its console warning is actually detecting —
               the dialog then has a name and description that its own
               accessibility check cannot see. */
            className="lc-scroll play-scroll"
            onOpenAutoFocus={(event) => {
              // Radix would focus the first tabbable, which is the CLOSE
              // control — the record would open by announcing the way out of
              // itself. Focus the record instead, so its name and its
              // description are read first and Tab then walks the entries in
              // written order.
              if (!recordRef.current) return;
              event.preventDefault();
              recordRef.current.focus();
            }}
            onCloseAutoFocus={(event) => {
              // A HANDOFF is not a dismissal. The player asked to be taken to
              // Practice, so focus belongs at the destination — placed by the
              // host, which is the only thing that knows where that is. Radix
              // must be stopped either way: restoring focus to the seal would
              // also scroll the seal back into view and fight the host's own
              // scroll to the section it is moving to.
              if (handingOffRef.current) {
                event.preventDefault();
                return;
              }
              // Take the restore over from Radix: its captured element is the
              // one that had focus at mount, which is not reliably the seal.
              if (!returnFocusTo?.current) return;
              event.preventDefault();
              returnFocusTo.current.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (!closeIsSafe) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (!closeIsSafe) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (!closeIsSafe) event.preventDefault();
            }}
          >
            {/* The material. Inert and hidden: it is what the record is
                printed on, not part of what it says. Same three slices the
                lobby's columns use — see LobbyPanel. */}
            <div className="lc-scroll__sheet" aria-hidden="true">
              <div className="lc-scroll__reveal">
                <div className="lc-scroll__cap lc-scroll__cap--top" />
                <div className="lc-scroll__body" />
                <div className="lc-scroll__foot-space" />
              </div>
              <div className="lc-scroll__cap lc-scroll__cap--foot" />
            </div>

            <div className="lc-scroll__content flex min-h-0 flex-col gap-2">
              <header className="shrink-0">
                {/* A ROW, not a centred line with a control floated over it.
                    The close stamp used to be absolutely positioned at the
                    right of a full-width centred title, which was fine while
                    the title was a 10px eyebrow and collided with it the
                    moment the title became a title: at 375 the last letters
                    of CHOOSE MODE ran under the stamp. Laying the header out
                    as [gutter][title][stamp] centres the title between them
                    at every width, with no overlap to tune and no padding to
                    keep in sync with the stamp's size. */}
                <div className="play-scroll-head">
                  {/* The gutter. Mirrors the stamp so the title's centre is
                      the SHEET's centre, not the centre of what is left over.
                      Inert, and it holds its width whether or not the stamp
                      is there — withdrawing the close must not shift the
                      title sideways. */}
                  <span className="play-scroll-head__gutter" aria-hidden="true" />

                  {/* The sheet's title, and it is now sized like one. It was a
                      10px tracked-out eyebrow, which read as a label ABOVE
                      the content rather than as the heading OF it — the
                      record's three entries are what the player came for and
                      the line over them should say so. */}
                  <DialogPrimitive.Title
                    className="play-scroll-heading"
                    style={{ color: INK.heading, textShadow: INK.press }}
                  >
                    Choose Mode
                  </DialogPrimitive.Title>

                  {/* The close control, ON the writing area rather than over
                      the head roll — the ornament is not usable surface, and a
                      control placed there reads as damage to the sheet.
                      Withheld — not merely disabled — while a queue entry is
                      live, so the record cannot be dismissed over a match the
                      player would then not know about. */}
                  <span className="play-scroll-head__gutter">
                    {closeIsSafe && (
                      <DialogPrimitive.Close asChild>
                        <button
                          type="button"
                          data-testid="play-scroll-close"
                          /* An ink stamp, not a browser chrome X: a struck
                             disc in the sheet's own brown with a double rim,
                             so the way out belongs to the parchment rather
                             than sitting on top of it. Full 32px target, with
                             its own hover, focus and pressed states — see
                             `.play-scroll-stamp` in index.css. */
                          className="play-scroll-stamp"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="sr-only">Close match entry</span>
                        </button>
                      </DialogPrimitive.Close>
                    )}
                  </span>
                </div>
                <DialogPrimitive.Description className="sr-only">
                  Choose how to play: a Ranked match, today's Daily Challenge, a
                  challenge to a summoner on your Academy roster, or practice
                  questions. Step the arrows to choose the role you enter as.
                </DialogPrimitive.Description>
                {/* The head rule, with a diamond at its centre — the mark a
                    scribe rules under a title. One element; the diamond and
                    the two tapering hairlines are its own pseudo-elements. */}
                <div aria-hidden="true" className="play-scroll-rule mx-auto mt-1.5 w-2/3" />
              </header>

              {/* Carried forward from the lobby's role scroll. Held outside
                  the scrolling body so the identity being entered never
                  leaves the sheet. */}
              <div className="shrink-0">
                <PlayScrollRoleSelector
                  role={displayRole}
                  /* The host's setter, verbatim — the same one the lobby's
                     carousel calls. No local mirror to keep in step. */
                  onStep={onSelectRole}
                  progression={progression}
                  /* Held still once the record has left the menu: the role is
                     committed by then, and stepping it would show a figure the
                     queue entry is not carrying. */
                  disabled={committing || view !== "menu"}
                />
              </div>

              {/* The writing area. Views that can grow (the roster) manage
                  their own scroll boundary inside this box so their actions
                  stay pinned to the sheet; this `overflow-y` is the
                  last-resort for a viewport too short even for that. */}
              <div className="play-scroll__body flex flex-col pr-1">
                {view === "menu" && (
                  <PlayModeMenu
                    modes={visible}
                    details={details}
                    onSelect={selectMode}
                    busyMode={busyMode}
                    completed={completed}
                    /* The SAME handoff the completed Daily clause uses — one
                       host ref, one scroll, one focus move. Practice is
                       reachable here whatever Daily Challenge is doing. */
                    onPlayPractice={goToPractice}
                  />
                )}
                {view === "ranked" && (
                  <RankedQueueView
                    queue={queue}
                    /* The role the entry was committed under — the preview the
                       player stepped to and Ranked wrote, not the lobby's
                       stale value. The view still prefers the SERVER's own
                       confirmation once a status lands; this is only the
                       frame before that. */
                    role={displayRole}
                    onJoin={queue.joinWithoutClass}
                    onBack={() => setView("menu")}
                  />
                )}
                {view === "invite" && (
                  <InvitePlayView signedIn={signedIn} onBack={() => setView("menu")} />
                )}
              </div>
            </div>

          </DialogPrimitive.Content>
          </div>
        </div>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
