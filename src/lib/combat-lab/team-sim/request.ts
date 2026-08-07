/**
 * Draft → wire payload. The ONLY place a team-simulation request is assembled.
 *
 * Guarantees, in order of importance:
 *  - it refuses to build at all while `validateDraft` reports an issue, so no
 *    stale action, unsupported item or dead target reference can be sent;
 *  - only ACTIVE runtime IDs appear anywhere in the payload (teams, plans,
 *    targeting) — a hidden 2v2 slot leaves no trace in a 1v1 request;
 *  - field order and list order are deterministic, so the same draft always
 *    serializes to the same bytes;
 *  - the digest that configured the request is captured alongside it, which is
 *    what makes the post-response catalog-drift check meaningful.
 */
import type {
  TeamSimCombatantRequest,
  TeamSimPlanRequest,
  TeamSimTargetingRequest,
  TeamSimulationRequest,
} from "./contract";
import { creditCostFor, type CatalogIndex } from "./catalog";
import {
  activeIdsForTeam,
  activePriority,
  validateDraft,
  type DraftIssue,
  type PlanStepDraft,
  type RuntimeId,
  type TeamScenarioDraft,
} from "./draft";

export const SCENARIO_ID = "combat-lab-team-sim-ui";

export class DraftNotSubmittableError extends Error {
  constructor(public readonly issues: DraftIssue[]) {
    super(
      issues[0]?.message ??
        "The scenario cannot be submitted in its current state."
    );
    this.name = "DraftNotSubmittableError";
  }
}

export type PreparedSimulation = {
  request: TeamSimulationRequest;
  /** Catalog digest the request was configured against. */
  catalogDigest: string;
  creditCost: number | null;
  teamShape: string;
};

function stepToWire(step: PlanStepDraft) {
  if (step.kind === "basic_attack") {
    return { type: "basic_attack" as const, not_before: step.notBefore };
  }
  if (step.kind === "slot") {
    return {
      type: "active" as const,
      slot: step.slot as string,
      not_before: step.notBefore,
    };
  }
  return {
    type: "active" as const,
    active_name: step.activeName as string,
    not_before: step.notBefore,
  };
}

function combatantToWire(
  draft: TeamScenarioDraft,
  id: RuntimeId
): TeamSimCombatantRequest {
  const c = draft.combatants[id];
  const body: TeamSimCombatantRequest = {
    runtime_id: c.runtimeId,
    champion: c.champion,
    level: c.level,
    items: [...c.items],
    runes: [...c.runes],
    // Sorted so an identical build always serializes identically regardless of
    // the order the operator happened to click the rank steppers.
    ability_ranks: Object.fromEntries(
      Object.entries(c.abilityRanks).sort(([a], [b]) => a.localeCompare(b))
    ),
    crit_mode: c.critMode,
  };
  // Omitted rather than sent as null: the schema treats absent as "use the
  // champion's computed max HP", and `extra="forbid"` makes a junk key fatal.
  if (c.startingHp !== null) body.starting_hp = c.startingHp;
  return body;
}

function targetingToWire(
  draft: TeamScenarioDraft,
  id: RuntimeId
): TeamSimTargetingRequest {
  const t = draft.combatants[id].targeting;
  // `priority` is only legal for policy "fixed"; every other policy sends the
  // bare policy so the backend never has to ignore a field. For "fixed" the
  // list is filtered to ACTIVE enemies here rather than in the draft, so a
  // team-shape round trip preserves the operator's ordering while the request
  // can still never name a combatant it does not contain.
  return t.policy === "fixed"
    ? { policy: t.policy, priority: activePriority(draft, id) }
    : { policy: t.policy };
}

export function buildSimulationRequest(
  draft: TeamScenarioDraft,
  index: CatalogIndex
): PreparedSimulation {
  const validation = validateDraft(draft, index);
  if (!validation.canSubmit) throw new DraftNotSubmittableError(validation.issues);

  const idsA = activeIdsForTeam(draft, "A");
  const idsB = activeIdsForTeam(draft, "B");
  const activeIds = [...idsA, ...idsB];

  const action_plans: Record<string, TeamSimPlanRequest> = {};
  const targeting: Record<string, TeamSimTargetingRequest> = {};
  for (const id of activeIds) {
    const plan = draft.combatants[id].plan;
    action_plans[id] = {
      steps: plan.steps.map(stepToWire),
      repeat: plan.repeat,
      on_failure: plan.onFailure,
    };
    targeting[id] = targetingToWire(draft, id);
  }

  const request: TeamSimulationRequest = {
    // Straight from the catalog, so a stale catalog produces an honest
    // `contract_version_unsupported` 422 instead of a silently-wrong run.
    contract_version: index.contractVersion,
    scenario_id: SCENARIO_ID,
    team_a: { team_id: "A", combatants: idsA.map((id) => combatantToWire(draft, id)) },
    team_b: { team_id: "B", combatants: idsB.map((id) => combatantToWire(draft, id)) },
    action_plans,
    targeting,
    limits: {
      max_duration: draft.scheduler.maxDuration,
      max_events: draft.scheduler.maxEvents,
      max_trace_events: draft.scheduler.maxTraceEvents,
    },
  };

  return {
    request,
    catalogDigest: index.digest,
    creditCost: creditCostFor(index, draft.teamSizeA, draft.teamSizeB),
    teamShape: `${draft.teamSizeA}v${draft.teamSizeB}`,
  };
}
