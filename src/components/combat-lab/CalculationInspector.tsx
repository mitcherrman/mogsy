/**
 * Polished, public-ready calculation inspector for the 1v1 Combat Lab.
 *
 * Shows the authoritative math behind the selected action: formula text +
 * the exact values the server's evaluator substituted, the damage-mitigation
 * pipeline, shield absorption, and target HP before → after. Every number
 * here is read straight off the backend response for
 * `/api/combat-lab/basic-attack` / `/api/combat-lab/active` — see
 * `lib/combat-lab/calculationEvidence.ts` for exact field provenance. This
 * component computes no damage, no mitigation, and no HP; it only labels and
 * arranges backend values.
 *
 * Distinct from the dev-only DamageBreakdownPanel / MitigationBreakdownPanel
 * / DeveloperPanel further down the page: those are raw diagnostic surfaces
 * gated behind Dev Mode. This panel is always visible, uses no internal
 * ids/JSON in its default view, and only reveals the resolved formula inputs
 * behind a "Show calculation inputs" toggle.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Sparkles, Swords } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { TimelineEvent, SandboxStepResponse } from "@/lib/combat-lab/api";
import {
  formulaEventFor,
  formulaEvidence,
  hasNoFormulaEvidence,
  isChampionRuntimeAction,
  pipelineEventFor,
  pipelineStages,
  primaryHp,
  shieldAbsorbed,
} from "@/lib/combat-lab/calculationEvidence";
import {
  getAbilityIconUrl,
  getChampionSquareIconUrl,
  inferActionAbilitySlot,
} from "@/lib/combat-lab/abilityIcons";
import { useChampionAssets, getChampionIcon } from "@/hooks/useChampionAssets";

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.abs(value % 1) < 1e-6 ? value : Number(value.toFixed(digits));
  return rounded.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const DAMAGE_TYPE_TONE: Record<string, string> = {
  physical: "border-l-orange-400/70 text-orange-300",
  magic: "border-l-violet-400/70 text-violet-300",
  true: "border-l-slate-200/70 text-slate-200",
};

function toneForDamageType(damageType: string | null | undefined): string {
  const key = (damageType ?? "").toLowerCase();
  return DAMAGE_TYPE_TONE[key] ?? "border-l-muted-foreground/50 text-foreground";
}

export type CalculationInspectorEntry = {
  label: string;
  action_id?: string;
  attacker: string;
  defender: string;
  events: TimelineEvent[];
  response: SandboxStepResponse | unknown;
};

export function CalculationInspector({
  entry,
  attackerChampion,
}: {
  entry: CalculationInspectorEntry | null;
  attackerChampion?: string | null;
}) {
  const { data: manifest } = useChampionAssets();
  const [showInputs, setShowInputs] = useState(false);

  if (!entry) {
    return (
      <Card className="border-border/60 bg-card/60 backdrop-blur-sm" data-testid="calculation-inspector">
        <CardContent className="p-4 text-sm text-muted-foreground">
          Perform an action to see the calculation behind it.
        </CardContent>
      </Card>
    );
  }

  const events = entry.events ?? [];
  const response = (entry.response ?? {}) as SandboxStepResponse;
  const hp = primaryHp(response);
  const runtimeOnly = isChampionRuntimeAction(events);
  const noEvidence = hasNoFormulaEvidence(events);
  const formulaEvent = formulaEventFor(events);
  const diagnostics = formulaEvent ? formulaEvidence(formulaEvent) : null;
  const pipeEvent = pipelineEventFor(events);
  const stages = pipeEvent ? pipelineStages(pipeEvent) : [];
  const shield = pipeEvent ? shieldAbsorbed(pipeEvent) : null;
  const damageType = pipeEvent?.damage_type ?? events.find((e) => e.damage_type)?.damage_type ?? null;
  const tone = toneForDamageType(damageType as string | null);

  const slot = inferActionAbilitySlot(entry.action_id, entry.label);
  const abilityIconUrl = slot ? getAbilityIconUrl(attackerChampion, slot) : null;
  const headerIconUrl =
    abilityIconUrl ?? getChampionIcon(manifest ?? null, attackerChampion) ?? getChampionSquareIconUrl(attackerChampion);

  return (
    <Card className="border-border/60 bg-card/60 backdrop-blur-sm" data-testid="calculation-inspector">
      <CardHeader className="px-3.5 pb-2 pt-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground/85">
          <Sparkles className="h-3.5 w-3.5" />
          Calculation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-3.5 pb-3.5">
        <InspectorHeader
          label={entry.label}
          iconUrl={headerIconUrl}
          attacker={entry.attacker}
          defender={entry.defender}
          appliedDamage={hp?.applied_hp_damage ?? null}
        />

        {runtimeOnly ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground" data-testid="champion-runtime-note">
            This ability's damage came from a champion-specific implementation rather than a
            general formula, so no formula substitution is shown. The pipeline and HP result
            below are still the engine's authoritative numbers.
          </p>
        ) : noEvidence ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground" data-testid="formula-unavailable-note">
            Formula breakdown isn't available for this action. The HP result below is still the
            engine's authoritative number.
          </p>
        ) : (
          <FormulaBlock
            formulaText={diagnostics?.formulaText ?? null}
            bindings={diagnostics?.formulaBindings ?? null}
            error={diagnostics?.error ?? null}
            showInputs={showInputs}
            onToggleInputs={() => setShowInputs((v) => !v)}
          />
        )}

        {stages.length > 0 && (
          <DamagePipeline stages={stages} shield={shield} tone={tone} />
        )}

        <HpResult hp={hp} defender={entry.defender} />
      </CardContent>
    </Card>
  );
}

function InspectorHeader({
  label,
  iconUrl,
  attacker,
  defender,
  appliedDamage,
}: {
  label: string;
  iconUrl: string | null;
  attacker: string;
  defender: string;
  appliedDamage: number | null;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconUrl]);

  return (
    <div className="flex items-center justify-between gap-2" data-testid="calculation-header">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background ring-1 ring-inset ring-white/10">
          {iconUrl && !broken ? (
            <img
              src={iconUrl}
              alt={label}
              className="h-full w-full object-cover"
              onError={() => setBroken(true)}
            />
          ) : (
            <Swords className="h-4 w-4 text-foreground/60" />
          )}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold">{label}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {attacker} <span className="mx-0.5">→</span> {defender}
          </div>
        </div>
      </div>
      {appliedDamage !== null && appliedDamage > 0 && (
        <div className="shrink-0 text-right">
          <div className="text-xl font-black tabular-nums text-destructive">
            −{formatNumber(appliedDamage, 0)}
          </div>
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">HP damage</div>
        </div>
      )}
    </div>
  );
}

function FormulaBlock({
  formulaText,
  bindings,
  error,
  showInputs,
  onToggleInputs,
}: {
  formulaText: string | null;
  bindings: Record<string, number> | null;
  error: string | null;
  showInputs: boolean;
  onToggleInputs: () => void;
}) {
  const hasBindings = !!bindings && Object.keys(bindings).length > 0;
  return (
    <div className="space-y-1.5">
      {formulaText ? (
        <div className="rounded bg-background/60 p-2 font-mono text-[12px]" data-testid="formula-text">
          {formulaText}
        </div>
      ) : (
        <div className="text-[12px] text-muted-foreground">No formula text on this action.</div>
      )}

      {hasBindings && (
        <Collapsible open={showInputs} onOpenChange={onToggleInputs}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              data-testid="calculation-inputs-toggle"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showInputs && "rotate-180")} />
              {showInputs ? "Hide" : "Show"} calculation inputs
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <table className="mt-1.5 w-full text-left text-[11px]" data-testid="formula-bindings-table">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pr-2 font-medium">Input</th>
                  <th className="font-medium">Value used</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bindings!).map(([k, v]) => (
                  <tr key={k}>
                    <td className="pr-2 font-mono">{k}</td>
                    <td className="font-mono">{formatNumber(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsibleContent>
        </Collapsible>
      )}

      {error && <div className="text-[11px] text-destructive">Formula error: {error}</div>}
    </div>
  );
}

function DamagePipeline({
  stages,
  shield,
  tone,
}: {
  stages: { key: string; label: string; value: number }[];
  shield: number | null;
  tone: string;
}) {
  return (
    <div data-testid="damage-pipeline">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Damage pipeline
      </div>
      <div className="space-y-1">
        {stages.map((stage, i) => (
          <div key={stage.key}>
            {i > 0 && <div className="pl-3 text-muted-foreground/50">↓</div>}
            <div
              data-testid="pipeline-stage-row"
              className={cn(
                "flex items-center justify-between rounded border-l-2 bg-background/50 px-2 py-1 text-[12px]",
                tone
              )}
            >
              <span className="text-muted-foreground">{stage.label}</span>
              <span className="font-mono font-semibold">{formatNumber(stage.value)}</span>
            </div>
          </div>
        ))}
        {shield !== null && shield > 0 && (
          <>
            <div className="pl-3 text-muted-foreground/50">↓</div>
            <div className="flex items-center justify-between rounded border-l-2 border-l-sky-400/70 bg-background/50 px-2 py-1 text-[12px] text-sky-300">
              <span className="text-muted-foreground">Shield absorbs</span>
              <span className="font-mono font-semibold">{formatNumber(shield)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HpResult({
  hp,
  defender,
}: {
  hp: { hp_before: number; hp_after: number; applied_hp_damage: number } | null;
  defender: string;
}) {
  if (!hp) {
    return (
      <div className="border-t border-border/40 pt-2 text-[12px] text-muted-foreground" data-testid="hp-result">
        No HP change was applied by this action.
      </div>
    );
  }
  const maxRef = Math.max(hp.hp_before, hp.hp_after, 1);
  return (
    <div className="space-y-1 border-t border-border/40 pt-2" data-testid="hp-result">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {defender}'s HP
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/30">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500/40 transition-[width] duration-500"
          style={{ width: `${Math.min(100, (hp.hp_before / maxRef) * 100)}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-destructive/70 transition-[width] duration-500"
          style={{ width: `${Math.min(100, (hp.hp_after / maxRef) * 100)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[13px] font-semibold tabular-nums">
        <span>
          {formatNumber(hp.hp_before, 0)} → {formatNumber(hp.hp_after, 0)} HP
        </span>
        {hp.applied_hp_damage > 0 && (
          <span className="text-destructive">−{formatNumber(hp.applied_hp_damage, 0)}</span>
        )}
      </div>
    </div>
  );
}

export default CalculationInspector;
