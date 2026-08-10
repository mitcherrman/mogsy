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
 *    what makes the post-response catalog-drift check meaningful;
 *  - ONE idempotency key is minted here, with the body (Phase 4C). That
 *    placement IS the key lifecycle: a new key exists only where a new body is
 *    built, so a key can never outlive the request it identifies and a changed
 *    body can never inherit one. Recovering an uncertain request means
 *    resending this same prepared object — same key, same bytes, the only
 *    combination the backend replays instead of charging again.
 */
import type {
  TeamSimCombatantRequest,
  TeamSimPlanRequest,
  TeamSimTargetingRequest,
  TeamSimulationRequest,
} from "./contract";
import {
  creditCostFor,
  traceDetailOptions,
  type CatalogIndex,
} from "./catalog";
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
  /**
   * The `Idempotency-Key` for this logical paid request (Phase 4C). Minted
   * once, here, alongside the body.
   */
  idempotencyKey: string;
};

/**
 * A fresh opaque key. `crypto.randomUUID` wherever it exists (every browser
 * this app targets, and jsdom on Node 20+); the fallback covers non-secure
 * contexts and stays well inside the backend's printable-ASCII 1–128 bound.
 */
export function newIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const rand = () => Math.random().toString(36).slice(2);
  return `ts-${Date.now().toString(36)}-${rand()}${rand()}`;
}

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

  // Phase 7A. Inside the BODY, so it is inside the backend's request digest:
  // two levels are two different logical requests, and the fresh key minted
  // below belongs to this one. That placement is what stops a level change from
  // replaying the other level's stored bytes — and what makes a level change
  // cost a credit, which is why the page never submits on its own when the
  // selector moves.
  //
  // Set conditionally, and OMITTED rather than defaulted when the catalog does
  // not publish trace_options: a backend old enough not to publish them does
  // not accept the field either, and every request model on that contract is
  // extra="forbid", so sending it would 422 the simulation instead of falling
  // back. Same rule the optional `starting_hp` above follows.
  const trace = traceDetailOptions(index);
  if (trace.published) {
    request.limits.trace_detail = draft.scheduler.traceDetail;
  }

  return {
    request,
    catalogDigest: index.digest,
    creditCost: creditCostFor(index, draft.teamSizeA, draft.teamSizeB),
    teamShape: `${draft.teamSizeA}v${draft.teamSizeB}`,
    idempotencyKey: newIdempotencyKey(),
  };
}
