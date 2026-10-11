/**
 * PPQ2-D — the pure model behind the premium Pro Play statistical reveal.
 *
 * WHAT IT IS. A projection of ONE server grade onto the question's options:
 * which option the server says is correct, which one the player picked, and
 * the server's own statistic for each, in SERVER OPTION ORDER. Nothing here
 * renders; `ProPlayRevealValue` and `ProPlayRevealFooter` draw it.
 *
 * ANSWER SAFETY.
 *  - `buildProPlayRevealModel(null)` is null. The only input is the graded
 *    reveal (PPQ2-B `projection.reveal`, which exists only after the server
 *    answered), so there is no pre-answer path to a value.
 *  - Correctness comes from the server's `correctOptionId` (= the index of
 *    `result.correct_answer`), the pick from `selectedOptionId`. No label is
 *    compared to decide a verdict, and `evidence.correct_label` is never used
 *    to mark a tablet.
 *
 * NO INVENTED STATISTICS.
 *  - `display` is the server's formatted value, shown verbatim; a subject
 *    without one shows `—`.
 *  - The support line is the legacy `ProPlayEvidence` line, copied verbatim
 *    (it is not exported there and that file is outside this workstream); a
 *    parity test pins the copy to the original's rendered output.
 *  - No rank, no position, no delta, no share, no sort. An option the
 *    evidence does not name (or names twice) gets no value rather than a
 *    guessed one.
 */
import type {
  ProPlayEvidence,
  ProPlayEvidenceSubject,
  ProPlayMetricTag,
} from "@/lib/pro-play/contract";
import type { AnswerOptionView } from "@/lib/ranked-core/viewTypes";

export const REVEAL_EMPTY_VALUE = "—";

/**
 * The graded reveal this module consumes. Structurally the subset of PPQ2-B's
 * `ProPlayRevealData` (`projection.reveal`) it reads, so that object is passed
 * as is; declared here because `lib/pro-play/arena` is not on this branch.
 */
export interface ProPlayRevealInput {
  isCorrect: boolean;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  /** The server's explanation, verbatim. */
  explanation: string;
  /** Structured evidence (Step 1), or null on an older backend. */
  evidence: ProPlayEvidence | null;
}

/** One option at reveal, in server option order. */
export interface RevealCandidate {
  optionId: string;
  index: number;
  letter: string;
  label: string;
  /** The server's correct option (`correctOptionId`). */
  correct: boolean;
  /** The option the player chose. */
  picked: boolean;
  /**
   * The server's statistic for this option, or null when the evidence does
   * not name it exactly once. `display` is verbatim (`—` when the server sent
   * none); `support` is the metric-aware sample line, or null.
   */
  value: { display: string; support: string | null } | null;
}

/** How much of the question the evidence covers. */
export type RevealEvidenceState = "complete" | "partial" | "absent";

export interface RevealAuthority {
  /** The question's single revision, when the server sent one. */
  revision: number | null;
  /** Per-option revisions, in server option order, only for named options. */
  revisions: { label: string; revision: number }[];
  metricDefinitionVersion: string | null;
  policyVersion: string | null;
}

export interface ProPlayRevealModel {
  isCorrect: boolean;
  candidates: RevealCandidate[];
  evidenceState: RevealEvidenceState;
  /** The server's form ("pairwise" | "ranking"), never inferred. */
  form: string | null;
  metric: ProPlayMetricTag | null;
  scopeLabel: string | null;
  /** The explanation for primary copy: the server's, minus the provenance tail. */
  explanation: string | null;
  /** The server's explanation exactly as sent (kept for the disclosure). */
  explanationVerbatim: string | null;
  /** The provenance tail removed from the primary copy, e.g. "authority revision 2 / 1". */
  provenanceNote: string | null;
  authority: RevealAuthority | null;
}

// ─── The legacy support line, verbatim ────────────────────────────────────

/**
 * The supporting line under a subject's headline value — the sample the
 * number stands on. COPIED VERBATIM from `ProPlayEvidence.tsx`'s private
 * `supportLine` (PPQ1 §G: "extracted verbatim"). Metric-aware so it never
 * repeats the headline, and built only from fields that are present.
 * `ProPlayReveal.test.tsx` checks it against the original's rendered output
 * for every fixture; integration may replace it with an export of the
 * original.
 */
export function revealSupportLine(
  subject: ProPlayEvidenceSubject,
  metricId: string | undefined,
): string | null {
  const parts: string[] = [];
  const games = subject.games;
  const wins = subject.wins;

  if (metricId === "wins") {
    if (typeof games === "number") parts.push(`of ${games} games`);
  } else if (metricId === "games_played") {
    if (typeof wins === "number") parts.push(`${wins} won`);
  } else if (metricId === "picks" || metricId === "bans") {
    if (typeof subject.scope_games === "number") {
      parts.push(`of ${subject.scope_games} scope games`);
    }
  } else if (metricId === "presence") {
    if (typeof subject.picks === "number") parts.push(`${subject.picks} picks`);
    if (typeof subject.bans === "number") parts.push(`${subject.bans} bans`);
  } else if (metricId === "champion_share") {
    if (typeof games === "number" && typeof subject.total_games_in_scope === "number") {
      parts.push(`${games} of ${subject.total_games_in_scope} games`);
    }
  } else {
    if (typeof games === "number") {
      parts.push(`${games} game${games === 1 ? "" : "s"}`);
    }
    if (typeof wins === "number") {
      parts.push(
        typeof subject.losses === "number"
          ? `${wins}W–${subject.losses}L`
          : `${wins}W`,
      );
    }
  }
  return parts.length ? parts.join(" · ") : null;
}

// ─── Explanation copy ─────────────────────────────────────────────────────

/**
 * The backend appends internal provenance to player-facing explanations —
 * "…, in LPL (authority revision 2 / 1)." (PPQ1 §1, open owner question Q4).
 * Requirement: provenance belongs in the disclosure, not the primary copy.
 * Only that exact trailing parenthetical is lifted out; every other character
 * of the server's sentence is kept, and the full sentence stays available.
 */
const AUTHORITY_TAIL = /\s*\((authority revisions?\b[^()]*)\)(\.?)\s*$/i;

export function splitExplanation(raw: string | null | undefined): {
  primary: string | null;
  provenance: string | null;
} {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return { primary: null, provenance: null };
  const m = AUTHORITY_TAIL.exec(text);
  if (!m) return { primary: text, provenance: null };
  const primary = `${text.slice(0, m.index).trimEnd()}${m[2] ?? ""}`.trim();
  return { primary: primary || null, provenance: m[1].trim() };
}

// ─── The model ────────────────────────────────────────────────────────────

const letterFor = (index: number) => String.fromCharCode(65 + index);

function authorityOf(evidence: ProPlayEvidence | null, labels: string[]): RevealAuthority | null {
  const a = evidence?.authority;
  if (!a) return null;
  const map = a.revisions && typeof a.revisions === "object" ? a.revisions : {};
  const revisions = labels
    .filter((label) => typeof map[label] === "number")
    .map((label) => ({ label, revision: map[label] as number }));
  const revision = typeof a.revision === "number" ? a.revision : null;
  const metricDefinitionVersion = a.metric_definition_version?.trim() || null;
  const policyVersion = a.policy_version?.trim() || null;
  if (revision === null && !revisions.length && !metricDefinitionVersion && !policyVersion) return null;
  return { revision, revisions, metricDefinitionVersion, policyVersion };
}

/**
 * The reveal for one graded question, or null before a grade exists.
 *
 * `options` are the question's options in server order (`id`, `index`,
 * `label`), exactly as the canonical grid receives them.
 */
export function buildProPlayRevealModel(
  options: ReadonlyArray<AnswerOptionView>,
  reveal: ProPlayRevealInput | null | undefined,
): ProPlayRevealModel | null {
  if (!reveal || typeof reveal.isCorrect !== "boolean") return null;
  const evidence = reveal.evidence && Array.isArray(reveal.evidence.subjects) ? reveal.evidence : null;
  const subjects = evidence?.subjects ?? [];
  const metricId = evidence?.metric?.id || undefined;

  const candidates: RevealCandidate[] = options.map((option, i) => {
    // Exact label join, and only when the evidence names the option ONCE:
    // a duplicate is ambiguous, and an ambiguous number is not shown.
    const matches = subjects.filter((s) => s && s.label === option.label);
    const subject = matches.length === 1 ? matches[0] : null;
    return {
      optionId: option.id,
      index: i,
      letter: letterFor(i),
      label: option.label,
      correct: reveal.correctOptionId !== null && option.id === reveal.correctOptionId,
      picked: reveal.selectedOptionId !== null && option.id === reveal.selectedOptionId,
      value: subject
        ? {
          display: typeof subject.display === "string" && subject.display.trim()
            ? subject.display
            : REVEAL_EMPTY_VALUE,
          support: revealSupportLine(subject, metricId),
        }
        : null,
    };
  });

  const named = candidates.filter((c) => c.value !== null).length;
  const evidenceState: RevealEvidenceState = named === 0
    ? "absent"
    : named === candidates.length ? "complete" : "partial";
  const { primary, provenance } = splitExplanation(reveal.explanation);

  return {
    isCorrect: reveal.isCorrect,
    candidates,
    evidenceState,
    form: evidence?.form ?? null,
    metric: evidence?.metric?.label ? evidence.metric : null,
    scopeLabel: evidence?.scope_label?.trim() || null,
    explanation: primary,
    explanationVerbatim: typeof reveal.explanation === "string" && reveal.explanation.trim()
      ? reveal.explanation
      : null,
    provenanceNote: provenance,
    authority: authorityOf(evidence, options.map((o) => o.label)),
  };
}

/** One sentence a screen reader hears for the verdict. Server facts only. */
export function verdictSentence(model: ProPlayRevealModel): string {
  const correct = model.candidates.find((c) => c.correct) ?? null;
  const picked = model.candidates.find((c) => c.picked) ?? null;
  const answer = correct ? `The answer is ${correct.letter}, ${correct.label}.` : "";
  if (model.isCorrect) return `Correct. ${answer}`.trim();
  const pick = picked ? `You picked ${picked.letter}, ${picked.label}.` : "";
  return ["Incorrect.", pick, answer].filter(Boolean).join(" ");
}
