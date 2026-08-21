import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, HelpCircle, RotateCcw, RotateCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RankedLobbyHero, { type DemoRoleMastery } from "@/components/quiz/RankedLobbyHero";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import QuizRecentResultsCard from "@/components/quiz/QuizRecentResultsCard";
import QuizCategoryStrip from "@/components/quiz/QuizCategoryStrip";
import RankedPlayScroll from "@/components/quiz/play-scroll/RankedPlayScroll";
import type { QuizHistoryResponse, QuizProgress, QuizSet } from "@/lib/quiz/api";
import type { DailyChallengeState, RankedState } from "@/lib/quiz/featured-mock";
import type { PlayModeVisibility } from "@/lib/quiz/playModes";
import type { RankedRole } from "@/lib/ranked-public/roles";
import type {
  RankedProgressionView,
  MatchHistoryEntryView,
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
 *   2. Recent Studies — the real session history, compact, and the entry to
 *                       the full history route.
 *   3. Study panel    — a compact icon strip naming the six subjects
 *                       Leaguecraft studies, then Practice sets and the
 *                       Mastery journeys, reduced to low-priority links inside
 *                       one small panel. Both are still fully reachable;
 *                       neither is a headline any more. The strip is an
 *                       overview, not a menu — it is the only thing in the
 *                       panel that is not a way in.
 *
 * The row-2 pair is deliberately short so the classroom art stays visible
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
  onEnterMatch,
  onPlayDailyChallenge,
  playModes,
  dailyChallenge = null,
  playScrollOpenOnMount = false,
  sets,
  setsLoading,
  onSelectSet,
  onRefreshSets,
  history,
  historyLoading,
  historyError,
  showMastery = true,
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
   * PLAY1: hand the player into the live-match host at `/quiz/ranked` once
   * the Ranked queue has a match. The hub never navigates itself.
   */
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
  dailyChallenge?: DailyChallengeState | null;
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
  showMastery?: boolean;
}) {
  const primarySet = sets.find((s) => s.name === PRIMARY_PRACTICE_SET) ?? sets[0] ?? null;
  const secondarySets = sets.filter((s) => s.id !== primarySet?.id);

  const [playOpen, setPlayOpen] = useState(playScrollOpenOnMount);
  // The seal the record was opened from, so the record can put focus back on
  // it when it closes. Explicit rather than left to Radix, which restores to
  // whatever had focus when the dialog mounted — `document.body` on every
  // browser that does not focus a button on click.
  const playSealRef = useRef<HTMLButtonElement | null>(null);
  /**
   * The Practice section, so the record can send a player to it by NAME
   * rather than by pixel. The section already existed and already had its own
   * heading; this is a ref on it and nothing more.
   */
  const practiceSectionRef = useRef<HTMLElement | null>(null);

  const openPlay = useCallback(() => setPlayOpen(true), []);
  // Focus is restored by the record itself, on its own unmount — see
  // `returnFocusTo`. Doing it here would race Radix's own restore.
  const closePlay = useCallback(() => setPlayOpen(false), []);

  /**
   * The record's Practice handoff: close, then travel.
   *
   * NO PHASE CHANGE IS NEEDED. This whole component only renders under the
   * page's `sets` phase, and the record renders inside it — so if the record
   * is open, the lobby is already the thing underneath and Practice is
   * already on the page.
   *
   * THE MOVE CANNOT HAPPEN IN THE CLICK, AND IT CANNOT HAPPEN A FRAME LATER.
   * The record is a Radix dialog, and closing one tears down two things that
   * both fight this: a focus scope that restores focus to whatever it
   * captured, and a scroll lock that owns `body`'s overflow while the dialog
   * is up. Both run during the unmount commit. Measured in Chrome: scrolling
   * and focusing from a `requestAnimationFrame` scheduled in the click ran
   * BEFORE that teardown finished, and the page was left exactly where it
   * started with focus nowhere — the handoff silently did nothing, while the
   * same code passed in jsdom, which has neither mechanism.
   *
   * So the flag is set here and the move is done in an effect below, which
   * React runs after the unmount is committed and every child cleanup has
   * already gone. That is an ordering guarantee rather than a delay long
   * enough to probably win.
   */
  const pendingPracticeRef = useRef(false);

  const goToPractice = useCallback(() => {
    pendingPracticeRef.current = true;
  }, []);

  useEffect(() => {
    if (playOpen) return;
    if (!pendingPracticeRef.current) return;
    pendingPracticeRef.current = false;
    goToSection(practiceSectionRef.current);
  }, [playOpen]);

  return (
    <div className="flex flex-col gap-3">
      {/* 1 ── Ranked lobby. The page's centre of gravity and only major CTA.
              Unframed on purpose: the columns sit directly in the classroom
              rather than inside one opaque panel, so the room reads through
              the composition instead of being covered by a dashboard. */}
      <section className="w-full" data-testid="hub-ranked-section">
        <RankedLobbyHero
          progress={progress}
          ranked={ranked}
          onPlayRanked={openPlay}
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

      {/* 2 ── Secondary row: where I've been, and where else I can study.
              Both panels are short by construction — no auto-rows-fr, no
              stretched tile grid — so the classroom reads around them. The
              rule and the extra top margin push the row below the lobby's
              fold: the three-column hero owns the upper screen, and these
              stay fully reachable one scroll down.

              LC1 panel pass: now that the lobby columns sit on their own
              plates, the row no longer needs a wide moat to read as separate —
              the panels do that. The rule stays (it is what makes this a
              second act rather than more hero), the gap shrinks, and the top
              of Recent Studies reaches the first viewport on a normal desktop
              instead of starting entirely below it. */}
      <div className="mt-1 grid grid-cols-1 gap-3 border-t border-[#c9a84c]/12 pt-3 lg:grid-cols-12">
        <section className="flex flex-col lg:col-span-7" data-testid="hub-recent-section">
          <SectionHeading icon={RotateCw} title="Recent Studies" hint="How am I doing?" />
          <QuizRecentResultsCard
            history={history}
            loading={historyLoading}
            error={historyError}
            onPlayRanked={openPlay}
            hideHeader
            className="mt-1.5 flex-1"
          />
        </section>

        {/* 3 ── Study: Practice + Mastery, demoted to one compact panel. The
                routes and sets are untouched — only their visual weight. */}
        {/* `tabIndex={-1}` makes the section focusable PROGRAMMATICALLY and
            never a tab stop, which is what lets the Practice handoff land the
            player on the landmark rather than at a scroll offset. */}
        <section
          ref={practiceSectionRef}
          tabIndex={-1}
          className="flex flex-col outline-none lg:col-span-5"
          data-testid="hub-practice-section"
        >
          <SectionHeading
            icon={ScrollText}
            title="Practice for Ranked"
            hint="Sharpen the knowledge used in Ranked."
          />
          <LobbyPanel className="mt-1.5 gap-2">
            {/* What the studying is ABOUT, before the list of ways in. The
                strip is an overview and never a control: the sets below are
                the only entry point, so the two cannot compete for the same
                click. See QuizCategoryStrip for why it carries no counts. */}
            <QuizCategoryStrip className="border-b border-[#c9a84c]/12 pb-2.5" />
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
                {primarySet && (
                  <Button
                    onClick={() => onSelectSet(primarySet)}
                    data-testid="practice-primary-cta"
                    variant="ghost"
                    className="h-8 w-full justify-between border border-[#c9a84c]/30 px-2.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#e2c877] hover:bg-[#c9a84c]/12 hover:text-[#f0d78c]"
                  >
                    Practice Questions
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                )}
                {/* The remaining sets as one-line chips: still every set, still
                    the same start action, at a fraction of the old grid's
                    visual weight. */}
                <div className="flex flex-col gap-1" data-testid="practice-tiles">
                  {primarySet && <PracticeTile set={primarySet} onSelect={() => onSelectSet(primarySet)} />}
                  {secondarySets.map((set) => (
                    <PracticeTile key={set.id} set={set} onSelect={() => onSelectSet(set)} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Mastery — the quietest line on the page, inside the study panel
                rather than as its own full-width band. */}
            {showMastery && (
              <Link
                to="/quiz/mastery"
                data-testid="hub-mastery-link"
                className="group mt-auto flex items-center gap-2 rounded-md border border-[#c9a84c]/15 px-2.5 py-1.5 transition-colors hover:border-[#c9a84c]/35 hover:bg-[#c9a84c]/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-[#c9a84c]/75" aria-hidden="true" />
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.2em] text-[#c9a84c]/80">
                  Mastery Journey
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  Guided champion progressions
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              </Link>
            )}
          </LobbyPanel>
        </section>
      </div>

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
          onEnterMatch={onEnterMatch}
          onPlayDailyChallenge={onPlayDailyChallenge}
          onPlayPractice={goToPractice}
        />
      )}
    </div>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
      <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[#e2c877]/85">
        <Icon className="h-3 w-3 text-[#c9a84c]/70" aria-hidden="true" />
        {title}
      </h2>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
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
