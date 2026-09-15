/**
 * RL2 — CHAMPION KNOWLEDGE: how many answers this account has got right,
 * per champion, restricted to the champions a Ranked role can actually be.
 *
 * WHY THIS FILE HOLDS NO DATA
 * ───────────────────────────
 * Two authorities are needed to answer "my best champions for Jungle", and
 * the client holds NEITHER:
 *
 *   1. per-champion correct-answer totals. `quiz_attempts` has no champion
 *      column and `quiz_questions` has none either; the champion appears only
 *      inside `question_key` (`champion_attack_type:v1:<x>:<Champion>`), at a
 *      position that differs per family. Parsing that on the client was
 *      explicitly refused: it would make every generator's key shape a
 *      frontend dependency, silently mis-attribute every family whose
 *      placeholder sits elsewhere, and read as data something that is an
 *      identifier.
 *
 *   2. champion → role eligibility. Mogzy's authority for this is the
 *      backend's `ranked_public/data/champion_primary_roles.csv` (173 rows,
 *      one PRIMARY role each), read through `ranked_public/champion_roles.py`.
 *      No route serves it, and it is deliberately NOT copied here — a second
 *      copy of a 173-row authority is a second copy that can disagree with
 *      the first.
 *
 * So this module defines the SHAPE of the answer and nothing else. The
 * production source below returns "absent" unconditionally, and the lobby
 * renders an absent state rather than a number it cannot stand behind. When a
 * real aggregate exists, `productionChampionKnowledge` is the one function
 * that changes, and no component does.
 *
 * `roleChampions.ts` is NOT an input here. That map is one COSMETIC champion
 * per role and says so in its own words; using it to answer "what am I best
 * at" would turn a decoration into a claim about the account.
 */
import type { RankedRole } from "@/lib/ranked-public/roles";

/** One champion the account has answered questions about. */
export interface ChampionKnowledgeEntry {
  /** Canonical roster spelling — the folder name under `assets/champions/`. */
  champion: string;
  /** Correct answers accumulated on this champion. The ranking key. */
  correct: number;
  /** Answers attempted. Present so a rank is never read as a rate. */
  attempts: number;
}

/**
 * What a source may say. `"absent"` is a first-class answer and is NOT an
 * error: it means "this account's champion knowledge cannot be stated", which
 * is exactly the production condition today. A component that treats absent
 * and empty as the same thing would tell a player they know no champions.
 */
export type ChampionKnowledgeResult =
  | { state: "absent" }
  | { state: "ready"; entries: readonly ChampionKnowledgeEntry[] };

/**
 * A role-scoped reader. Implementations return champions ALREADY restricted to
 * the role by the canonical eligibility authority — the restriction is a
 * property of the authority, never of the caller, so no component filters.
 */
export type ChampionKnowledgeSource = (role: RankedRole) => ChampionKnowledgeResult;

/** How many the lobby shows. Stated once so the demo and the real reader can
 *  never disagree about the length of the row. */
export const CHAMPION_KNOWLEDGE_TOP_N = 3;

/**
 * The production reader. Absent, always, until a backend aggregate exists.
 * It takes the role it will one day use so that adding the real call changes
 * this body and nothing above it.
 */
export const productionChampionKnowledge: ChampionKnowledgeSource = (_role) => ({
  state: "absent",
});

/**
 * Rank and cut. Pure, exported for its own test: ordering by `correct` is the
 * approved intent, and ties fall back to the champion name so the row does not
 * reshuffle between renders on equal scores.
 */
export function topChampions(
  entries: readonly ChampionKnowledgeEntry[],
  limit: number = CHAMPION_KNOWLEDGE_TOP_N,
): ChampionKnowledgeEntry[] {
  return [...entries]
    .filter((entry) => entry.correct > 0)
    .sort((a, b) => b.correct - a.correct || a.champion.localeCompare(b.champion))
    .slice(0, limit);
}

/** The backend-relative icon path for a canonical champion name. Capitalised
 *  folder, because macOS resolves the wrong case locally and Linux 404s on it. */
export function championIconPath(champion: string): string {
  return `assets/champions/${champion}/icon.png`;
}
