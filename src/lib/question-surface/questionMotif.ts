/**
 * QF1 — a question's visual MOTIF: what kind of knowledge it is.
 *
 * Resolved server-side from the question's family (`quiz.question_motif`) and
 * shipped as `topic.motif` / a Mastery challenge's `motif`. The client never
 * derives it from the category, prompt, roles, media or a question key — it
 * only validates the wire value.
 *
 * Independent of every other axis a question carries: `category` is the public
 * subject, `roles` are the RQ1 role emblems, and presentation is premise media.
 * A motif replaces none of them.
 *
 * Not to be confused with RA7's `familyLayout` (combat/lifecycle LAYOUT
 * families), which is a different concept that predates this one.
 */

export const QUESTION_MOTIFS = [
  "champion_studies",
  "combat_workings",
  "items_economy",
  "rift_field_guide",
  "runes_summoner_arts",
] as const;

export type QuestionMotif = (typeof QUESTION_MOTIFS)[number];

const KNOWN: ReadonlySet<string> = new Set(QUESTION_MOTIFS);

/**
 * The wire motif, or `null`. Fails closed: an absent, malformed or unknown
 * value is `null` (no motif), never a guess.
 */
export function readQuestionMotif(value: unknown): QuestionMotif | null {
  return typeof value === "string" && KNOWN.has(value)
    ? (value as QuestionMotif)
    : null;
}
