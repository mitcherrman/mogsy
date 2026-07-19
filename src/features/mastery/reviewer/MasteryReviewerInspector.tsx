/**
 * Top-level Mastery reviewer workbench (G5.2C).
 *
 * Prop-driven and read-only: it accepts a parsed `MasteryReviewArtifact` +
 * `MasteryReviewRecord` (and the raw object for the JSON view) so it can later
 * consume a backend response without architectural change. It never mutates the
 * fixture, calls the network, computes a value, or generates an ID.
 *
 * Layout: header on top; a two-column workbench below — the ordered question list
 * (stacks above the detail on mobile) and a tabbed detail/artifact area.
 */
import { useState } from "react";
import type { MasteryReviewArtifact, MasteryReviewRecord } from "../contracts/review";
import { JsonDisclosure } from "./_shared";
import { MasteryReviewerHeader } from "./MasteryReviewerHeader";
import { MasteryQuestionList } from "./MasteryQuestionList";
import { MasteryQuestionInspector } from "./MasteryQuestionInspector";
import { MasteryArtifactSummary } from "./MasteryArtifactSummary";
import { MasteryTransitionInspector } from "./MasteryTransitionInspector";
import { MasterySuppressionInspector } from "./MasterySuppressionInspector";
import { MasteryCapsuleEligibilityPanel } from "./MasteryCapsuleEligibilityPanel";
import { MasterySourceInspector } from "./MasterySourceInspector";
import { MasteryIdentityInspector } from "./MasteryIdentityInspector";
import { MasteryReviewStatusPanel } from "./MasteryReviewStatusPanel";

export function MasteryReviewerInspector({
  artifact,
  reviewRecord,
  rawArtifact,
}: {
  artifact: MasteryReviewArtifact;
  reviewRecord: MasteryReviewRecord;
  rawArtifact?: unknown;
}) {
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState("question");
  const step = artifact.steps[selected] ?? artifact.steps[0];
  const patchLabel = String((artifact.patchDescriptor as Record<string, unknown>).game_patch_display ?? "");

  const TABS: { id: string; label: string }[] = [
    { id: "question", label: "Question" },
    { id: "summary", label: "Summary & patch" },
    { id: "transitions", label: "Transitions" },
    { id: "mechanics", label: "Mechanics" },
    { id: "capsules", label: "Capsules" },
    { id: "identity", label: "Identity" },
    { id: "review", label: "Review" },
    { id: "raw", label: "Raw JSON" },
  ];

  return (
    <div data-testid="mastery-reviewer-inspector" className="mx-auto w-full max-w-6xl space-y-4 p-4">
      <MasteryReviewerHeader artifact={artifact} reviewRecord={reviewRecord} patchDisplay={patchLabel} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <MasteryQuestionList steps={artifact.steps} selectedIndex={selected} onSelect={setSelected} />
        </aside>

        <div className="min-w-0">
          <div role="tablist" aria-label="Artifact sections" className="flex flex-wrap gap-1 overflow-x-auto border-b border-border pb-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`mastery-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`mastery-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors motion-reduce:transition-none ${
                  tab === t.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            role="tabpanel"
            id={`mastery-panel-${tab}`}
            aria-labelledby={`mastery-tab-${tab}`}
            className="mt-3"
          >
            {tab === "question" && <MasteryQuestionInspector step={step} artifact={artifact} />}
            {tab === "summary" && <MasteryArtifactSummary artifact={artifact} />}
            {tab === "transitions" && <MasteryTransitionInspector artifact={artifact} />}
            {tab === "mechanics" && <MasterySuppressionInspector artifact={artifact} />}
            {tab === "capsules" && <MasteryCapsuleEligibilityPanel artifact={artifact} />}
            {tab === "identity" && <MasteryIdentityInspector artifact={artifact} />}
            {tab === "review" && (
              <div className="space-y-4">
                <MasteryReviewStatusPanel reviewRecord={reviewRecord} />
                <MasterySourceInspector artifact={artifact} />
              </div>
            )}
            {tab === "raw" && (
              <JsonDisclosure
                value={rawArtifact ?? artifact}
                label="Full reviewer artifact JSON"
                testId="artifact-raw-json-trigger"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
