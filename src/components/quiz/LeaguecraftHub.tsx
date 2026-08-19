import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, HelpCircle, RotateCcw, ScrollText, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import QuizRankedQueueCard from "@/components/quiz/QuizRankedQueueCard";
import QuizRecentResultsCard from "@/components/quiz/QuizRecentResultsCard";
import type { QuizHistoryResponse, QuizProgress, QuizSet } from "@/lib/quiz/api";
import type { RankedState } from "@/lib/quiz/featured-mock";
import type { RankedRole } from "@/lib/ranked-public/roles";

/**
 * Leaguecraft hub — the Ranked-first one-page composition served at /quiz.
 *
 * The loop the page is built around is: play Ranked → see how it went →
 * practice the knowledge Ranked asks for → play Ranked again. Everything on
 * screen serves one of those three beats, in that order of visual weight:
 *
 *   1. Ranked hero          — dominant, gold-framed, the page's only major CTA
 *   2. Practice for Ranked  — the real quiz sets, compact
 *   3. Recent Studies       — the real session history, compact
 *   4. Mastery Journey      — a thin entry strip; must never rival Ranked
 *
 * This component is presentation only. Every value it renders is real data
 * owned by the /quiz page (ranked progress, quiz sets and their question
 * counts, session history); it fabricates nothing and fetches nothing.
 */

/** The set the "Practice Questions" primary action opens, when the backend
 *  serves it. Falls back to the first catalog set so the action is never dead. */
const PRIMARY_PRACTICE_SET = "All Current Questions";

export default function LeaguecraftHub({
  progress,
  ranked,
  onPlayRanked,
  sets,
  setsLoading,
  onSelectSet,
  onRefreshSets,
  history,
  historyLoading,
  historyError,
  showMastery = true,
  rankedRole = null,
}: {
  progress: QuizProgress | null;
  ranked: RankedState;
  /** R1: the player's League role, forwarded to the hero. Presentation only —
   * this component still fetches nothing. */
  rankedRole?: RankedRole | null;
  onPlayRanked: () => void;
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

  return (
    // One composition, not a stack: on desktop the middle row absorbs the
    // leftover height so the hub settles into the viewport instead of
    // clustering at the top. The height is capped so tall monitors get a
    // balanced block rather than three stretched bands.
    <div className="flex flex-col gap-3 lg:min-h-[min(calc(100dvh-var(--app-header-h)-6rem),34rem)]">
      {/* 1 ── Ranked / Placement hero. Strongest frame on the page. */}
      <section data-testid="hub-ranked-section">
        <QuizRankedQueueCard
          progress={progress}
          ranked={ranked}
          disabled={false}
          onPlay={onPlayRanked}
          role={rankedRole}
        />
      </section>

      <div className="grid grid-cols-1 gap-3 lg:flex-1 lg:grid-cols-12">
      {/* 2 ── Practice for Ranked. */}
      <section className="flex flex-col lg:col-span-7" data-testid="hub-practice-section">
        <SectionHeading
          icon={ScrollText}
          title="Practice for Ranked"
          hint="Sharpen the knowledge used in Ranked."
        />
        <Panel className="mt-1.5 flex flex-1 flex-col">
          {setsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full rounded-md" />
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[38px] w-full rounded-md" />
                ))}
              </div>
            </div>
          ) : sets.length === 0 ? (
            <div className="flex flex-col items-start gap-2 py-3" data-testid="practice-empty">
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col gap-2">
              {primarySet && (
                <Button
                  onClick={() => onSelectSet(primarySet)}
                  data-testid="practice-primary-cta"
                  className="h-9 w-full justify-between border border-[#c9a84c]/45 bg-[#c9a84c]/10 text-[13px] font-bold uppercase tracking-[0.14em] text-[#f0d78c] hover:bg-[#c9a84c]/20"
                >
                  Practice Questions
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
              {/* Compact topic tiles — the same sets, the same start action,
                  without five full-height cards. */}
              <div
                className="grid flex-1 auto-rows-fr grid-cols-1 gap-1.5 sm:grid-cols-2"
                data-testid="practice-tiles"
              >
                {sets.map((set) => (
                  <PracticeTile key={set.id} set={set} onSelect={() => onSelectSet(set)} />
                ))}
              </div>
            </motion.div>
          )}
        </Panel>
      </section>

      {/* 3 ── Recent Studies / progress. */}
      <section className="flex flex-col lg:col-span-5" data-testid="hub-recent-section">
        <SectionHeading icon={RotateCw} title="Recent Studies" hint="How am I doing?" />
        <QuizRecentResultsCard
          history={history}
          loading={historyLoading}
          error={historyError}
          onPlayRanked={onPlayRanked}
          hideHeader
          className="mt-1.5 flex-1"
        />
      </section>
      </div>

      {/* 4 ── Mastery Journey — deliberately the quietest module on the page. */}
      {showMastery && (
        <section data-testid="hub-mastery-section">
          <Link
            to="/quiz/mastery"
            data-testid="hub-mastery-link"
            className="group flex items-center gap-3 rounded-lg border border-[#c9a84c]/18 bg-[#060d1a]/70 px-3.5 py-2 backdrop-blur-md transition-colors hover:border-[#c9a84c]/40 hover:bg-[#0a1428]/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BookOpen className="h-4 w-4 shrink-0 text-[#c9a84c]/80" aria-hidden="true" />
            <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.22em] text-[#c9a84c]/85">
              Mastery Journey
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              Guided champion progressions — cooldowns, mana, items. New: Olaf, level 1 to 11.
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-cyan-200/80 group-hover:text-cyan-200">
              View journeys
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      )}
    </div>
  );
}

/** Warm navy glass panel. Deliberately avoids `bg-card`, which the LoL theme
 *  wraps in a cyan inset ring — the hub reserves that emphasis for Ranked. */
function Panel({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-lg border border-[#c9a84c]/18 bg-[#060d1a]/72 p-3 backdrop-blur-md ${className}`}
    >
      {children}
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
      <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.2em] text-[#e2c877]">
        <Icon className="h-3.5 w-3.5 text-[#c9a84c]/80" aria-hidden="true" />
        {title}
      </h2>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
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
      className="flex min-h-[38px] w-full items-center gap-2 rounded-md border border-cyan-400/15 bg-[#04101c]/60 px-2.5 py-1.5 text-left transition-colors hover:border-cyan-300/45 hover:bg-[#06182a]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90">
        {set.name}
      </span>
      <span className="shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">
        {count.toLocaleString()} Q
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
    </button>
  );
}
