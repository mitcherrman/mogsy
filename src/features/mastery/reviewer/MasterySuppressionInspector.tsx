/**
 * Supported and suppressed mechanics (G5.2C). Two separate panels. Suppressed
 * entries show verbatim canonical reason codes and expose that NO calculation
 * result is attached — only audit evidence.
 */
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MasteryReviewArtifact } from "../contracts/review";
import { SectionHeading } from "./_shared";

function get(o: unknown, k: string): string {
  return o && typeof o === "object" ? String((o as Record<string, unknown>)[k] ?? "") : "";
}

export function MasterySuppressionInspector({ artifact }: { artifact: MasteryReviewArtifact }) {
  return (
    <div className="space-y-4">
      <section aria-label="Supported mechanics" className="space-y-2">
        <SectionHeading>Supported mechanics</SectionHeading>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Champion</TableHead>
                <TableHead>Ability</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Question family</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="supported-table">
              {artifact.supportedMechanicDeclarations.map((d, i) => (
                <TableRow key={i} data-testid={`supported-row-${i}`}>
                  <TableCell className="text-xs">{get(d, "champion_id")}</TableCell>
                  <TableCell className="text-xs">{get(d, "ability_key")}</TableCell>
                  <TableCell className="text-xs">{get(d, "operation")}</TableCell>
                  <TableCell className="text-xs">{get(d, "question_family")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section aria-label="Suppressed mechanics" className="space-y-2">
        <SectionHeading>Suppressed mechanics</SectionHeading>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Champion</TableHead>
                <TableHead>Ability</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Reason code</TableHead>
                <TableHead>Calc result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="suppressed-table">
              {artifact.suppressedMechanicDeclarations.map((d, i) => {
                const hasCalc = d && typeof d === "object" && "calculation_result" in (d as Record<string, unknown>);
                return (
                  <TableRow key={i} data-testid={`suppressed-row-${i}`}>
                    <TableCell className="text-xs">{get(d, "champion_id")}</TableCell>
                    <TableCell className="text-xs">{get(d, "ability_key")}</TableCell>
                    <TableCell className="text-xs">{get(d, "operation")}</TableCell>
                    {/* Canonical reason code shown verbatim. */}
                    <TableCell><code className="font-mono text-[11px]" data-testid={`suppressed-reason-${i}`}>{get(d, "reason_code")}</code></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {hasCalc ? "present" : "absent (audit only)"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
