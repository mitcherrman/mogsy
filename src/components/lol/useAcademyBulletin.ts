/**
 * What goes on the Academy Bulletin — the Commons' noticeboard.
 *
 * Four families, in priority order, every one backed by a source that already
 * serves production. Nothing here invents a feed, a CMS or a statistic: a
 * family that cannot prove its content simply does not produce a notice, and
 * the board shows the ones that can.
 *
 * | Family      | Source                                        | Claims |
 * |-------------|-----------------------------------------------|--------|
 * | `personal`  | the reader's own Ranked rows and quiz progress | what those rows say |
 * | `quiz`      | `quizApi.categoryQuestions` — a live question  | the question text, verbatim |
 * | `mechanics` | `fetchTablesIndex` — a published study table   | that table's own title, subtitle, patch, row count |
 * | `proplay`   | none needed — an invitation to a real route    | nothing |
 *
 * ### The rules this file exists to enforce
 *
 * **No answer ever reaches the board.** The questions endpoint returns
 * `question_text` and shuffled `choices` and *no* correct answer — the answer
 * exists only in the response to `submitAnswer` — so a prompt card physically
 * cannot leak one. The choices are dropped here as well: the board asks, the
 * quiz answers.
 *
 * **No manufactured significance.** Every personal projection has a stated
 * condition, and an account that does not meet it gets fewer notices rather
 * than a padded one.
 *
 * **No duplicate of Screen 1.** The Hall's Broadcast already renders the Patch
 * Brief, so the patch family is deliberately absent.
 *
 * **A board is never empty.** The Pro Play invitation needs no data at all and
 * is always last.
 *
 * ### Variety without infrastructure
 * Which quiz subject and which study table appear is chosen by the DAY, not by
 * stored history: `daySeed` is days-since-epoch, so the board's subject rotates
 * on its own and every visitor on a given day sees the same one. Within a
 * subject the backend already randomises, so two visits on the same day still
 * get different questions. No storage, no personalisation, no recommender —
 * and it stays deterministic for a test or a capture by passing `daySeed`.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchTablesIndex, mechanicsTablesKeys } from "@/lib/mechanics-tables/api";
import { categoryLabel, quizApi, type QuizProgress } from "@/lib/quiz/api";
import { PRACTICE_CATEGORY_SOURCES } from "@/lib/quiz/practiceCategories";
import { PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";
import { deriveProfileStats } from "@/lib/profile/view-model";
import { academyTierLabel, parseAcademyProgression } from "@/lib/progression/academy";
import { useRankedMatchHistory } from "@/pages/quiz-ranked/useRankedMatchHistory";

export type BulletinNoticeKind = "personal" | "quiz" | "mechanics" | "proplay";

export interface BulletinNotice {
  id: string;
  kind: BulletinNoticeKind;
  eyebrow: string;
  title: string;
  body: string;
  meta?: string;
  ctaLabel: string;
  ctaTo: string;
}

/**
 * Every live `quiz_categories.name` the practice rail can open, flattened from
 * the SAME map the rail uses. Addressed by category rather than by set for the
 * reason `practiceCategories.ts` explains. `vision` contributes nothing because
 * it deliberately has no sources.
 */
export const BULLETIN_QUIZ_SOURCES: readonly string[] = Object.values(
  PRACTICE_CATEGORY_SOURCES,
).flat();

/* ---------------------------------------------------------------------------
   QUESTION SUITABILITY — measured, not guessed
   ---------------------------------------------------------------------------
   Production shipped a board that truncated real questions mid-word:
   "…LEE SIN R - DRAGON'S RAGE, OR LEONA R -…". A question the reader cannot
   finish reading is not a question, and truncating at a word boundary would
   not fix it — it would just move the cut. So the rule is eligibility: a
   question that cannot be shown whole is not shown at all.

   The threshold is calibrated against the real bank, not invented. 414 live
   questions from all 17 stocked categories were rendered into the actual title
   element at 1024x781, 1280x800 and 1440x900 and measured against a three-line
   budget:

     title box, 1024x781 (the tightest gate): 17.2px / 20.0px line-height,
     292px wide, budget 61px
     longest question that FITS ........ 60 characters
     shortest question that FAILS ...... 52 characters

   The two overlap because wrapping is a function of glyph widths, not of
   character count — which is exactly why a character rule has to sit BELOW the
   observed failure floor rather than near the fitting ceiling. 48 leaves four
   characters of margin under the shortest observed failure.

   Character capacity is very nearly constant across the gated viewports: the
   type and the column both scale with `--u`, so 1440 measured a longest-fitting
   of 61 against 1024's 60. One threshold covers all of them, and flow mode is
   more generous still.

   TO RE-CALIBRATE after any change to the board's type or width: render the
   live bank into `[data-testid="academy-bulletin-title"]` at 1024x781, compare
   `scrollHeight` against three line-boxes — NOT against `clientHeight`, which
   on a line-clamped element tracks the content and will tell you a one-line
   title cannot hold two — and set this below the shortest failure.
--------------------------------------------------------------------------- */
export const BULLETIN_QUESTION_MAX_CHARS = 48;

/**
 * A single unbroken token wider than the column overflows horizontally however
 * short the whole string is, and no line budget catches that. The longest word
 * measured anywhere in the live bank was 20 characters, so this rejects only
 * genuinely pathological rows.
 */
export const BULLETIN_QUESTION_MAX_WORD = 18;

/** Can this question be shown WHOLE on the painted board? */
export function isBulletinSuitableQuestion(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > BULLETIN_QUESTION_MAX_CHARS) return false;
  return !trimmed.split(/\s+/).some((word) => word.length > BULLETIN_QUESTION_MAX_WORD);
}

/**
 * The body is clamped to two lines, so authored copy has to fit whole for the
 * same reason a question does: a sentence cut mid-word is not worth showing.
 * Measured the same way — the longest real study-table subtitle that renders
 * complete on the board is 63 characters, so authored bodies stay under this.
 * Data-sourced bodies (a table's own subtitle) are not policed here; the
 * authority owns its own copy and the clamp protects the geometry.
 */
export const BULLETIN_AUTHORED_BODY_MAX_CHARS = 66;

/** The invitation that needs no data, and therefore never fails. */
const PRO_PLAY_NOTICE: BulletinNotice = {
  id: "proplay-invitation",
  kind: "proplay",
  eyebrow: "Pro Play",
  title: "Watch the pros, then prove it",
  body: "Champion picks, player careers and years of match history.",
  ctaLabel: "Open Pro Play",
  ctaTo: PRO_PLAY_ROUTE,
};

/** Days since the epoch. Stable for a day, needs no storage. */
export function bulletinDaySeed(now: number = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/** `2026-09-07T12:00:00` → "7 Sep". Undated rows simply get no date. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

export interface AcademyBulletinInput {
  /** False for guests and anonymous sessions: no personal family, no request. */
  isIdentified: boolean;
  /** The account's id, for the shared quiz-progress cache key. */
  userId?: string | null;
  /** Override the day rotation. For tests and deterministic capture only. */
  daySeed?: number;
}

/**
 * The board's running order, best first. Always at least one notice.
 *
 * What the reader did comes before what they could do, which comes before what
 * is true in general, which comes before an invitation. A family still loading
 * is absent rather than a placeholder — the board grows as answers arrive, and
 * nobody sees a skeleton pinned to a noticeboard.
 */
export function useAcademyBulletin({
  isIdentified,
  userId,
  daySeed,
}: AcademyBulletinInput): BulletinNotice[] {
  const seed = daySeed ?? bulletinDaySeed();

  const ranked = useRankedMatchHistory(5, { enabled: isIdentified });

  // The SAME key the Academy Record and the profile page use — one cache, and
  // no second request for progress anywhere on this page.
  const { data: progress } = useQuery<QuizProgress>({
    queryKey: ["quiz-progress", userId ?? null],
    queryFn: () => quizApi.getProgress(userId as string),
    enabled: isIdentified && !!userId,
  });

  /* TWO subjects per day, not one.
     Measured against the live bank on 2026-09-07: of the 19 sources, five
     cannot currently supply a question the board can show whole — two are
     empty categories and three (Jungle Camps, Item Build Paths, Champion
     Ability Cooldowns) are stocked entirely with the long comparison and
     scenario formats. Rotating one subject a day would therefore drop the
     board's most playable card on roughly a quarter of days. Drawing from a
     deterministic PAIR takes that to about one day in fourteen, at the cost of
     one more small cached request, and needs no ranking or history.
     The stride is coprime with the source count so the pair is a real pair;
     the guard covers the one seed where the two expressions coincide. */
  const sourceCount = BULLETIN_QUIZ_SOURCES.length;
  const primaryIndex = sourceCount ? seed % sourceCount : 0;
  let secondaryIndex = sourceCount ? (seed * 7 + 3) % sourceCount : 0;
  if (sourceCount > 1 && secondaryIndex === primaryIndex) {
    secondaryIndex = (secondaryIndex + 1) % sourceCount;
  }
  const primaryCategory = sourceCount ? BULLETIN_QUIZ_SOURCES[primaryIndex] : null;
  const secondaryCategory =
    sourceCount > 1 ? BULLETIN_QUIZ_SOURCES[secondaryIndex] : null;

  const primaryBatch = useQuery({
    queryKey: ["bulletin-quiz-prompt", primaryCategory],
    // A batch, not one row: most of a subject is too long for the board, so
    // the notice is picked from what that subject can actually show.
    queryFn: () => quizApi.categoryQuestions(primaryCategory as string, 20),
    enabled: !!primaryCategory,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
  const secondaryBatch = useQuery({
    queryKey: ["bulletin-quiz-prompt", secondaryCategory],
    queryFn: () => quizApi.categoryQuestions(secondaryCategory as string, 20),
    enabled: !!secondaryCategory,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tables } = useQuery({
    queryKey: mechanicsTablesKeys.index,
    queryFn: fetchTablesIndex,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const notices: BulletinNotice[] = [];
  const stats = deriveProfileStats(progress ?? null, [], null);
  const academy = parseAcademyProgression(progress ?? null);

  // ---- 1. what the reader did ------------------------------------------
  // Up to two personal notices, each with a stated condition. An account that
  // meets neither gets none, which is the honest outcome for a sparse reader.
  const lastMatch = ranked.loadState === "ready" ? ranked.entries[0] : undefined;
  if (lastMatch) {
    const outcome =
      lastMatch.viewerOutcome === "win"
        ? "You won your last Ranked match"
        : lastMatch.viewerOutcome === "loss"
          ? "You lost your last Ranked match"
          : "Your last Ranked match was a draw";
    const bits: string[] = [];
    if (typeof lastMatch.ratingDelta === "number") {
      bits.push(`${lastMatch.ratingDelta >= 0 ? "+" : ""}${lastMatch.ratingDelta} rating`);
    }
    if (lastMatch.opponentIsBot) bits.push("versus a bot");
    else if (lastMatch.opponentDisplayName) bits.push(`versus ${lastMatch.opponentDisplayName}`);
    const when = shortDate(lastMatch.completedAt);
    if (when) bits.push(when);

    notices.push({
      id: `personal-match-${lastMatch.matchId}`,
      kind: "personal",
      eyebrow: "Your Record",
      title: outcome,
      body: "Every result is kept. Queue again and put it on the board.",
      meta: bits.length ? bits.join(" · ") : undefined,
      ctaLabel: "Play Ranked",
      ctaTo: "/quiz",
    });
  }

  /* The second personal notice alternates by day between two facts the reader
     already has, so a returning player is not shown the same card twice.
     Both are STATUS, not milestones: nothing here decides that an ordinary
     number is an achievement. The streak needs a real run (five answers in a
     row) and the standing needs a coherent Academy block from the backend. */
  const streakQualifies = stats.currentStreak >= 5;
  const standingQualifies = !!academy && stats.hasAnyQuizActivity;
  const preferStreak = seed % 2 === 0;
  const secondary: Array<BulletinNotice | null> = [
    streakQualifies
      ? {
          id: "personal-streak",
          kind: "personal" as const,
          eyebrow: "Your Record",
          title: `${formatCount(stats.currentStreak)} correct in a row`,
          body: "Your streak is still running. One more keeps it alive.",
          meta: stats.bestStreak > stats.currentStreak
            ? `Best ${formatCount(stats.bestStreak)}`
            : "Your best yet",
          ctaLabel: "Keep it going",
          ctaTo: "/quiz",
        }
      : null,
    standingQualifies && academy
      ? {
          id: "personal-standing",
          kind: "personal" as const,
          eyebrow: "Your Record",
          title: `You stand at ${academyTierLabel(academy.tier)}`,
          body: academy.isMaxTier
            ? "The top of the Academy. Nothing stands above it."
            : "Every answered question moves the mark. Keep climbing.",
          meta: academy.isMaxTier
            ? undefined
            : `${formatCount(academy.xpToNext)} XP to ${academyTierLabel(
                academy.nextTier ?? academy.tier,
              ).replace("Academy ", "")}`,
          ctaLabel: "Climb",
          ctaTo: "/quiz",
        }
      : null,
  ];
  const second = preferStreak
    ? secondary[0] ?? secondary[1]
    : secondary[1] ?? secondary[0];
  if (second) notices.push(second);

  // ---- 2. something to answer right now --------------------------------
  // Only a question the board can show WHOLE. If the day's subject has none,
  // the family is absent rather than truncated.
  const prompt = [
    ...(primaryBatch.data?.questions ?? []),
    ...(secondaryBatch.data?.questions ?? []),
  ].find((q) => isBulletinSuitableQuestion(q.question_text));
  if (prompt?.question_text) {
    notices.push({
      id: `quiz-${prompt.id}`,
      kind: "quiz",
      eyebrow: "Can you answer this?",
      title: prompt.question_text.trim(),
      body: "One of four. Thousands more where that came from.",
      meta: categoryLabel(prompt) || undefined,
      ctaLabel: "Answer it",
      ctaTo: "/quiz",
    });
  }

  // ---- 3. something true in general ------------------------------------
  // Every published study table is a candidate, not just the first of the
  // first category, and the day picks which one.
  const allTables = (tables?.categories ?? []).flatMap((c) => c.study_tables);
  const table = allTables.length ? allTables[seed % allTables.length] : undefined;
  if (table) {
    notices.push({
      id: `mechanics-${table.table_id}`,
      kind: "mechanics",
      eyebrow: "Mechanics",
      title: table.title,
      body: table.subtitle,
      meta: tables?.patch ? `Patch ${tables.patch} · ${table.row_count} rows` : undefined,
      ctaLabel: "Open the Explorer",
      ctaTo: "/lol/mechanics",
    });
  }

  // ---- 4. the floor, which never fails ---------------------------------
  notices.push(PRO_PLAY_NOTICE);

  return notices;
}
