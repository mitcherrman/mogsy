/**
 * PRAC1 — what a lobby category tile actually OPENS.
 *
 * The category rail names six subjects. This file is the other half of that
 * promise: for each of them, the live `quiz_categories` rows that hold its
 * Practice questions, and the loader that turns a tile press into a real
 * Practice session.
 *
 * WHY A MAP AND NOT A SET
 * ───────────────────────
 * Practice used to be entered only by SET (`GET /api/quiz/sets`), and the five
 * live sets do not describe these six subjects: none of them contains
 * `Champion Ability Cooldowns` (3,497 live rows), `Champion Ability Costs`
 * (1,339) or `Minion Waves` (54), and "All Current Questions" is every subject
 * at once. Wiring a tile to a set would open the wrong thing for four of the
 * five actionable subjects.
 *
 * The SAME Practice endpoint already takes a category: `GET
 * /api/quiz/questions?category=<name>` carries the identical `PRACTICE_MODE`
 * family gate, the identical `is_active` predicate and the identical row
 * formatter as the `?set=` path (`routes/quiz.py`). So this is not a second
 * practice system — it is the one Practice runner, addressed by subject
 * instead of by set.
 *
 * WHERE THE MAPPING COMES FROM
 * ────────────────────────────
 * `quiz/public_category.py` on the backend is the authority for "which subject
 * is this question?", and its `_STORED_TO_CATEGORY` table is what these lists
 * invert. Two live categories are NOT in that table yet and are placed here
 * from their rows' own family ids, both of which the backend's
 * `FAMILY_TO_CATEGORY` files under Abilities:
 *
 *   `Champion Ability Costs`  → family `ability_cost_rank`   → ABILITIES
 *   `Mana Management`         → family `casts_before_oom`    → ABILITIES
 *
 * Leaving them out would have silently withheld 1,618 live rows from the
 * Abilities tile.
 *
 * Names are the RAW `quiz_categories.name` strings, because that is what the
 * endpoint matches on (`AND c.name = ?`). They are ordered by live row count,
 * descending, which only decides who wins a tie in the round-robin below — a
 * category that has gone away simply returns nothing and is skipped.
 *
 * VISION HAS NO SOURCES, AND THAT IS THE POINT
 * ────────────────────────────────────────────
 * There is no `Vision` category on the live bank and no question anywhere
 * resolves to the subject. Its entry is deliberately an empty list rather than
 * a missing key: the tile stays in the taxonomy, `isPracticeCategoryAvailable`
 * answers false, and the rail renders it unavailable. Nothing here invents a
 * route, a placeholder bank or a stand-in category for it.
 */
import { quizApi, type QuizQuestion } from "@/lib/quiz/api";

/** The live `quiz_categories.name` rows behind each lobby tile. */
export const PRACTICE_CATEGORY_SOURCES: Readonly<Record<string, readonly string[]>> = {
  objectives: ["Objectives", "Objective Timers", "Jungle Camps"],
  "wave-management": ["Minion Waves"],
  "summoner-spells": [
    "Summoner Spell Cooldowns",
    "Summoner Spells",
    "Summoner Spell Recognition",
  ],
  itemization: [
    "Item Builds Into",
    "Item Exact Stats",
    "Item Costs",
    "Item Components",
    "Item Build Paths",
    "Item Stat Diversity",
    "Item Recognition",
    "Item Stats",
  ],
  abilities: [
    "Champion Ability Cooldowns",
    "Champion Ability Costs",
    "Champion Ability Recognition",
    "Mana Management",
  ],
  // No content exists. Not a gap to be filled in later by guessing.
  vision: [],
};

/** The session length the set-entered Practice runner already uses. */
export const PRACTICE_SESSION_SIZE = 10;

export function practiceSourcesFor(categoryId: string): readonly string[] {
  return PRACTICE_CATEGORY_SOURCES[categoryId] ?? [];
}

/**
 * Whether a tile is a door.
 *
 * A category this build has never heard of answers false rather than throwing:
 * an unknown id is a real state (a rail that deployed ahead of this map), and
 * an inert tile is the correct rendering of "nothing to open".
 */
export function isPracticeCategoryAvailable(categoryId: string): boolean {
  return practiceSourcesFor(categoryId).length > 0;
}

/** Fisher–Yates. The server randomises WITHIN a category; this randomises the
 *  order the categories' questions are met in. */
function shuffle<T>(items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Load one Practice session for a subject.
 *
 * Every source category is asked for a full session's worth in parallel, and
 * the answers are dealt out ROUND-ROBIN rather than concatenated. That is what
 * makes an Itemization session feel like itemization instead of like whichever
 * of its eight categories happens to be biggest: build paths outnumber item
 * stats 14:1 on the live bank, and a straight merge-and-shuffle would print
 * that ratio. One pass per source per round means every source that has
 * anything is represented before any source is drawn from twice.
 *
 * A source that errors or is empty is skipped, not fatal — a subject with
 * three categories should still open when one of them has been retired. The
 * caller sees an empty array only when the whole subject came back empty,
 * which is the same signal the set-entered path already handles.
 */
export async function loadPracticeCategoryQuestions(
  categoryId: string,
  limit: number = PRACTICE_SESSION_SIZE,
): Promise<QuizQuestion[]> {
  const sources = practiceSourcesFor(categoryId);
  if (sources.length === 0) return [];

  const pools = await Promise.all(
    sources.map((name) =>
      quizApi
        .categoryQuestions(name, limit)
        .then((data) => data.questions ?? [])
        .catch(() => [] as QuizQuestion[]),
    ),
  );

  const seen = new Set<string>();
  const picked: QuizQuestion[] = [];
  const depth = Math.max(0, ...pools.map((p) => p.length));

  for (let round = 0; round < depth && picked.length < limit; round += 1) {
    for (const pool of pools) {
      if (picked.length >= limit) break;
      const question = pool[round];
      if (!question) continue;
      const key = String(question.id);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(question);
    }
  }

  return shuffle(picked);
}
