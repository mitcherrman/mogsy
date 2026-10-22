/**
 * Combat Theater V4 — pure adapter from a Team Simulator response to a
 * playable "script" (combatants, beats, deterministic state reconstruction)
 * and a step-by-step mathematical explanation of any single beat.
 *
 * Provenance rules (same as `team-sim/playback.ts`, on which this builds):
 *  - Nothing here computes damage, HP or timing. Every number a consumer can
 *    render is read off the wire and carries the field it came from.
 *  - HP at any instant is reconstructed by REPLAYING authoritative
 *    `damage_accounting.by_scope.PRIMARY.hp_after` values in scheduler order,
 *    never by subtracting damage. Scrubbing backward therefore evaluates the
 *    same pure function with a smaller prefix of beats — there is no
 *    cumulative client-side state to get wrong.
 *  - `formula_text` is displayed verbatim (real captures carry a decimal
 *    comma, e.g. `0,75 * AP`). It is never parsed or evaluated. The
 *    "substituted" view only replaces whole-word identifiers that appear in
 *    `formula_bindings` with the value the server bound; the result shown
 *    beside it is the server's own `raw_damage`.
 *  - Where a field is absent the explanation reports a limitation instead of
 *    a value.
 */
import type {
  TeamSimEvent,
  TeamSimulationResponse,
} from "@/lib/combat-lab/team-sim/contract";
import {
  buildPlaybackActions,
  actionSpan,
  formulaDiagnostics,
  humanizeActionId,
  pipelineEventFor,
  primaryHp,
  type PlaybackAction,
} from "@/lib/combat-lab/team-sim/playback";
import { inferActionAbilitySlot } from "@/lib/combat-lab/abilityIcons";

export type TheaterSide = "left" | "right";
export type AbilitySlot = "Q" | "W" | "E" | "R";
export type DamageType = "physical" | "magic" | "true" | "unknown";

export type TheaterCombatant = {
  id: string;
  champion: string;
  team: string;
  side: TheaterSide;
  slotIndex: number;
  level: number | null;
  items: string[];
  runes: string[];
  /** `effective_builds[id].starting_hp` — the initial fill. */
  startingHp: number;
  /** `effective_builds[id].max_hp` — the bar scale (never `starting_hp`). */
  maxHp: number;
  /** `combatant_summaries[id].final_hp`. */
  finalHp: number | null;
  alive: boolean;
  /** `combatant_summaries[id].death_time`. */
  deathTime: number | null;
};

/** One damage-bearing kernel event inside a beat, as reported. */
export type TheaterHit = {
  seq: number;
  type: string;
  source: string | null;
  state: string | null;
  description: string | null;
  damageType: DamageType;
  /** `payload.raw_damage` */
  rawDamage: number | null;
  /** `payload.final_damage` */
  finalDamage: number | null;
  mitigated: boolean | null;
  /** `payload.metadata.applied_hp_damage` */
  appliedHpDamage: number | null;
};

export type TheaterHp = {
  targetId: string;
  /** `meta.damage_accounting.by_scope.PRIMARY.hp_before` */
  before: number;
  /** `…hp_after` */
  after: number;
  /** `…applied_hp_damage` */
  applied: number;
};

export type TheaterBeat = {
  index: number;
  seq: number;
  /** The scheduler event's own `time`. */
  time: number;
  /** `meta.clock_after` when later than `time`, else `time`. */
  resolvesAt: number;
  ok: boolean;
  error: string | null;
  actorId: string;
  actorSide: TheaterSide;
  targetId: string | null;
  actionId: string | null;
  /** `meta.action_type` — the server's own classification. */
  actionType: string | null;
  label: string;
  slot: AbilitySlot | null;
  kind: "basic_attack" | "ability" | "other";
  damageType: DamageType;
  hp: TheaterHp | null;
  hits: TheaterHit[];
  /** A `lifecycle/death` event names this beat's `seq` as `cause_action_seq`. */
  killingBlow: boolean;
  /** Victim of that death, read from the death event (see `deathVictim`). */
  killedId: string | null;
  action: PlaybackAction;
};

export type TheaterDeath = {
  victimId: string;
  time: number;
  causeSeq: number | null;
  causeActorId: string | null;
};

export type TheaterScript = {
  scenarioId: string;
  contractVersion: string;
  traceDetail: string | null;
  duration: number;
  combatants: TheaterCombatant[];
  left: TheaterCombatant[];
  right: TheaterCombatant[];
  leftTeam: string;
  rightTeam: string;
  beats: TheaterBeat[];
  deaths: TheaterDeath[];
  termination: { reason: string; winner: string | null; detail: string | null };
  warnings: string[];
};

const EPS = 1e-9;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export function normalizeDamageType(v: unknown): DamageType {
  const s = (str(v) ?? "").toLowerCase();
  if (s === "physical" || s === "magic" || s === "true") return s;
  return "unknown";
}

function slotFor(actionId: string | null, actionType: string | null): AbilitySlot | null {
  if (actionType === "basic_attack") return null;
  const slot = inferActionAbilitySlot(actionId, actionId);
  return slot ? (slot as AbilitySlot) : null;
}

function hitFrom(event: TeamSimEvent): TheaterHit | null {
  const payload = asRecord(event.payload);
  const final = num(payload.final_damage);
  const raw = num(payload.raw_damage);
  // Only events that carry a magnitude are "hits"; state/counter rows are not.
  if (final === null || final <= 0) return null;
  const metadata = asRecord(payload.metadata);
  return {
    seq: event.seq,
    type: event.type,
    source: str(payload.source),
    state: str(payload.state),
    description: str(payload.description),
    damageType: normalizeDamageType(payload.damage_type),
    rawDamage: raw,
    finalDamage: final,
    mitigated: typeof payload.mitigated === "boolean" ? payload.mitigated : null,
    appliedHpDamage: num(metadata.applied_hp_damage),
  };
}

/**
 * The victim of a `lifecycle/death` event. The fixture pairs `actor_id` =
 * killer and `target_id` = victim, but that is a single observed case (prep
 * handoff H9), so the victim is CONFIRMED against
 * `combatant_summaries[*].death_time` and only falls back to `target_id` when
 * no summary matches.
 */
export function deathVictim(event: TeamSimEvent, response: TeamSimulationResponse): string | null {
  const meta = asRecord(event.meta);
  const deathTime = num(meta.death_time) ?? event.time;
  const candidates = [event.target_id, event.actor_id].filter(Boolean) as string[];
  for (const id of candidates) {
    const summary = response.combatant_summaries[id];
    if (summary && summary.death_time !== null && Math.abs(summary.death_time - deathTime) < 1e-6) {
      return id;
    }
  }
  return event.target_id ?? null;
}

/** Build the theater script. Pure; safe to memoise on the response identity. */
export function buildTheaterScript(response: TeamSimulationResponse): TheaterScript {
  const teamIds = Object.keys(response.team_summaries);
  const leftTeam = teamIds[0] ?? "A";
  const rightTeam = teamIds.find((t) => t !== leftTeam) ?? "B";

  const combatants: TheaterCombatant[] = Object.entries(response.combatant_summaries)
    .map(([id, summary]) => {
      const build = response.effective_builds[id];
      return {
        id,
        champion: build?.champion ?? summary.champion ?? id,
        team: summary.team_id,
        side: (summary.team_id === leftTeam ? "left" : "right") as TheaterSide,
        slotIndex: summary.slot_index,
        level: num(build?.level),
        items: (build?.items ?? []).map((i) => i.name),
        runes: build?.runes ?? [],
        startingHp: num(build?.starting_hp) ?? num(build?.max_hp) ?? 0,
        maxHp: num(build?.max_hp) ?? num(summary.max_hp) ?? 0,
        finalHp: num(summary.final_hp),
        alive: summary.alive,
        deathTime: summary.death_time,
      };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);

  const sideOf = new Map(combatants.map((c) => [c.id, c.side] as const));

  const deaths: TheaterDeath[] = response.events
    .filter((e) => e.source === "lifecycle" && e.type === "death")
    .map((e) => {
      const meta = asRecord(e.meta);
      return {
        victimId: deathVictim(e, response) ?? "",
        time: num(meta.death_time) ?? e.time,
        causeSeq: num(meta.cause_action_seq),
        causeActorId: str(meta.cause_actor_id) ?? e.actor_id,
      };
    })
    .filter((d) => d.victimId);

  const beats: TheaterBeat[] = buildPlaybackActions(response).map((action, index) => {
    const meta = asRecord(action.event.meta);
    const hits = action.kernelEvents.map(hitFrom).filter((h): h is TheaterHit => h !== null);
    const pipe = pipelineEventFor(action);
    const pipePayload = asRecord(pipe?.payload);
    const damageType =
      normalizeDamageType(pipePayload.damage_type) !== "unknown"
        ? normalizeDamageType(pipePayload.damage_type)
        : (hits.find((h) => h.damageType !== "unknown")?.damageType ?? "unknown");
    const hp = primaryHp(action);
    const death = deaths.find((d) => d.causeSeq === action.seq) ?? null;
    const kind: TheaterBeat["kind"] =
      action.actionType === "basic_attack" ? "basic_attack" : action.actionType === "active" ? "ability" : "other";
    return {
      index,
      seq: action.seq,
      time: action.startTime,
      resolvesAt: actionSpan(action).end,
      ok: action.ok,
      error: str(meta.error),
      actorId: action.actorId ?? "",
      actorSide: sideOf.get(action.actorId ?? "") ?? "left",
      targetId: action.targetId,
      actionId: action.actionId,
      actionType: action.actionType,
      label: humanizeActionId(action.actionId),
      slot: slotFor(action.actionId, action.actionType),
      kind,
      damageType,
      hp: hp && action.targetId ? { targetId: action.targetId, before: hp.hp_before, after: hp.hp_after, applied: hp.applied_hp_damage } : null,
      hits,
      killingBlow: death !== null,
      killedId: death?.victimId ?? null,
      action,
    };
  });

  const lastBeatEnd = beats.reduce((m, b) => Math.max(m, b.resolvesAt), 0);

  return {
    scenarioId: response.scenario_id,
    contractVersion: response.contract_version,
    traceDetail: response.trace?.detail ?? null,
    duration: Math.max(num(response.duration) ?? 0, lastBeatEnd),
    combatants,
    left: combatants.filter((c) => c.side === "left"),
    right: combatants.filter((c) => c.side === "right"),
    leftTeam,
    rightTeam,
    beats,
    deaths,
    termination: {
      reason: response.termination?.reason ?? "unknown",
      winner: response.termination?.winner ?? null,
      detail: response.termination?.detail ?? null,
    },
    warnings: response.warnings ?? [],
  };
}

// ---------------------------------------------------------------------------
// Deterministic state reconstruction
// ---------------------------------------------------------------------------

export type CombatantState = {
  id: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Which authoritative value `hp` is: the starting fill, or a beat's `hp_after`. */
  hpSource: { kind: "starting_hp" } | { kind: "hp_after"; seq: number };
};

export type TheaterState = {
  /** Index of the last beat applied, -1 before the first. */
  beatIndex: number;
  combatants: Record<string, CombatantState>;
};

/** Index of the last beat whose `time` is at or before `time`; -1 if none. */
export function beatIndexAt(script: TheaterScript, time: number): number {
  let idx = -1;
  for (const beat of script.beats) {
    if (beat.time <= time + EPS) idx = beat.index;
    else break;
  }
  return idx;
}

/**
 * State after beats `0..index` (inclusive) have fired. Pure: evaluating at
 * index 2 then index 5 then index 2 again yields identical objects, which is
 * what makes backward scrubbing correct by construction.
 */
export function stateAfterBeat(script: TheaterScript, index: number): TheaterState {
  const combatants: Record<string, CombatantState> = {};
  for (const c of script.combatants) {
    combatants[c.id] = { id: c.id, hp: c.startingHp, maxHp: c.maxHp, alive: true, hpSource: { kind: "starting_hp" } };
  }
  const clamped = Math.min(index, script.beats.length - 1);
  for (let i = 0; i <= clamped; i++) {
    const beat = script.beats[i];
    if (beat.hp && combatants[beat.hp.targetId]) {
      combatants[beat.hp.targetId].hp = beat.hp.after;
      combatants[beat.hp.targetId].hpSource = { kind: "hp_after", seq: beat.seq };
    }
    if (beat.killingBlow && beat.killedId && combatants[beat.killedId]) {
      combatants[beat.killedId].alive = false;
    }
  }
  return { beatIndex: clamped, combatants };
}

/** State at a clock instant: the prefix of beats at or before `time`. */
export function stateAt(script: TheaterScript, time: number): TheaterState {
  return stateAfterBeat(script, beatIndexAt(script, time));
}

/**
 * Previous / next beat index around a selection, clamped to
 * [-1, beats.length - 1]. Index -1 is the pre-fight state (nothing fired yet),
 * so "previous" from the first beat shows both champions untouched.
 */
export function stepBeatIndex(script: TheaterScript, from: number, delta: 1 | -1): number {
  const next = from + delta;
  return Math.max(-1, Math.min(script.beats.length - 1, next));
}

// ---------------------------------------------------------------------------
// Visual mathematics — one beat explained, with provenance
// ---------------------------------------------------------------------------

/** A number with the wire field it was read from. */
export type Sourced = { value: number; field: string };

export type FormulaToken =
  | { kind: "text"; text: string }
  | { kind: "identifier"; text: string; name: string; value: number };

export type MathStep =
  | {
      id: "identity";
      status: "ok";
      ability: string;
      state: string | null;
      description: string | null;
      actionId: string | null;
      damageType: DamageType;
      provenance: string[];
    }
  | {
      id: "formula";
      status: "ok" | "limited";
      formulaText: string | null;
      bindings: Array<{ name: string; value: number }>;
      rank: number | null;
      note: string | null;
      provenance: string[];
    }
  | {
      id: "substitution";
      status: "ok" | "limited";
      tokens: FormulaToken[];
      result: Sourced | null;
      /** For a basic attack: the engine's reported attack-model inputs (not a formula). */
      reportedInputs: Array<{ name: string; value: number | string | boolean }>;
      note: string | null;
      provenance: string[];
    }
  | {
      id: "mitigation";
      status: "ok" | "limited";
      before: Sourced | null;
      resistance: { kind: "armor" | "magic_resist" | "resistance"; value: number; field: string } | null;
      after: Sourced | null;
      modifiers: Array<{ label: string; percent: Sourced | null; value: Sourced }>;
      note: string | null;
      provenance: string[];
    }
  | {
      id: "shield";
      status: "ok" | "limited";
      before: Sourced | null;
      absorbed: Sourced | null;
      after: Sourced | null;
      note: string | null;
      provenance: string[];
    }
  | {
      id: "final";
      status: "ok" | "limited";
      finalDamage: Sourced | null;
      appliedHpDamage: Sourced | null;
      overkill: number | null;
      note: string | null;
      provenance: string[];
    }
  | {
      id: "hp";
      status: "ok" | "limited";
      targetId: string | null;
      before: Sourced | null;
      after: Sourced | null;
      applied: Sourced | null;
      maxHp: Sourced | null;
      note: string | null;
      provenance: string[];
    };

export type MathExplanation = {
  beatSeq: number;
  steps: MathStep[];
  limitations: string[];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split `formulaText` into verbatim text and identifier tokens. Only whole
 * identifiers present in `bindings` become tokens; everything else — including
 * the decimal-comma literals — is passed through untouched. This is a lexical
 * highlight, not a parse: no arithmetic is interpreted.
 */
export function tokenizeFormula(formulaText: string, bindings: Record<string, number>): FormulaToken[] {
  const names = Object.keys(bindings).sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ kind: "text", text: formulaText }];
  const re = new RegExp(`(?<![A-Za-z0-9_])(${names.map(escapeRegExp).join("|")})(?![A-Za-z0-9_])`, "g");
  const tokens: FormulaToken[] = [];
  let last = 0;
  for (const m of formulaText.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ kind: "text", text: formulaText.slice(last, start) });
    tokens.push({ kind: "identifier", text: m[1], name: m[1], value: bindings[m[1]] });
    last = start + m[1].length;
  }
  if (last < formulaText.length) tokens.push({ kind: "text", text: formulaText.slice(last) });
  return tokens;
}

function sourced(container: Record<string, unknown>, key: string, prefix: string): Sourced | null {
  const v = num(container[key]);
  return v === null ? null : { value: v, field: `${prefix}.${key}` };
}

export function explainBeat(script: TheaterScript, beat: TheaterBeat): MathExplanation {
  const limitations: string[] = [];
  const steps: MathStep[] = [];
  const action = beat.action;
  const target = beat.targetId ? script.combatants.find((c) => c.id === beat.targetId) ?? null : null;

  const abilityEvent =
    action.kernelEvents.find((e) => e.type === "champion_ability") ?? null;
  const pipeEvent = pipelineEventFor(action) ?? abilityEvent ?? action.kernelEvents.find((e) => hitFrom(e)) ?? null;
  const pipePayload = asRecord(pipeEvent?.payload);
  const pipeMeta = asRecord(pipePayload.metadata);
  const P = "payload";
  const M = "payload.metadata";

  // 1. Identity ------------------------------------------------------------
  const identityPayload = asRecord((abilityEvent ?? pipeEvent)?.payload);
  steps.push({
    id: "identity",
    status: "ok",
    ability: str(identityPayload.source) ?? beat.label,
    state: str(identityPayload.state),
    description: str(identityPayload.description),
    actionId: beat.actionId,
    damageType: beat.damageType,
    provenance: ["action_id", `${P}.source`, `${P}.state`, `${P}.damage_type`],
  });

  if (!beat.ok) {
    limitations.push(`The scheduler rejected this action${beat.error ? ` (${beat.error})` : ""}; no damage was computed.`);
    return { beatSeq: beat.seq, steps, limitations };
  }

  // 2. Formula -------------------------------------------------------------
  const diag = abilityEvent ? formulaDiagnostics(abilityEvent) : null;
  const bindings = diag?.formulaBindings ?? null;
  const bindingList = bindings ? Object.entries(bindings).map(([name, value]) => ({ name, value })) : [];
  const abilityMeta = asRecord(asRecord(abilityEvent?.payload).metadata);
  if (diag?.formulaText && bindings) {
    steps.push({
      id: "formula",
      status: "ok",
      formulaText: diag.formulaText,
      bindings: bindingList,
      rank: num(abilityMeta.generic_rank),
      note: diag.formulaStatus && diag.formulaStatus !== "ok" ? `formula_status: ${diag.formulaStatus}` : null,
      provenance: [`${M}.formula_text`, `${M}.formula_bindings`, `${M}.generic_rank`],
    });
  } else if (beat.kind === "basic_attack") {
    steps.push({
      id: "formula",
      status: "limited",
      formulaText: null,
      bindings: [],
      rank: null,
      note: "Basic attacks carry no formula on the wire. The engine priced this hit through its attack model; only the reported inputs are shown.",
      provenance: [],
    });
    limitations.push("No formula text or bindings exist for basic attacks.");
  } else if (abilityEvent && diag && !diag.isGenericFormulaEvent) {
    steps.push({
      id: "formula",
      status: "limited",
      formulaText: null,
      bindings: [],
      rank: null,
      note: "A champion-specific runtime priced this ability in code; there is no formula to substitute.",
      provenance: [],
    });
    limitations.push("Champion-runtime ability: no formula evidence.");
  } else {
    steps.push({
      id: "formula",
      status: "limited",
      formulaText: diag?.formulaText ?? null,
      bindings: [],
      rank: null,
      note: `Formula bindings are not on this trace (detail: ${script.traceDetail ?? "unknown"}). Re-run at "calculation" or "full".`,
      provenance: diag?.formulaText ? [`${M}.formula_text`] : [],
    });
    limitations.push("No formula bindings on this event.");
  }

  // 3. Substitution ----------------------------------------------------------
  const rawResult = sourced(pipePayload, "raw_damage", P);
  if (diag?.formulaText && bindings) {
    steps.push({
      id: "substitution",
      status: "ok",
      tokens: tokenizeFormula(diag.formulaText, bindings),
      result: rawResult,
      reportedInputs: [],
      note: null,
      provenance: [`${M}.formula_bindings`, `${P}.raw_damage`],
    });
  } else {
    const model = asRecord(pipeMeta.ashe_attack_model);
    const modelKey = Object.keys(pipeMeta).find((k) => k.endsWith("_attack_model")) ?? null;
    const reported = Object.entries(modelKey ? asRecord(pipeMeta[modelKey]) : model)
      .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || typeof v === "string")
      .map(([name, value]) => ({ name, value: value as number | string | boolean }));
    steps.push({
      id: "substitution",
      status: reported.length > 0 ? "ok" : "limited",
      tokens: [],
      result: rawResult,
      reportedInputs: reported,
      note:
        reported.length > 0
          ? "Inputs the engine reports for its attack model. They are shown as reported, not combined client-side."
          : "No substitutable inputs are reported for this action.",
      provenance: [...(modelKey ? [`${M}.${modelKey}`] : []), `${P}.raw_damage`],
    });
  }

  // 4. Mitigation ------------------------------------------------------------
  const beforePipeline = sourced(pipeMeta, "raw_damage_before_pipeline", M);
  const payloadRaw = rawResult;
  const postMitigation = sourced(pipeMeta, "post_mitigation_damage", M);
  const resistanceField =
    num(pipeMeta.effective_magic_resist) !== null
      ? { kind: "magic_resist" as const, key: "effective_magic_resist", container: pipeMeta, prefix: M }
      : num(pipeMeta.effective_armor) !== null
        ? { kind: "armor" as const, key: "effective_armor", container: pipeMeta, prefix: M }
        : num(pipePayload.effective_armor) !== null
          ? { kind: "armor" as const, key: "effective_armor", container: pipePayload, prefix: P }
          : num(pipeMeta.target_armor_or_mr_used) !== null
            ? { kind: "resistance" as const, key: "target_armor_or_mr_used", container: pipeMeta, prefix: M }
            : null;
  const resistance = resistanceField
    ? { kind: resistanceField.kind, value: num(resistanceField.container[resistanceField.key]) as number, field: `${resistanceField.prefix}.${resistanceField.key}` }
    : null;
  // Prep handoff H1: on basic attacks `raw_damage_before_pipeline` equals the
  // POST-mitigation value, while `payload.raw_damage` holds the pre-mitigation
  // figure. Prefer `payload.raw_damage` whenever the two disagree, and say so.
  let before: Sourced | null = beforePipeline;
  let mitigationNote: string | null = null;
  if (payloadRaw && beforePipeline && Math.abs(payloadRaw.value - beforePipeline.value) > 1e-6) {
    before = payloadRaw;
    mitigationNote =
      "raw_damage_before_pipeline on this event equals the post-mitigation value (known backend labeling hazard for basic attacks); the pre-mitigation figure shown is payload.raw_damage.";
    limitations.push(mitigationNote);
  } else if (!before && payloadRaw) {
    before = payloadRaw;
  }
  const modifiers: Array<{ label: string; percent: Sourced | null; value: Sourced }> = [];
  const modifierKeys: Array<[string, string, string]> = [
    ["Outgoing damage amp", "attacker_outgoing_damage_amp_percent", "post_outgoing_amp_damage"],
    ["Damage taken amp", "target_damage_taken_amp_percent", "post_amp_damage"],
    ["Damage reduction", "target_damage_reduction_percent", "target_damage_after_reduction"],
  ];
  for (const [label, pctKey, valueKey] of modifierKeys) {
    const value = sourced(pipeMeta, valueKey, M);
    if (value) modifiers.push({ label, percent: sourced(pipeMeta, pctKey, M), value });
  }
  const mitigationOk = before !== null && postMitigation !== null;
  steps.push({
    id: "mitigation",
    status: mitigationOk ? "ok" : "limited",
    before,
    resistance,
    after: postMitigation,
    modifiers,
    note: mitigationOk
      ? mitigationNote
      : "Mitigation stages are not on this event (pipeline fields require trace detail \"calculation\" or \"full\").",
    provenance: [
      ...(before ? [before.field] : []),
      ...(resistance ? [resistance.field] : []),
      ...(postMitigation ? [postMitigation.field] : []),
    ],
  });
  if (!mitigationOk) limitations.push("No mitigation stages on this event.");
  if (mitigationOk && !resistance) limitations.push("No effective resistance value reported.");
  if (mitigationOk) {
    limitations.push("Penetration and lethality inputs are not on the wire; only the effective resistance is reported.");
  }

  // 5. Shield ------------------------------------------------------------------
  const shieldBefore = sourced(pipeMeta, "target_shield_before", M);
  const shieldAbsorbedV = sourced(pipeMeta, "target_shield_absorbed", M) ?? sourced(pipeMeta, "shield_absorbed", M);
  const shieldAfter = sourced(pipeMeta, "target_shield_after", M);
  if (shieldAbsorbedV) {
    const none = (shieldBefore?.value ?? 0) === 0 && shieldAbsorbedV.value === 0;
    steps.push({
      id: "shield",
      status: "ok",
      before: shieldBefore,
      absorbed: shieldAbsorbedV,
      after: shieldAfter,
      note: none ? "No shield on the target at this instant; nothing was absorbed." : null,
      provenance: [shieldBefore?.field, shieldAbsorbedV.field, shieldAfter?.field].filter(Boolean) as string[],
    });
  } else {
    steps.push({
      id: "shield",
      status: "limited",
      before: null,
      absorbed: null,
      after: null,
      note: "Shield absorption is not reported for this event.",
      provenance: [],
    });
    limitations.push("Shield absorption not reported.");
  }

  // 6. Final damage -------------------------------------------------------------
  // The scheduler's damage accounting is the HP authority. The kernel packet
  // also carries `metadata.applied_hp_damage`, but on the fixture's killing
  // blow that value is the unclamped hit (110.29) while the accounting's
  // `applied_hp_damage` is what actually left the pool (69.14) — so the
  // accounting value is preferred and a disagreement is reported, not hidden.
  const finalDamage = sourced(pipePayload, "final_damage", P);
  const packetApplied = sourced(pipeMeta, "applied_hp_damage", M);
  const accountingApplied: Sourced | null = beat.hp
    ? { value: beat.hp.applied, field: "meta.damage_accounting.by_scope.PRIMARY.applied_hp_damage" }
    : null;
  const appliedHp = accountingApplied ?? packetApplied;
  const overkill = finalDamage && appliedHp && finalDamage.value - appliedHp.value > 1e-6 ? finalDamage.value - appliedHp.value : null;
  let finalNote: string | null = overkill !== null ? "The hit exceeded the remaining HP; only the applied portion left the pool." : null;
  if (accountingApplied && packetApplied && Math.abs(accountingApplied.value - packetApplied.value) > 1e-6) {
    finalNote = `${finalNote ?? ""}${finalNote ? " " : ""}The packet's own applied_hp_damage (${formatDamage(packetApplied.value)}) is unclamped; the accounting value is shown.`.trim();
  }
  steps.push({
    id: "final",
    status: finalDamage || appliedHp ? "ok" : "limited",
    finalDamage,
    appliedHpDamage: appliedHp,
    overkill,
    note: finalNote,
    provenance: [finalDamage?.field, appliedHp?.field].filter(Boolean) as string[],
  });

  // 7. HP before / after ------------------------------------------------------------
  const hpPrefix = "meta.damage_accounting.by_scope.PRIMARY";
  steps.push({
    id: "hp",
    status: beat.hp ? "ok" : "limited",
    targetId: beat.targetId,
    before: beat.hp ? { value: beat.hp.before, field: `${hpPrefix}.hp_before` } : null,
    after: beat.hp ? { value: beat.hp.after, field: `${hpPrefix}.hp_after` } : null,
    applied: beat.hp ? { value: beat.hp.applied, field: `${hpPrefix}.applied_hp_damage` } : null,
    maxHp: target ? { value: target.maxHp, field: `effective_builds.${target.id}.max_hp` } : null,
    note: beat.hp ? null : "This action carries no PRIMARY-scope damage accounting.",
    provenance: beat.hp ? [`${hpPrefix}.hp_before`, `${hpPrefix}.hp_after`] : [],
  });

  return { beatSeq: beat.seq, steps, limitations: Array.from(new Set(limitations)) };
}

// ---------------------------------------------------------------------------
// Display helpers (formatting only)
// ---------------------------------------------------------------------------

export function formatHp(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

export function formatDamage(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(digits);
  return fixed.replace(/\.0+$/, "");
}

export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0.000";
  return seconds.toFixed(3);
}
