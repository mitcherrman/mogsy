/**
 * RG3 — the evidence that sits under a resolved answer.
 *
 * One component, two shapes, because the model has two and they are genuinely
 * different things to look at:
 *
 *   comparison — a Meta Reflex card. Both operands with their values, the
 *                winning side lit. This IS the answer, so it is loud.
 *   statement  — one short line distilled from a normal question's frozen
 *                rationale. Supporting matter, so it is quiet.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * ─────────────────────────────
 * It is not a panel, it has no control, and it never grows past one line per
 * row. The surface it replaces (`QuizAnswerFeedback`, a bordered box with a
 * header, a correct-answer line and a paragraph) is still the right thing for a
 * study surface with room; in a 1.5-second gameplay beat it is furniture that
 * arrives after the player has already moved on.
 *
 * GEOMETRY
 * ────────
 * Both shapes render into a box whose height does not depend on its contents:
 * a comparison is always two rows, a statement is always one, and a card with
 * no value still reserves the value slot. That is what keeps the answer grid
 * above from moving when a round settles — the failure mode RG3 must not
 * reintroduce.
 *
 * Nothing here computes. `winner` is the server's ruling and the two value
 * strings are the server's formatting of the numbers it actually compared.
 */
import type { FeedbackEvidence } from "@/lib/question-feedback/model";

function ComparisonRow({
  side,
  label,
  value,
  state,
}: {
  side: "left" | "right";
  label: string | null;
  value: string | null;
  state: "winner" | "loser" | "neutral";
}) {
  const tone =
    state === "winner"
      ? "border-emerald-400/55 bg-emerald-400/10 text-emerald-200"
      : state === "loser"
        ? "border-destructive/45 bg-destructive/10 text-[#e2757b]"
        : "border-white/12 bg-white/[0.03] text-muted-foreground";
  return (
    <div
      data-testid={`evidence-${side}`}
      data-state={state}
      // min-h, not h: the row must not clip a wrapped label on a narrow
      // viewport, and must not shrink when a card compares nothing.
      className={`flex min-h-[1.75rem] items-center justify-between gap-3 rounded-md border px-2 py-1 ${tone}`}
    >
      <span className="min-w-0 truncate text-xs font-semibold sm:text-sm">
        {label ?? "—"}
      </span>
      {/* Always mounted, even when there is no value: an empty right-hand
          column keeps the two rows the same shape whether the card compared a
          number or nothing at all. */}
      <span
        data-testid={`evidence-${side}-value`}
        className="shrink-0 text-xs font-black tabular-nums sm:text-sm"
      >
        {value ?? ""}
      </span>
    </div>
  );
}

export function EvidenceLine({
  evidence,
  className = "",
}: {
  evidence: FeedbackEvidence | null;
  className?: string;
}) {
  // A question with no authoritative evidence renders NOTHING — not an empty
  // box, not a placeholder. There is no honest sentence to put here, and the
  // verdict plus the highlighted correct answer is already complete feedback.
  if (!evidence) return null;

  if (evidence.kind === "statement") {
    return (
      <p
        data-testid="answer-evidence"
        data-evidence-kind="statement"
        className={`text-xs font-semibold leading-snug text-[#e8c97a] ${className}`}
      >
        {evidence.text}
      </p>
    );
  }

  const { left, right, winner } = evidence;
  return (
    <div
      data-testid="answer-evidence"
      data-evidence-kind="comparison"
      className={`grid gap-1 ${className}`}
    >
      <ComparisonRow
        side="left"
        label={left.label}
        value={left.valueDisplay}
        state={winner === null ? "neutral" : winner === "left" ? "winner" : "loser"}
      />
      <ComparisonRow
        side="right"
        label={right.label}
        value={right.valueDisplay}
        state={winner === null ? "neutral" : winner === "right" ? "winner" : "loser"}
      />
    </div>
  );
}
