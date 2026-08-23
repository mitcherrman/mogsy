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
import { Check, Minus, X } from "lucide-react";
import { LEAGUECRAFT_INK } from "@/components/quiz/leaguecraft-ink";
import {
  prettyCategory,
  questionOutcome,
  resolveQuestionIcon,
} from "@/components/quiz/workspace/questionIcons";
import { resolveQuizAssetUrl } from "@/lib/quiz/api";
import type { ReviewChallenge, ReviewRound } from "@/lib/ranked-public/contracts";

/** The three marks, printed rather than lit — the row's own palette. */
const TONE = {
  correct: { ink: "#1f5c3c", edge: "rgba(31,92,60,0.45)", fill: "rgba(31,92,60,0.09)" },
  incorrect: { ink: LEAGUECRAFT_INK.rubric, edge: "rgba(122,40,32,0.45)", fill: "rgba(122,40,32,0.08)" },
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
  return (
    <div className="space-y-0.5" data-testid="review-working">
      <SectionLabel>Working</SectionLabel>
      <ol className="space-y-px text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
        {rows.map((r, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1">{r.text}</span>
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

/** The one-line answer summary. Labels in the sheet's brass, values in ink. */
function AnswerLine({
  label, value, ink, note, testId,
}: {
  label: string;
  value: string;
  ink: string;
  note?: string | null;
  testId: string;
}) {
  return (
    <div className="flex items-baseline gap-2 text-[11.5px]" data-testid={testId}>
      <span
        className="w-[5.4rem] shrink-0 text-[9px] font-bold uppercase tracking-[0.14em]"
        style={{ color: LEAGUECRAFT_INK.brass }}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-semibold" style={{ color: ink }}>{value}</span>
        {note && (
          <span style={{ color: LEAGUECRAFT_INK.faint }}> — {note}</span>
        )}
      </span>
    </div>
  );
}

function QuizBody({ round }: { round: ReviewRound }) {
  const q = round.question;
  if (!q) return null;
  const chosen = round.viewerSubmission.answerIndex;
  const correct = q.correctOptionIndex;
  const expl = q.explanation ?? {};
  const ownDerivation =
    chosen !== null && chosen !== correct ? ownDerivationFor(expl, q.options[chosen]) : null;
  const note = typeof expl.scenario_note === "string" ? expl.scenario_note.trim() : "";
  const steps = Array.isArray(expl.calculation_steps) ? expl.calculation_steps : null;

  return (
    <>
      <p className="text-[12.5px] leading-relaxed" style={{ color: LEAGUECRAFT_INK.strong }}>
        {q.prompt}
      </p>

      <ul className="space-y-1" data-testid="review-options">
        {q.options.map((opt, i) => {
          const isCorrect = correct !== null && i === correct;
          const isChosen = chosen === i;
          const tone = isCorrect ? TONE.correct : isChosen ? TONE.incorrect : TONE.idle;
          const Icon = isCorrect ? Check : isChosen ? X : Minus;
          return (
            <li
              key={i}
              data-review-option={i}
              data-option-state={isCorrect ? "correct" : isChosen ? "chosen" : "idle"}
              className="flex items-start gap-1.5 rounded border px-1.5 py-1 text-[11.5px]"
              style={{ borderColor: tone.edge, background: tone.fill, color: tone.ink }}
            >
              <Icon className="mt-[3px] h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 break-words">{opt}</span>
              {isChosen && (
                <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-[0.14em] opacity-80">
                  yours
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Stated in words as well as marked in the list. A reader glancing at
          one question should not have to decode two icons to learn what they
          picked and what was right. */}
      <div className="space-y-0.5">
        <AnswerLine
          testId="review-your-answer"
          label="Your answer"
          value={chosen !== null && q.options[chosen] !== undefined ? q.options[chosen] : "Not answered"}
          ink={
            chosen === null ? LEAGUECRAFT_INK.faint
              : chosen === correct ? TONE.correct.ink : TONE.incorrect.ink
          }
          note={ownDerivation}
        />
        {round.revealed && correct !== null && q.options[correct] !== undefined ? (
          <AnswerLine
            testId="review-correct-answer"
            label="Correct answer"
            value={q.options[correct]}
            ink={TONE.correct.ink}
          />
        ) : (
          <p
            className="text-[11px]"
            data-testid="review-unresolved"
            style={{ color: LEAGUECRAFT_INK.faint }}
          >
            This round was never played out, so its answer stays sealed.
          </p>
        )}
      </div>

      {note && (
        <div className="space-y-0.5" data-testid="review-explanation">
          <SectionLabel>Explanation</SectionLabel>
          <p className="text-[11.5px] leading-relaxed" style={{ color: LEAGUECRAFT_INK.body }}>
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
        <div className="truncate text-[11px] font-medium" style={{ color: tone.ink }}>
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
    </div>
  );
}

function MetaReflexBody({ round }: { round: ReviewRound }) {
  const cards = round.challenges ?? [];
  const sub = round.viewerSubmission;
  return (
    <>
      {sub.correctCount !== null && sub.challengeCount !== null && (
        <p className="text-[11.5px]" style={{ color: LEAGUECRAFT_INK.body }}>
          <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
            {sub.correctCount}
          </span>{" "}
          of{" "}
          <span className="font-semibold tabular-nums" style={{ color: LEAGUECRAFT_INK.strong }}>
            {sub.challengeCount}
          </span>{" "}
          cards right.
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

export default function QuestionReviewCard({
  round, position, total,
}: { round: ReviewRound; position: number; total: number }) {
  const icon = resolveQuestionIcon(round.iconHint);
  const outcome = questionOutcome(round);
  const subject =
    round.kind === "meta_reflex"
      ? "Meta Reflex"
      : round.category
        ? prettyCategory(round.category)
        : icon.label;

  return (
    <div className="space-y-2" data-testid="question-review-card" data-outcome={outcome}>
      {/* The heading line: where you are, and what it was about. */}
      <div className="flex items-baseline gap-1.5">
        <span
          className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.18em]"
          style={{ color: LEAGUECRAFT_INK.heading, textShadow: LEAGUECRAFT_INK.press }}
          data-testid="review-position"
        >
          Q{position} of {total}
        </span>
        <span
          className="min-w-0 flex-1 truncate text-[9.5px] font-bold uppercase tracking-[0.16em]"
          style={{ color: LEAGUECRAFT_INK.brass }}
          title={subject}
        >
          · {subject}
        </span>
      </div>

      <div className="h-px w-full" style={{ background: LEAGUECRAFT_INK.rule }} aria-hidden="true" />

      {round.kind === "meta_reflex" ? (
        <MetaReflexBody round={round} />
      ) : (
        <QuizBody round={round} />
      )}
    </div>
  );
}
