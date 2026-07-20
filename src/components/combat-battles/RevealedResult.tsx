// Frozen result presentation. Every number comes straight from the backend's
// applied_hp_damage / healing accounting — nothing is recomputed here, and the
// legacy total_damage/active_damage fields are never used.
import { Trophy } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  decisionReasonCopy, fmtHp, fmtPct, winnerLabel,
} from "@/lib/combat-battles/lifecycle";
import type { FrozenResultPublic, SequenceResult } from "@/lib/combat-battles/types";

function SideResult({ label, r, isWinner }: { label: string; r: SequenceResult; isWinner: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${isWinner ? "border-primary bg-primary/5" : "border-border"}`}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-semibold">{label}</h4>
        {isWinner && (
          <Badge className="gap-1">
            <Trophy className="h-3.5 w-3.5" aria-hidden /> Winner
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Applied HP damage</dt>
        <dd className="text-right font-medium tabular-nums">{fmtHp(r.applied_hp_damage)}</dd>
        <dt className="text-muted-foreground">% of max HP removed</dt>
        <dd className="text-right font-medium tabular-nums">{fmtPct(r.applied_hp_damage_pct)}</dd>
        <dt className="text-muted-foreground">Remaining HP</dt>
        <dd className="text-right font-medium tabular-nums">{fmtHp(r.final_target_hp)}</dd>
        <dt className="text-muted-foreground">Reached lethal</dt>
        <dd className="text-right font-medium">{r.reached_lethal ? "Yes" : "No"}</dd>
        <dt className="text-muted-foreground">Actions executed</dt>
        <dd className="text-right font-medium tabular-nums">{r.executed_action_count}</dd>
        {r.executed_actions_to_lethal != null && (
          <>
            <dt className="text-muted-foreground">Actions to lethal</dt>
            <dd className="text-right font-medium tabular-nums">{r.executed_actions_to_lethal}</dd>
          </>
        )}
        {r.healing_applied > 0 && (
          <>
            <dt className="text-muted-foreground">Self-healing applied</dt>
            <dd className="text-right font-medium tabular-nums">{fmtHp(r.healing_applied)}</dd>
          </>
        )}
      </dl>

      <Accordion type="single" collapsible className="mt-3">
        <AccordionItem value="log" className="border-none">
          <AccordionTrigger className="py-1 text-sm">Combat log ({r.per_action.length})</AccordionTrigger>
          <AccordionContent>
            <ol className="space-y-1 text-xs">
              {r.per_action.map((a) => (
                <li key={a.index} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="text-muted-foreground tabular-nums">{a.index + 1}.</span>
                    <span>{a.type === "basic_attack" ? "Basic attack" : (a.slot ?? a.active_name ?? "Ability")}</span>
                    {a.applied_hp_damage === 0 && (
                      <span className="text-muted-foreground">({a.classification.replace(/_/g, " ")})</span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {a.applied_hp_damage > 0 ? `−${fmtHp(a.applied_hp_damage)} HP` : "—"}
                  </span>
                </li>
              ))}
            </ol>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

export default function RevealedResult({
  result,
  leftName,
  rightName,
  engine,
}: {
  result: FrozenResultPublic;
  leftName: string;
  rightName: string;
  engine?: { engine_version?: string; data_version?: string; patch_version?: string };
}) {
  const winner = result.winner_side;
  const publicWarnings = (result.warnings ?? []).filter((w) => !/blocking/i.test(w));

  return (
    <Card className="border-primary/30 bg-card/70 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" aria-hidden />
          Result: {winnerLabel(winner, leftName, rightName)}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {decisionReasonCopy(result.decision_reason, leftName, rightName)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <SideResult label={leftName} r={result.left_result} isWinner={winner === "left"} />
          <SideResult label={rightName} r={result.right_result} isWinner={winner === "right"} />
        </div>

        {publicWarnings.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
            {publicWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}

        <Accordion type="single" collapsible>
          <AccordionItem value="tech" className="border-none">
            <AccordionTrigger className="py-1 text-xs text-muted-foreground">
              Technical details
            </AccordionTrigger>
            <AccordionContent>
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <dt>Comparison</dt><dd className="break-all">{result.comparison_version}</dd>
                {engine?.engine_version && (<><dt>Engine</dt><dd className="break-all">{engine.engine_version}</dd></>)}
                {engine?.data_version && (<><dt>Data fingerprint</dt><dd className="break-all">{engine.data_version}</dd></>)}
                <dt>Patch</dt><dd>{engine?.patch_version ?? "unknown"}</dd>
                <dt>Result checksum</dt><dd className="break-all">{result.result_checksum}</dd>
              </dl>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
}
