/**
 * MALT B1 — what a question icon on a match timeline actually shows.
 *
 * The backend hands down an `icon_hint` it PROVED from the round's frozen,
 * already-sanitized media blob: a kind, a name, and — when it verified one on
 * disk — a repo-relative asset path. This module is the frontend half: it
 * turns that hint into a picture, a label, and a sentence a screen reader can
 * read, and it decides nothing the hint did not already establish.
 *
 * THE DIVISION OF LABOUR
 * ──────────────────────
 * The backend owns ENTITY art, because it is the only side that can verify a
 * champion or item image exists before naming it (a case-wrong path is a live
 * 404 on Linux and silently fine on macOS, which is exactly the class of bug
 * that survives local testing). The frontend owns CATEGORY art, because the
 * category icons are this app's own — the six on the Leaguecraft category
 * strip, already chosen, already approved, already resolved through the one
 * rule that knows which host serves them.
 *
 * So: a hint with an `icon` renders that icon. A hint without one falls to its
 * category. A category this app has no art for falls to a neutral glyph, and
 * a neutral glyph is not a failure — it is the truthful rendering of "the data
 * proves the subject and no more".
 *
 * WHY THE CATEGORY MAP IS SPELT OUT
 * ─────────────────────────────────
 * Ranked question categories arrive in two shapes, because two providers wrote
 * them: generator SLUGS (`purchase_history_total`, `champion_ability_identity`)
 * from the placeholder bank, and human LABELS (`Item Costs`, `Champion Ability
 * Cooldowns`) from the accepted bank. Both are real and both are on rows in
 * production today, so the map keys on a normalized form of either and neither
 * is treated as the canonical one. An unknown category is normal — the bank
 * grows — and resolves to the neutral glyph rather than to a wrong picture.
 */
import { resolveCategoryIconUrl, QUIZ_CATEGORY_ICONS } from "@/components/quiz/QuizCategoryStrip";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { ReviewIconHint, ReviewRound } from "@/lib/ranked-public/contracts";

/** The category-strip tile ids, by their own id, for one lookup. */
const STRIP_BY_ID = new Map(QUIZ_CATEGORY_ICONS.map((c) => [c.id, c]));

/** Lowercased, punctuation-flattened: `Item Costs` and `item_costs` collide. */
function normalizeCategory(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Ranked category -> a category-strip tile id.
 *
 * Keyed by NORMALIZED category, so each entry covers the slug and the human
 * label of the same subject without listing both. Only subjects the strip
 * actually has art for appear; everything else is deliberately absent.
 */
const CATEGORY_TO_STRIP: Record<string, string> = {
  // Itemization — costs, components, recipes, stat lines, comparisons.
  item_costs: "itemization",
  item_components: "itemization",
  item_builds_into: "itemization",
  item_exact_stats: "itemization",
  item_stat_diversity: "itemization",
  item_stats: "itemization",
  item_recipe: "itemization",
  item_comparison: "itemization",
  purchase_history_total: "itemization",
  flat_inventory_stat_total: "itemization",
  // Abilities & cooldowns.
  champion_ability_cooldowns: "abilities",
  champion_ability_identity: "abilities",
  ability_identity: "abilities",
  post_mitigation_damage: "abilities",
  // Summoner spells.
  summoner_spells: "summoner-spells",
  summoner_spell_identity: "summoner-spells",
  // Objectives.
  objective_timers: "objectives",
  objectives: "objectives",
  // Champion knowledge that is not about a specific ability. There is no
  // champion tile on the strip (the six are subjects, not entity classes), so
  // this deliberately has no entry and resolves to the neutral glyph — see
  // `resolveQuestionIcon`. Listing it against a wrong tile would be worse.
  // Vision.
  vision: "vision",
  // Wave management.
  wave_management: "wave-management",
};

/**
 * How a question icon should be drawn.
 *
 * `specific` is not decoration — it is the difference between "this question
 * is about Trinity Force" and "this question is about itemization", and the
 * category tiles are REAL ITEM ART, so without it the two are the same
 * picture. The timeline prints a category mark quieter and cooler than an
 * entity portrait so the reader can tell a subject area from a subject.
 *
 * `glyph` names a drawn mark to use INSTEAD of art, for the one subject that
 * has no entity of its own.
 */
export interface QuestionIconView {
  src?: string;
  /** Short human label for the subject — the icon's `alt`/title. */
  label: string;
  /** True when the picture is the backend's proven ENTITY art rather than a
   *  category stand-in. */
  specific: boolean;
  /** A drawn mark rather than art. Today only Meta Reflex uses one. */
  glyph?: "meta_reflex";
}

/**
 * Turn one hint into a picture.
 *
 * Priority is the product's, and every step is something the data proves:
 * the verified entity image, then the category tile, then nothing. Meta Reflex
 * is its own case above both — the module id is the proof, and the block is
 * not "about" any one entity.
 */
export function resolveQuestionIcon(hint: ReviewIconHint): QuestionIconView {
  if (hint.kind === "meta_reflex") {
    /**
     * A DRAWN mark, not borrowed art.
     *
     * An earlier pass gave the block the category strip's ability tile, which
     * is a picture of Lux's ultimate — so a Meta Reflex block and an abilities
     * question printed the same icon while meaning different things, and the
     * block appeared to claim an ability it never asked about. Meta Reflex is
     * a speed drill ACROSS champions, items and stats; the honest icon for
     * "no one entity, on purpose" is a mark rather than a portrait.
     */
    return { glyph: "meta_reflex", label: "Meta Reflex", specific: true };
  }
  if (hint.icon) {
    return {
      src: resolveQuizAssetUrl(hint.icon),
      label: hint.key ?? KIND_LABELS[hint.kind] ?? "Question",
      specific: true,
    };
  }
  if (hint.kind === "category" && hint.key) {
    const tile = STRIP_BY_ID.get(CATEGORY_TO_STRIP[normalizeCategory(hint.key)] ?? "");
    return {
      src: tile ? resolveCategoryIconUrl(tile.iconPath) : undefined,
      label: prettyCategory(hint.key),
      specific: false,
    };
  }
  // A named entity whose art the backend could not verify (`{champion,
  // "Darius", null}`). The NAME is still proven; the picture is not, and a
  // path built here from the name would be exactly the unverified guess the
  // backend refused to make.
  return { label: hint.key ?? KIND_LABELS[hint.kind] ?? "Question", specific: false };
}

const KIND_LABELS: Record<string, string> = {
  champion: "Champion",
  ability: "Ability",
  item: "Item",
  rune: "Rune",
  summoner_spell: "Summoner spell",
  entity: "Entity",
  category: "Question",
  generic: "Question",
};

/** `champion_ability_identity` -> `Champion ability identity`; a human label
 *  passes through with its own capitalisation intact. */
export function prettyCategory(raw: string): string {
  if (/[A-Z]/.test(raw) && raw.includes(" ")) return raw;
  const words = raw.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : raw;
}

/**
 * The sentence a screen reader gets for one icon.
 *
 * It states position, subject and outcome in that order — "Question 4 of 15,
 * Item Knowledge, incorrect" — because a reader stepping along the timeline
 * needs to know WHERE they are before what it was about. An unresolved round
 * says so rather than reporting an outcome it does not have.
 */
export function questionIconLabel(
  round: ReviewRound, position: number, total: number,
): string {
  const subject =
    round.kind === "meta_reflex"
      ? "Meta Reflex"
      : resolveQuestionIcon(round.iconHint).label;
  const outcome = questionOutcome(round);
  const state =
    outcome === "correct" ? "correct"
      : outcome === "incorrect" ? "incorrect"
        : !round.revealed ? "not played out"
          : "unanswered";
  return `Question ${position} of ${total}, ${subject}, ${state}`;
}

export type QuestionOutcome = "correct" | "incorrect" | "unanswered";

/**
 * How the viewer did, as ONE value the timeline can tint by.
 *
 * A Meta Reflex block is five cards, not one answer, so it is `correct` only
 * on a clean sweep — anything less is `incorrect`, and a block with nothing
 * answered is `unanswered`. Collapsing 3-of-5 to "correct" would make the
 * timeline lie in the reader's favour, which is the one direction a study
 * record must never round.
 */
export function questionOutcome(round: ReviewRound): QuestionOutcome {
  if (!round.revealed) return "unanswered";
  const sub = round.viewerSubmission;
  if (round.kind === "meta_reflex") {
    const total = sub.challengeCount ?? 0;
    if (!sub.answeredCount) return "unanswered";
    return (sub.correctCount ?? 0) === total && total > 0 ? "correct" : "incorrect";
  }
  if (sub.isCorrect === null) return "unanswered";
  return sub.isCorrect ? "correct" : "incorrect";
}
