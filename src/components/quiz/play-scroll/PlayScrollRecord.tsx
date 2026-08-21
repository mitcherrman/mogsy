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
import PlayScrollRoleBanner from "./PlayScrollRoleBanner";
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
        setView("ranked");
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
    [busyMode, dailyComplete, onClose, onPlayDailyChallenge],
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

            <div className="lc-scroll__content flex min-h-0 flex-col gap-3">
              <header className="relative shrink-0">
                {/* The close control, ON the writing area rather than over
                    the head roll — the ornament is not usable surface, and a
                    control placed there reads as damage to the sheet.
                    Withheld — not merely disabled — while a queue entry is
                    live, so the record cannot be dismissed over a match the
                    player would then not know about. */}
                {closeIsSafe && (
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      data-testid="play-scroll-close"
                      /* An ink stamp, not a browser chrome X: a struck disc
                         in the sheet's own brown with a double rim, so the
                         way out belongs to the parchment rather than sitting
                         on top of it. It stays a full 32px target and keeps
                         its own hover, focus and pressed states — see
                         `.play-scroll-stamp` in index.css. */
                      className="play-scroll-stamp absolute -top-1.5 right-0"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="sr-only">Close match entry</span>
                    </button>
                  </DialogPrimitive.Close>
                )}
                <DialogPrimitive.Title
                  className="play-scroll-heading text-center text-[10px] font-black uppercase tracking-[0.34em]"
                  style={{ color: INK.heading, textShadow: INK.press }}
                >
                  Match Entry
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  Choose how to play: a Ranked match, today's Daily Challenge, or a
                  challenge to a summoner on your Academy roster.
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
                <PlayScrollRoleBanner role={role} progression={progression} />
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
                  />
                )}
                {view === "ranked" && (
                  <RankedQueueView
                    queue={queue}
                    role={role}
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
