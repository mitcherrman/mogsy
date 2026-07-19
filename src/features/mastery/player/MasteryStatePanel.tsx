/**
 * Display-only canonical-state panel (G5.2B; J1 player-safe pass).
 *
 * Renders champions' current health, optional backend-provided maximum, resource,
 * and active authored effects from a parsed `MasteryStateView`. It NEVER invents
 * a maximum health value: when `maxHealth` is null it shows only the absolute
 * number (never "maximum unavailable"). Player-facing only — no snapshot ids,
 * validation status, or internal stat slugs are shown here (those live on the
 * admin reviewer route).
 */
import type { MasteryChampionView, MasteryStateView } from "../contracts/stateView";
import { MasteryChampionPortrait } from "./MasteryChampionPortrait";
import { effectLabel, humanizeResource } from "./playerFormat";

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
        // No maximum in this scenario — show the absolute value only, with a thin
        // neutral bar for visual rhythm. Never surface "maximum unavailable".
        <div
          className="h-3.5 overflow-hidden rounded-full border border-border bg-muted"
          aria-label={`${name} health ${currentHealth}`}
        >
          <div className="h-full w-full rounded-full bg-emerald-500/60" />
        </div>
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
      <div className="flex items-center gap-2">
        <MasteryChampionPortrait
          championId={champion.championId}
          displayName={champion.displayName}
          size={28}
        />
        <h4 className="text-sm font-semibold">{name}</h4>
      </div>
      <HealthMeter champion={champion} />
      {champion.resourceType && champion.currentResource !== null && (
        <p className="text-[11px] text-muted-foreground">
          {champion.currentResource}
          {champion.maxResource !== null && ` / ${champion.maxResource}`} {humanizeResource(champion.resourceType)}
        </p>
      )}
      {champion.activeEffects.length > 0 && (
        <ul data-testid={`mastery-effects-${champion.championId}`} className="flex flex-wrap gap-1">
          {champion.activeEffects.map((e, i) => (
            <li key={`${e.effectId}-${i}`}>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                {effectLabel(e)}
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
    </section>
  );
}
