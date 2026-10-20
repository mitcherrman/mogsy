/**
 * MALT B1 — one question, reviewed, inside a popover on the match record.
 *
 * A small page torn from the same book: the ledger's vellum, its ink, and the
 * same restrained jade/rubric the rows already mark outcomes with. Not a
 * browser tooltip, not a modal, not a cyan SaaS panel.
 *
 * A QUICK INSPECTOR, NOT A REPORT
 * ───────────────────────────────
 * The reader is stepping along a timeline. What they want per question is:
 * where am I, what was asked, what did I pick, what was right, and why — in
 * that order, in one glance, without scrolling. So the card is wide and short
 * rather than narrow and tall, and everything that is not one of those five
 * things has been cut.
 *
 * THE ANSWER HIERARCHY (Match History V2)
 * ──────────────────────────────────────
 * Top to bottom, in the order a reader's eye needs them:
 *   1. the heading line — position, proven subject mark, subject, verdict word;
 *   2. the question;
 *   3. the ANSWER PAIR — mine beside right, each stated once, as a figure;
 *   4. the CHOICES — the frozen options, kept, as a quiet reference strip
 *      (chips for short figures, rows for sentences) that marks the same two
 *      choices among their neighbours rather than repeating them in words;
 *   5. why — working first, then the explanation.
 * A pick on a round that never resolved is "pending", not graded: green and
 * red are only ever printed against an answer the backend revealed.
 *
 * WHAT IS DELIBERATELY NOT SHOWN
 * ──────────────────────────────
 * The frozen explanation is the candidate pipeline's own review material, and
 * some of it is addressed to the pipeline rather than to a player:
 * `formula_id` names an internal generator formula, `rounding_rule` is a
 * policy string for a reviewer. Printing them made a study card look like a
 * stack trace, so they are dropped HERE rather than removed from the payload
 * — the backend record stays complete, and a future moderator surface can
 * still read them.
 *
 * `distractor_derivations` is likewise not dumped as a table: only the row
 * matching the reader's OWN wrong answer is shown, attached to that answer,
 * because the other three explain mistakes they did not make.
 *
 * REVIEW, NEVER REPLAY
 * ────────────────────
 * Nothing here is answerable. The options are printed as a list with the
 * reader's pick and the right one marked; there is no button, no radio, no
 * form control, and no path back into a match that is already over.
 *
 * A ROUND THAT NEVER RESOLVED SAYS SO
 * ───────────────────────────────────
 * A forfeited match can end mid-round. The backend withholds that round's
 * answer (the question bank is shared and the reader can be asked it again),
 * so this prints the question and states plainly that it was never played
 * out — rather than rendering an empty "Correct answer" with a dash, which
 * reads as missing data instead of as a decision.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronRight, Minus, X, Zap } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import {
  prettyCategory,
  questionOutcome,
  resolveQuestionIcon,
  type QuestionOutcome,
} from "@/components/quiz/workspace/questionIcons";
import ModuleSigil, { hasModuleSigil } from "@/components/quiz/workspace/ModuleSigil";
import {
  MasteryQuestionNavigator, type MasteryNavStatus,
} from "@/components/quiz/workspace/MasteryQuestionNavigator";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import { useQuestionOwnership } from "@/components/quiz/workspace/ownedQuestionIndex";
import type {
  MasterySliceChallengeView, ReviewChallenge, ReviewMasteryChallenge, ReviewRound,
} from "@/lib/ranked-public/contracts";
import { QuestionRoleEmblems } from "@/components/ranked-arena/RoleEmblem";
import { JourneyCombatWorking } from "@/components/journey/JourneyCombatWorking";
import { combatPremiseOf, combatQuestionSentence } from "@/components/journey/JourneyCombatQuestion";
import { withUnitLabel } from "@/features/mastery/contracts/comparisonValues";
import {
  masteryChallengeRolesDiffer, reviewRoundRoles,
} from "@/lib/ranked-public/reviewRoles";
import { META_REFLEX_LABEL } from "@/lib/ranked-core/modules/metaReflexLabel";
import {
  contextFor as assemblyContextFor, noteFor as assemblyNoteFor,
} from "@/lib/ranked-core/modules/assemblyAdapter";

/** The marks, printed rather than lit — the row's own palette. `pending` is a
 *  pick nobody judged (a sealed round): committed, but neither jade nor red. */
const TONE = {
  correct: { ink: "#1f5c3c", edge: "rgba(31,92,60,0.45)", fill: "rgba(31,92,60,0.09)" },
  incorrect: { ink: LEAGUECRAFT_INK.rubric, edge: "rgba(122,40,32,0.45)", fill: "rgba(122,40,32,0.08)" },
  partial: { ink: "#6b4a0c", edge: "rgba(107,74,12,0.45)", fill: "rgba(107,74,12,0.09)" },
  pending: { ink: LEAGUECRAFT_INK.strong, edge: "rgba(96,68,28,0.5)", fill: "rgba(112,82,36,0.12)" },
  idle: { ink: LEAGUECRAFT_INK.body, edge: "rgba(96,68,28,0.22)", fill: "transparent" },
} as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[9px] font-bold uppercase tracking-[0.18em]"
      style={{ color: LEAGUECRAFT_INK.brass }}
    >
      {children}
    </div>
  );
}

/**
 * A worked step, made readable.
 *
 * The shipped shape is `{step, running_total}` with `{step, value}` on the
 * closing line; other families have emitted plain strings. Both render as
 * "what was done" on the left and "where that leaves you" on the right, which
 * is how a worked total is actually read.
 *
 * An unrecognised object prints its VALUES only, never its keys: a key is an
 * internal field name, and this card does not show the reader field names.
 */
function stepText(v: unknown): { text: string; figure: string | null } {
  if (v === null || v === undefined) return { text: "", figure: null };
  if (typeof v !== "object") return { text: String(v), figure: null };
  const o = v as Record<string, unknown>;
  const rawFigure = o.running_total ?? o.value;
  const figure =
    typeof rawFigure === "number" || typeof rawFigure === "string" ? String(rawFigure) : null;
  if (typeof o.step === "string") return { text: o.step, figure };
  const words = Object.values(o).filter((x) => typeof x === "string") as string[];
  return { text: words.join(" — "), figure };
}

function Working({ steps }: { steps: unknown[] }) {
  const rows = steps.map(stepText).filter((r) => r.text || r.figure !== null);
  if (rows.length === 0) return null;
  // The last row is the worked total ("total gold spent 2400"): it is the
  // result of the rows above it, so it is ruled off and set a shade heavier.
  const last = rows.length - 1;
  const closing = (i: number) => i === last && rows.length > 1;
  return (
    <div className="space-y-0.5" data-testid="review-working">
      <SectionLabel>Working</SectionLabel>
      <ol
        className="rounded border px-2 py-1 text-[11.5px] leading-snug"
        style={{ color: LEAGUECRAFT_INK.body, borderColor: TONE.idle.edge, background: LEAGUECRAFT_INK.inset }}
      >
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2 py-px"
            style={closing(i)
              ? { borderTop: `1px solid ${TONE.idle.edge}`, marginTop: 2, paddingTop: 3 }
              : undefined}
          >
            <span
              className={`min-w-0 flex-1 break-words ${closing(i) ? "font-semibold" : ""}`}
              style={closing(i) ? { color: LEAGUECRAFT_INK.strong } : undefined}
            >
              {r.text}
            </span>
            {r.figure !== null && (
              <span
                className="shrink-0 tabular-nums font-semibold"
                style={{ color: LEAGUECRAFT_INK.strong }}
              >
                {r.figure}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Why the reader's OWN wrong option was wrong, as a sentence, or `null`.
 *
 * `distractor_derivations` ships as a LIST of `{value, derivation}` matched on
 * the option's own text; a keyed object is accepted too, because an older or
 * hand-authored candidate can carry one and a review card is not the place to
 * be strict about a field that only ever adds context.
 */
function ownDerivationFor(
  explanation: Record<string, unknown>, chosenOption: string | undefined,
): string | null {
  if (chosenOption === undefined) return null;
  const raw = explanation.distractor_derivations;
  let hit: unknown;
  if (Array.isArray(raw)) {
    const row = raw.find(
      (r) => r && typeof r === "object" &&
        String((r as Record<string, unknown>).value) === chosenOption,
    ) as Record<string, unknown> | undefined;
    hit = row?.derivation;
  } else if (raw && typeof raw === "object") {
    hit = (raw as Record<string, unknown>)[chosenOption];
  }
  return typeof hit === "string" && hit.trim() ? hit.trim() : null;
}

type AnswerState = "right" | "wrong" | "pending" | "none";

/**
 * One side of the answer pair: a labelled figure the eye can land on.
 *
 * The VALUE is the largest thing in the card after the question, because
 * "what did I pick, what was right" is why the reader opened it. The mark is
 * an icon plus the tile's own label — colour is never the only signal — and
 * a screen reader also gets the verdict as a word.
 */
function AnswerTile({
  label, value, state, note, testId, spoken,
}: {
  label: string;
  value: string;
  state: AnswerState;
  note?: string | null;
  testId: string;
  /** The verdict a screen reader hears after the value; omitted when the
   *  label already says it. */
  spoken?: string;
}) {
  const tone = state === "right" ? TONE.correct
    : state === "wrong" ? TONE.incorrect
      : state === "pending" ? TONE.pending : TONE.idle;
  const Icon = state === "right" ? Check : state === "wrong" ? X : Minus;
  return (
    <div
      className="min-w-0 rounded border px-2 py-1"
      style={{ borderColor: tone.edge, background: tone.fill }}
      data-testid={testId}
      data-answer-state={state}
    >
      <div
        className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.14em]"
        style={{ color: LEAGUECRAFT_INK.brass }}
      >
        <Icon className="h-3 w-3 shrink-0" style={{ color: tone.ink }} aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div
        className="break-words text-[13px] font-semibold leading-snug"
        style={{ color: state === "none" ? LEAGUECRAFT_INK.faint : tone.ink }}
      >
        {value}
        {spoken && <span className="sr-only">{`, ${spoken}`}</span>}
      </div>
      {note && (
        <div className="mt-0.5 break-words text-[10.5px] leading-snug" style={{ color: LEAGUECRAFT_INK.faint }}>
          {note}
        </div>
      )}
    </div>
  );
}

/**
 * The answer pair — YOURS beside RIGHT — in place of two stacked label rows.
 *
 * Side by side so the contrast ("57" against "50") is one glance, and wrapping
 * to a single column only when the container cannot give each tile ~9.5rem
 * (a 320px sheet), never by viewport width. A round that never resolved has no
 * canonical answer to print; it says so in the second slot instead of showing
 * an empty tile that reads as missing data.
 */
function AnswerPair({
  mine, mineTestId, mineNote, mineState, right, rightTestId, unresolvedTestId,
}: {
  mine: string;
  mineTestId: string;
  mineNote?: string | null;
  mineState: AnswerState;
  /** `null` when the round is sealed. */
  right: string | null;
  rightTestId: string;
  unresolvedTestId: string;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(9.5rem,100%),1fr))] gap-1.5">
      <AnswerTile
        testId={mineTestId} label="Your answer" value={mine} state={mineState} note={mineNote}
        spoken={mineState === "right" ? "correct" : mineState === "wrong" ? "incorrect" : undefined}
      />
      {right !== null ? (
        <AnswerTile testId={rightTestId} label="Correct answer" value={right} state="right" />
      ) : (
        <p
          className="min-w-0 rounded border border-dashed px-2 py-1 text-[11px] leading-snug"
          data-testid={unresolvedTestId}
          style={{ color: LEAGUECRAFT_INK.faint, borderColor: TONE.idle.edge }}
        >
          This round was never played out, so its answer stays sealed.
        </p>
      )}
    </div>
  );
}

interface ChoiceView {
  text: string;
  state: "correct" | "chosen" | "idle";
  /** A pick on a round that never resolved: the reader's, but not judged. */
  pending?: boolean;
  /** The reader's pick — "yours" is said even when it was the right one. */
  yours: boolean;
}

/**
 * The frozen options, kept — they are the distractors the reader weighed —
 * but demoted to a reference strip under the answer pair.
 *
 * Short options (item costs, levels, stat values) sit in a wrapping grid so
 * four of them are one line, not four rows. Anything longer than a figure or a
 * short name keeps a row each, because a wrapped sentence in a narrow chip is
 * harder to read than a tall list. Each option carries its own icon and, for
 * the reader's pick, the word "yours"; list semantics, `data-review-option`
 * and `data-option-state` are unchanged.
 */
function Choices({ choices, testId }: { choices: ChoiceView[]; testId?: string }) {
  if (choices.length === 0) return null;
  const compact = choices.every((c) => c.text.length <= 14);
  return (
    <div className="space-y-0.5">
      <SectionLabel>Choices</SectionLabel>
      <ul
        className={compact
          ? "grid grid-cols-[repeat(auto-fill,minmax(min(5.25rem,100%),1fr))] gap-1"
          : "space-y-1"}
        data-testid={testId}
        data-layout={compact ? "chips" : "rows"}
      >
        {choices.map((c, i) => {
          const tone = c.state === "correct" ? TONE.correct
            : c.state === "chosen" ? (c.pending ? TONE.pending : TONE.incorrect) : TONE.idle;
          const Icon = c.state === "correct" ? Check : c.state === "chosen" && !c.pending ? X : Minus;
          return (
            <li
              key={i}
              data-review-option={i}
              data-option-state={c.state}
              className="flex min-w-0 items-start gap-1 rounded border px-1.5 py-0.5 text-[11.5px] leading-snug"
              style={{ borderColor: tone.edge, background: tone.fill, color: tone.ink }}
            >
              <Icon className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">{c.text}</span>
              {c.yours && (
                <span className="shrink-0 self-center text-[8.5px] font-bold uppercase tracking-[0.14em] opacity-80">
                  yours
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuizBody({ round }: { round: ReviewRound }) {
  const q = round.question;
  if (!q) return null;
  const chosen = round.viewerSubmission.answerIndex;
  const correct = q.correctOptionIndex;
  const expl = q.explanation ?? {};
  // A pick can only be judged against an answer the round actually resolved.
  const judged = round.revealed && correct !== null;
  const ownDerivation =
    chosen !== null && chosen !== correct ? ownDerivationFor(expl, q.options[chosen]) : null;
  const note = typeof expl.scenario_note === "string" ? expl.scenario_note.trim() : "";
  const steps = Array.isArray(expl.calculation_steps) ? expl.calculation_steps : null;
  const picked = chosen !== null && q.options[chosen] !== undefined;

  return (
    <>
      <p className="break-words text-[12.5px] leading-relaxed" style={{ color: LEAGUECRAFT_INK.strong }}>
        {q.prompt}
      </p>

      {/* What I picked against what was right, stated once and large. The
          option strip below marks the same two choices among their
          neighbours; it does not repeat them in words. */}
      <AnswerPair
        mineTestId="review-your-answer"
        mine={picked ? q.options[chosen!] : "Not answered"}
        mineState={!picked ? "none" : !judged ? "pending" : chosen === correct ? "right" : "wrong"}
        mineNote={ownDerivation}
        right={judged && q.options[correct!] !== undefined ? q.options[correct!] : null}
        rightTestId="review-correct-answer"
        unresolvedTestId="review-unresolved"
      />

      <Choices
        testId="review-options"
        choices={q.options.map((opt, i) => {
          const isCorrect = correct !== null && i === correct;
          const isChosen = chosen === i;
          return {
            text: opt,
            state: isCorrect ? "correct" : isChosen ? "chosen" : "idle",
            pending: isChosen && !isCorrect && !judged,
            yours: isChosen,
          };
        })}
      />

      {note && (
        <div className="space-y-0.5" data-testid="review-explanation">
          <SectionLabel>Explanation</SectionLabel>
          <p className="break-words text-[11.5px] leading-relaxed" style={{ color: LEAGUECRAFT_INK.body }}>
            {note}
          </p>
        </div>
      )}

      {steps && <Working steps={steps} />}
    </>
  );
}

function CardSide({
  card, side, revealed,
}: { card: ReviewChallenge; side: "left" | "right"; revealed: boolean }) {
  const data = card[side];
  const isCorrect = card.correctSide === side;
  const isChosen = card.viewerSide === side;
  const tone = isCorrect ? TONE.correct : isChosen ? TONE.incorrect : TONE.idle;
  const src = data.icon ? resolveQuizAssetUrl(data.icon) : undefined;
  const Icon = isCorrect ? Check : isChosen ? X : null;
  return (
    <div
      data-review-card-side={side}
      data-side-state={isCorrect ? "correct" : isChosen ? "chosen" : "idle"}
      className="flex min-w-0 flex-1 items-center gap-1.5 rounded border px-1.5 py-1"
      style={{ borderColor: tone.edge, background: tone.fill }}
    >
      {src && (
        <img src={src} alt="" aria-hidden="true" className="h-6 w-6 shrink-0 rounded-sm" loading="lazy" />
      )}
      <div className="min-w-0 flex-1">
        {/* Two lines before it clips: a long item name should not be cut to
            "Abyssal Ma…" in the one place the reader is told what it was. */}
        <div className="line-clamp-2 break-words text-[11.5px] font-medium leading-snug" style={{ color: tone.ink }}>
          {/* Reveal-only: a recognition card's label IS its answer, so an
              unresolved block has none to print. */}
          {data.label ?? (revealed ? "—" : "sealed")}
        </div>
        {data.value !== null && (
          <div className="text-[10px] tabular-nums" style={{ color: LEAGUECRAFT_INK.faint }}>
            {data.value}
          </div>
        )}
      </div>
      {/* The pick and the answer are marked by shape as well as by tint. */}
      {Icon && (
        <Icon
          className="h-3 w-3 shrink-0"
          style={{ color: tone.ink }}
          aria-label={isCorrect ? (isChosen ? "Your pick, correct" : "Correct card") : "Your pick"}
        />
      )}
    </div>
  );
}

/**
 * One `mastery_slice` segment, reviewed.
 *
 * The SAME five things every other review body states — where am I, what was
 * asked, what did I pick, what was right, and why — repeated once per
 * challenge, because a slice is several questions answered in one segment
 * rather than one question or a block of recognition cards.
 *
 * It reuses this file's existing option list, tones and `AnswerLine` rather
 * than introducing a Mastery look inside the ledger, and it reads ONLY the
 * frozen round: nothing here re-resolves a Mastery set, so a later change to
 * generation policy, serving policy or canonical data cannot rewrite what a
 * played match shows.
 *
 * Generic over the challenge contract — there is no champion, item or damage
 * type in it, and it prints whatever the frozen challenges hold.
 */
/**
 * DD1 — a comparison row's two served values, one line ("Leona 90 seconds ·
 * Pantheon 180 seconds"). Only from the reveal-gated `comparison_values`
 * block, printed verbatim; a row without it (every match frozen before the
 * block existed) shows nothing here and keeps its explanation.
 */
function comparisonValuesLine(challenge: ReviewMasteryChallenge): string | null {
  const cv = challenge.comparisonValues;
  if (!cv) return null;
  const cs = challenge.comparisonSemantics;
  const [a, b] = challenge.answerOptions;
  const labelOf = (token: string): string => {
    const name = token === a ? cs?.champion_a_display : token === b ? cs?.champion_b_display : null;
    return typeof name === "string" && name ? name : token;
  };
  return cv.sides.map((side) => `${labelOf(side.token)} ${withUnitLabel(side.display, cv)}`).join(" · ");
}

/** One dot per answered challenge — jade right, rubric wrong, hollow unanswered. */
function Pips({ results }: { results: (boolean | null)[] }) {
  return (
    <span className="inline-flex items-center gap-[3px] align-middle" aria-hidden="true" data-testid="review-pips">
      {results.map((ok, i) => (
        <span
          key={i}
          className="inline-block h-[7px] w-[7px] rounded-full border"
          style={ok === null
            ? { borderColor: TONE.idle.edge }
            : { borderColor: ok ? TONE.correct.ink : TONE.incorrect.ink, background: ok ? TONE.correct.ink : TONE.incorrect.ink }}
        />
      ))}
    </span>
  );
}

/**
 * The reader's own answer: green or red only when the round resolved and
 * graded it. A pick on a sealed round is committed but unjudged.
 */
function masteryState(
  chosen: string | number | boolean | null, isCorrect: boolean | null, judged: boolean,
): AnswerState {
  if (chosen === null) return "none";
  if (!judged || isCorrect === null) return "pending";
  return isCorrect ? "right" : "wrong";
}

/**
 * The backend's own margin for a comparison row ("90 seconds"), verbatim with
 * its unit. Only from the reveal-gated `comparison_values` block; nothing is
 * subtracted, compared or inferred here, and `operator` (which direction wins)
 * is informational on the wire and not printed.
 */
function comparisonMarginLine(challenge: ReviewMasteryChallenge): string | null {
  const cv = challenge.comparisonValues;
  return cv?.deltaDisplay ? withUnitLabel(cv.deltaDisplay, cv) : null;
}

/**
 * A Journey Combat challenge's question, phrased from its SERVED premise.
 *
 * The frozen `prompt` of these rows is the backend's serialized state ("…ability
 * physical damage after armor @ Leona target, 3 target level, none target
 * items…"). The structured `prompt_semantics` beside it names the same
 * question, and the Journey already phrases it ("How much physical damage does
 * Pantheon's Rank 1 Aegis Assault deal to Leona?") — this reuses that helper
 * verbatim. Null for every other family, and for a premise too thin to name
 * its attacker and ability: those keep the recorded prompt, never a guess.
 */
function combatQuestion(challenge: ReviewMasteryChallenge): string | null {
  const premise = combatPremiseOf(
    { promptSemantics: challenge.promptSemantics } as MasterySliceChallengeView,
  );
  if (!premise || !premise.champion || !(premise.ability || premise.slot)) return null;
  return combatQuestionSentence(premise);
}

/**
 * A native disclosure for recorded text that is kept but not led with. A
 * `<summary>` is focusable and keyboard-operable, and is not an answer control.
 */
function Fold({ label, testId, children }: { label: string; testId?: string; children: React.ReactNode }) {
  return (
    <details className="group" data-testid={testId}>
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm text-[9px] font-bold uppercase tracking-[0.18em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
        style={{ color: LEAGUECRAFT_INK.brass, outlineColor: LEAGUECRAFT_INK.accent }}
      >
        <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden="true" />
        {label}
      </summary>
      <p className="mt-0.5 break-words text-[11px] leading-relaxed" style={{ color: LEAGUECRAFT_INK.body }}>
        {children}
      </p>
    </details>
  );
}

/** The scrollable ancestor of `el`, if any (the Popover or the Sheet body). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

/**
 * What a selector tab may say about one challenge. Derived from the same
 * reveal-gated facts the card prints, so a sealed round yields `sealed` for
 * every challenge (no word, no tint, no glyph) and nothing about correctness
 * can reach the selector's styling, data attributes or accessible names.
 */
function masteryNavStatus(round: ReviewRound, challenge: ReviewMasteryChallenge): MasteryNavStatus {
  const judged = round.revealed && challenge.correctAnswer !== null;
  if (!judged) return "sealed";
  if (challenge.viewerAnswer === null) return "unanswered";
  if (challenge.isCorrect === true) return "correct";
  if (challenge.isCorrect === false) return "incorrect";
  return "sealed";
}

/**
 * ONE frozen challenge, reviewed: the question, then the answer pair, the
 * choices, and why. Everything is read from the frozen record exactly as
 * before the selector existed; only how many are on screen at once changed.
 */
function MasteryChallenge({
  round, challenge, perChallengeRoles,
}: { round: ReviewRound; challenge: ReviewMasteryChallenge; perChallengeRoles: boolean }) {
  const chosen = challenge.viewerAnswer;
  const correct = challenge.correctAnswer;
  const judged = round.revealed && correct !== null;
  const values = round.revealed ? comparisonValuesLine(challenge) : null;
  const working = round.revealed ? challenge.combatWorking : null;
  const semanticQuestion = combatQuestion(challenge);
  const margin = round.revealed ? comparisonMarginLine(challenge) : null;
  return (
    <li
      className="space-y-2"
      data-review-mastery-challenge={challenge.challengeIndex}
    >
      <p
        className="break-words text-[14px] font-medium leading-relaxed"
        style={{ color: LEAGUECRAFT_INK.strong }}
      >
        {perChallengeRoles && (
          <QuestionRoleEmblems roles={challenge.roles} size="sm" backed
            className="mr-1.5 align-[-2px]"
            testId={`review-mastery-roles-${challenge.challengeIndex}`} />
        )}
        {semanticQuestion ?? challenge.prompt}
      </p>
      {/* The serialized wording the match was frozen with stays, one
          tap away, whenever the question above was phrased from the
          served premise instead. */}
      {semanticQuestion && (
        <Fold label="Recorded question" testId={`review-mastery-recorded-${challenge.challengeIndex}`}>
          {challenge.prompt}
        </Fold>
      )}

      <AnswerPair
        mineTestId={`review-mastery-your-answer-${challenge.challengeIndex}`}
        mine={chosen === null ? "Not answered" : String(chosen)}
        mineState={masteryState(chosen, challenge.isCorrect, judged)}
        right={judged ? String(correct) : null}
        rightTestId={`review-mastery-correct-answer-${challenge.challengeIndex}`}
        unresolvedTestId={`review-mastery-unresolved-${challenge.challengeIndex}`}
      />

      <Choices
        testId={`review-mastery-options-${challenge.challengeIndex}`}
        choices={challenge.answerOptions.map((opt) => {
          const isCorrect = judged && String(correct) === opt;
          const isChosen = chosen !== null && String(chosen) === opt;
          return {
            text: opt,
            state: isCorrect ? "correct" : isChosen ? "chosen" : "idle",
            pending: isChosen && !isCorrect && !judged,
            yours: isChosen,
          };
        })}
      />

      {values && (
        <div
          className="space-y-0.5"
          data-testid={`review-mastery-values-${challenge.challengeIndex}`}
        >
          <SectionLabel>Values</SectionLabel>
          <p className="break-words text-[11.5px] tabular-nums" style={{ color: LEAGUECRAFT_INK.body }}>
            {values}
          </p>
          {margin && (
            <p
              className="break-words text-[11px] tabular-nums"
              style={{ color: LEAGUECRAFT_INK.faint }}
              data-testid={`review-mastery-margin-${challenge.challengeIndex}`}
            >
              Margin {margin}
            </p>
          )}
        </div>
      )}

      {/* JOURNEY5 — a Journey Combat child's served working, verbatim,
          above the prose (kept, as on the live reveal). Laid out in
          the Journey reveal's own three-line `rows` form inside an
          inset, so the chain of reasoning reads as lines of a sum
          rather than one run-on sentence. */}
      {working && (
        <div
          className="space-y-0.5"
          data-testid={`review-mastery-working-${challenge.challengeIndex}`}
          style={{ color: LEAGUECRAFT_INK.body }}
        >
          <SectionLabel>Working</SectionLabel>
          <div
            className="rounded border px-2.5 py-1.5 text-[12px] leading-snug"
            style={{ borderColor: TONE.idle.edge, background: LEAGUECRAFT_INK.inset }}
          >
            <JourneyCombatWorking working={working} rows className="gap-y-0.5" />
          </div>
        </div>
      )}

      {challenge.explanation && (
        <div
          className="space-y-0.5"
          data-testid={`review-mastery-explanation-${challenge.challengeIndex}`}
        >
          {working ? (
            /* The served sentence restates the same inputs the working
               above already lays out ("…at Leona target, 4 target level,
               Cloth Armor target items…"). It stays — it is the frozen
               record — but folds away behind a native disclosure so the
               working leads. */
            <Fold label="Full explanation">{challenge.explanation}</Fold>
          ) : (
            <>
              <SectionLabel>Explanation</SectionLabel>
              <p
                className="break-words text-[12px] leading-relaxed"
                style={{ color: LEAGUECRAFT_INK.body }}
              >
                {challenge.explanation}
              </p>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * One `mastery_slice` segment, reviewed — ONE challenge at a time.
 *
 * A slice answers several questions in one segment, so the reader picks which
 * to read from a numbered selector (`MasteryQuestionNavigator`) rather than
 * scrolling through all of them. The selection is this body's own state and
 * the body is keyed by its round in the card, so both hosts (Popover and
 * Sheet) behave identically and opening another round always starts at the
 * first challenge. A slice with a single challenge shows no selector.
 *
 * Two small things keep the surface calm while the reader steps through:
 *  - the question area never SHRINKS below the tallest challenge seen so far
 *    (capped), so an anchored popover does not jump under the pointer; and
 *  - changing question returns an internally scrolled host to its top, where
 *    the selector is.
 */
function MasterySliceBody({ round }: { round: ReviewRound }) {
  const challenges = round.masteryChallenges ?? [];
  // RQ1: per-challenge emblems only when the challenges' frozen role sets
  // differ — when they agree, the card header already shows the one set.
  const perChallengeRoles = masteryChallengeRolesDiffer(round);
  const sub = round.viewerSubmission;
  const several = challenges.length > 1;
  const [pick, setPick] = useState(0);
  const selected = Math.min(pick, Math.max(0, challenges.length - 1));
  const challenge = challenges[selected] ?? null;
  const panelId = useId();
  const tabIdPrefix = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [floor, setFloor] = useState(0);

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const grow = () => setFloor((f) => Math.max(f, Math.ceil(el.getBoundingClientRect().height)));
    grow();
    const observer = new ResizeObserver(grow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [several]);

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    scrollParentOf(panelRef.current)?.scrollTo?.({ top: 0 });
  }, [selected]);

  return (
    <>
      {sub.correctCount !== null && sub.challengeCount !== null && (
        <p className="flex items-center gap-2 text-[12px]" style={{ color: LEAGUECRAFT_INK.body }}>
          <span>
            <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
              {sub.correctCount}
            </span>{" "}
            of{" "}
            <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
              {sub.challengeCount}
            </span>{" "}
            right.
          </span>
        </p>
      )}
      {several && (
        <MasteryQuestionNavigator
          statuses={challenges.map((c) => masteryNavStatus(round, c))}
          selected={selected}
          onSelect={setPick}
          panelId={panelId}
          tabIdPrefix={tabIdPrefix}
        />
      )}
      <div
        ref={panelRef}
        id={panelId}
        role={several ? "tabpanel" : undefined}
        aria-labelledby={several ? `${tabIdPrefix}-tab-${selected}` : undefined}
        className={several ? "border-t pt-2.5" : undefined}
        style={several
          ? { borderColor: TONE.idle.edge, minHeight: floor > 0 ? `min(${floor}px, 24rem, 45dvh)` : undefined }
          : undefined}
        data-testid="review-mastery-panel"
        data-selected-index={selected}
      >
        <ul data-testid="review-mastery-challenges">
          {challenge && (
            <MasteryChallenge
              key={challenge.challengeIndex}
              round={round}
              challenge={challenge}
              perChallengeRoles={perChallengeRoles}
            />
          )}
        </ul>
      </div>
    </>
  );
}

/**
 * One `order_forge` round, reviewed: the viewer's sequence beside the correct
 * one. Every fact (order, value, per-position mark) is the backend's; an
 * unrevealed round has no canonical order and shows only what was asked.
 */
function OrderForgeBody({ round }: { round: ReviewRound }) {
  const of = round.orderForge;
  if (!of) return null;
  const byId = new Map(of.entries.map((e) => [e.entryId, e]));
  const list = (ids: string[] | null, marks: boolean[], testId: string) => (
    <ol className="space-y-1" data-testid={testId}>
      {(ids ?? []).map((id, i) => {
        const e = byId.get(id);
        const mark = marks[i];
        const tone = mark === undefined ? TONE.idle : mark ? TONE.correct : TONE.incorrect;
        return (
          <li key={id} data-position={i + 1} data-mark={mark === undefined ? "none" : String(mark)}
            className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11.5px]"
            style={{ color: tone.ink, borderColor: tone.edge, background: tone.fill }}>
            <span className="w-4 shrink-0 text-center font-bold tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{e?.label ?? id}</span>
            {e?.valueDisplay && <span className="shrink-0 tabular-nums">{e.valueDisplay}</span>}
            {mark !== undefined && (
              mark
                ? <Check className="h-3 w-3 shrink-0" aria-label="In the right place" />
                : <X className="h-3 w-3 shrink-0" aria-label="In the wrong place" />
            )}
          </li>
        );
      })}
    </ol>
  );
  return (
    <div className="space-y-2" data-testid="review-order-forge">
      {of.viewerOrder === null && (
        <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          {of.outcome === "timeout" ? "You did not lock in an order." : "No order was locked in."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {of.viewerOrder !== null && (
          <div className="space-y-1">
            <SectionLabel>My order</SectionLabel>
            {list(of.viewerOrder, of.positionCorrect, "review-order-mine")}
          </div>
        )}
        {round.revealed && of.canonicalOrder !== null && (
          <div className="space-y-1">
            <SectionLabel>Correct order</SectionLabel>
            {list(of.canonicalOrder, [], "review-order-correct")}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One `reconstruct` round, reviewed: the viewer's build (one row per socket,
 * with the server's mark) beside the canonical recipe, each part with what it
 * is made of and the server's gold figures. Nothing is graded or summed here;
 * an unrevealed round shows only what was asked.
 */
/**
 * SCRUB-S2 — one reviewed Chronoscope round: the objective, the viewer's
 * checkpoint beside the first one, and the authority's before → after proof.
 * Every figure is the server's; the verdict is the backend's `outcome`.
 */
function ScrubBody({ round }: { round: ReviewRound }) {
  const sc = round.scrub;
  if (!sc) return null;
  const byToken = new Map(sc.checkpoints.map((c) => [c.token, c]));
  const name = (token: string | null) => {
    const cp = token ? byToken.get(token) : undefined;
    return cp ? `Wave ${cp.waveNumber} · ${cp.spawnTimeDisplay}` : token ?? "—";
  };
  const mine = sc.viewerCheckpoint ? byToken.get(sc.viewerCheckpoint) ?? null : null;
  const tone = sc.outcome === "correct" ? TONE.correct : sc.outcome === "incorrect" ? TONE.incorrect : TONE.idle;
  const reading = (r: NonNullable<typeof sc.proof>["after"] | null, label: string, testId: string) => r && (
    <li data-testid={testId} className="rounded border px-1.5 py-1 text-[11.5px]"
      style={{ color: TONE.idle.ink, borderColor: TONE.idle.edge, background: TONE.idle.fill }}>
      <span className="font-semibold">{label} · Wave {r.waveNumber} · {r.spawnTimeDisplay}</span>
      <span className="ml-1 tabular-nums">Level {r.level ?? "—"} · {r.cumulativeXp} XP</span>
    </li>
  );
  return (
    <div className="space-y-2" data-testid="review-scrub">
      <p className="text-[12px] font-semibold" style={{ color: LEAGUECRAFT_INK.body }}
        data-testid="review-scrub-objective">
        {sc.objective?.text ?? round.category ?? "Find the checkpoint"}
      </p>
      {sc.viewerCheckpoint === null ? (
        <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          {sc.outcome === "timeout" ? "You did not lock in a checkpoint." : "No checkpoint was locked in."}
        </p>
      ) : (
        <p data-testid="review-scrub-mine" data-mark={sc.outcome ?? "none"}
          className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11.5px]"
          style={{ color: tone.ink, borderColor: tone.edge, background: tone.fill }}>
          <span className="min-w-0 flex-1 font-semibold">My checkpoint · {name(sc.viewerCheckpoint)}</span>
          {mine && <span className="shrink-0 tabular-nums">Level {mine.level} · {mine.cumulativeXp} XP</span>}
          {sc.outcome === "correct" && <Check className="h-3 w-3 shrink-0" aria-label="The first checkpoint" />}
          {sc.outcome === "incorrect" && <X className="h-3 w-3 shrink-0" aria-label="Not the first checkpoint" />}
        </p>
      )}
      {round.revealed && sc.proof && (
        <div className="space-y-1">
          <SectionLabel>First checkpoint · {name(sc.canonicalCheckpoint)}</SectionLabel>
          <ul className="space-y-1" data-testid="review-scrub-proof">
            {reading(sc.proof.before, "Before", "review-scrub-before")}
            {reading(sc.proof.after, "First", "review-scrub-after")}
          </ul>
          {sc.proof.thresholdXp && (
            <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.body }} data-testid="review-scrub-threshold">
              Level {sc.proof.targetLevel} needs {sc.proof.thresholdXp} cumulative XP
              {sc.proof.cannonOnly ? " · cannon waves only" : ""}
            </p>
          )}
          <p className="text-[10.5px] opacity-75" style={{ color: LEAGUECRAFT_INK.body }}>
            Checkpoints are wave spawn times · levels at wave granularity
          </p>
        </div>
      )}
    </div>
  );
}

function ReconstructBody({ round }: { round: ReviewRound }) {
  const rc = round.reconstruct;
  if (!rc) return null;
  const byId = new Map(rc.pieces.map((p) => [p.pieceId, p]));
  const art = (src: string | null) => {
    const url = resolveQuizAssetUrl(src);
    return url
      ? <img src={url} alt="" aria-hidden className="h-4 w-4 shrink-0 rounded-sm" loading="lazy" />
      : <span aria-hidden className="h-4 w-4 shrink-0 rounded-sm bg-black/10" />;
  };
  return (
    <div className="space-y-2" data-testid="review-reconstruct">
      <p className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: LEAGUECRAFT_INK.body }}
        data-testid="review-reconstruct-target">
        {art(rc.target.media)}
        <span className="min-w-0 break-words">Rebuild {rc.target.label}</span>
      </p>
      {rc.viewerPlacement === null && (
        <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          {rc.outcome === "timeout" ? "You did not lock in a build." : "No build was locked in."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rc.viewerPlacement !== null && (
          <div className="space-y-1">
            <SectionLabel>My build</SectionLabel>
            <ul className="space-y-1" data-testid="review-reconstruct-mine">
              {rc.viewerPlacement.map((id, i) => {
                const mark = rc.slotCorrect[i];
                const tone = mark === undefined ? TONE.idle : mark ? TONE.correct : TONE.incorrect;
                return (
                  <li key={`${i}:${id}`} data-mark={mark === undefined ? "none" : String(mark)}
                    className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11.5px]"
                    style={{ color: tone.ink, borderColor: tone.edge, background: tone.fill }}>
                    {art(byId.get(id)?.media ?? null)}
                    <span className="min-w-0 flex-1 break-words font-semibold">{byId.get(id)?.label ?? id}</span>
                    {mark !== undefined && (
                      mark
                        ? <Check className="h-3 w-3 shrink-0" aria-label="A right part" />
                        : <X className="h-3 w-3 shrink-0" aria-label="Not in the recipe here" />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {round.revealed && rc.canonicalParts !== null && (
          <div className="space-y-1">
            <SectionLabel>Recipe</SectionLabel>
            <ul className="space-y-1" data-testid="review-reconstruct-recipe">
              {rc.canonicalParts.map((part) => (
                <li key={part.pieceId} className="space-y-0.5 rounded border px-1.5 py-1 text-[11.5px]"
                  style={{ color: TONE.idle.ink, borderColor: TONE.idle.edge, background: TONE.idle.fill }}>
                  <span className="flex items-center gap-1.5">
                    {art(byId.get(part.pieceId)?.media ?? null)}
                    <span className="min-w-0 flex-1 break-words font-semibold">
                      {part.label}{part.quantity > 1 ? ` ×${part.quantity}` : ""}
                    </span>
                    {part.valueDisplay && <span className="shrink-0 tabular-nums">{part.valueDisplay}</span>}
                  </span>
                  <span className="block pl-[22px] text-[10.5px] opacity-80" data-testid="review-reconstruct-subparts">
                    {part.subParts.length === 0 ? "Basic part"
                      : `= ${part.subParts.map((s) => (s.quantity > 1 ? `${s.label} ×${s.quantity}` : s.label)).join(" + ")}`}
                  </span>
                </li>
              ))}
            </ul>
            {rc.recipeTarget?.totalDisplay && (
              <p className="flex justify-between gap-2 text-[11px] font-semibold" style={{ color: LEAGUECRAFT_INK.body }}
                data-testid="review-reconstruct-total">
                <span>{rc.recipeTarget.combineDisplay ? `Parts + ${rc.recipeTarget.combineDisplay} to combine` : "Total"}</span>
                <span className="tabular-nums">{rc.recipeTarget.totalDisplay}</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MG-P3 — one `match` round, reviewed from the FROZEN review payload only: the
 * viewer's board (each rune with the seal it was locked under and the
 * server's mark) and, once revealed, the canonical seal and the server's own
 * facts. Nothing is graded or looked up here; an unrevealed round shows only
 * what was asked.
 */
function MatchBody({ round }: { round: ReviewRound }) {
  const m = round.match;
  if (!m) return null;
  const groupLabel = new Map(m.groups.map((g) => [g.groupId, g.label]));
  const mine = new Map((m.viewerAssignments ?? []).map((a) => [a.entityId, a.groupId]));
  const home = new Map((m.canonicalAssignments ?? []).map((a) => [a.entityId, a.groupId]));
  const total = m.entities.length;
  return (
    <div className="space-y-2" data-testid="review-match">
      {m.prompt && (
        <p className="text-[12px] font-semibold" style={{ color: LEAGUECRAFT_INK.body }}>{m.prompt}</p>
      )}
      {m.viewerAssignments === null && (
        <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          {m.outcome === "timeout" ? "You did not lock in a board." : "No board was locked in."}
        </p>
      )}
      {round.revealed && m.matched !== null && total > 0 && (
        <p className="text-[11px]" style={{ color: LEAGUECRAFT_INK.body }} data-testid="review-match-count">
          {m.matched} of {total} relationships correct
        </p>
      )}
      <ul className="space-y-1" data-testid="review-match-board">
        {m.entities.map((e) => {
          const mark = m.entityCorrect?.[e.entityId];
          const tone = mark === undefined ? TONE.idle : mark ? TONE.correct : TONE.incorrect;
          const fact = m.entityFacts?.[e.entityId];
          const placed = mine.get(e.entityId);
          const canonical = home.get(e.entityId);
          const url = resolveQuizAssetUrl(e.media?.src ?? null);
          return (
            <li key={e.entityId} data-testid="review-match-entity" data-entity={e.entityId}
              data-mark={mark === undefined ? "none" : String(mark)}
              className="space-y-0.5 rounded border px-1.5 py-1 text-[11.5px]"
              style={{ color: tone.ink, borderColor: tone.edge, background: tone.fill }}>
              <span className="flex items-center gap-1.5">
                {url
                  ? <img src={url} alt="" aria-hidden className="h-4 w-4 shrink-0 rounded-sm" loading="lazy" />
                  : <span aria-hidden className="h-4 w-4 shrink-0 rounded-sm bg-black/10" />}
                <span className="min-w-0 flex-1 break-words font-semibold">{e.label}</span>
                {mark !== undefined && (
                  mark
                    ? <Check className="h-3 w-3 shrink-0" aria-label="Seated correctly" />
                    : <X className="h-3 w-3 shrink-0" aria-label="Seated under another tree" />
                )}
              </span>
              <span className="block pl-[22px] text-[10.5px] opacity-80" data-testid="review-match-line">
                {placed !== undefined ? `You: ${groupLabel.get(placed) ?? placed}` : "Not seated"}
                {canonical !== undefined && ` → ${groupLabel.get(canonical) ?? canonical}`}
                {fact?.runeType === "keystone" ? " · Keystone" : fact?.runeType === "minor" ? " · Minor rune"
                  : fact?.runeType ? ` · ${fact.runeType}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * PA2B — one `assembly` round, reviewed: the viewer's board position by
 * position (the server's mark on each), the true lineup beside it, what each
 * wrong pick actually was, and where and when it happened. Every mark, card
 * and fact is the server's; only the words are the host's (the same
 * `noteFor` / `contextFor` the live reveal uses). An unrevealed round shows
 * only what was asked.
 */
function AssemblyBody({ round }: { round: ReviewRound }) {
  const as = round.assembly;
  if (!as) return null;
  const byToken = new Map(as.cards.map((c) => [c.token, c]));
  const lineup = as.canonicalLineup;
  const context = as.context;
  const plate = context ? assemblyContextFor(context) : null;
  return (
    <div className="space-y-2" data-testid="review-assembly" data-family={as.family ?? undefined}>
      {as.prompt && (
        <p className="text-[12px] font-semibold" style={{ color: LEAGUECRAFT_INK.body }}
          data-testid="review-assembly-prompt">{as.prompt}</p>
      )}
      {as.viewerPlacement === null && (
        <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          {as.outcome === "timeout" ? "You did not lock in a board." : "No board was locked in."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {as.viewerPlacement !== null && (
          <div className="space-y-1">
            <SectionLabel>My board</SectionLabel>
            <ul className="space-y-1" data-testid="review-assembly-mine">
              {as.positions.map((pos, i) => {
                const token = as.viewerPlacement![i];
                const mark = as.positionCorrect ? as.positionCorrect[pos.slotId] : undefined;
                const tone = mark === undefined ? TONE.idle : mark ? TONE.correct : TONE.incorrect;
                const fact = as.cardFacts?.[token];
                const note = mark === false && fact && context ? assemblyNoteFor(fact, context) : null;
                return (
                  <li key={pos.slotId} data-mark={mark === undefined ? "none" : String(mark)}
                    className="rounded border px-1.5 py-1 text-[11.5px]"
                    style={{ color: tone.ink, borderColor: tone.edge, background: tone.fill }}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-80">{pos.short}</span>
                      <span className="min-w-0 flex-1 break-words font-semibold">{byToken.get(token)?.label ?? token}</span>
                      {mark !== undefined && (
                        mark
                          ? <Check className="h-3 w-3 shrink-0" aria-label="In position" />
                          : <X className="h-3 w-3 shrink-0" aria-label="Not in this position" />
                      )}
                    </span>
                    {note && <span className="block pl-[38px] text-[10.5px] opacity-80"
                      data-testid="review-assembly-note">{note}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {round.revealed && lineup !== null && (
          <div className="space-y-1">
            <SectionLabel>{as.family === "draft_memory" ? "The composition" : "The lineup"}</SectionLabel>
            <ul className="space-y-1" data-testid="review-assembly-lineup">
              {lineup.map((e) => (
                <li key={e.slotId} className="flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11.5px]"
                  style={{ color: TONE.idle.ink, borderColor: TONE.idle.edge, background: TONE.idle.fill }}>
                  <span className="w-8 shrink-0 text-[10px] font-bold uppercase tracking-wider opacity-80">
                    {as.positions.find((p) => p.slotId === e.slotId)?.short ?? e.slotId}
                  </span>
                  <span className="min-w-0 flex-1 break-words font-semibold">{e.label}</span>
                  {e.sublabel && <span className="shrink-0 text-[10.5px] opacity-70">{e.sublabel}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {plate && (
        <div className="space-y-0.5 text-[11px]" style={{ color: LEAGUECRAFT_INK.body }}
          data-testid="review-assembly-context">
          <p className="font-semibold">{plate.title}</p>
          {plate.lines.map((line) => <p key={line} className="opacity-80">{line}</p>)}
          {plate.source && <p className="text-[10px] opacity-60">{plate.source.label}</p>}
        </div>
      )}
    </div>
  );
}

function MetaReflexBody({ round }: { round: ReviewRound }) {
  const cards = round.challenges ?? [];
  const sub = round.viewerSubmission;
  return (
    <>
      {sub.correctCount !== null && sub.challengeCount !== null && (
        <p className="flex items-center gap-2 text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          <span>
            <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
              {sub.correctCount}
            </span>{" "}
            of{" "}
            <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
              {sub.challengeCount}
            </span>{" "}
            cards right.
          </span>
          {cards.length > 1 && round.revealed && <Pips results={cards.map((c) => c.isCorrect)} />}
        </p>
      )}
      <ul className="space-y-1.5" data-testid="review-cards">
        {cards.map((card) => (
          <li key={card.challengeIndex} className="space-y-1">
            {card.prompt && (
              <div className="text-[11px]" style={{ color: LEAGUECRAFT_INK.body }}>
                {card.prompt}
              </div>
            )}
            <div className="flex items-stretch gap-1.5">
              <CardSide card={card} side="left" revealed={round.revealed} />
              <CardSide card={card} side="right" revealed={round.revealed} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * PT1.2 — the lifetime line: what this question is to the account, as opposed
 * to what happened in this one match.
 *
 * The card above it is already complete without this; ownership is a footnote
 * on it, not a section of it. So it is one quiet line under the hairline, and
 * it renders NOTHING at all when the question is not in the collection or the
 * index could not be completed (see `ownedQuestionIndex.tsx`) — the absence of
 * a line must never be readable as "you do not own this".
 *
 * `accuracy: null` is the endpoint's "nothing answered" and prints as an em
 * dash, never 0%.
 */
function OwnershipFootnote({ canonicalQuestionRef }: { canonicalQuestionRef: string | null }) {
  const owned = useQuestionOwnership(canonicalQuestionRef);
  if (!owned) return null;
  const seen = owned.timesAnswered;
  const accuracy = owned.accuracy === null ? "—" : `${Math.round(owned.accuracy * 100)}%`;
  const since = new Date(
    /Z|[+-]\d{2}:\d{2}$/.test(owned.firstSeenAt)
      ? owned.firstSeenAt
      : `${owned.firstSeenAt.replace(" ", "T")}Z`,
  );
  const sinceLabel = Number.isNaN(since.getTime())
    ? null
    : since.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return (
    <p
      className="text-[10px] leading-relaxed"
      style={{ color: LEAGUECRAFT_INK.faint }}
      data-testid="review-ownership"
    >
      In your collection{sinceLabel ? ` since ${sinceLabel}` : ""} · answered{" "}
      <span className="font-semibold tabular-nums">{seen}</span>{" "}
      {seen === 1 ? "time" : "times"} ·{" "}
      <span className="font-semibold tabular-nums">{owned.timesCorrect}</span> correct (
      <span className="tabular-nums">{accuracy}</span>)
    </p>
  );
}

/**
 * The verdict, as one word in the heading line.
 *
 * It restates what `data-outcome` already says on the card, where a reader
 * scanning down a stack of cards can find it without reading the body. A
 * counted round (a Mastery slice, a Meta Reflex block) is `correct` only on a
 * clean sweep and `incorrect` on a clean miss; anything between is "Partial",
 * which is neither — the timeline's tint (`questionOutcome`) stays as it was.
 */
function OutcomeChip({ round, outcome }: { round: ReviewRound; outcome: QuestionOutcome }) {
  const sub = round.viewerSubmission;
  const counted = sub.challengeCount !== null && sub.isCorrect === null;
  const partial = counted && outcome === "incorrect"
    && (sub.correctCount ?? 0) > 0 && (sub.correctCount ?? 0) < (sub.challengeCount ?? 0);
  const state = !round.revealed ? "sealed" : partial ? "partial" : outcome;
  const label = state === "sealed" ? "Not played out"
    : state === "partial" ? "Partial"
      : state === "correct" ? "Correct"
        : state === "incorrect" ? "Incorrect" : "Unanswered";
  const tone = state === "correct" ? TONE.correct
    : state === "incorrect" ? TONE.incorrect
      : state === "partial" ? TONE.partial : TONE.idle;
  const Icon = state === "correct" ? Check : state === "incorrect" ? X : Minus;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[8.5px] font-bold uppercase leading-snug tracking-[0.12em]"
      style={{ color: tone.ink, borderColor: tone.edge, background: tone.fill }}
      data-testid="review-outcome"
      data-state={state}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * The subject's mark, from the SAME proven hint the timeline icon draws.
 *
 * Nothing is chosen here: `resolveQuestionIcon` is the timeline's own
 * resolver, so the card and the icon that opened it cannot disagree. Backend-
 * verified entity art prints as it is; a category tile is muted the way the
 * timeline mutes it, so "Items" never reads as "this was about Infinity Edge".
 * A module with no entity wears its drawn sigil, Meta Reflex its bolt, and a
 * subject with neither prints no mark at all rather than a placeholder.
 */
function SubjectMark({ round }: { round: ReviewRound }) {
  const icon = resolveQuestionIcon(round.iconHint);
  // A proven image that fails to load is simply absent (never a broken-image
  // glyph, never a substitute picture). Reset when the source changes.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = "h-[18px] w-[18px] shrink-0 self-center rounded-[3px]";
  if (icon.glyph === "meta_reflex") {
    return <Zap className="h-4 w-4 shrink-0 self-center" style={{ color: LEAGUECRAFT_INK.brass }} aria-hidden="true" />;
  }
  if (icon.src && icon.src !== failedSrc) {
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        onError={() => setFailedSrc(icon.src ?? null)}
        data-testid="review-subject-mark"
        data-specific={icon.specific ? "true" : "false"}
        className={`${box} object-cover`}
        style={icon.specific ? undefined : { opacity: 0.88, filter: "sepia(0.18) saturate(0.92) brightness(0.97)" }}
      />
    );
  }
  if (hasModuleSigil(round)) return <ModuleSigil kind={round.kind} className="h-4 w-4 shrink-0 self-center" />;
  return null;
}

export default function QuestionReviewCard({
  round, position, total,
}: { round: ReviewRound; position: number; total: number }) {
  const icon = resolveQuestionIcon(round.iconHint);
  const outcome = questionOutcome(round);
  // A Mastery body keeps its own selected challenge: a different round starts at the first.
  const masteryKey = `${position}:${round.roundNumber}:${(round.masteryChallenges ?? []).map((c) => c.challengeIndex).join(",")}`;
  const subject =
    round.kind === "meta_reflex"
      ? META_REFLEX_LABEL
      : round.kind === "mastery_slice"
        ? "Mastery"
        : round.kind === "order_forge"
        ? "Order Forge"
        : round.kind === "reconstruct"
        ? "Reconstruct"
        : round.kind === "match"
        ? "Match Grid"
        : round.kind === "assembly"
        ? (round.assembly?.family === "draft_memory" ? "Draft Memory" : "Roster Lock")
        : round.kind === "scrub"
        ? "Chronoscope"
        : round.category
          ? prettyCategory(round.category)
          : icon.label;

  return (
    <div className="space-y-2" data-testid="question-review-card" data-outcome={outcome}>
      {/* The heading line: where you are, and what it was about. */}
      <div className="flex items-center gap-1.5">
        <SubjectMark round={round} />
        <span
          className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: LEAGUECRAFT_INK.heading, textShadow: LEAGUECRAFT_INK.press }}
          data-testid="review-position"
        >
          Q{position} of {total}
        </span>
        {/* RQ1 — the question's FROZEN role(s), immediately left of the
            subject. A Mastery Slice shows a set here only when all of its
            challenges share it (see `reviewRoundRoles`). */}
        <QuestionRoleEmblems roles={reviewRoundRoles(round)} size="sm"
          backed className="self-center" testId="review-question-roles" />
        <span
          className="min-w-0 flex-1 truncate text-[9.5px] font-bold uppercase tracking-[0.16em]"
          style={{ color: LEAGUECRAFT_INK.brass }}
          title={subject}
        >
          · {subject}
        </span>
        <OutcomeChip round={round} outcome={outcome} />
      </div>

      <div className="h-px w-full" style={{ background: LEAGUECRAFT_INK.rule }} aria-hidden="true" />

      {round.kind === "meta_reflex" ? (
        <MetaReflexBody round={round} />
      ) : round.kind === "mastery_slice" ? (
        <MasterySliceBody key={masteryKey} round={round} />
      ) : round.kind === "order_forge" ? (
        <OrderForgeBody round={round} />
      ) : round.kind === "reconstruct" ? (
        <ReconstructBody round={round} />
      ) : round.kind === "match" ? (
        <MatchBody round={round} />
      ) : round.kind === "assembly" ? (
        <AssemblyBody round={round} />
      ) : round.kind === "scrub" ? (
        <ScrubBody round={round} />
      ) : (
        <QuizBody round={round} />
      )}

      <OwnershipFootnote canonicalQuestionRef={round.canonicalQuestionRef} />
    </div>
  );
}
