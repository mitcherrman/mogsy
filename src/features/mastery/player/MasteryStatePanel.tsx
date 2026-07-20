/**
 * Display-only canonical-state panel (G5.2B; J1 player-safe pass; G4 progression).
 *
 * Renders champions' current health, optional backend-provided maximum, resource,
 * and active authored effects from a parsed `MasteryStateView`. It NEVER invents
 * a maximum health value: when `maxHealth` is null it shows only the absolute
 * number (never "maximum unavailable"). Player-facing only — no snapshot ids,
 * validation status, or internal stat slugs are shown here (those live on the
 * admin reviewer route).
 *
 * When a set supplies progression display facts (level, ability ranks, AP, gold,
 * target resistances, inventory — the Ahri chain does not), a gated progression
 * block renders them; sets without those facts are visually unchanged.
 */
import { useState } from "react";

import type { MasteryChampionView, MasteryStateView } from "../contracts/stateView";
import { MasteryChampionPortrait } from "./MasteryChampionPortrait";
import { useMasteryAssets } from "./MasteryAssets";
import { effectLabel, humanizeResource } from "./playerFormat";

/** A champion carries progression detail only when a set populates these display
 *  facts, so the extra block never affects sets (e.g. Ahri) that omit them. */
function hasProgression(c: MasteryChampionView): boolean {
  return (
    c.abilityPower !== null ||
    c.totalAttackDamage !== null ||
    c.gold !== null ||
    c.archetype !== null ||
    c.inventoryItems.length > 0
  );
}

function ItemIcon({ name, itemId }: { name: string; itemId: number | null }) {
  const { itemIconUrl } = useMasteryAssets();
  const [broken, setBroken] = useState(false);
  const url = itemIconUrl(itemId);
  return (
    <span
      data-testid={`mastery-item-${itemId ?? name}`}
      className="inline-flex items-center gap-1 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[11px]"
    >
      {url && !broken && (
        <img
          src={url}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 rounded-sm"
          onError={() => setBroken(true)}
          loading="lazy"
        />
      )}
      <span>{name}</span>
    </span>
  );
}

const _ABILITY_ORDER = ["Q", "W", "E", "R"];

function ProgressionDetails({ champion }: { champion: MasteryChampionView }) {
  const ranks = Object.entries(champion.abilityRanks)
    .filter(([, v]) => v > 0)
    .sort((a, b) => _ABILITY_ORDER.indexOf(a[0]) - _ABILITY_ORDER.indexOf(b[0]));
  return (
    <div
      data-testid={`mastery-progression-${champion.championId}`}
      className="space-y-1.5 border-t border-border/60 pt-1.5 text-[11px]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
        {champion.level !== null && (
          <span>
            <span className="font-medium text-foreground">Lv {champion.level}</span>
          </span>
        )}
        {ranks.length > 0 && (
          <span className="flex items-center gap-1" data-testid={`mastery-ranks-${champion.championId}`}>
            {ranks.map(([k, v]) => (
              <span key={k} className="rounded bg-primary/10 px-1 py-0.5 font-medium text-primary">
                {k}
                {v}
              </span>
            ))}
          </span>
        )}
        {champion.abilityPower !== null && champion.abilityPower > 0 && (
          <span>AP <span className="font-medium text-foreground">{champion.abilityPower}</span></span>
        )}
        {champion.totalAttackDamage !== null && (
          <span data-testid={`mastery-ad-${champion.championId}`}>
            AD <span className="font-medium text-foreground">{Math.round(champion.totalAttackDamage)}</span>
            {champion.baseAttackDamage !== null &&
              champion.bonusAttackDamage !== null &&
              champion.bonusAttackDamage > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({Math.round(champion.baseAttackDamage)}+{Math.round(champion.bonusAttackDamage)})
                </span>
              )}
          </span>
        )}
        {champion.gold !== null && (
          <span data-testid={`mastery-gold-${champion.championId}`}>
            Gold <span className="font-medium text-foreground">{champion.gold}</span>
          </span>
        )}
        {champion.armor !== null && (
          <span>Armor <span className="font-medium text-foreground">{champion.armor}</span></span>
        )}
        {champion.magicResist !== null && (
          <span>MR <span className="font-medium text-foreground">{champion.magicResist}</span></span>
        )}
      </div>
      {champion.inventoryItems.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid={`mastery-inventory-${champion.championId}`}>
          {champion.inventoryItems.map((it, i) => (
            <ItemIcon key={`${it.itemId ?? it.name}-${i}`} name={it.name} itemId={it.itemId} />
          ))}
        </div>
      )}
    </div>
  );
}

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
      {hasProgression(champion) && <ProgressionDetails champion={champion} />}
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
