/**
 * Terminal results (official and practice). Renders only server values;
 * accuracy is derived from authoritative counts alone. History failures
 * degrade gracefully — results stay usable without them.
 */

import { useEffect, useRef } from "react";
import { DsaHistory, DsaResults, dsaChoiceLabel } from "./dailyScoreAttackTypes";

type Props = {
  results: DsaResults;
  history: DsaHistory | null;
  onPracticeAgain: () => void;
  practiceAllowed: boolean;
};

export default function DailyScoreAttackResults({
  results,
  history,
  onPracticeAgain,
  practiceAllowed,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const accuracy =
    results.answered_count > 0
      ? Math.round((results.correct_count / results.answered_count) * 100)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
        {results.official ? "Official Run Complete" : "Practice Run Complete"}
      </h2>
      <span
        data-testid="dsa-results-badge"
        className={`w-fit rounded-full border px-3 py-0.5 text-xs font-semibold uppercase tracking-wide ${
          results.official
            ? "border-amber-500 text-amber-400"
            : "border-sky-500 text-sky-400"
        }`}
      >
        {results.official ? "Official" : "Practice"}
      </span>

      <div className="rounded-xl border border-border bg-card p-5 text-center">
        <div className="text-5xl font-black tabular-nums" data-testid="dsa-final-score">
          {results.total_score.toLocaleString()}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">
          {results.completion_reason === "pool_exhausted"
            ? "All 30 questions cleared"
            : "Time expired"}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Correct</dt>
          <dd className="font-semibold tabular-nums">
            {results.correct_count} / {results.answered_count} answered
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Accuracy</dt>
          <dd className="font-semibold tabular-nums" data-testid="dsa-accuracy">
            {accuracy === null ? "—" : `${accuracy}%`}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Best combo</dt>
          <dd className="font-semibold tabular-nums">×{results.highest_combo}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Seen</dt>
          <dd className="font-semibold tabular-nums">{results.presented_count} / 30</dd>
        </div>
      </dl>

      {results.official ? (
        <div className="rounded-lg border border-border bg-card p-3 text-sm" data-testid="dsa-rewards">
          <p>
            Daily completion bonus:{" "}
            <strong>{results.bonus_xp_awarded ? "+250 XP awarded" : "not awarded"}</strong>
          </p>
          <p>
            Daily streak: <strong>{results.streak_awarded ? "advanced" : "unchanged"}</strong>
            {history ? ` — current streak ${history.daily_streak}` : ""}
          </p>
          {!results.participated && (
            <p className="mt-1 text-muted-foreground">
              No answers were submitted, so this run earned no bonus XP or streak credit.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-3 text-sm" data-testid="dsa-practice-note">
          <p className="font-medium">Practice runs are unscored for progression:</p>
          <ul className="mt-1 list-inside list-disc text-muted-foreground">
            <li>No XP</li>
            <li>No Daily streak</li>
            <li>No official record or personal best</li>
          </ul>
        </div>
      )}

      {results.official && history && (
        <div className="rounded-lg border border-border bg-card p-3 text-sm" data-testid="dsa-history">
          <p className="font-medium">Official history</p>
          {history.personal_best && (
            <p className="text-muted-foreground">
              Personal best: {history.personal_best.score.toLocaleString()} (
              {history.personal_best.challenge_date})
            </p>
          )}
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {history.entries.slice(0, 5).map((entry) => (
              <li key={entry.challenge_date} className="tabular-nums">
                {entry.challenge_date}: {entry.score.toLocaleString()} ({entry.correct_count}✓)
              </li>
            ))}
          </ul>
        </div>
      )}

      {results.breakdown.length > 0 && (
        <details className="rounded-lg border border-border bg-card p-3 text-sm">
          <summary className="cursor-pointer font-medium">
            Question breakdown ({results.breakdown.length} presented)
          </summary>
          <ol className="mt-2 space-y-2">
            {results.breakdown.map((item) => (
              <li key={item.sequence} className="border-t border-border pt-2">
                <p className="font-medium">
                  {item.sequence}. {item.question_text}
                </p>
                <p className="text-muted-foreground">
                  {item.resolution_reason === "run_expired"
                    ? "Unanswered (time expired)"
                    : item.is_correct
                      ? `Correct — +${item.awarded_score}`
                      : "Incorrect — +0"}
                  {" · Answer: "}
                  {dsaChoiceLabel(item.choices[item.correct_index])}
                </p>
                {item.explanation && (
                  <p className="text-xs text-muted-foreground">{item.explanation}</p>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}

      {practiceAllowed && (
        <button
          type="button"
          onClick={onPracticeAgain}
          className="min-h-11 rounded-lg border border-border bg-primary px-4 font-semibold text-primary-foreground hover:opacity-90"
        >
          {results.official ? "Try a practice run" : "Practice again"}
        </button>
      )}
    </div>
  );
}
