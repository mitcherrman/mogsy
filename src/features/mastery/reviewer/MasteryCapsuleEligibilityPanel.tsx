/**
 * Ranked capsule eligibility across all six steps (G5.2C), with the four known
 * capsule IDs where the fixture provides them. Extraction is never performed in
 * the browser.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { MasteryReviewArtifact } from "../contracts/review";
import { SectionHeading } from "./_shared";

export function MasteryCapsuleEligibilityPanel({ artifact }: { artifact: MasteryReviewArtifact }) {
  const capsuleByStep = new Map(artifact.rankedCapsules.map((c) => [c.sourceSequenceIndex, c]));
  return (
    <section aria-label="Ranked capsule eligibility" className="space-y-2">
      <SectionHeading>Ranked capsule eligibility</SectionHeading>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Q</TableHead>
              <TableHead>Eligible</TableHead>
              <TableHead>Requires rewording</TableHead>
              <TableHead>Standalone complete</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Capsule ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody data-testid="capsule-table">
            {artifact.steps.map((s) => {
              const cap = s.rankedCapsuleEligibility;
              const capsule = capsuleByStep.get(s.sequenceIndex);
              return (
                <TableRow key={s.stepId} data-testid={`capsule-row-${s.sequenceIndex}`}>
                  <TableCell className="text-xs font-semibold">Q{s.sequenceIndex + 1}</TableCell>
                  <TableCell>
                    <Badge variant={cap.eligible ? "default" : "outline"} className="text-[10px]">
                      {cap.eligible ? "eligible" : "chain-only"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{String(cap.requiresRewording)}</TableCell>
                  <TableCell className="text-xs">{String(cap.standaloneStateComplete)}</TableCell>
                  <TableCell><code className="font-mono text-[10px]">{cap.reasonCode ?? "—"}</code></TableCell>
                  <TableCell>
                    {capsule ? (
                      <code className="break-all font-mono text-[10px]" title={capsule.capsuleId}>
                        {capsule.capsuleId}
                      </code>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        {artifact.rankedCapsules.length} standalone Ranked capsules provided by the backend. Extraction
        is performed by the backend, never in the browser.
      </p>
    </section>
  );
}
