/**
 * Calculation & recomputation inspector (G5.2C). Displays backend calculation
 * evidence verbatim — expressions are shown as text and NEVER evaluated. No
 * value is recomputed in TypeScript.
 */
import { CheckCircle2, XCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JsonDisclosure, KeyValueList, SectionHeading } from "./_shared";

interface CalcStep {
  order: number;
  description: string;
  expression: string;
  result: number;
}

function asCalcSteps(v: unknown): CalcStep[] {
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is CalcStep => !!s && typeof s === "object");
}

export function MasteryCalculationInspector({ calculationResult }: { calculationResult: Readonly<Record<string, unknown>> }) {
  const c = calculationResult;
  const steps = asCalcSteps(c.steps);
  const recomp = (c.recomputation ?? {}) as Record<string, unknown>;
  const matches = recomp.matches === true;
  const warnings = Array.isArray(c.warnings) ? (c.warnings as unknown[]) : [];
  const stateChanges = Array.isArray(c.state_changes) ? (c.state_changes as unknown[]) : [];

  return (
    <section aria-label="Calculation evidence" className="space-y-3">
      <SectionHeading>Calculation</SectionHeading>
      <KeyValueList
        entries={[
          ["value", c.value],
          ["unit", c.unit],
          ["runtime_version", c.runtime_version],
        ]}
      />

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Ordered steps</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Expression</TableHead>
                <TableHead className="text-right">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody data-testid="calc-steps-table">
              {steps.map((s) => (
                <TableRow key={s.order}>
                  <TableCell className="tabular-nums">{s.order}</TableCell>
                  <TableCell className="text-xs">{s.description}</TableCell>
                  {/* Expression is display text only — never evaluated. */}
                  <TableCell><code className="break-all font-mono text-[11px]">{s.expression}</code></TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{s.result}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div
        role="status"
        data-testid="recomputation-status"
        data-matches={matches ? "true" : "false"}
        className="flex items-center gap-2 text-sm"
      >
        {matches ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        ) : (
          <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
        )}
        <span className="font-medium">
          Recomputation {matches ? "verified (matches)" : "did not match"}
        </span>
        {"recomputed_value" in recomp && (
          <span className="text-xs text-muted-foreground tabular-nums">
            recomputed {String(recomp.recomputed_value)} {String(recomp.recomputed_unit ?? "")}
          </span>
        )}
      </div>

      {warnings.length > 0 && (
        <div>
          <SectionHeading>Warnings</SectionHeading>
          <ul className="list-disc pl-5 text-xs">
            {warnings.map((w, i) => <li key={i}>{String(w)}</li>)}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Proposed state changes: <span className="tabular-nums">{stateChanges.length}</span>
        </p>
      </div>

      {"provenance" in c && <JsonDisclosure value={c.provenance} label="Calculation provenance" testId="calc-provenance-trigger" />}
    </section>
  );
}
