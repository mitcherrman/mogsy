/**
 * What goes on the Academy Bulletin — the Commons' noticeboard, Step 4.
 *
 * Four families, in priority order, every one of them backed by a source that
 * already exists in production. Nothing here invents a feed, a CMS or a
 * statistic: a family that cannot prove its content simply does not produce a
 * notice, and the board shows the ones that can.
 *
 * ### The families, and what actually backs them
 *
 * | Family      | Source                                        | Claims |
 * |-------------|-----------------------------------------------|--------|
 * | `personal`  | `useRankedMatchHistory` — the reader's own row | the outcome and rating delta the backend recorded |
 * | `quiz`      | `quizApi.categoryQuestions` — a live question  | the question text, verbatim |
 * | `mechanics` | `fetchTablesIndex` — a published study table   | that table's own title, subtitle and patch |
 * | `proplay`   | none needed — an invitation to a real route    | nothing |
 *
 * ### The rules this file exists to enforce
 *
 * **No answer ever reaches the board.** The questions endpoint returns
 * `question_text` and shuffled `choices` and *no* correct answer — the answer
 * only exists in the response to `submitAnswer` — so a prompt card physically
 * cannot leak one. The choices are dropped here as well: the board asks, the
 * quiz answers.
 *
 * **No manufactured significance.** The personal family renders only when the
 * reader has a real completed Ranked match, and says only what the row says.
 * A guest, an anonymous session, an account with no matches, and a backend
 * that will not answer all produce no personal notice at all.
 *
 * **No duplicate of Screen 1.** The Hall's Broadcast already renders the Patch
 * Brief from `usePatchBriefFeed`, so the patch family is deliberately absent —
 * see the handoff. The mechanics notice names the patch its tables are
 * verified through, which is patch-adjacent and is not that transmission.
 *
 * **A board is never empty.** The Pro Play invitation needs no data at all and
 * is always last, so a guest, a sparse account and a total backend outage all
 * still get an honest noticeboard.
 *
 * ### Cost
 * Two small reads for everyone (one live question, the mechanics index, both
 * cached by React Query) and one more for an identified account (their own
 * Ranked rows). The Ranked read is `enabled`-gated for exactly the reason
 * Revision 26 documents: `/lol` is the front page, and asking about an account
 * that does not exist answered 403 for every anonymous visitor.
 */
import { useQuery } from "@tanstack/react-query";
import { fetchTablesIndex, mechanicsTablesKeys } from "@/lib/mechanics-tables/api";
import { quizApi } from "@/lib/quiz/api";
import { PRO_PLAY_ROUTE } from "@/lib/pro-play/routes";
import { useRankedMatchHistory } from "@/pages/quiz-ranked/useRankedMatchHistory";

export type BulletinNoticeKind = "personal" | "quiz" | "mechanics" | "proplay";

export interface BulletinNotice {
  /** Stable across renders, and the handle the deterministic selector uses. */
  id: string;
  kind: BulletinNoticeKind;
  /** Small caps above the headline. Names the family to the reader. */
  eyebrow: string;
  /** Two lines at most on the painted sheet — the card clamps it. */
  title: string;
  /** Three lines at most. */
  body: string;
  /** One short supporting fact, or nothing. Never padded to fill a slot. */
  meta?: string;
  ctaLabel: string;
  ctaTo: string;
}

/**
 * The subject the quiz prompt is drawn from. A live `quiz_categories.name`,
 * taken from `PRACTICE_CATEGORY_SOURCES`' Abilities list — the largest live
 * bank, so the board is least likely to find it empty. Addressed by category
 * rather than by set for the reason `practiceCategories.ts` explains.
 */
const QUIZ_PROMPT_CATEGORY = "Champion Ability Cooldowns";

/** The invitation that needs no data, and therefore never fails. */
const PRO_PLAY_NOTICE: BulletinNotice = {
  id: "proplay-invitation",
  kind: "proplay",
  eyebrow: "Pro Play",
  title: "Watch the pros, then prove it",
  body:
    "Champion picks, player careers and match history from years of professional League — with questions drawn from the same record.",
  ctaLabel: "Open Pro Play",
  ctaTo: PRO_PLAY_ROUTE,
};

/** `2026-09-07T12:00:00` → "7 Sep". Undated rows simply get no date. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export interface AcademyBulletinInput {
  /** False for guests and anonymous sessions: no personal family, no request. */
  isIdentified: boolean;
}

/**
 * The board's running order, best first. Always at least one notice.
 *
 * Order is a product decision, not an accident of loading: what the reader
 * did comes before what they could do, which comes before what is true in
 * general, which comes before an invitation. A family that is still loading is
 * absent rather than a placeholder — the board simply grows as answers arrive,
 * and the reader never sees a skeleton pinned to a noticeboard.
 */
export function useAcademyBulletin({ isIdentified }: AcademyBulletinInput): BulletinNotice[] {
  // The reader's own last Ranked match. One row is all this family needs, but
  // the endpoint's smallest honest window is what the lobby already asks for.
  const ranked = useRankedMatchHistory(5, { enabled: isIdentified });

  const { data: question } = useQuery({
    queryKey: ["bulletin-quiz-prompt", QUIZ_PROMPT_CATEGORY],
    queryFn: () => quizApi.categoryQuestions(QUIZ_PROMPT_CATEGORY, 1),
    // The board is not worth a retry storm on a page this hot.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: tables } = useQuery({
    // The SAME key the Mechanics Explorer uses, so the two share one cache.
    queryKey: mechanicsTablesKeys.index,
    queryFn: fetchTablesIndex,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const notices: BulletinNotice[] = [];

  // ---- 1. what the reader just did -------------------------------------
  const lastMatch = ranked.loadState === "ready" ? ranked.entries[0] : undefined;
  if (lastMatch) {
    const outcome =
      lastMatch.viewerOutcome === "win"
        ? "You won your last Ranked match"
        : lastMatch.viewerOutcome === "loss"
          ? "You lost your last Ranked match"
          : "Your last Ranked match was a draw";
    // Only what the row actually carries. A null delta prints nothing rather
    // than a zero, and a bot match says so rather than implying an opponent.
    const bits: string[] = [];
    if (typeof lastMatch.ratingDelta === "number") {
      bits.push(`${lastMatch.ratingDelta >= 0 ? "+" : ""}${lastMatch.ratingDelta} rating`);
    }
    if (lastMatch.opponentIsBot) bits.push("versus a bot");
    else if (lastMatch.opponentDisplayName) bits.push(`versus ${lastMatch.opponentDisplayName}`);
    const when = shortDate(lastMatch.completedAt);
    if (when) bits.push(when);

    notices.push({
      id: `personal-${lastMatch.matchId}`,
      kind: "personal",
      eyebrow: "Your Record",
      title: outcome,
      body: "The Academy keeps every result. Queue again and put it on the board.",
      meta: bits.length ? bits.join(" · ") : undefined,
      ctaLabel: "Play Ranked",
      ctaTo: "/quiz",
    });
  }

  // ---- 2. something to answer right now --------------------------------
  const prompt = question?.questions?.[0];
  if (prompt?.question_text) {
    notices.push({
      id: `quiz-${prompt.id}`,
      kind: "quiz",
      eyebrow: "Can you answer this?",
      // The question verbatim. The choices are deliberately NOT carried here.
      title: prompt.question_text,
      body: "One of four. The Academy has thousands more where that came from.",
      meta: prompt.category || undefined,
      ctaLabel: "Answer it",
      ctaTo: "/quiz",
    });
  }

  // ---- 3. something true in general ------------------------------------
  const table = tables?.categories?.find((c) => c.study_tables.length > 0)?.study_tables?.[0];
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
