/**
 * The local scenario model and its reducer.
 *
 * Separate from the wire payload on purpose. Three properties matter:
 *
 *  1. Combatants are keyed by RUNTIME ID (A1..A3 / B1..B3) and ALL entries
 *     exist for the whole session. Shrinking a team hides a slot, it never
 *     moves or destroys its configuration, so 3v3 -> 2v2 -> 3v3 round-trips
 *     without a champion's build silently landing on another runtime ID.
 *  2. Nothing in the draft is trusted at submit time. Validity is recomputed
 *     against the CURRENT catalog by `validateDraft`, so a catalog that
 *     changed under the editor invalidates the affected controls instead of
 *     letting a stale name through.
 *  3. The reducer is pure and its identifiers are deterministic (a counter in
 *     the draft, never Math.random), so tests and undo/redo snapshots compare
 *     structurally.
 */
import type {
  AbilitySlot,
  CritMode,
  OnFailurePolicy,
  TargetingPolicy,
} from "./contract";
import {
  championActionNames,
  creditCostFor,
  rankBoundsFor,
  type CatalogIndex,
} from "./catalog";

/**
 * The largest team the editor can express. The BACKEND cap is authoritative
 * and published as `index.maxTeamSize`; this is the editor's own structural
 * limit, because the draft models a fixed set of runtime slots. The team-size
 * control takes the smaller of the two, so a backend that raises its cap
 * first does not produce slots this file has no state for.
 */
export const MAX_EDITOR_TEAM_SIZE = 3;

const TEAM_KEYS = ["A", "B"] as const;
export type TeamKey = (typeof TEAM_KEYS)[number];

/**
 * Runtime IDs in scenario slot order: team A's slots, then team B's — the same
 * order the scheduler assigns slot indices in, which is what makes the
 * editor's ordering and the result's ordering agree by construction.
 *
 * Derived rather than listed. Phase 6A went from four slots to six, and every
 * hand-written four-entry literal in this file (`TEAM_OF`, `enemiesOf`, the
 * two `Record<RuntimeId, …>` seeds) was a place the third slot could have been
 * silently dropped.
 */
export const RUNTIME_IDS = TEAM_KEYS.flatMap((team) =>
  Array.from({ length: MAX_EDITOR_TEAM_SIZE }, (_, i) => `${team}${i + 1}`)
) as RuntimeId[];

/**
 * NOTE: the `1 | 2 | 3` here and `MAX_EDITOR_TEAM_SIZE` above must move
 * together — TypeScript cannot derive one from the other, and `RUNTIME_IDS`
 * casts through this type. Raising the constant alone would mint an "A4" that
 * is not a `RuntimeId`; `draft.3v3.test.ts` asserts the two agree.
 */
export type RuntimeId = `${TeamKey}${1 | 2 | 3}`;
export type TeamSize = 1 | 2 | 3;

export const TEAM_SIZES: readonly TeamSize[] = [1, 2, 3];

export const TEAM_OF: Record<RuntimeId, TeamKey> = Object.fromEntries(
  RUNTIME_IDS.map((id) => [id, id[0] as TeamKey])
) as Record<RuntimeId, TeamKey>;

/** All runtime IDs belonging to one team, in slot order. */
export function runtimeIdsOfTeam(team: TeamKey): RuntimeId[] {
  return RUNTIME_IDS.filter((id) => TEAM_OF[id] === team);
}

/** An empty per-runtime-ID record — one entry per slot, never a literal. */
function byRuntime<T>(make: () => T): Record<RuntimeId, T> {
  return Object.fromEntries(RUNTIME_IDS.map((id) => [id, make()])) as Record<
    RuntimeId,
    T
  >;
}

/**
 * Champion level bounds come from the CATALOG (`build_options.level`,
 * Phase 4C). Through Phase 4B this file mirrored the schema's
 * `level: int = Field(default=18, ge=1, le=18)` as local constants, because
 * the Phase 4A catalog did not publish the range. It does now, so the mirror
 * is gone and there is one authority again. The backend still enforces:
 * an out-of-range level is a 422, never a clamp.
 */
export function levelBounds(index: CatalogIndex) {
  return index.levelBounds;
}

export type PlanStepKind = "basic_attack" | "slot" | "champion_action";

export type PlanStepDraft = {
  /** Stable local key; survives reordering. Never sent to the backend. */
  id: string;
  kind: PlanStepKind;
  /** Set for kind "slot". */
  slot: AbilitySlot | null;
  /** Set for kind "champion_action". */
  activeName: string | null;
  notBefore: number;
};

export type PlanDraft = {
  steps: PlanStepDraft[];
  repeat: boolean;
  onFailure: OnFailurePolicy;
};

export type TargetingDraft = {
  policy: TargetingPolicy;
  /** Ordered enemy runtime IDs. Only meaningful for policy "fixed". */
  priority: RuntimeId[];
};

export type CombatantDraft = {
  runtimeId: RuntimeId;
  champion: string;
  level: number;
  items: string[];
  runes: string[];
  abilityRanks: Record<string, number>;
  critMode: CritMode;
  /** null = let the backend use the champion's computed max HP. */
  startingHp: number | null;
  plan: PlanDraft;
  targeting: TargetingDraft;
};

export type SchedulerDraft = {
  maxDuration: number;
  maxEvents: number;
  maxTraceEvents: number;
};

export type TeamScenarioDraft = {
  teamSizeA: TeamSize;
  teamSizeB: TeamSize;
  /** Every slot always present; team sizes decide which are active. */
  combatants: Record<RuntimeId, CombatantDraft>;
  scheduler: SchedulerDraft;
  /** Monotonic source of deterministic plan-step ids. */
  stepCounter: number;
};

/* ─────────────────────────── construction ─────────────────────────── */

export function enemiesOf(runtimeId: RuntimeId): RuntimeId[] {
  return runtimeIdsOfTeam(TEAM_OF[runtimeId] === "A" ? "B" : "A");
}

export function activeIdsForTeam(
  draft: TeamScenarioDraft,
  team: TeamKey
): RuntimeId[] {
  const size = team === "A" ? draft.teamSizeA : draft.teamSizeB;
  return runtimeIdsOfTeam(team).slice(0, size);
}

/** Active runtime IDs in scenario slot order: team A first, then team B. */
export function activeRuntimeIds(draft: TeamScenarioDraft): RuntimeId[] {
  return [...activeIdsForTeam(draft, "A"), ...activeIdsForTeam(draft, "B")];
}

export function isActive(draft: TeamScenarioDraft, id: RuntimeId): boolean {
  return activeRuntimeIds(draft).includes(id);
}

export function activeEnemiesOf(
  draft: TeamScenarioDraft,
  id: RuntimeId
): RuntimeId[] {
  const enemyTeam: TeamKey = TEAM_OF[id] === "A" ? "B" : "A";
  return activeIdsForTeam(draft, enemyTeam);
}

function defaultChampionFor(index: CatalogIndex, slotIndex: number): string {
  const names = index.championNames;
  return names[Math.min(slotIndex, names.length - 1)] ?? names[0];
}

function makeCombatant(
  index: CatalogIndex,
  runtimeId: RuntimeId,
  slotIndex: number,
  stepId: string
): CombatantDraft {
  return {
    runtimeId,
    champion: defaultChampionFor(index, slotIndex),
    level: index.levelBounds.default,
    items: [],
    runes: [],
    abilityRanks: { ...index.rankDefaults },
    critMode: (index.critModes[0] ?? "expected") as CritMode,
    startingHp: null,
    plan: {
      steps: [
        { id: stepId, kind: "basic_attack", slot: null, activeName: null, notBefore: 0 },
      ],
      repeat: true,
      onFailure: (index.onFailurePolicies.includes("skip")
        ? "skip"
        : index.onFailurePolicies[0]) as OnFailurePolicy,
    },
    targeting: {
      policy: (index.targetingPolicies.includes("first_living")
        ? "first_living"
        : index.targetingPolicies[0]) as TargetingPolicy,
      priority: [],
    },
  };
}

export function createDraft(index: CatalogIndex): TeamScenarioDraft {
  let counter = 0;
  const nextId = (id: RuntimeId) => `${id}-s${++counter}`;
  const combatants = {} as Record<RuntimeId, CombatantDraft>;
  RUNTIME_IDS.forEach((id, slotIndex) => {
    combatants[id] = makeCombatant(index, id, slotIndex, nextId(id));
  });
  return {
    teamSizeA: 1,
    teamSizeB: 1,
    combatants,
    scheduler: {
      maxDuration: index.schedulerLimits.max_duration.default,
      maxEvents: index.schedulerLimits.max_events.default,
      maxTraceEvents: index.schedulerLimits.max_trace_events.default,
    },
    stepCounter: counter,
  };
}

/* ──────────────────────────── reducer ──────────────────────────── */

export type DraftAction =
  | { type: "restore"; draft: TeamScenarioDraft }
  | { type: "reset"; index: CatalogIndex }
  | { type: "setTeamSize"; team: TeamKey; size: TeamSize }
  | { type: "setChampion"; id: RuntimeId; champion: string }
  | { type: "setLevel"; id: RuntimeId; level: number }
  | { type: "toggleItem"; id: RuntimeId; item: string; max: number }
  | { type: "clearItems"; id: RuntimeId }
  | { type: "toggleRune"; id: RuntimeId; rune: string; max: number }
  | { type: "clearRunes"; id: RuntimeId }
  | { type: "setAbilityRank"; id: RuntimeId; slot: string; rank: number }
  | { type: "setCritMode"; id: RuntimeId; critMode: CritMode }
  | { type: "setStartingHp"; id: RuntimeId; startingHp: number | null }
  | { type: "addStep"; id: RuntimeId; step: Omit<PlanStepDraft, "id"> }
  | { type: "removeStep"; id: RuntimeId; stepId: string }
  | { type: "moveStep"; id: RuntimeId; stepId: string; direction: -1 | 1 }
  | { type: "updateStep"; id: RuntimeId; stepId: string; patch: Partial<Omit<PlanStepDraft, "id">> }
  | { type: "clearPlan"; id: RuntimeId }
  | { type: "removeInvalidSteps"; id: RuntimeId; stepIds: string[] }
  | { type: "setRepeat"; id: RuntimeId; repeat: boolean }
  | { type: "setOnFailure"; id: RuntimeId; onFailure: OnFailurePolicy }
  | { type: "setTargetingPolicy"; id: RuntimeId; policy: TargetingPolicy }
  | { type: "togglePriority"; id: RuntimeId; target: RuntimeId }
  | { type: "movePriority"; id: RuntimeId; target: RuntimeId; direction: -1 | 1 }
  | { type: "resetCombatant"; id: RuntimeId; index: CatalogIndex }
  | { type: "copyBuild"; from: RuntimeId; to: RuntimeId }
  | { type: "setScheduler"; patch: Partial<SchedulerDraft> };

function withCombatant(
  draft: TeamScenarioDraft,
  id: RuntimeId,
  update: (c: CombatantDraft) => CombatantDraft
): TeamScenarioDraft {
  return {
    ...draft,
    combatants: { ...draft.combatants, [id]: update(draft.combatants[id]) },
  };
}

function withPlan(
  draft: TeamScenarioDraft,
  id: RuntimeId,
  update: (p: PlanDraft) => PlanDraft
): TeamScenarioDraft {
  return withCombatant(draft, id, (c) => ({ ...c, plan: update(c.plan) }));
}

/**
 * The priority entries that will actually be SENT for one combatant: the
 * draft's order, restricted to currently-active enemies.
 *
 * Deliberately a derivation rather than a mutation. Pruning the draft on every
 * team-size change destroyed configuration: 2v2 with priority [B2, B1] ->
 * 2v1 -> 2v2 came back as [B1], a materially different scenario (focus B2,
 * fall back to B1 became attack B1, idle when it dies) with nothing on screen
 * to say so. Inactive entries stay in the draft, are shown as inactive, and
 * never reach the wire.
 */
export function activePriority(
  draft: TeamScenarioDraft,
  id: RuntimeId
): RuntimeId[] {
  const allowed = new Set(activeEnemiesOf(draft, id));
  return draft.combatants[id].targeting.priority.filter((entry) =>
    allowed.has(entry)
  );
}

export function draftReducer(
  draft: TeamScenarioDraft,
  action: DraftAction
): TeamScenarioDraft {
  switch (action.type) {
    case "restore":
      return action.draft;

    case "reset":
      return createDraft(action.index);

    case "setTeamSize":
      // Nothing else changes: hidden slots keep their build, plan AND
      // targeting, and `activePriority` decides what is actually sent.
      return action.team === "A"
        ? { ...draft, teamSizeA: action.size }
        : { ...draft, teamSizeB: action.size };

    case "setChampion":
      // Plan steps are NOT rewritten here. A champion-specific step that the
      // new champion cannot cast becomes visibly invalid (validateDraft) and
      // blocks submission — silently dropping or remapping it would send a
      // scenario the operator never authored.
      return withCombatant(draft, action.id, (c) => ({ ...c, champion: action.champion }));

    case "setLevel":
      return withCombatant(draft, action.id, (c) => ({ ...c, level: action.level }));

    case "toggleItem":
      return withCombatant(draft, action.id, (c) => {
        if (c.items.includes(action.item)) {
          return { ...c, items: c.items.filter((i) => i !== action.item) };
        }
        if (c.items.length >= action.max) return c;
        return { ...c, items: [...c.items, action.item] };
      });

    case "clearItems":
      return withCombatant(draft, action.id, (c) => ({ ...c, items: [] }));

    case "toggleRune":
      return withCombatant(draft, action.id, (c) => {
        if (c.runes.includes(action.rune)) {
          return { ...c, runes: c.runes.filter((r) => r !== action.rune) };
        }
        if (c.runes.length >= action.max) return c;
        return { ...c, runes: [...c.runes, action.rune] };
      });

    case "clearRunes":
      return withCombatant(draft, action.id, (c) => ({ ...c, runes: [] }));

    case "setAbilityRank":
      return withCombatant(draft, action.id, (c) => ({
        ...c,
        abilityRanks: { ...c.abilityRanks, [action.slot]: action.rank },
      }));

    case "setCritMode":
      return withCombatant(draft, action.id, (c) => ({ ...c, critMode: action.critMode }));

    case "setStartingHp":
      return withCombatant(draft, action.id, (c) => ({ ...c, startingHp: action.startingHp }));

    case "addStep": {
      const stepId = `${action.id}-s${draft.stepCounter + 1}`;
      const next = withPlan(draft, action.id, (p) => ({
        ...p,
        steps: [...p.steps, { id: stepId, ...action.step }],
      }));
      return { ...next, stepCounter: draft.stepCounter + 1 };
    }

    case "removeStep":
      return withPlan(draft, action.id, (p) => ({
        ...p,
        steps: p.steps.filter((s) => s.id !== action.stepId),
      }));

    case "removeInvalidSteps": {
      const drop = new Set(action.stepIds);
      return withPlan(draft, action.id, (p) => ({
        ...p,
        steps: p.steps.filter((s) => !drop.has(s.id)),
      }));
    }

    case "moveStep":
      return withPlan(draft, action.id, (p) => {
        const from = p.steps.findIndex((s) => s.id === action.stepId);
        const to = from + action.direction;
        if (from < 0 || to < 0 || to >= p.steps.length) return p;
        const steps = [...p.steps];
        [steps[from], steps[to]] = [steps[to], steps[from]];
        return { ...p, steps };
      });

    case "updateStep":
      return withPlan(draft, action.id, (p) => ({
        ...p,
        steps: p.steps.map((s) =>
          s.id === action.stepId ? { ...s, ...action.patch } : s
        ),
      }));

    case "clearPlan":
      return withPlan(draft, action.id, (p) => ({ ...p, steps: [] }));

    case "setRepeat":
      return withPlan(draft, action.id, (p) => ({ ...p, repeat: action.repeat }));

    case "setOnFailure":
      return withPlan(draft, action.id, (p) => ({ ...p, onFailure: action.onFailure }));

    case "setTargetingPolicy":
      return withCombatant(draft, action.id, (c) => ({
        ...c,
        targeting: { ...c.targeting, policy: action.policy },
      }));

    case "togglePriority": {
      const allowed = new Set(activeEnemiesOf(draft, action.id));
      if (!allowed.has(action.target)) return draft;
      return withCombatant(draft, action.id, (c) => {
        const priority = c.targeting.priority.includes(action.target)
          ? c.targeting.priority.filter((p) => p !== action.target)
          : [...c.targeting.priority, action.target];
        return { ...c, targeting: { ...c.targeting, priority } };
      });
    }

    case "movePriority":
      return withCombatant(draft, action.id, (c) => {
        const from = c.targeting.priority.indexOf(action.target);
        const to = from + action.direction;
        if (from < 0 || to < 0 || to >= c.targeting.priority.length) return c;
        const priority = [...c.targeting.priority];
        [priority[from], priority[to]] = [priority[to], priority[from]];
        return { ...c, targeting: { ...c.targeting, priority } };
      });

    case "resetCombatant": {
      const slotIndex = RUNTIME_IDS.indexOf(action.id);
      const stepId = `${action.id}-s${draft.stepCounter + 1}`;
      const next = withCombatant(draft, action.id, () =>
        makeCombatant(action.index, action.id, slotIndex, stepId)
      );
      return { ...next, stepCounter: draft.stepCounter + 1 };
    }

    case "copyBuild": {
      // Build only — the plan and targeting stay with their own runtime ID so
      // a copy can never move one combatant's targeting onto another.
      const source = draft.combatants[action.from];
      return withCombatant(draft, action.to, (c) => ({
        ...c,
        champion: source.champion,
        level: source.level,
        items: [...source.items],
        runes: [...source.runes],
        abilityRanks: { ...source.abilityRanks },
        critMode: source.critMode,
        startingHp: source.startingHp,
      }));
    }

    case "setScheduler":
      return { ...draft, scheduler: { ...draft.scheduler, ...action.patch } };

    default:
      return draft;
  }
}

/* ─────────────────────────── validation ─────────────────────────── */

export type DraftIssueField =
  | "champion"
  | "level"
  | "items"
  | "runes"
  | "ranks"
  | "crit_mode"
  | "starting_hp"
  | "plan"
  | "targeting"
  | "scheduler"
  | "team";

export type DraftIssue = {
  runtimeId: RuntimeId | null;
  field: DraftIssueField;
  message: string;
  stepId?: string;
};

export type DraftValidation = {
  issues: DraftIssue[];
  /** Plan-step ids that cannot be submitted, keyed by runtime ID. */
  invalidStepIds: Record<RuntimeId, string[]>;
  /** Per-step reason, so the editor can say WHY a step is invalid. */
  stepIssues: Record<RuntimeId, Record<string, string>>;
  /** Selected item names the CURRENT catalog no longer supports. */
  invalidItems: Record<RuntimeId, string[]>;
  invalidRunes: Record<RuntimeId, string[]>;
  canSubmit: boolean;
};

const emptyByRuntime = (): Record<RuntimeId, string[]> => byRuntime(() => []);

/**
 * Validate ACTIVE combatants against the currently loaded catalog.
 *
 * Inactive slots are ignored entirely: their configuration is preserved but
 * never submitted, so a stale champion parked in a hidden A2 must not block a
 * perfectly valid 1v1.
 */
export function validateDraft(
  draft: TeamScenarioDraft,
  index: CatalogIndex
): DraftValidation {
  const issues: DraftIssue[] = [];
  const invalidStepIds = emptyByRuntime();
  const stepIssues: Record<RuntimeId, Record<string, string>> = byRuntime(
    () => ({})
  );
  const invalidItems = emptyByRuntime();
  const invalidRunes = emptyByRuntime();

  if (creditCostFor(index, draft.teamSizeA, draft.teamSizeB) === null) {
    issues.push({
      runtimeId: null,
      field: "team",
      message: `The catalog does not price a ${draft.teamSizeA}v${draft.teamSizeB} simulation.`,
    });
  }

  const limits = index.schedulerLimits;
  const boundedNumber = (
    value: number,
    max: number,
    label: string,
    integer: boolean
  ) => {
    if (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
      issues.push({ runtimeId: null, field: "scheduler", message: `${label} must be a positive ${integer ? "whole number" : "number"}.` });
    } else if (value > max) {
      issues.push({ runtimeId: null, field: "scheduler", message: `${label} may not exceed ${max}.` });
    }
  };
  boundedNumber(draft.scheduler.maxDuration, limits.max_duration.maximum, "Max duration", false);
  boundedNumber(draft.scheduler.maxEvents, limits.max_events.maximum, "Max events", true);
  boundedNumber(draft.scheduler.maxTraceEvents, limits.max_trace_events.maximum, "Max trace events", true);

  for (const id of activeRuntimeIds(draft)) {
    const c = draft.combatants[id];

    if (!index.championByName.has(c.champion)) {
      issues.push({
        runtimeId: id,
        field: "champion",
        message: `${id}: "${c.champion}" is not in the simulation catalog.`,
      });
    }

    const levels = index.levelBounds;
    if (!Number.isInteger(c.level) || c.level < levels.min || c.level > levels.max) {
      issues.push({
        runtimeId: id,
        field: "level",
        message: `${id}: level must be a whole number from ${levels.min} to ${levels.max}.`,
      });
    }

    const unsupportedItems = c.items.filter((i) => !index.supportedItemNames.has(i));
    if (unsupportedItems.length > 0) {
      invalidItems[id] = unsupportedItems;
      issues.push({
        runtimeId: id,
        field: "items",
        message: `${id}: the catalog does not support ${unsupportedItems.join(", ")}.`,
      });
    }
    if (c.items.length > index.maxItems) {
      issues.push({
        runtimeId: id,
        field: "items",
        message: `${id}: at most ${index.maxItems} items per combatant.`,
      });
    }

    const unsupportedRunes = c.runes.filter((r) => !index.supportedRuneNames.has(r));
    if (unsupportedRunes.length > 0) {
      invalidRunes[id] = unsupportedRunes;
      issues.push({
        runtimeId: id,
        field: "runes",
        message: `${id}: the catalog does not support ${unsupportedRunes.join(", ")}.`,
      });
    }
    if (c.runes.length > index.maxRunes) {
      issues.push({
        runtimeId: id,
        field: "runes",
        message: `${id}: at most ${index.maxRunes} runes per combatant.`,
      });
    }

    for (const [slot, rank] of Object.entries(c.abilityRanks)) {
      const bounds = rankBoundsFor(index, slot);
      if (!Number.isInteger(rank) || rank < bounds.min || rank > bounds.max) {
        issues.push({
          runtimeId: id,
          field: "ranks",
          message: `${id}: ${slot} rank must be ${bounds.min}–${bounds.max}.`,
        });
      }
    }

    if (!index.critModes.includes(c.critMode)) {
      issues.push({
        runtimeId: id,
        field: "crit_mode",
        message: `${id}: crit mode "${c.critMode}" is not in the catalog.`,
      });
    }

    if (c.startingHp !== null && (!Number.isFinite(c.startingHp) || c.startingHp <= 0)) {
      issues.push({
        runtimeId: id,
        field: "starting_hp",
        message: `${id}: starting HP must be greater than 0, or left blank.`,
      });
    }

    if (c.plan.steps.length > index.maxPlanSteps) {
      issues.push({
        runtimeId: id,
        field: "plan",
        message: `${id}: at most ${index.maxPlanSteps} plan steps.`,
      });
    }
    if (!index.onFailurePolicies.includes(c.plan.onFailure)) {
      issues.push({
        runtimeId: id,
        field: "plan",
        message: `${id}: failure policy "${c.plan.onFailure}" is not in the catalog.`,
      });
    }
    // team_combat/planning.py: `if repeat and not steps` is a hard rejection.
    // An empty plan is legal ONLY as a non-repeating "never acts" plan.
    if (c.plan.repeat && c.plan.steps.length === 0) {
      issues.push({
        runtimeId: id,
        field: "plan",
        message: `${id}: a repeating plan needs at least one step (turn off Repeat for an idle combatant).`,
      });
    }

    const allowedActions = championActionNames(index, c.champion);
    const allowedSlots = new Set<string>(index.genericSlots);
    for (const step of c.plan.steps) {
      let invalid: string | null = null;
      if (step.kind === "champion_action") {
        if (!step.activeName || !allowedActions.has(step.activeName)) {
          invalid = `"${step.activeName ?? "?"}" is not an action ${c.champion} supports.`;
        }
      } else if (step.kind === "slot") {
        if (!step.slot || !allowedSlots.has(step.slot)) {
          invalid = `"${step.slot ?? "?"}" is not a castable slot.`;
        }
      }
      if (!Number.isFinite(step.notBefore) || step.notBefore < 0) {
        invalid = invalid ?? "Not-before must be 0 or greater.";
      }
      if (invalid) {
        invalidStepIds[id].push(step.id);
        stepIssues[id][step.id] = invalid;
        issues.push({ runtimeId: id, field: "plan", stepId: step.id, message: `${id}: ${invalid}` });
      }
    }

    if (!index.targetingPolicies.includes(c.targeting.policy)) {
      issues.push({
        runtimeId: id,
        field: "targeting",
        message: `${id}: targeting policy "${c.targeting.policy}" is not in the catalog.`,
      });
    }
    if (c.targeting.policy === "fixed") {
      // Entries naming an inactive combatant are inert, not invalid: they are
      // preserved for team-shape round trips and filtered out at wire time.
      // What must not happen is submitting a fixed policy with nothing live
      // to aim at.
      if (activePriority(draft, id).length === 0) {
        issues.push({
          runtimeId: id,
          field: "targeting",
          message: `${id}: fixed targeting needs at least one ACTIVE enemy in the priority list.`,
        });
      }
      if (new Set(c.targeting.priority).size !== c.targeting.priority.length) {
        issues.push({
          runtimeId: id,
          field: "targeting",
          message: `${id}: priority lists the same combatant twice.`,
        });
      }
    }
  }

  return {
    issues,
    invalidStepIds,
    stepIssues,
    invalidItems,
    invalidRunes,
    canSubmit: issues.length === 0,
  };
}

/** Compact "A1 Q -> Basic Attack -> repeat" style summary for dense views. */
export function describePlan(plan: PlanDraft): string {
  if (plan.steps.length === 0) return "No actions (idle)";
  const labels = plan.steps.map(describeStep);
  return plan.repeat ? `${labels.join(" → ")} ↻` : labels.join(" → ");
}

export function describeStep(step: PlanStepDraft): string {
  const base =
    step.kind === "basic_attack"
      ? "Basic Attack"
      : step.kind === "slot"
        ? `Cast ${step.slot ?? "?"}`
        : (step.activeName ?? "?");
  return step.notBefore > 0 ? `${base} @≥${step.notBefore}s` : base;
}
