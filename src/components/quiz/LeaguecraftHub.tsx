import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronRight, HelpCircle, Library, RotateCcw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RankedLobbyHero, { type DemoRoleMastery } from "@/components/quiz/RankedLobbyHero";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import QuizCategoryRail from "@/components/quiz/QuizCategoryRail";
import RankedPlayScroll from "@/components/quiz/play-scroll/RankedPlayScroll";
 
import { usePlaySfx } from "@/lib/audio/usePlaySfx";

import LeaguecraftWorkspace, {
  parseWorkspaceHash,
  workspaceHash,
  type WorkspaceMode,
} from "@/components/quiz/workspace/LeaguecraftWorkspace";
import StudyHistoryLedger from "@/components/quiz/workspace/StudyHistoryLedger";
import ReviewPane from "@/components/quiz/workspace/ReviewPane";
import type { QuestionLibraryState } from "@/components/quiz/workspace/useQuestionLibrary";
import { SectionHeading } from "@/components/quiz/workspace/primitives";
import type { MissedQuestionsState } from "@/components/quiz/workspace/useMissedQuestions";
import { authHref } from "@/lib/auth/auth-destination";

import type { QuizHistoryResponse, QuizProgress, QuizSet } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";
import type { DailyStatusView } from "@/lib/daily-challenge/status";
import type { PlayModeVisibility } from "@/lib/quiz/playModes";
import type { RankedRole } from "@/lib/ranked-public/roles";
import type {
  RankedProgressionView,
  MatchHistoryEntryView,
  MatchReviewView,
} from "@/lib/ranked-public/contracts";

/**
 * Leaguecraft hub — the Ranked-first one-page composition served at /quiz.
 *
 * The loop the page is built around is: play Ranked → see how it went →
 * study the knowledge Ranked asks for → play Ranked again. The LC1
 * simplification pass makes the first beat unmistakably dominant and demotes
 * the rest to a single quiet row beneath it:
 *
 * PLAY1 — PLAY OPENS THE RECORD, IT DOES NOT NAVIGATE
 * ───────────────────────────────────────────────────
 * The lobby's one PLAY seal used to be a link to `/quiz/ranked` and its
 * pre-match menu. It now opens the MATCH-ENTRY SCROLL over this page: the
 * lobby stays mounted and visible behind it, the role it just carried is
 * carried forward rather than re-asked, and the Ranked queue runs inside the
 * scroll. `/quiz/ranked` is still the live-match host and is where the scroll
 * hands off once the server has a match.
 *
 * The hub owns the open/closed state because BOTH ways in — the PLAY seal and
 * the "play Ranked" nudge on Recent Studies — are its own children. The host
 * page supplies what the scroll cannot know: how to enter a match, how to
 * start today's Daily Challenge, and which entries the admin policy allows.
 *
 *   1. Ranked lobby   — the three-column hero: the role character-select on
 *                       the left, the LEAGUECRAFT/RANKED identity and the one
 *                       PLAY gem in the centre, the player's own portrait,
 *                       standing and recent Ranked results on the right.
 *                       Nothing else on the page competes with it.
 *   2. Category rail  — the six subjects Leaguecraft studies, as one
 *                       full-width horizontal band across the foot of the
 *                       first viewport. It closes the lobby and opens the
 *                       workspace, and since PRAC1 it is also Leaguecraft's
 *                       PRACTICE CHOOSER: five of its six tiles start a
 *                       Practice session for that subject in place. Vision has
 *                       no content and is rendered unavailable. See
 *                       `QuizCategoryRail`, and the note at its mount for why
 *                       it is not sticky yet.
 *   3. Workspace      — Recent Studies (PRACTICE sessions only; the centre
 *                       scroll owns the Ranked ledger) and the Practice panel:
 *                       the sets and the Mastery journeys, reduced to
 *                       low-priority links. Both are still fully reachable;
 *                       neither is a headline any more.
 *
 * The row-3 pair is deliberately short so the classroom art stays visible
 * around the composition instead of being covered by a dashboard grid.
 *
 * This component is presentation only. Every value it renders is real data
 * owned by the /quiz page (ranked progress, quiz sets and their question
 * counts, session history); it fabricates nothing and fetches nothing. It
 * makes no progression decisions either — rank identity, emblem art and
 * placement state arrive already resolved and are passed straight through to
 * the hero, so RE1 can change what a rank means without touching this file.
 */

/**
 * Move the page to a section, and put focus there.
 *
 * FOCUS FIRST, THEN SCROLL. Not a style choice — Chrome CANCELS an in-flight
 * smooth scroll when an element is focused, so focusing after `scrollIntoView`
 * freezes the scroll where it started and the player never arrives. The same
 * ordering, and the same finding, is written down in `useSectionNavigation`
 * (the Combat Lab's section nav); this is the one-target case and does not
 * need that hook's measuring, ordering or scroll tracking.
 *
 * Focus is what makes the arrival LEGIBLE rather than merely positional: the
 * section carries `tabIndex={-1}`, so it is focusable programmatically and
 * never a tab stop, and a screen reader announces the landmark it just
 * arrived at instead of the player being moved silently.
 *
 * `preventScroll` on the focus call is what keeps the two from fighting: the
 * focus places the reading position, the scroll does the travelling.
 *
 * AND THEN IT CHECKS THAT IT WORKED.
 * `behavior: "smooth"` is a request, not a guarantee. Measured in the review
 * browser: every smooth scroll on this page is a no-op — including a bare
 * `window.scrollTo({top: 400, behavior: "smooth"})` with no dialog, no lock
 * and `prefers-reduced-motion` reporting false — while the identical call
 * with `behavior: "auto"` scrolls correctly. Real users meet the same thing
 * behind extensions, embedded webviews and hardened browser settings.
 *
 * A handoff that silently leaves the player where they were is the exact
 * defect this whole change exists to remove, so the smooth path is verified
 * and falls back to an immediate scroll if nothing moved. The check is cheap
 * and cannot double-scroll a player who did arrive: an in-flight smooth
 * scroll has already changed `scrollY` by the time it runs, and a section
 * that was already at the top reports a top of ~0.
 */
function goToSection(el: HTMLElement | null): void {
  if (!el) return;
  el.focus?.({ preventScroll: true });

  const reduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // A reduced-motion reader is taken there immediately, with no animation to
  // verify and nothing to fall back from.
  if (reduced) {
    el.scrollIntoView?.({ behavior: "auto", block: "start" });
    return;
  }

  const before = typeof window === "undefined" ? 0 : window.scrollY;
  el.scrollIntoView?.({ behavior: "smooth", block: "start" });
  if (typeof window === "undefined") return;

  window.setTimeout(() => {
    const arrived =
      window.scrollY !== before ||
      Math.abs(el.getBoundingClientRect().top) < 4;
    if (arrived) return;
    el.scrollIntoView?.({ behavior: "auto", block: "start" });
  }, SMOOTH_SCROLL_CHECK_MS);
}

/** Long enough for a smooth scroll to have visibly started, short enough that
 *  a player who is going nowhere is not left wondering. */
const SMOOTH_SCROLL_CHECK_MS = 350;

/** The set the "Practice Questions" primary action opens, when the backend
 *  serves it. Falls back to the first catalog set so the action is never dead. */
const PRIMARY_PRACTICE_SET = "All Current Questions";

export default function LeaguecraftHub({
  progress,
  ranked,
  onPlayRanked,
  playDisabled = false,
  onCommitRole,
  hasAccount = true,
  onRequireAccount,
  onEnterMatch,
  onPlayDailyChallenge,
  playModes,
  dailyChallenge = null,
  playScrollOpenOnMount = false,
  sets,
  setsLoading,
  onSelectSet,
  onSelectCategory,
  focusCategoryId = null,
  onRefreshSets,
  history,
  historyLoading,
  historyError,
  showPractice = false,
  timeTrial,
  builder,
  rankedHistoryPreview,
  rankedReviewPreview,
  trends,
  reviewState,
  ownedQuestionsPreview,
  rankedRole = null,
  onSelectRankedRole,
  roleSelectDisabled = false,
  roleSaving = null,
  rankedProgression = null,
  matchHistory = [],
  matchHistoryLoading = false,
  displayName = null,
  avatarUrl = null,
  signedIn = false,
  demoRoleMastery = null,
}: {
  progress: QuizProgress | null;
  ranked: RankedState;
  /** R1: the player's League role, forwarded to the hero. Presentation only —
   * this component still fetches nothing. */
  rankedRole?: RankedRole | null;
  /** LC1: persist a role from the hero's carousel. Omit to make the
   * carousel read-only (an older backend, or a guest). */
  onSelectRankedRole?: (role: RankedRole) => void;
  roleSelectDisabled?: boolean;
  roleSaving?: RankedRole | null;
  /** RE1: the account's Ranked five-tier standing, forwarded to the hero.
   * Still presentation only — this component fetches nothing. */
  rankedProgression?: RankedProgressionView | null;
  /** LC1: the account's real recent Ranked rows, fetched by the host. */
  matchHistory?: readonly MatchHistoryEntryView[];
  matchHistoryLoading?: boolean;
  /** LC1: the account's own display identity, or null when there is none. */
  displayName?: string | null;
  avatarUrl?: string | null;
  signedIn?: boolean;
  /**
   * DEMO ONLY, and forwarded untouched. The product has no Role Mastery
   * score; `/dev/lobby-preview` is the sole caller that passes one, so the
   * mature-state summary band can be reviewed before the product can fill
   * it. `Quiz.tsx` passes nothing and a real account therefore never sees a
   * score. See `DemoRoleMastery` in `RankedLobbyHero`.
   */
  demoRoleMastery?: Partial<Record<RankedRole, DemoRoleMastery>> | null;
  /**
   * PLAY — the lobby's ONE commit point, kept from the MALT lobby flow.
   *
   * The role carousel moves against local state so that browsing costs
   * nothing (`role_set` is rate limited to ten writes a minute, and two
   * laps of the carousel used to exhaust it). The account is written here
   * instead, once, when the reader actually commits by pressing PLAY.
   *
   * IT RESOLVES TO WHETHER THE COMMIT HELD, and the hub does not open the
   * match-entry record unless it did. That is the same rule the MALT flow
   * wrote as "a refusal does not navigate", carried over intact now that
   * PLAY opens a record instead of navigating: the queue join reads the
   * player's STORED role off the account inside its own transaction, so
   * entering the record on a refused write would queue them as whoever
   * they used to be, with nothing on screen saying so.
   */
  onPlayRanked: () => boolean | Promise<boolean>;
  /** Holds the PLAY seal still while the host commits the chosen role. The
   *  seal is the lobby's one commit point, so a second press during that
   *  write would start a second write and a second record. */
  playDisabled?: boolean;
  /**
   * PLAY1: hand the player into the live-match host at `/quiz/ranked` once
   * the Ranked queue has a match. The hub never navigates itself.
   */
  /**
   * PLAY1: persist the role the player settled on INSIDE the record, and say
   * whether it held. Forwarded untouched — the hub neither reads nor decides
   * a role, it only carries the host's one canonical write down to the
   * surface that now owns the choice. See `PlayScrollRecord.onCommitRole`.
   */
  onCommitRole: (role: RankedRole) => boolean | Promise<boolean>;
  /** PLAY1: whether this visitor may enter Ranked — a real account, not a
   *  guest. Forwarded untouched; see `PlayScrollRecord.hasAccount`. */
  hasAccount?: boolean;
  /** PLAY1: raise the host's signup notice when a guest presses Ranked. */
  onRequireAccount?: () => void;
  onEnterMatch: (matchId: string) => void;
  /**
   * PLAY1: the host's OWN Daily Challenge entry. `Quiz.tsx` hosts the daily
   * set in-page (`handlePlayDailyChallenge`), which is a different feature
   * from the Score Attack time trial at `/quiz/daily`; the scroll calls this
   * rather than guessing a route.
   */
  onPlayDailyChallenge: () => void;
  /** PLAY1: which entries the match-entry scroll offers (admin policy). */
  playModes: PlayModeVisibility;
  /** PLAY1: today's real Daily Challenge state, for the scroll's figure. */
  /** DC2's own status for today, for the Daily clause in the match record. */
  dailyChallenge?: DailyStatusView | null;
  /**
   * PLAY1: open the record as soon as the lobby mounts. Set when the player
   * arrives from `/quiz/ranked` with no active match — that route sends them
   * to the proper entry experience rather than resurrecting its old menu.
   */
  playScrollOpenOnMount?: boolean;
  sets: QuizSet[];
  setsLoading: boolean;
  onSelectSet: (set: QuizSet) => void;
  onRefreshSets: () => void;
  history: QuizHistoryResponse | null;
  historyLoading: boolean;
  historyError: string | null;
  /**
   * Render the withheld "Practice for Ranked" panel.
   *
   * Default OFF. The category rail above it is becoming Leaguecraft's
   * practice selector, and until it opens the panel was a second, louder
   * navigation to the same six subjects. `HUB_MODULES.practicePanel` in
   * `Quiz.tsx` is the switch; the sets, their counts and the start action are
   * all still here behind it, and no practice route changed.
   */
  showPractice?: boolean;
  /**
   * PT1.7A — the Time Trial entry, as a SLOT rather than a component.
   *
   * The host owns the mode's availability probe and its analytics, so it
   * passes the finished card down; the hub only decides where a study entry
   * sits. Omit it and the row collapses to whatever else it holds, exactly as
   * it did before the mode was surfaced.
   *
   * It shares the study row with the practice packs because that row was
   * always a PAIR — the withheld half is where Recent Studies used to sit —
   * and because a mode entry belongs above the record, not under it.
   */
  timeTrial?: ReactNode;
  /**
   * PT1.7B — the Premium Practice Builder, as a slot for the same reason the
   * Time Trial card is one: the hub places it and knows nothing else about it.
   * The panel resolves its own capability from the server and draws its own
   * paywall, so there is no entitlement logic anywhere in this file.
   */
  builder?: ReactNode;
  /**
   * PRAC1: start a Practice session for one rail subject.
   *
   * Passing it is what turns the category rail from an overview into
   * Leaguecraft's Practice chooser. Omit it — as `/dev/lobby-preview` does —
   * and the rail renders exactly as it did before, inert, because a host with
   * no way to run a session must not advertise a door.
   */
  onSelectCategory?: (categoryId: string) => void;
  /** PRAC1: the rail subject to hand focus back to on mount, so returning
   *  from the Practice runner lands on the tile it was started from. */
  focusCategoryId?: string | null;
  /**
   * FROZEN OVERRIDE for the Record's Ranked rows.
   *
   * B1 shipped Ranked history into the Record, so production now renders
   * `matchHistory` — the account's real rows, which this component already
   * receives for the centre parchment's ledger and which are read ONCE for
   * both. This prop stays because `/dev/lobby-preview` needs a deterministic
   * set to judge the treatment against, and because a fixture host must never
   * be able to reach the network. When it is supplied it REPLACES the real
   * rows; when it is not, nothing about the lobby's own read changes.
   */
  rankedHistoryPreview?: readonly MatchHistoryEntryView[];
  /** Frozen review payloads by match id, for the same fixture host. Absent in
   *  production, where the ledger loads reviews itself. */
  rankedReviewPreview?: Readonly<Record<string, MatchReviewView>>;
  /**
   * MALT: a pre-resolved missed-question bank for the Review pane, for a host
   * that must not fetch. `/dev/lobby-preview` is the only caller — its whole
   * contract is that it reads no account. `Quiz.tsx` passes nothing and the
   * pane loads the real bank the moment a reader opens Review.
   */
  reviewState?: MissedQuestionsState;
  /**
   * PT1.2: a pre-resolved OWNED collection for a host that must not fetch.
   * `/dev/lobby-preview` is again the only caller; `Quiz.tsx` passes nothing
   * and REVIEW reads the real collection when a reader opens it.
   */
  ownedQuestionsPreview?: QuestionLibraryState;
  /**
   * PT1.8 — the Performance Trends pane's body, supplied by the host exactly
   * as `builder` is. The hub neither knows nor decides who may see it: the
   * pane draws its own paywall from the server's capability answer, and the
   * workspace mounts it only while its tab is the open one.
   */
  trends?: React.ReactNode;
}) {
  const primarySet = sets.find((s) => s.name === PRIMARY_PRACTICE_SET) ?? sets[0] ?? null;
  const secondarySets = sets.filter((s) => s.id !== primarySet?.id);

  const [playOpen, setPlayOpen] = useState(playScrollOpenOnMount);
  // The seal the record was opened from, so the record can put focus back on
  // it when it closes. Explicit rather than left to Radix, which restores to
  // whatever had focus when the dialog mounted — `document.body` on every
  // browser that does not focus a button on click.
  const playSealRef = useRef<HTMLButtonElement | null>(null);
  /* ─── MALT: THE HISTORY / REVIEW WORKSPACE ──────────────────────────────
     The lower workspace's open pane is ADDRESSABLE — `/quiz#history` and
     `/quiz#review` — so a link from anywhere in the product can open the
     record on the question it means, and so the back button undoes a tab
     switch instead of leaving the page.

     The hash is the single source of truth and local state is only its
     fallback, which is what keeps back/forward honest: a `navigate` on a tab
     press pushes an entry, and popping it re-reads the hash below rather than
     restoring a stale piece of component state. No router change is involved
     — this is the hash the router already carries.

     ONLY AN EXPLICIT HASH SCROLLS. A reader who merely lands on /quiz must
     not be thrown past the ceremonial first screen they arrived for, so
     arrival scrolls only when the URL actually named a pane, and only once
     per hash. */
  const { hash } = useLocation();
  const navigate = useNavigate();
  const workspaceSectionRef = useRef<HTMLElement | null>(null);
  const hashMode = useMemo(() => parseWorkspaceHash(hash), [hash]);
  const [localMode, setLocalMode] = useState<WorkspaceMode>("history");
  const workspaceMode = hashMode ?? localMode;
  const arrivedFor = useRef<WorkspaceMode | null>(null);

  useEffect(() => {
    if (!hashMode) {
      arrivedFor.current = null;
      return;
    }
    setLocalMode(hashMode);
    if (arrivedFor.current === hashMode) return;
    arrivedFor.current = hashMode;
    goToSection(workspaceSectionRef.current);
  }, [hashMode]);

  /** Open a pane FROM THE PAGE — a tab press, or Recent Studies' own footer.
   *  Writes the hash so the pane is shareable and the press is undoable. */
  const openWorkspace = useCallback(
    (mode: WorkspaceMode) => {
      setLocalMode(mode);
      // Re-selecting the pane that is already open must still travel — the
      // Recent Studies footer's whole job is to take the reader there — but
      // must not stack another identical history entry to back out of.
      if (hashMode === mode) {
        goToSection(workspaceSectionRef.current);
        return;
      }
      arrivedFor.current = mode;
      navigate(workspaceHash(mode));
      goToSection(workspaceSectionRef.current);
    },
    [hashMode, navigate],
  );

  /**
   * PLAY: commit the chosen role, then open the record.
   *
   * The two halves come from opposite sides of this merge and both are
   * load-bearing.
   *
   * The COMMIT is the MALT lobby flow's: the role carousel moves against
   * local state so browsing costs nothing, and the account is written exactly
   * once, here, when the reader commits. The queue join sends no role — the
   * backend reads the player's stored preference inside the join transaction
   * — so the write has to land BEFORE the record can be entered, or the
   * reader queues as whoever they used to be.
   *
   * The OPEN is PLAY1's: pressing PLAY no longer navigates anywhere. The only
   * navigation left in this flow is `onEnterMatch`, once the server actually
   * has a match.
   *
   * A REFUSAL DOES NOTHING BUT SAY SO. If the account cannot be moved — an
   * active match, a live queue entry, a rate limit — the host surfaces its
   * notice and the record stays shut. That is the MALT rule ("a refusal does
   * not navigate") carried over unchanged; only the thing being withheld
   * changed from a route to a record.
   */
  /**
   * PLAY1 SOUND — the hub owns exactly one cue: the record unrolling.
   *
   * It is sounded from THIS ACTION, never from the record's lifecycle. An
   * effect inside the record would fire again on a StrictMode double-invoke,
   * and would also sound for the `playScrollOpenOnMount` arrival from
   * `/quiz/ranked` — which is a route landing, not a press. The engine's
   * first-gesture gate makes that arrival silent on a cold load anyway; not
   * having a mount trigger is what makes it silent on a warm one too.
   *
   * Everything else the record can say is the record's, because it is the only
   * thing that can tell a dismissal from a handoff and a refusal from a retry.
   * See `PlayScrollRecord`.
   */
  const sfx = usePlaySfx();

  const openPlay = useCallback(async () => {
    const committed = await onPlayRanked();
    /*
     * NO CUE FOR A WITHHELD OPEN, and no `error` either.
     *
     * `onPlayRanked` no longer writes anything — the role commit moved onto
     * the record's Ranked entry — so the only thing it withholds for is a
     * write already in flight from a previous press. Nothing is put on screen
     * for that, and a negative cue with no visible refusal beside it is the
     * interface making a noise about its own internals.
     */
    if (!committed) return;
    sfx.play("scrollOpen");
    setPlayOpen(true);
  }, [onPlayRanked, sfx]);
  // Focus is restored by the record itself, on its own unmount — see
  // `returnFocusTo`. Doing it here would race Radix's own restore.
  const closePlay = useCallback(() => setPlayOpen(false), []);

  /**
   * The record's Practice handoff — and what changed under it.
   *
   * On a finished Daily Challenge the record offers "Play practice questions
   * to improve". It used to CLOSE and then SCROLL to the Practice panel
   * further down the lobby, deliberately stopping short of starting anything.
   *
   * That panel is withheld now (see `showPractice`), so scrolling would take
   * the reader to nothing at all — a handoff that silently does nothing is
   * the exact defect the original scroll machinery existed to prevent. The
   * entry therefore does what its own label has always said: it STARTS the
   * catalog-wide practice set, in place, the same way the panel's primary
   * action did.
   *
   * The deferred-scroll machinery it replaces is gone with it. That existed
   * because Radix's focus scope and scroll lock tear down during the record's
   * unmount and would have eaten a scroll scheduled from the click. A phase
   * change has no such race — it is the same synchronous shape the Daily
   * Challenge entry beside it already uses — so the ref, the effect and the
   * frame-ordering note are no longer carrying anything.
   *
   * When the catalog has not loaded there is no set to start, and the entry
   * does nothing rather than starting a set that is not there. The panel's
   * own action had the same floor.
   */
  const goToPractice = useCallback(() => {
    if (!primarySet) return;
    onSelectSet(primarySet);
  }, [onSelectSet, primarySet]);

  return (
    <div className="flex flex-col gap-3">
      {/* 1 ── Ranked lobby. The page's centre of gravity and only major CTA.
              Unframed on purpose: the columns sit directly in the classroom
              rather than inside one opaque panel, so the room reads through
              the composition instead of being covered by a dashboard. */}
      {/* ── THE FIRST SCREEN ────────────────────────────────────────────────
          The rack and the rail are ONE composed screen, and this wrapper is
          what makes that true rather than merely intended.

          Two jobs, both of them the reason it exists:

          TIGHTER INSIDE. Its own `gap-2` closes the space between the scroll
          bottoms and the rail, which the root's `gap-3` used to set. The rail
          is the rack's closing edge, not the first item of the next section,
          so it sits nearer to what it closes.

          TALLER OUTSIDE. `min-h` holds the wrapper to the full viewport, so
          whatever follows it starts BELOW the fold. Recent Studies and the
          Practice panel used to crest into the first screen — a heading and
          the top of a card, enough to read as "the page carries on here" and
          to pull the eye off the composition before the reader had taken it
          in. The extra height lands AFTER the rail (the wrapper packs from the
          top), so nothing inside the composition is stretched or separated:
          the rack and rail keep their exact geometry and the slack becomes
          classroom between the rail and the workspace.

          The two offsets are the wrapper's own distance from the top of the
          viewport, which differs by breakpoint because the reclaim does: at
          `xl` the shell's band is cancelled outright and the hub's `pt-4` is
          the whole of it (1rem); at `lg` the reclaim keeps 1.5rem of the band
          back, so it is that plus the same `pt-4` (2.5rem). Below `lg` there
          is no min-height at all — the stacked rack is already several
          viewports tall and the fold means nothing there. */}
      {/* THE RESERVE IS NOW HEIGHT-AWARE, and that is the whole change.
          A flat `100dvh` reserve did one job well and one job badly. On a
          SHORT desktop it is what makes the rack and rail read as a composed
          screen that ends. On a TALL one the rack+rail only reach ~820px, so
          the same rule reserved everything above that as empty classroom —
          measured at 268px of dead background at 1920x1080 — purely to keep
          the record out of sight. That is a worse defect than the peeking it
          was preventing.

          So the reserve is bounded by a HEIGHT query rather than removed: it
          still applies below 880px tall, where the composition genuinely
          needs it and the record still lands at or below the fold; above that
          it is not emitted at all and the record simply follows the rail at a
          fixed, natural distance (see the record's own top margin). 880px is
          the crossover because the composition bottoms out around 820: every
          supported short desktop (800, 832, 864) stays under it, and the dead
          band never gets a chance to grow past ~60px.

          The height condition is stacked INSIDE the width variant on purpose.
          Written as a separate `min-h-0` override it would depend on Tailwind
          emitting it after the `xl:` rule, which is an ordering assumption
          rather than a guarantee; as one nested query there is exactly one
          rule per breakpoint and nothing to lose a specificity race with. */}
      <div className="flex flex-col gap-2 lg:[@media(max-height:879px)]:min-h-[calc(100dvh_-_2.25rem)] xl:[@media(max-height:879px)]:min-h-[calc(100dvh_-_0.75rem)]">
      <section className="w-full" data-testid="hub-ranked-section">
        <RankedLobbyHero
          progress={progress}
          ranked={ranked}
          onPlayRanked={openPlay}
          playDisabled={playDisabled}
          playButtonRef={playSealRef}
          rankedRole={rankedRole}
          onSelectRole={onSelectRankedRole}
          roleSelectDisabled={roleSelectDisabled}
          roleSaving={roleSaving}
          rankedProgression={rankedProgression}
          matchHistory={matchHistory}
          matchHistoryLoading={matchHistoryLoading}
          displayName={displayName}
          avatarUrl={avatarUrl}
          signedIn={signedIn}
          demoRoleMastery={demoRoleMastery}
        />
      </section>

      {/* 2 ── The category rail. The seam of the page: the six subjects at the
              full width of the composition, closing the Ranked lobby and
              opening the study workspace beneath it.

              IN FLOW, NOT STICKY — and that is a measurement, not a taste.
              The intended behaviour is that the rail pins under the HUD band
              once the rack scrolls past and becomes the header of the lower
              workspace. It was built and measured: nothing in the shell
              blocks `position: sticky` (the only ancestor with an overflow is
              `body`, whose `overflow-x` propagates to the viewport), and with
              `lg:sticky lg:top-[var(--app-header-h)]` the rail pins at exactly
              y=56 — below the corner controls rather than under them.

              It can never REACH that state today. Pinning needs the page to
              scroll by `railTop - 56`, which at 1440x900 is 842px; the whole
              document only scrolls 490px, because the workspace below the rail
              is ~300px tall — a Recent Studies empty state and five practice
              chips. A behaviour that cannot fire is not a section transition,
              so it does not ship on the strength of a passing probe. It
              belongs with the history consolidation that actually gives the
              workspace a viewport of depth; at that point this wrapper takes
              the two classes above and the section below takes a matching
              `scroll-mt`, and nothing else has to move. */}
      {/* No top margin of its own — the first-screen wrapper's `gap-2` is the
          whole seam, and it is deliberately tighter than the gap that
          separates the composition from the workspace below it. */}
      <div className="relative z-30">
        <QuizCategoryRail
          onSelectCategory={onSelectCategory}
          focusCategoryId={focusCategoryId}
        />
      </div>
      </div>

      {/* 3 ── THE STUDY ROW — curated packs, and today's Time Trial.
              ──────────────────────────────────────────────────────
              One row, up to two occupants, both host-controlled. It is the
              row the lobby always had; PT1.7A gave it back its second half.

              THE PACKS ARE NOT THE RAIL, AND THAT IS WHY THEY ARE BACK.
              This panel was withheld on the stated grounds that it and the
              category rail were "two navigations to the same six subjects".
              Measured against the live bank, they are not the same subjects
              at all: the five sets reach `Champion Attack Types`,
              `Champion Base Stats`, `Champion Resources`, `Runes` and
              `Game Fundamentals`, and NO rail tile resolves to any of them —
              `Champion Basics` alone is ~520 live questions with no other
              door. The rail reaches abilities, waves, objectives, summoners
              and the item family; the packs reach the rest. They are
              complementary, so both are shown, and the panel's own duplicate
              (a primary button that opened the very set its first chip
              opens) is what went away instead. See PT1.7A in the handoff.

              TIME TRIAL sits beside them rather than under the record: it is
              a way to SPEND a session, so it belongs with the other things
              you can start, above the place you go to read what happened.
              `HUB_MODULES.timeTrial` in `Quiz.tsx` is still the one switch,
              and the host still supplies the card.

              Recent Studies used to hold this row's second half. It is gone
              rather than hidden: it was a three-row preview of the very same
              payload the Leaguecraft Record's History ledger now prints in
              full, and two renderings of one record is the duplication that
              pass existed to remove. */}
      {(showPractice || timeTrial) && (
        <div
          data-testid="hub-workspace"
          className="mt-3 grid grid-cols-1 gap-3 pt-1 lg:grid-cols-12"
        >
          {showPractice && (
          <section
            className={timeTrial ? "flex flex-col lg:col-span-7" : "flex flex-col lg:col-span-12"}
            data-testid="hub-practice-section"
          >
            <SectionHeading
              icon={ScrollText}
              title="Practice Packs"
              hint="Curated sets the six subjects above do not cover."
            />
            <LobbyPanel className="mt-1.5 gap-2">
              {setsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full rounded-md" />
                  <Skeleton className="h-16 w-full rounded-md" />
                </div>
              ) : sets.length === 0 ? (
                <div className="flex flex-col items-start gap-2 py-2" data-testid="practice-empty">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <HelpCircle className="h-4 w-4" />
                    No quiz sets available right now.
                  </div>
                  <Button onClick={onRefreshSets} variant="ghost" size="sm" className="text-xs">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </div>
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2">
                  {/* Every set as a one-line chip, at a fraction of the old
                      grid's visual weight.

                      THE PRIMARY BUTTON IS GONE, and only the button: it
                      opened `All Current Questions`, which is the first chip
                      directly beneath it, so the panel led with a duplicate
                      of its own first row. The catalog-wide set keeps two
                      other doors that were built for it — the match-entry
                      record's Practice footer and the empty record's one
                      action — and both call the same `onSelectSet`. */}
                  <div className="flex flex-col gap-1" data-testid="practice-tiles">
                    {primarySet && <PracticeTile set={primarySet} onSelect={() => onSelectSet(primarySet)} />}
                    {secondarySets.map((set) => (
                      <PracticeTile key={set.id} set={set} onSelect={() => onSelectSet(set)} />
                    ))}
                  </div>
                </motion.div>
              )}
            </LobbyPanel>
            {/* The Builder lives beneath the curated packs: the packs are what
                Mogzy chose, this is what you choose. One column, read top to
                bottom, rather than a competing band elsewhere on the page. */}
            {builder && <div className="mt-3">{builder}</div>}
          </section>
          )}

          {/* The host's Time Trial card, unchanged. The hub adds the column
              and nothing else — no copy, no state, no probe of its own. */}
          {timeTrial && (
            <section
              className={showPractice ? "flex flex-col lg:col-span-5" : "flex flex-col lg:col-span-12"}
              data-testid="hub-time-trial-section"
            >
              {timeTrial}
            </section>
          )}
        </div>
      )}


      {/* 4 ── The record. History and Review, the two questions a player asks
              AFTER a session rather than before one, so it sits below the row
              that offers the next one.

              It is deliberately the page's deepest section: the ceremonial
              first screen is what the lobby is for, the secondary row is how
              you get back into it, and this is where you go to study what
              already happened. `tabIndex={-1}` makes the section focusable
              programmatically and never a tab stop, which is what lets a
              `#history` link land a reader on the landmark rather than at a
              scroll offset. */}
      {/* The seam under the rail is the ROOT's `gap-3` and nothing else.
          It used to be that gap PLUS this section's own `mt-3`, which read as
          a break between two pages rather than as one system continuing. The
          first screen's `min-h` still holds the record below the fold, so the
          band above it is whatever that reserve leaves — see the note there. */}
      {/* On a SHORT screen the seam is the root's `gap-3` and the reserve
          above supplies the rest, so the record lands at or below the fold.
          On a TALL screen there is no reserve, so the record would otherwise
          sit 12px under the rail — too tight to read as its own section. The
          extra 24px is added under the SAME height query that drops the
          reserve, which puts the gap at 36px there: enough to separate the
          record from the rail, little enough that they still read as one
          continuous system. */}
      <section
        ref={workspaceSectionRef}
        tabIndex={-1}
        className="flex flex-col outline-none [@media(min-height:880px)]:mt-6"
        data-testid="hub-record-section"
        aria-label="Leaguecraft record"
      >
        <SectionHeading
          icon={Library}
          title="Leaguecraft Record"
          hint="What I have studied, and the questions I own."
        />
        <LeaguecraftWorkspace
          className="mt-1.5"
          mode={workspaceMode}
          onModeChange={openWorkspace}
          history={
            <StudyHistoryLedger
              history={history}
              loading={historyLoading}
              error={historyError}
              /* The lobby's ONE empty-record action, inherited from the Recent
                 Studies card: it opens the catalog-wide practice set in place,
                 never a Ranked match. */
              onStartPractice={primarySet ? () => onSelectSet(primarySet) : undefined}
              /* One record: the account's real Ranked rows, or the frozen
                 fixture set when a preview host supplied one. */
              rankedEntries={rankedHistoryPreview ?? matchHistory}
              rankedReviews={rankedReviewPreview}
              /* PT1.2: lets each question card carry its lifetime ownership.
                 One read for the whole record, and only for a real account —
                 the collection endpoint refuses a guest/anonymous session. */
              ownsCollection={hasAccount && signedIn}
              signInHref={authHref("/quiz#history")}
            />
          }
          /* Mounted only while Review is the open pane. Neither source is
             read on an ordinary lobby load: the missed bank is Pro-gated, and
             the collection needs a real account — `hasAccount` lets OWNED say
             so locally instead of spending a request to be told 403. */
          review={
            <ReviewPane
              enabled={workspaceMode === "review"}
              hasAccount={hasAccount && signedIn}
              signInHref={authHref("/quiz#review")}
              missedState={reviewState}
              ownedState={ownedQuestionsPreview}
            />
          }
          /* Mounted only while Trends is the open pane, for the same reason
             Review is: its reads are account-bound and nobody who has not
             opened the pane should spend a request on them. */
          trends={
            trends && isValidElement(trends)
              ? cloneElement(trends as React.ReactElement<{
                  hasAccount?: boolean; signInHref?: string;
                }>, {
                  /* Same answer Review already gets. A guest is told to sign
                     in rather than being sent to the server to be refused. */
                  hasAccount: hasAccount && signedIn,
                  signInHref: authHref("/quiz#trends"),
                })
              : (trends ?? null)
          }
        />
      </section>

      {/* The match-entry record. Mounted only while it is open, so the Ranked
          queue is polled and the Academy roster is read only when the player
          is actually looking at them — never on every lobby load. */}
      {playOpen && (
        <RankedPlayScroll
          onClose={closePlay}
          role={rankedRole}
          progression={rankedProgression}
          modes={playModes}
          daily={dailyChallenge}
          returnFocusTo={playSealRef}
          signedIn={signedIn}
          /* The SAME setter the lobby's own carousel is given, so stepping a
             role on the record moves the stage behind it. One local
             selection, two renderings of it. */
          onSelectRole={onSelectRankedRole ?? (() => {})}
          onCommitRole={onCommitRole}
          hasAccount={hasAccount}
          onRequireAccount={onRequireAccount}
          onEnterMatch={onEnterMatch}
          onPlayDailyChallenge={onPlayDailyChallenge}
          onPlayPractice={goToPractice}
        />
      )}
    </div>
  );
}

/** One practice topic: the set's real name and its real question count, and
 *  the same start action the old full-size mode cards used. */
function PracticeTile({ set, onSelect }: { set: QuizSet; onSelect: () => void }) {
  const count = set.question_count || 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid="practice-tile"
      className="flex min-h-[30px] w-full items-center gap-2 rounded-md border border-cyan-400/12 bg-[#04101c]/50 px-2.5 py-1 text-left transition-colors hover:border-cyan-300/40 hover:bg-[#06182a]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground/85">
        {set.name}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {count.toLocaleString()} Q
      </span>
      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/60" />
    </button>
  );
}
