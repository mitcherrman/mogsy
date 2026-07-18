import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap, Loader2, RotateCcw } from "lucide-react";
import { TutorialEvent } from "../types";
import { useTutorialOnboarding } from "../tutorialOnboardingContext";

/**
 * Final Tutorial Complete view. Behavior is driven by the run-mode context:
 *
 *  - "dev"/"replay": Practice Again reuses the canonical reducer RESTART (full
 *    stateless reset, no persistence), and the return control is an ordinary
 *    route link to the Ranked hub — it never queues or navigates automatically.
 *
 *  - "mandatory": no skip. The primary action durably persists completion via
 *    the context's onComplete; navigation happens only after the authoritative
 *    write succeeds. On failure the user stays here with a retryable error.
 */
export function TutorialCompletePanel({
  dispatch,
}: {
  dispatch: (event: TutorialEvent) => void;
}) {
  const { mode, onComplete, returnTo } = useTutorialOnboarding();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const isMandatory = mode === "mandatory";

  const handleFinish = async () => {
    if (saving || !onComplete) return;
    setSaving(true);
    setFailed(false);
    const ok = await onComplete();
    // On success the host navigates away; keep the pending state so the button
    // never re-enables mid-teardown. On failure, surface a retry.
    if (!ok) {
      setSaving(false);
      setFailed(true);
    }
  };

  return (
    <section
      aria-label="Tutorial complete"
      data-testid="tutorial-complete-panel"
      className="rounded-xl border-2 border-emerald-600/60 bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-emerald-600" aria-hidden />
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold outline-none">
          Tutorial complete
        </h2>
      </div>
      <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-0.5">
        <li>Both players get the same question; choices stay hidden until reveal.</li>
        <li>Correct answers deal damage — and both players can deal damage.</li>
        <li>Zero HP ends the match; XP unlocks abilities.</li>
        <li>Level 2 is a permanent choice; Level 3 unlocks the rest automatically.</li>
        <li>Charges are limited and committed when the round resolves.</li>
        <li>Queue and recovery happen outside this training simulation.</li>
      </ul>

      {isMandatory ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleFinish}
              disabled={saving}
              className="gap-1"
              data-testid="finish-tutorial"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {saving ? "Saving…" : "Finish & Continue"}
            </Button>
          </div>
          {failed && (
            <p
              role="alert"
              data-testid="completion-error"
              className="text-sm text-destructive"
            >
              We couldn&apos;t save your progress. Please check your connection and try again.
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Finishing unlocks the normal quiz experience. You won&apos;t need to repeat
            this tutorial.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => dispatch({ type: "RESTART" })}
              className="gap-1"
              data-testid="practice-again"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Practice Again
            </Button>
            <Button asChild variant="outline" data-testid="return-to-ranked">
              <Link to={returnTo}>Return to Ranked</Link>
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This returns to the Ranked area. It does not automatically queue you.
            {mode === "replay"
              ? " Replaying does not change your saved progress."
              : " Nothing from this tutorial was saved."}
          </p>
        </>
      )}
    </section>
  );
}
