/**
 * QRT2 — the "Correct answer" / "Your pick" tabs a revealed answer carries.
 *
 * One component for every surface that tells a graded answer in words, so the
 * arena's tablets (`QuizAnswerOptions`) and Mastery's choice rows
 * (`MasteryChoiceInput`) cannot word, size or place them apart.
 *
 * WHAT THEY ARE: real text on the answer's top edge, out of flow (they never
 * resize the row they sit on), one line each (`whitespace-nowrap`; a wrapped tab
 * grows into the row's corner). WHAT THEY ARE NOT: a live region. The text sits
 * inside the control, so a screen reader hears it with the answer's own name on
 * focus; the verdict itself is announced once, elsewhere.
 *
 * `compact` is for tiles only ~145-155px wide on a phone (a two-up pair, a
 * picture choice): tighter type, and the answer's reads "Correct" when the
 * player's own pick shares the edge. Together ~128px, inside the tile.
 *
 * The parent must be `position: relative`.
 */
export function AnswerTabs({
  correct,
  pick,
  compact = false,
}: {
  /** This is the answer the server disclosed. */
  correct: boolean;
  /** This is the option the player chose. */
  pick: boolean;
  compact?: boolean;
}) {
  if (!correct && !pick) return null;
  const size = compact
    ? "px-1 py-0.5 text-[9px] tracking-[0.08em]"
    : "px-1.5 py-0.5 text-[10px] tracking-[0.14em]";
  return (
    <span data-testid="answer-result-tags"
      className={`pointer-events-none absolute -top-2 flex items-center whitespace-nowrap ${
        compact ? "right-2 gap-0.5" : "right-3 gap-1"}`}>
      {correct && (
        <span data-testid="answer-correct-tag"
          className={`whitespace-nowrap rounded-sm bg-[#86efac] font-black uppercase leading-none text-[#052e1a] shadow-[0_1px_4px_rgba(0,0,0,0.45)] ${size}`}>
          {compact && pick ? "Correct" : "Correct answer"}
        </span>
      )}
      {pick && (
        <span data-testid="answer-your-pick"
          className={`whitespace-nowrap rounded-sm bg-[#f0d78c] font-black uppercase leading-none text-[#1d1608] shadow-[0_1px_4px_rgba(0,0,0,0.45)] ${size}`}>
          Your pick
        </span>
      )}
    </span>
  );
}
