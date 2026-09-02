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
 * RG2 — THE CATEGORY MAP LEFT THIS FILE
 * ─────────────────────────────────────
 * It used to live here: a private table reconciling the spellings a Ranked
 * category arrives in — generator SLUGS (`purchase_history_total`) from the
 * placeholder bank, human LABELS (`Item Costs`) from the accepted bank, and
 * `quiz_categories` names from the shared bank. All three are on live rows, so
 * the table was real work; the problem was where it was. Sitting in one
 * component's file, applied to one surface, it could not be checked against
 * the family contract that actually defines the bank, and the arena timeline
 * would have needed a second copy of it.
 *
 * Classification now happens once, in `quiz/public_category.py` — the only
 * place that can see the family contract, the pool specs and the seeding
 * scripts — and travels as a stable key on each round's `topic`. What is left
 * here is the half that was always the frontend's: turning that key into a
 * picture, through the shared `@/lib/quiz/publicCategory` art so this surface
 * and the timeline cannot print different icons for the same subject.
 */
import {
  categoryIconUrl,
  categoryLabel,
  legacyCategoryKey,
  type CategoryKey,
} from "@/lib/quiz/publicCategory";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { ReviewIconHint, ReviewRound } from "@/lib/ranked-public/contracts";

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
/**
 * Art for a round whose backend DID publish a topic — the RG2 path.
 *
 * Preferred over `resolveQuestionIcon` wherever a whole round is in hand,
 * because a topic carries the resolved public key and this file then does no
 * classification at all.
 */
export function resolveRoundIcon(round: ReviewRound): QuestionIconView {
  const topic = round.topic;
  if (!topic) return resolveQuestionIcon(round.iconHint);
  if (topic.category === "meta-reflex") {
    return { glyph: "meta_reflex", label: "Meta Reflex", specific: true };
  }
  const hint = topic.iconHint;
  if (hint?.icon) {
    return {
      src: resolveQuizAssetUrl(hint.icon),
      label: hint.key ?? categoryLabel(topic.category),
      specific: true,
    };
  }
  return {
    src: categoryIconUrl(topic.category as CategoryKey),
    label: hint?.key && hint.kind !== "category"
      ? hint.key : categoryLabel(topic.category),
    specific: false,
  };
}

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
    // The key here is the RAW stored string, not a public key: this branch is
    // only reached for a round the backend classified before RG2. The bridge
    // maps what it can and answers `general` for the rest — never a guess.
    return {
      src: categoryIconUrl(legacyCategoryKey(hint.key)),
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
      : round.kind === "mastery_slice"
        ? "Mastery"
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
 * A multi-challenge round is several answers, not one, so it is `correct` only
 * on a clean sweep — anything less is `incorrect`, and a round with nothing
 * answered is `unanswered`. Collapsing 3-of-5 to "correct" would make the
 * timeline lie in the reader's favour, which is the one direction a study
 * record must never round.
 *
 * Which rule applies is decided by the SHAPE of the submission, not by a list
 * of module kinds: a counted round reports `challengeCount` and no single
 * `isCorrect`, and a one-answer round reports the reverse. A Meta Reflex block
 * and a Mastery slice are both the former, and so is any future counted
 * module, with no change here.
 */
export function questionOutcome(round: ReviewRound): QuestionOutcome {
  if (!round.revealed) return "unanswered";
  const sub = round.viewerSubmission;
  if (sub.challengeCount !== null && sub.isCorrect === null) {
    const total = sub.challengeCount;
    if (!sub.answeredCount) return "unanswered";
    return (sub.correctCount ?? 0) === total && total > 0 ? "correct" : "incorrect";
  }
  if (sub.isCorrect === null) return "unanswered";
  return sub.isCorrect ? "correct" : "incorrect";
}
