/**
 * The Pro Play question card: short stem, visual context, answer-safe
 * metadata before the answer, statistical evidence after it.
 *
 * COMPOSITION ORDER IS THE PRODUCT. Chips first (what is being asked, and
 * over what scope), then the champion art that makes it a League question,
 * then the short stem, then the symmetric subject cards a reader needs to
 * tell the two options apart, then the choices. The stem stays exactly as the
 * server wrote it.
 *
 * ADDITIVE BY CONSTRUCTION. `context` is optional: with none, this renders
 * the same topic label and stem the surface shipped with before Step 1, and
 * nothing else changes. That is what lets the backend contract roll forward
 * or back without a frontend release.
 */
import ProPlayChampionAnchor, { championMediaKey } from "./ProPlayChampionAnchor";
import ProPlayContextRail from "./ProPlayContextRail";
import ProPlaySubjectCards from "./ProPlaySubjectCards";
import type { ProPlayQuestionContext } from "@/lib/pro-play/contract";

export interface ProPlayQuestionCardProps {
  /** Fallback label shown when there is no context ("Champion"/"Player"/"Team"). */
  topic: string;
  questionText: string;
  context: ProPlayQuestionContext | null;
  children: React.ReactNode;
}

export default function ProPlayQuestionCard({
  topic,
  questionText,
  context,
  children,
}: ProPlayQuestionCardProps) {
  if (!context) {
    return (
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
          {topic}
        </p>
        <h2 data-pro-play-question className="mb-5 text-lg font-medium">
          {questionText}
        </h2>
        {children}
      </div>
    );
  }

  const stem = (
    <h2 data-pro-play-question className="text-lg font-medium leading-snug">
      {questionText}
    </h2>
  );

  return (
    <div>
      {/* Only a CHAMPION anchor has art. A player, team or scope anchor has a
          null media key by design (those images are a deferred ingestion), so
          the band is skipped entirely rather than rendered empty — an empty
          200px slab would push the stem down for no information. */}
      {championMediaKey(context.anchor) ? (
        <ProPlayChampionAnchor anchor={context.anchor} className="mb-4">
          <ProPlayContextRail context={context} className="mb-3" />
          {stem}
        </ProPlayChampionAnchor>
      ) : (
        <div className="mb-4">
          <ProPlayContextRail context={context} className="mb-3" />
          {stem}
        </div>
      )}

      <ProPlaySubjectCards subjects={context.subjects} className="mb-4" />

      {children}
    </div>
  );
}
