import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, HelpCircle, RotateCcw, RotateCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RankedLobbyHero, { type DemoRoleMastery } from "@/components/quiz/RankedLobbyHero";
import LobbyPanel from "@/components/quiz/LobbyPanel";
import QuizRecentResultsCard from "@/components/quiz/QuizRecentResultsCard";
import QuizCategoryRail from "@/components/quiz/QuizCategoryRail";
import type { QuizHistoryResponse, QuizProgress, QuizSet } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";
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
 *   1. Ranked lobby   — the three-column hero: the role character-select on
 *                       the left, the LEAGUECRAFT/RANKED identity and the one
 *                       PLAY gem in the centre, the player's own portrait,
 *                       standing and recent Ranked results on the right.
 *                       Nothing else on the page competes with it.
 *   2. Category rail  — the six subjects Leaguecraft studies, as one
 *                       full-width horizontal band across the foot of the
 *                       first viewport. It closes the lobby and opens the
 *                       workspace. An overview, not a menu — see
 *                       `QuizCategoryRail` for why it is not a door yet, and
 *                       the note at its mount for why it is not sticky yet.
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

/** The set the "Practice Questions" primary action opens, when the backend
 *  serves it. Falls back to the first catalog set so the action is never dead. */
const PRIMARY_PRACTICE_SET = "All Current Questions";

export default function LeaguecraftHub({
  progress,
  ranked,
  onPlayRanked,
  playDisabled = false,
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
  onPlayRanked: () => void;
  /** Holds the PLAY seal still while the host commits the chosen role. The
   *  seal is the lobby's one commit point, so a second press during that
   *  write would start a second write and a second navigation. */
  playDisabled?: boolean;
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
          onPlayRanked={onPlayRanked}
          playDisabled={playDisabled}
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
      {/* No top margin of its own: the hub's own `gap-3` is the whole seam.
          The rail is what CLOSES the rack, so it wants to read as attached to
          it rather than as the first item of a new list — and at 832px tall
          the four pixels are the difference between the rail's bottom edge
          landing inside the first viewport and just outside it. */}
      <div className="relative z-30">
        <QuizCategoryRail />
      </div>

      {/* 3 ── Secondary row: where I've been, and where else I can study.
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
      <div
        data-testid="hub-workspace"
        /* The rule that used to open this row is gone: the RAIL above is the
           rule now, and a hairline immediately under the rail's own bottom
           edge read as a double line. The `pt-3` stays — it is also what keeps
           the first content clear of the rail at the moment it pins. */
        className="mt-3 grid grid-cols-1 gap-3 pt-1 lg:grid-cols-12"
      >
        <section className="flex flex-col lg:col-span-7" data-testid="hub-recent-section">
          <SectionHeading icon={RotateCw} title="Recent Studies" hint="How am I doing?" />
          {/* The empty state opens PRACTICE, not Ranked. A Ranked match never
              produces a row in this card (see its header comment), so the old
              "Play Ranked" button was pointing at the one activity whose
              result would never show up in the thing it was empty. It opens
              the same set the panel's own primary action does, and falls back
              to nothing at all when the catalog has not loaded — never to a
              dead button. */}
          <QuizRecentResultsCard
            history={history}
            loading={historyLoading}
            error={historyError}
            onStartPractice={primarySet ? () => onSelectSet(primarySet) : undefined}
            hideHeader
            className="mt-1.5 flex-1"
          />
        </section>

        {/* 3b ─ Study: Practice + Mastery, demoted to one compact panel. The
                routes and sets are untouched — only their visual weight. */}
        <section className="flex flex-col lg:col-span-5" data-testid="hub-practice-section">
          <SectionHeading
            icon={ScrollText}
            title="Practice for Ranked"
            hint="Sharpen the knowledge used in Ranked."
          />
          {/* The six subjects used to head this panel. They are the RAIL above
              now — the same six icons at the width they actually apply to —
              so the panel is only the ways IN, and the overview and the doors
              no longer share a box. */}
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
