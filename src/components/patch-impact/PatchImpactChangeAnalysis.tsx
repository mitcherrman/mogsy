import { Component, type ReactNode } from "react";
import { usePatchImpactLoader } from "@/hooks/usePatchImpactLoader";
import { isImpactScopedLine } from "@/lib/patch-impact/eligibility";
import type { PatchReportCard, PatchReportChange } from "@/lib/patch-reports/api";
import type { PatchReportChangeContext } from "@/components/patch-reports/PatchReportEntrySlots";
import { PatchImpact } from "./PatchImpact";
import { toPresentationState } from "./presentation-state";

const LoadedPatchImpact = ({
  card,
  change,
  patchVersion,
}: {
  card: PatchReportCard;
  change: PatchReportChange;
  patchVersion: string;
}) => {
  const loader = usePatchImpactLoader({ card, change, patchVersion });
  const { analysis, projectionStatus, onRequestProjection } = toPresentationState(loader);
  return (
    <PatchImpact
      analysis={analysis}
      projectionStatus={projectionStatus}
      onRequestProjection={onRequestProjection}
    />
  );
};

/**
 * Impact is an annotation: if anything inside it throws (a payload the analyzer
 * cannot read), drop the annotation and keep Riot's line and the rest of the
 * report on screen.
 */
class ImpactBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Patch Report `changeAnalysis` slot body for PH2 Patch Impact.
 *
 * Lines outside Champions › Base Stats render nothing and mount no loader, so a
 * report with hundreds of lines pays only for its Base Stats rows. In-scope
 * lines mount the lazy loader; nothing is fetched until the reader opens Explore
 * on a row whose projection needs evidence.
 */
export const PatchImpactChangeAnalysis = ({
  ctx,
  patchVersion,
}: {
  ctx: PatchReportChangeContext;
  patchVersion: string;
}) => {
  const card = ctx.entity.card;
  if (!isImpactScopedLine(card, ctx.change)) return null;
  return (
    <ImpactBoundary>
      <LoadedPatchImpact card={card} change={ctx.change} patchVersion={patchVersion} />
    </ImpactBoundary>
  );
};
