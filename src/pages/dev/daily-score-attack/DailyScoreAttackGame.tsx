/**
 * Active-question and reveal surfaces. Pure projection consumers: every
 * number and outcome rendered here comes from the server run/resolution.
 * Answers are an accessible single-choice radiogroup submitted by index.
 */

import { useEffect, useRef, useState } from "react";
import { DsaResolution, DsaRun, dsaChoiceLabel } from "./dailyScoreAttackTypes";
import DailyScoreAttackTimer from "./DailyScoreAttackTimer";
import { fetchQuestionImageObjectUrl } from "./dailyScoreAttackClient";

/**
 * Renders the current question's media, fetched from the opaque auth-scoped
 * endpoint as a blob object URL — so the DOM `src` is a `blob:` URL that
 * carries no champion/entity name. Eager-loads (this is the active question in
 * timed play); degrades silently to nothing on absence or fetch failure.
 */
function revokeObjectUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

function QuestionMedia({ imageUrl }: { imageUrl: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    const controller = new AbortController();
    setObjectUrl(null);
    setFailed(false);
    fetchQuestionImageObjectUrl(imageUrl, controller.signal)
      .then((url) => {
        if (revoked) {
          revokeObjectUrl(url);
          return;
        }
        created = url;
        setObjectUrl(url);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFailed(true);
      });
    return () => {
      revoked = true;
      controller.abort();
      if (created) revokeObjectUrl(created);
    };
  }, [imageUrl]);

  if (failed) {
    return (
      <p className="mb-3 text-xs text-muted-foreground" data-testid="dsa-question-media-error">
        Question image unavailable.
      </p>
    );
  }
  if (!objectUrl) {
    return (
      <div
        className="mb-3 h-40 w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
        data-testid="dsa-question-media-loading"
        aria-hidden
      />
    );
  }
  return (
    <img
      src={objectUrl}
      alt="Question image"
      data-testid="dsa-question-media"
      className="mb-3 max-h-56 w-full rounded-lg object-contain"
    />
  );
}

type GameProps = {
  run: DsaRun;
  phase: "active-question" | "submitting-answer" | "reveal" | "transitioning";
  resolution: DsaResolution | null;
  selectedIndex: number | null;
  reducedMotion: boolean;
  onSelect: (index: number) => void;
  onTimerZero: () => void;
  onAnnounce: (message: string) => void;
};

export default function DailyScoreAttackGame({
  run,
  phase,
  resolution,
  selectedIndex,
  reducedMotion,
  onSelect,
  onTimerZero,
  onAnnounce,
}: GameProps) {
  const question = run.question;
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (phase === "active-question") headingRef.current?.focus();
  }, [phase, question?.sequence]);

  const locked = phase !== "active-question";
  const inReveal = phase === "reveal" && resolution !== null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-3">
      <div className="flex items-center justify-between gap-3">
        <DailyScoreAttackTimer
          expiresAt={run.expires_at}
          serverRemainingMs={run.remaining_ms}
          running={run.status === "active"}
          onZero={onTimerZero}
          onAnnounce={onAnnounce}
        />
        <div className="text-right">
          <div data-testid="dsa-score" className="text-2xl font-bold tabular-nums">
            {run.total_score.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">score</div>
        </div>
        <div className="text-right">
          <div
            data-testid="dsa-combo"
            className={`text-2xl font-bold tabular-nums ${
              run.combo >= 3 ? "text-amber-400" : ""
            }`}
          >
            ×{run.combo}
          </div>
          <div className="text-xs text-muted-foreground">combo</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums" data-testid="dsa-progress">
            {run.presented_count} / 30
          </div>
          <div className="text-xs text-muted-foreground">question</div>
        </div>
      </div>

      {question && (
        <div className="rounded-xl border border-border bg-card p-4">
          {question.has_image && question.image_url && (
            <QuestionMedia key={question.sequence} imageUrl={question.image_url} />
          )}
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mb-4 text-lg font-semibold outline-none"
            data-testid="dsa-question-text"
          >
            {question.question_text}
          </h2>
          <div role="radiogroup" aria-label="Answer choices" className="grid grid-cols-1 gap-2.5">
            {question.choices.map((choice, index) => {
              const label = dsaChoiceLabel(choice);
              const isSelected = selectedIndex === index;
              let revealState = "idle";
              if (inReveal && resolution) {
                if (index === resolution.correct_index) revealState = "correct";
                else if (isSelected) revealState = "incorrect-selected";
              } else if (isSelected) {
                revealState = "selected";
              }
              return (
                <button
                  key={index}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={locked}
                  data-dsa-choice={index}
                  data-choice-state={revealState}
                  onClick={() => onSelect(index)}
                  className={`min-h-11 rounded-lg border px-4 py-2.5 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
                    revealState === "correct"
                      ? "border-emerald-500 bg-emerald-500/15"
                      : revealState === "incorrect-selected"
                        ? "border-red-500 bg-red-500/15"
                        : revealState === "selected"
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background hover:bg-accent disabled:opacity-60"
                  }`}
                >
                  {label}
                  {revealState === "correct" && <span className="sr-only"> (correct answer)</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {inReveal && resolution && (
        <div
          data-testid="dsa-reveal"
          className={`rounded-xl border p-4 ${
            resolution.is_correct
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-red-500/60 bg-red-500/10"
          } ${reducedMotion ? "" : "animate-in fade-in duration-200"}`}
        >
          <p className="font-semibold">
            {resolution.is_correct ? "Correct!" : "Incorrect"}
          </p>
          {resolution.is_correct ? (
            <p className="mt-1 text-sm tabular-nums" data-testid="dsa-reveal-score">
              {resolution.base_score} base + {resolution.speed_bonus} speed ×{" "}
              {resolution.multiplier.num === resolution.multiplier.den
                ? "1"
                : `${resolution.multiplier.num}/${resolution.multiplier.den}`}{" "}
              = <strong>+{resolution.awarded_score}</strong> (combo {resolution.combo_before} →{" "}
              {resolution.combo_after})
            </p>
          ) : (
            <p className="mt-1 text-sm" data-testid="dsa-reveal-score">
              No points. Combo reset to {resolution.combo_after}.
            </p>
          )}
          {resolution.explanation && (
            <p className="mt-2 text-sm text-muted-foreground">{resolution.explanation}</p>
          )}
        </div>
      )}

      {phase === "submitting-answer" && (
        <p className="text-center text-sm text-muted-foreground" role="status">
          Locking answer…
        </p>
      )}
    </div>
  );
}
