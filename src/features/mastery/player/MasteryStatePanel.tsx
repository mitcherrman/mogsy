/**
 * Display-only canonical-state panel (G5.2B).
 *
 * Renders champions' current health, optional backend-provided maximum, resource,
 * and active authored effects from a parsed `MasteryStateView`. It NEVER invents
 * a maximum health value: when `maxHealth` is null it shows the absolute number
 * and no proportional meter (following the Ranked CombatantPanel discipline).
 */
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { MasteryChampionView, MasteryStateView } from "../contracts/stateView";

function HealthMeter({ champion }: { champion: MasteryChampionView }) {
  const { currentHealth, maxHealth, displayName, championId } = champion;
  const name = displayName ?? championId;
  const pct = maxHealth !== null && maxHealth > 0 ? Math.min(100, Math.round((currentHealth / maxHealth) * 100)) : null;
  return (
    <div data-testid={`mastery-hp-${championId}`}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-semibold">HP</span>
        <span className="tabular-nums text-base font-bold leading-none">
          {currentHealth}
          {maxHealth !== null && (
            <span className="text-xs font-medium text-muted-foreground"> / {maxHealth}</span>
          )}
        </span>
      </div>
      {pct !== null ? (
        <div
          role="meter"
          aria-label={`${name} health`}
          aria-valuenow={currentHealth}
          aria-valuemin={0}
          aria-valuemax={maxHealth as number}
          className="h-3.5 overflow-hidden rounded-full border border-border bg-muted"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${
              pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : "bg-destructive"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p
          className="text-[11px] text-muted-foreground"
          aria-label={`${name} health ${currentHealth}, maximum unavailable`}
        >
          {currentHealth} health (maximum unavailable)
        </p>
      )}
    </div>
  );
}

function ChampionCard({ champion }: { champion: MasteryChampionView }) {
  const name = champion.displayName ?? champion.championId;
  return (
    <div
      data-testid={`mastery-champion-${champion.championId}`}
      className="flex-1 space-y-2 rounded-lg border border-border bg-card/50 p-3"
    >
      <h4 className="text-sm font-semibold">{name}</h4>
      <HealthMeter champion={champion} />
      {champion.resourceType && champion.currentResource !== null && (
        <p className="text-[11px] text-muted-foreground">
          <span className="capitalize">{champion.resourceType}</span>: {champion.currentResource}
          {champion.maxResource !== null && ` / ${champion.maxResource}`}
        </p>
      )}
      {champion.activeEffects.length > 0 && (
        <ul data-testid={`mastery-effects-${champion.championId}`} className="space-y-1">
          {champion.activeEffects.map((e, i) => (
            <li key={`${e.effectId}-${i}`} className="text-[11px]">
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                {e.label}
                {e.magnitude !== null && ` (+${e.magnitude}${e.unit ? ` ${e.unit}` : ""})`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MasteryStatePanel({
  state,
  heading,
}: {
  state: MasteryStateView;
  heading?: string;
}) {
  return (
    <section aria-label={heading ?? "Current state"} className="space-y-2">
      {heading && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{heading}</h3>}
      <div className="flex flex-col gap-2 sm:flex-row">
        <ChampionCard champion={state.championA} />
        <ChampionCard champion={state.championB} />
      </div>
      <Collapsible>
        <CollapsibleTrigger className="text-[11px] text-muted-foreground underline underline-offset-2">
          Technical details
        </CollapsibleTrigger>
        <CollapsibleContent>
          <dl className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
            <div className="flex gap-1">
              <dt className="shrink-0 font-medium">Snapshot:</dt>
              <dd className="truncate" title={state.snapshotId}>{state.snapshotId}</dd>
            </div>
            {state.validationStatus && (
              <div className="flex gap-1">
                <dt className="shrink-0 font-medium">Validation:</dt>
                <dd>{state.validationStatus}</dd>
              </div>
            )}
          </dl>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
