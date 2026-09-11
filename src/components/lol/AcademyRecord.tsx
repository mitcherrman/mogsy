/**
 * THE ACADEMY RECORD — the Commons' large gilt-framed navy mount, left.
 *
 * Revision 24 of `docs/MOGZY_HUB_REDESIGN_HANDOFF.md`. This is the room's
 * primary object: the reader's own standing in the Academy, mounted where the
 * membership plaque used to hang. Premium moved down to a supporting slip; a
 * promotion is not what a member's room shows first.
 *
 * ### It is a credential, not a dashboard
 * Six facts and two actions. Every number is a real backend answer — there is
 * no fixture, no seeded value and no "coming soon" row. When a fact is not
 * available the line is simply absent, because an Academy record that invents
 * an entry is worse than a short one.
 *
 * ### It reuses Profile's authorities rather than copying Profile
 *  - identity            `useProfileIdentity` (the canonical `profiles` read)
 *  - standing / XP       `quizApi.getProgress` → `parseAcademyProgression`,
 *                        with `deriveProfileStats`' legacy rank as the fallback
 *  - answered/accuracy/  `deriveProfileStats` — the same view model the profile
 *    streak              page renders, so the two surfaces cannot disagree
 *  - best category       `pickBestCategory` over `quizApi.getCategories`
 *  - Ranked standing     `useRankedProgression`
 *
 * The two React Query keys are the SAME keys `LeagueProfileStats` uses
 * (`["quiz-progress", userId]`, `["quiz-categories", userId]`), so a reader who
 * goes from here to their profile pays for neither fetch twice.
 *
 * `useRankedProgression` is fail-closed by construction — an older backend, a
 * rate limit and an ineligible account all resolve to `unavailable`, and the
 * Ranked line is then absent. It is asked **only for an identified account**:
 * `/lol` is the front page and every anonymous visitor loads it, so firing the
 * request for guests put an expected 403 in the console on every page view.
 * A 403 nobody can act on is noise that hides real failures. An authenticated
 * failure is untouched and still travels the normal path.
 *
 * ### States
 * Signed out, anonymous, or no activity at all → the empty register: the frame
 * still reads as a record, and it invites the reader to open one. It never
 * prints `0%` or "Unranked" as though those were achievements. A member's
 * standing is marked in the band; there is no upsell anywhere in this panel.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfileIdentity } from "@/hooks/useProfileIdentity";
import { usePremiumSession } from "@/hooks/usePremiumSession";
import { useRankedProgression } from "@/pages/quiz-ranked/useRankedProgression";
import { categoryLabel, quizApi } from "@/lib/quiz/api";
import { deriveProfileStats, pickBestCategory } from "@/lib/profile/view-model";
import { academyTierLabel, parseAcademyProgression } from "@/lib/progression/academy";

/** Whole numbers below 10%, one decimal above — never a trailing `.0`. */
function formatAccuracy(value: number): string {
  return `${Number(value).toFixed(Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1)}%`;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

/** One engraved line of the register: a label, its value, nothing else. */
function RecordLine({ label, value }: { label: string; value: string }) {
  return (
    <li className="academy-commons-record-line flex items-baseline justify-between gap-3">
      <span className="academy-commons-record-line-label text-[11px] font-bold uppercase tracking-[0.2em] text-[#c3cfe2]/60">
        {label}
      </span>
      <span className="academy-commons-record-line-value text-[15px] font-semibold text-[#f0e2bd]">
        {value}
      </span>
    </li>
  );
}

export default function AcademyRecord() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  // An anonymous session is a real Supabase user, but it is not an identity:
  // it has no profile row worth naming and no standing worth engraving.
  const isAnonymous = !!(user as { is_anonymous?: boolean } | null)?.is_anonymous;
  const isIdentified = !!userId && !isAnonymous;

  const { proStatus } = usePremiumSession();
  const { displayName, avatarUrl } = useProfileIdentity(isIdentified ? userId : null);

  // Same query keys as LeagueProfileStats — one cache, two surfaces.
  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: ["quiz-progress", userId],
    queryFn: () => quizApi.getProgress(userId as string),
    enabled: !!userId,
  });
  const { data: categoriesData } = useQuery({
    queryKey: ["quiz-categories", userId],
    queryFn: () => quizApi.getCategories(userId as string),
    enabled: !!userId,
  });

  // Only ask about a Ranked standing when there is an account to have one.
  const ranked = useRankedProgression({ enabled: isIdentified });

  const stats = deriveProfileStats(progress ?? null, categoriesData?.categories ?? [], null);
  const academy = parseAcademyProgression(progress ?? null);
  const best = pickBestCategory(categoriesData?.categories ?? []);

  // The register is opened by ACTIVITY, not by having an account. A signed-in
  // reader who has never answered a question sees the same honest invitation a
  // visitor does, rather than a record of zeroes.
  const hasRecord = stats.hasAnyQuizActivity;
  const standing = academy ? academyTierLabel(academy.tier) : stats.rankName;
  const showRanked = ranked.loadState === "ready" && !!ranked.progression?.rated;

  return (
    <section
      data-testid="academy-record"
      data-record-state={hasRecord ? "open" : "empty"}
      aria-labelledby="academy-record-heading"
      /* `border-4` is the walnut mount board in flow mode; stage mode drops it,
         because the painting supplies the gilt frame instead. */
      className="academy-commons-plaque academy-commons-record relative flex min-w-0 flex-col overflow-hidden rounded-[3px] border-4 border-solid"
    >
      <div className="academy-commons-plaque-band academy-commons-record-band relative flex items-center justify-center gap-3 px-4 py-2 sm:px-5">
        <span className="academy-commons-engraved text-[10px] font-bold uppercase tracking-[0.3em] sm:text-[11px]">
          {proStatus === "pro" ? "Academy Record · Member" : "Academy Record"}
        </span>
      </div>

      <div className="academy-commons-record-body relative flex flex-1 flex-col justify-center gap-4 px-5 py-5 sm:px-7 sm:py-6">
        {/* The seal drops into the painting's laurel medallion in stage mode.
            The reader's own avatar when there is one — this is their record. */}
        <span
          aria-hidden
          className="academy-commons-record-seal mx-auto flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#c9a84c]/50 bg-[#0a121f] shadow-[inset_0_1px_0_rgba(232,205,152,0.25)]"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UserRound className="h-6 w-6 text-[#e8cd98]" />
          )}
        </span>

        <div className="academy-commons-record-head text-center">
          <h2
            id="academy-record-heading"
            className="academy-commons-record-title text-[1.5rem] font-medium leading-tight text-[#f0e2bd] sm:text-[1.75rem]"
            style={{ fontFamily: '"Cinzel", "Trajan Pro", "EB Garamond", Georgia, serif' }}
          >
            {/* The band above is already engraved "Academy Record"; the title
                is the PERSON. With no display name the hub's own established
                fallback is used (Screen 1 addresses a nameless reader the same
                way) rather than repeating the band back at them. */}
            {displayName ?? "Summoner"}
          </h2>
          <p className="academy-commons-record-standing mt-1.5 text-[12px] font-bold uppercase tracking-[0.26em] text-[#c9a84c]">
            {hasRecord ? standing : "No record opened"}
          </p>
        </div>

        <span
          aria-hidden
          className="academy-commons-record-rule block h-px w-full bg-gradient-to-r from-transparent via-[#c9a84c]/35 to-transparent"
        />

        {hasRecord ? (
          <>
            <ul className="academy-commons-record-register flex flex-col gap-2">
              {academy && !academy.isMaxTier ? (
                <RecordLine
                  label="To next tier"
                  value={`${formatCount(academy.xpToNext)} XP`}
                />
              ) : null}
              <RecordLine label="Answered" value={formatCount(stats.totalQuestionsAnswered)} />
              <RecordLine label="Accuracy" value={formatAccuracy(stats.accuracy)} />
              <RecordLine
                label="Streak"
                value={`${formatCount(stats.currentStreak)} · best ${formatCount(stats.bestStreak)}`}
              />
              {best ? (
                <RecordLine label="Strongest" value={categoryLabel(best)} />
              ) : null}
              {showRanked && ranked.progression ? (
                <RecordLine
                  label="Ranked"
                  value={`${formatCount(ranked.progression.rating)} · ${academyTierLabel(
                    ranked.progression.tier,
                  ).replace("Academy ", "")}`}
                />
              ) : null}
            </ul>

            {/* The tier interval, drawn only when the backend gave a coherent
                one. No bar is better than a bar at a guessed position. */}
            {academy && !academy.isMaxTier ? (
              <div
                className="academy-commons-record-bar h-1 w-full overflow-hidden rounded-full bg-[#0a121f] ring-1 ring-inset ring-[#c9a84c]/25"
                role="presentation"
              >
                <span
                  className="block h-full bg-gradient-to-r from-[#b08c30] to-[#e0c273]"
                  style={{ width: `${academy.progressPercent}%` }}
                />
              </div>
            ) : null}
          </>
        ) : (
          <p className="academy-commons-record-empty text-center text-[13.5px] leading-relaxed text-[#c3cfe2]/80">
            {progressLoading
              ? "Retrieving your record…"
              : "Nothing is written here yet. Answer your first question and the Academy will start keeping your record — standing, accuracy, streak and all."}
          </p>
        )}

        {/* No `mt-auto`. Pinning the actions to the foot of the frame reads
            correctly only once the register fills the middle; in the empty
            state — which is what every guest and every logged-out visitor sees
            — it left a large void of bare navy between the copy and the CTA.
            The body centres as one group instead, in both states. */}
        <div className="academy-commons-record-actions flex flex-col items-center gap-2">
          <Link
            to="/quiz"
            data-testid="academy-record-primary"
            className="academy-commons-record-cta inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[3px] bg-gradient-to-b from-[#e0c273] to-[#b08c30] px-7 py-3 text-[15px] font-bold text-[#160f02] shadow-[0_1px_0_hsl(42_90%_78%)_inset] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0d78c] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b14] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:w-auto sm:px-9"
          >
            {hasRecord ? "Continue Studying" : "Begin Studying"}
            <ArrowRight className="h-4 w-4 opacity-75" aria-hidden />
          </Link>
          {/* `/profile` is a protected route; the hub establishes an anonymous
              session, so it resolves for everyone who can see this panel. */}
          <Link
            to="/profile"
            data-testid="academy-record-secondary"
            className="academy-commons-record-secondary inline-flex min-h-[44px] items-center gap-1.5 rounded-[2px] px-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#c9a84c] transition-colors hover:text-[#f0d78c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e6cd93]/70"
          >
            View Profile
          </Link>
        </div>
      </div>

    </section>
  );
}
