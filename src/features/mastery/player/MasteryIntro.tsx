/**
 * Introduction screen (G5.2B). Shows set framing only — no answers, deltas,
 * calculations, future snapshots, or artifact internals. Focus moves to the
 * heading on mount.
 */
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LegacyMasteryPlayerQuestion } from "../contracts/playerQuestion";
import { MasteryPatchBadge } from "./MasteryPatchBadge";

// This intro screen is written for the fixed two-champion teaching-scenario
// framing (`{championA} E vs {championB} E`), so it takes the narrowed legacy
// type. An atomic-recall set's intro is a Phase 4C follow-up concern — this
// slice's dev seam starts an atomic-recall session straight into the question
// phase (see `pages/dev/mastery/AtomicRecallPrototypePage.tsx`).
export function MasteryIntro({
  firstQuestion,
  totalSteps,
  onStart,
}: {
  firstQuestion: LegacyMasteryPlayerQuestion;
  totalSteps: number;
  onStart: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const { championA, championB } = firstQuestion.matchupIdentity;
  return (
    <section aria-label="Mastery Set introduction" className="space-y-4">
      <h1
        ref={headingRef}
        tabIndex={-1}
        data-testid="mastery-intro-heading"
        className="text-xl font-bold outline-none"
      >
        {championA} E vs {championB} E
      </h1>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] uppercase">
          {championA} vs {championB}
        </Badge>
        <MasteryPatchBadge patchDisplay={firstQuestion.patchDisplay} />
        <Badge variant="secondary" className="text-[10px]" data-testid="mastery-curated-badge">
          Curated teaching scenario
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        A {totalSteps}-question teaching set. It is a curated teaching scenario and is
        <strong> not</strong> presented as a proven or popular meta build.
      </p>
      <p className="text-sm text-muted-foreground">
        Later questions reuse state that was changed earlier in the set — an applied
        ability-haste effect and an applied hit carry forward between questions.
      </p>

      <Button onClick={onStart} data-testid="mastery-start-button">
        Start the Mastery Set
      </Button>
    </section>
  );
}
