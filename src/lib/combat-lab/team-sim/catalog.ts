/**
 * Catalog validation + the derived lookups every selector is built from.
 *
 * The catalog is the ONLY vocabulary authority for this surface. If a section
 * this UI needs is missing or malformed, the page must say so rather than
 * render controls that look valid — `assertTeamSimCatalog` is what makes
 * "malformed catalog" a first-class state instead of a runtime crash halfway
 * through a selector.
 */
import type {
  AbilitySlot,
  CatalogChampion,
  CatalogChampionAction,
  CatalogItem,
  CatalogRune,
  CritMode,
  OnFailurePolicy,
  RankedAbilitySlot,
  TargetingPolicy,
  TeamSimCatalog,
} from "./contract";

export class MalformedCatalogError extends Error {
  constructor(public readonly field: string) {
    super(`Simulation catalog is malformed (missing or invalid: ${field}).`);
    this.name = "MalformedCatalogError";
  }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Narrow an unknown body to a usable catalog.
 *
 * Deliberately checks only what this UI actually consumes, and checks it
 * strictly: a partially-populated catalog (e.g. zero champions, or a pricing
 * table with no rows) cannot build a correct selector or a correct cost
 * preview, so it is a hard failure rather than an empty dropdown.
 */
export function assertTeamSimCatalog(body: unknown): TeamSimCatalog {
  if (!isObj(body)) throw new MalformedCatalogError("body");
  const need = (cond: boolean, field: string) => {
    if (!cond) throw new MalformedCatalogError(field);
  };

  /** `body.section.key`, or undefined when the section is not an object. */
  const at = (section: unknown, key: string): unknown =>
    isObj(section) ? section[key] : undefined;

  const isNum = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

  need(typeof body.catalog_digest === "string" && !!body.catalog_digest, "catalog_digest");
  need(typeof body.contract_version === "string" && !!body.contract_version, "contract_version");
  need(Array.isArray(body.champions) && body.champions.length > 0, "champions");
  need(Array.isArray(at(body.items, "supported")), "items.supported");
  need(Array.isArray(at(body.runes, "supported")), "runes.supported");
  need(isObj(at(body.ability_rules, "rank_bounds")), "ability_rules.rank_bounds");
  // Without `defaults` the editor would seed every rank at the minimum while
  // the engine silently applies its own defaults — the screen and the
  // simulation would disagree, and only effective_builds would reveal it.
  need(isObj(at(body.ability_rules, "defaults")), "ability_rules.defaults");
  need(Array.isArray(at(body.build_options, "crit_modes")), "build_options.crit_modes");
  // Each bound below turns into `x >= undefined` (always false) if absent, i.e.
  // a silently disabled limit and a guaranteed 422 from the schema.
  need(isNum(at(body.build_options, "max_items_per_combatant")), "build_options.max_items_per_combatant");
  need(isNum(at(body.build_options, "max_runes_per_combatant")), "build_options.max_runes_per_combatant");
  need(Array.isArray(body.targeting_policies) && body.targeting_policies.length > 0, "targeting_policies");
  need(Array.isArray(at(body.action_plan_options, "on_failure")), "action_plan_options.on_failure");
  need(isNum(at(body.action_plan_options, "max_steps_per_plan")), "action_plan_options.max_steps_per_plan");

  need(isObj(body.scheduler_limits), "scheduler_limits");
  for (const key of ["max_duration", "max_events", "max_trace_events"] as const) {
    const section = at(body.scheduler_limits, key);
    // `createDraft` dereferences .default immediately; a missing sub-object
    // throws during render, and the route has no error boundary — the operator
    // would get a blank page instead of the malformed-catalog card.
    need(isNum(at(section, "default")) && isNum(at(section, "maximum")),
      `scheduler_limits.${key}`);
  }

  need(typeof at(body.team_limits, "max_team_size") === "number", "team_limits.max_team_size");

  const costs = at(body.pricing, "costs");
  need(Array.isArray(costs) && costs.length > 0, "pricing.costs");
  for (const row of costs as unknown[]) {
    need(
      isNum(at(row, "team_a_size")) && isNum(at(row, "team_b_size")) && isNum(at(row, "credits")),
      "pricing.costs[]"
    );
  }
  need(Array.isArray(body.unsupported_mechanics), "unsupported_mechanics");

  for (const champion of body.champions as unknown[]) {
    if (!isObj(champion) || typeof champion.name !== "string" || !champion.name) {
      throw new MalformedCatalogError("champions[].name");
    }
    if (!Array.isArray(champion.actions)) {
      throw new MalformedCatalogError(`champions[${champion.name}].actions`);
    }
  }
  return body as unknown as TeamSimCatalog;
}

/* ─────────────────────── derived lookups ─────────────────────── */

/**
 * Pre-computed indexes over one catalog instance. Built once per catalog load
 * (memoized by identity) so a 172-champion / 197-item catalog does not get
 * re-scanned on every keystroke.
 */
/** One row of a searchable multi-select, precomputed once per catalog. */
export type CatalogPickEntry = {
  name: string;
  supported: boolean;
  reason?: string;
  group?: string;
};

export type CatalogIndex = {
  catalog: TeamSimCatalog;
  digest: string;
  contractVersion: string;
  championNames: string[];
  /** Stable <select> option list — rebuilding 172 of these per keystroke is not free. */
  championOptions: Array<{ value: string; label: string }>;
  itemEntries: CatalogPickEntry[];
  runeEntries: CatalogPickEntry[];
  championByName: Map<string, CatalogChampion>;
  supportedItems: CatalogItem[];
  supportedItemNames: Set<string>;
  unsupportedItems: CatalogItem[];
  supportedRunes: CatalogRune[];
  supportedRuneNames: Set<string>;
  unsupportedRunes: CatalogRune[];
  critModes: CritMode[];
  maxItems: number;
  maxRunes: number;
  maxTeamSize: number;
  maxPlanSteps: number;
  onFailurePolicies: OnFailurePolicy[];
  targetingPolicies: TargetingPolicy[];
  genericSlots: AbilitySlot[];
  rankedSlots: RankedAbilitySlot[];
  rankBounds: Record<string, { min: number; max: number }>;
  rankDefaults: Record<string, number>;
  schedulerLimits: TeamSimCatalog["scheduler_limits"];
};

const INDEX_CACHE = new WeakMap<TeamSimCatalog, CatalogIndex>();

export function indexCatalog(catalog: TeamSimCatalog): CatalogIndex {
  const cached = INDEX_CACHE.get(catalog);
  if (cached) return cached;

  const championByName = new Map<string, CatalogChampion>();
  for (const champion of catalog.champions) championByName.set(champion.name, champion);

  const supportedItems = catalog.items.supported;
  const supportedRunes = catalog.runes.supported;

  // Slot vocabulary comes from the catalog's own generic-slot declaration; the
  // ranked subset is whatever ability_rules actually bounds (P has no rank).
  const genericSlots = (catalog.actions?.generic_slot_actions?.slots ??
    ["P", "Q", "W", "E", "R"]) as AbilitySlot[];
  const rankedSlots = Object.keys(catalog.ability_rules.rank_bounds)
    .sort() as RankedAbilitySlot[];

  const index: CatalogIndex = {
    catalog,
    digest: catalog.catalog_digest,
    contractVersion: catalog.contract_version,
    championNames: catalog.champions.map((c) => c.name),
    championOptions: catalog.champions.map((c) => ({ value: c.name, label: c.name })),
    itemEntries: [
      ...supportedItems.map((item) => ({ name: item.name, supported: true })),
      ...(catalog.items.known_unsupported ?? []).map((item) => ({
        name: item.name,
        supported: false,
        reason: item.reason ?? "not simulated",
      })),
    ],
    runeEntries: [
      ...supportedRunes.map((rune) => ({
        name: rune.name,
        supported: true,
        group: rune.tree,
      })),
      ...(catalog.runes.known_unsupported ?? []).map((rune) => ({
        name: rune.name,
        supported: false,
        reason: rune.reason ?? "described but inert",
      })),
    ],
    championByName,
    supportedItems,
    supportedItemNames: new Set(supportedItems.map((i) => i.name)),
    unsupportedItems: catalog.items.known_unsupported ?? [],
    supportedRunes,
    supportedRuneNames: new Set(supportedRunes.map((r) => r.name)),
    unsupportedRunes: catalog.runes.known_unsupported ?? [],
    critModes: catalog.build_options.crit_modes as CritMode[],
    maxItems: catalog.build_options.max_items_per_combatant,
    maxRunes: catalog.build_options.max_runes_per_combatant,
    maxTeamSize: catalog.team_limits.max_team_size,
    maxPlanSteps: catalog.action_plan_options.max_steps_per_plan,
    onFailurePolicies: catalog.action_plan_options.on_failure as OnFailurePolicy[],
    targetingPolicies: catalog.targeting_policies.map((p) => p.policy) as TargetingPolicy[],
    genericSlots,
    rankedSlots,
    rankBounds: catalog.ability_rules.rank_bounds,
    rankDefaults: catalog.ability_rules.defaults,
    schedulerLimits: catalog.scheduler_limits,
  };
  INDEX_CACHE.set(catalog, index);
  return index;
}

/** Champion-specific actions the backend advertises as dispatchable. */
export function championActions(
  index: CatalogIndex,
  champion: string
): CatalogChampionAction[] {
  return index.championByName.get(champion)?.actions ?? [];
}

export function championActionNames(
  index: CatalogIndex,
  champion: string
): Set<string> {
  return new Set(championActions(index, champion).map((a) => a.active_name));
}

/**
 * Credit cost for a team shape, straight from the catalog's matrix.
 * Returns null when the catalog does not price the shape — the UI shows
 * "unknown" rather than guessing, and the backend stays the authority.
 */
export function creditCostFor(
  index: CatalogIndex,
  teamASize: number,
  teamBSize: number
): number | null {
  const row = index.catalog.pricing.costs.find(
    (c) => c.team_a_size === teamASize && c.team_b_size === teamBSize
  );
  return row ? row.credits : null;
}

/** Every team shape the catalog prices, in (a, b) order. */
export function pricedTeamShapes(
  index: CatalogIndex
): Array<{ a: number; b: number; credits: number }> {
  return index.catalog.pricing.costs
    .map((c) => ({ a: c.team_a_size, b: c.team_b_size, credits: c.credits }))
    .sort((x, y) => x.a - y.a || x.b - y.b);
}

export function rankBoundsFor(
  index: CatalogIndex,
  slot: string
): { min: number; max: number } {
  return index.rankBounds[slot] ?? { min: 1, max: 5 };
}

export function targetingPolicyInfo(
  index: CatalogIndex,
  policy: string
) {
  return index.catalog.targeting_policies.find((p) => p.policy === policy);
}
