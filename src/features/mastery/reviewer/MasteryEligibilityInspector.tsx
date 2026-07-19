/**
 * Per-step G2 eligibility evidence (G5.2C). Exposes the full evidence rather than
 * collapsing it to a single green badge.
 */
import { CheckCircle2 } from "lucide-react";
import type { MasteryReviewStep } from "../contracts/review";
import { JsonDisclosure, KeyValueList, SectionHeading } from "./_shared";

export function MasteryEligibilityInspector({ step }: { step: MasteryReviewStep }) {
  const e = step.eligibilityEvidence as Record<string, unknown>;
  const eligible = e.eligible === true;
  return (
    <section aria-label="Eligibility evidence" className="space-y-2" data-testid="eligibility-inspector">
      <SectionHeading>Eligibility evidence</SectionHeading>
      <div role="status" data-eligible={eligible ? "true" : "false"} className="flex items-center gap-2 text-sm">
        {eligible && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
        <span className="font-medium">{eligible ? "Eligible" : "Not eligible"}</span>
      </div>
      <KeyValueList
        entries={[
          ["operation_type", e.operation_type],
          ["adapter_id", e.adapter_id],
          ["certification_state", e.certification_state],
          ["profile_version", e.profile_version],
          ["patch_key_digest", e.patch_key_digest],
          ["validation_context_digest", e.validation_context_digest],
        ]}
      />
      <JsonDisclosure value={e.source_records} label="Eligibility source records" testId="eligibility-sources-trigger" />
      <JsonDisclosure value={e} label="Full eligibility evidence" testId="eligibility-full-trigger" />
    </section>
  );
}
