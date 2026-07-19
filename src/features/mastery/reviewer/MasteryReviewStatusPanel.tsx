/**
 * Mutable review record rendered READ-ONLY (G5.2C). No mutation is possible; any
 * controls are disabled and the surface is labeled a read-only fixture prototype.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MasteryReviewRecord } from "../contracts/review";
import { IdValue, JsonDisclosure, SectionHeading } from "./_shared";

export function MasteryReviewStatusPanel({ reviewRecord }: { reviewRecord: MasteryReviewRecord }) {
  return (
    <section aria-label="Review and publication" className="space-y-3" data-testid="review-status-panel">
      <div className="flex items-center justify-between">
        <SectionHeading>Review &amp; publication</SectionHeading>
        <Badge variant="outline" className="text-[10px]" data-testid="review-readonly-label">
          Read-only fixture prototype
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" data-testid="review-reviewer-status">
          reviewer: {reviewRecord.reviewerStatus}
        </Badge>
        <Badge variant="secondary" data-testid="review-publication-status">
          publication: {reviewRecord.publicationStatus}
        </Badge>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Reviewer notes</p>
        <p className="text-xs" data-testid="review-notes">
          {reviewRecord.reviewerNotes || "(none)"}
        </p>
      </div>

      <IdValue label="source hash" value={reviewRecord.sourceHash} />

      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Revision history ({reviewRecord.revisionHistory.length})
        </p>
        <JsonDisclosure value={reviewRecord.revisionHistory} label="Revision history" testId="revision-history-trigger" />
      </div>

      {/* Disabled controls: demonstrate the future workflow shape without implying
          any mutation works in this fixture prototype. */}
      <div className="flex flex-wrap gap-2" aria-label="Review actions (disabled)">
        {["Approve", "Request changes", "Reject", "Publish"].map((a) => (
          <Button key={a} type="button" size="sm" variant="outline" disabled data-testid={`review-action-${a.toLowerCase().replace(/\s+/g, "-")}`}>
            {a}
          </Button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Actions are disabled — this inspector never mutates the artifact or review record.
      </p>
    </section>
  );
}
