import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GraduationCap, RotateCcw } from "lucide-react";
import { TutorialEvent } from "../types";

/**
 * Final Tutorial Complete view. Practice Again reuses the canonical
 * reducer RESTART (full stateless reset, no reload, no persistence).
 * Return to Ranked is an ordinary route link to the existing /quiz hub —
 * it never queues or navigates automatically.
 */
export function TutorialCompletePanel({
  dispatch,
}: {
  dispatch: (event: TutorialEvent) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
          <Link to="/quiz">Return to Ranked</Link>
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        This returns to the Ranked area. It does not automatically queue you.
        Nothing from this tutorial was saved.
      </p>
    </section>
  );
}
