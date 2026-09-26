/**
 * JOURNEY-UI3 — THE REAL JOURNEY WIRE (backend JOURNEY3 `journey3/daily`).
 *
 * The Daily's Journey module (`mastery_slice` v2) carries, beside its
 * prefix-only `challenges`, the Journey's public block — shown a REACHED
 * PREFIX at a time by `visible_journey`:
 *
 *   segment_state.challenges.journey = {
 *     journey_version: "mastery_journey.v1",
 *     public_state_contract: "journey_public_state.v1",      ← what marks J3
 *     ledger_policy, reveal_policy, recipe_id, recipe_version, title, role,
 *     arc_type, plan, child_count,
 *     children: [ …reached only: {index, child_id, engine, domains,
 *                   state: JourneyPublicState (sides, focus, withheld),
 *                   premise, withheld, asks, learner, reinforces} ],
 *     transitions: [ …reached only (incl. one during its beat):
 *                   {transition_id, kind: level|purchase, presentation,
 *                    note, beat_ms, before_child, state_version,
 *                    events: [typed], changes: [lossless, NO cost]} ],
 *     open_delays_ms: [ …through the reached prefix… ] }
 *
 * THIS FILE IS THE ONLY PLACE THAT KNOWS J3's SPELLINGS. It reads them with a
 * typed ALLOWLIST: every object against its exact key set, an unknown key
 * anywhere fails the read. Unlike J2's reader it has NO carve-out: J3 publishes
 * no item gold (`cost`) anywhere, so the block also passes the generic
 * pre-reveal walk untouched (`ranked-public/contracts.ts`). Nothing here
 * computes a League value.
 *
 * Cross-checks on top of the shapes (fail closed):
 *   * an ask is always `withheld: true`;
 *   * a stat the child ASKS is absent from `stats` (named in `withheld` only);
 *   * a stat reading `"recalled"` is exactly one the state names as recalled;
 *   * every stat key is a premise stat from the closed vocabulary;
 *   * children are the contiguous reached prefix; a transition sits at most one
 *     child past it (the one whose beat is running).
 */
import { JourneyContractError, ABILITY_SLOTS, type AbilitySlot } from "./contract";
import { isJourneyStatKey, type JourneyStatKey } from "./stats";

export const JOURNEY_J3_VERSION = "mastery_journey.v1";
export const JOURNEY_J3_STATE_CONTRACT = "journey_public_state.v1";

export type J3Side = "player" | "opponent";
export type J3Engine = "champion" | "matchup" | "combat";

export interface J3Ability { slot: AbilitySlot; name: string; rank: number; unlocked: boolean }
export interface J3Item { itemId: string; name: string }

/** A stat on the public state: the server's number, or the `recalled` marker. */
export type J3StatValue = number | "recalled";

export interface J3SideState {
  side: J3Side;
  championId: string;
  champion: string;
  level: number;
  /** Always Q, W, E, R after reading (the wire sorts them alphabetically). */
  abilities: J3Ability[];
  inventory: J3Item[];
  stats: Partial<Record<JourneyStatKey, J3StatValue>>;
}

export type J3Focus =
  | { engine: "champion"; objective: string; side: J3Side; slot: AbilitySlot | null; stat: JourneyStatKey | null }
  | { engine: "matchup"; objective: string; sides: J3Side[]; slot: AbilitySlot }
  | { engine: "combat"; objective: string; side: J3Side; slot: AbilitySlot; targetSide: J3Side };

export interface J3StateWithheld {
  side: J3Side;
  /** `stats.<key>` or `abilities.<slot>.<what>` — a NAME, never a value. */
  field: string;
  reason: "asked" | "recalled";
  fact: string | null;
  establishedInChild: number | null;
}

export interface J3State {
  contract: typeof JOURNEY_J3_STATE_CONTRACT;
  stateVersion: number;
  stateKey: string;
  sides: Record<J3Side, J3SideState>;
  focus: J3Focus | null;
  withheld: J3StateWithheld[];
}

export interface J3Formula {
  abilityName: string;
  champion: string;
  slot: AbilitySlot;
  damageType: string;
  flatByRank: number[];
  ratios: { stat: string; label: string; ratio: number }[];
}

/** A fact this child RELIES ON without restating it (its number is withheld). */
export interface J3Recall {
  fact: string;
  /** `ability_damage` (a formula) or `target_armor`. */
  what: string;
  /** Named for a recalled target stat (`target_armor`); absent for a formula. */
  side: J3Side | null;
  champion: string;
  slot: AbilitySlot | null;
  /** How the learner got it: a premise STATED it, or a reveal TAUGHT it. */
  source: "stated" | "revealed";
  establishedInChild: number;
}

export interface J3Asks {
  engine: string;
  family: string;
  metric: string;
  subjectRef: string;
  subject: string | string[];
}

/** The learner ledger's public half. Correctness is NOT part of it. */
export interface J3Learner {
  established: {
    fact: string; kind: string; label: string; source: "stated" | "revealed"; child: number;
    /** The established value, as served (number, text, or a formula). */
    value: number | string | J3Formula;
  }[];
  reliesOn: { fact: string; what: string; source: "stated" | "revealed"; establishedInChild: number }[];
  states: { fact: string; kind: string; label: string; value: number | string | J3Formula }[];
}

export interface J3Child {
  index: number;
  childId: string;
  engine: J3Engine;
  domains: string[];
  state: J3State;
  /** A formula this child STATES (Combat, `formula: state`), else null. */
  formula: J3Formula | null;
  recalls: J3Recall[];
  asks: J3Asks;
  learner: J3Learner;
  reinforces: number[];
}

export type J3Event =
  | { type: "level_up"; side: J3Side; champion: string; from: number; to: number }
  | { type: "ability_rank_up"; side: J3Side; champion: string; slot: AbilitySlot; from: number; to: number; unlocked: boolean }
  | { type: "item_acquired"; side: J3Side; champion: string; itemId: string; name: string }
  | {
    type: "stat_change"; side: J3Side; champion: string; stat: JourneyStatKey;
    /** A DELTA, never a total (J3 §10). */
    delta: number;
    source: { itemId: string; name: string } | null;
  };

export interface J3Transition {
  transitionId: string;
  kind: "level" | "purchase";
  /** Narration only (e.g. `first_back`); never a timing or gold claim. */
  presentation: string | null;
  note: string;
  beatMs: number;
  beforeChild: number;
  stateVersion: number;
  events: J3Event[];
}

export interface JourneyJ3 {
  version: typeof JOURNEY_J3_VERSION;
  stateContract: typeof JOURNEY_J3_STATE_CONTRACT;
  /**
   * A Daily REVIEW re-ask (`reask: true`): ONE missed Journey child, re-asked
   * SELF-CONTAINED at current truth (every premise it once recalled is stated).
   * It names no recipe, title or plan; those read null here.
   */
  reask: boolean;
  ledgerPolicy: string | null;
  revealPolicy: string | null;
  recipeId: string | null;
  recipeVersion: number | null;
  title: string | null;
  role: string | null;
  arcType: string | null;
  plan: "standard" | "survival";
  childCount: number;
  children: J3Child[];
  transitions: J3Transition[];
  openDelaysMs: number[];
}

type Rec = Record<string, unknown>;
const fail = (m: string): never => { throw new JourneyContractError(`journey(j3): ${m}`); };
function shape(v: unknown, l: string, allowed: readonly string[], required: readonly string[] = allowed): Rec {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${l} must be an object`);
  const o = v as Rec;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${l} carries a field J3 does not publish: "${k}"`);
  for (const k of required) if (!(k in o)) fail(`${l}.${k} is required`);
  return o;
}
const str = (v: unknown, l: string): string => (typeof v === "string" ? v : fail(`${l} must be a string`));
const nstr = (v: unknown, l: string): string | null => (v === null || v === undefined ? null : str(v, l));
const int = (v: unknown, l: string, min = 0): number =>
  (typeof v === "number" && Number.isInteger(v) && v >= min ? v : fail(`${l} must be an integer ≥ ${min}`));
const num = (v: unknown, l: string): number =>
  (typeof v === "number" && Number.isFinite(v) ? v : fail(`${l} must be a finite number`));
const bool = (v: unknown, l: string): boolean => (typeof v === "boolean" ? v : fail(`${l} must be a boolean`));
const arr = (v: unknown, l: string): unknown[] => (Array.isArray(v) ? v : fail(`${l} must be an array`));
const side = (v: unknown, l: string): J3Side => (v === "player" || v === "opponent" ? v : fail(`${l} must be player|opponent`));
const slot = (v: unknown, l: string): AbilitySlot =>
  ((ABILITY_SLOTS as readonly unknown[]).includes(v) ? v as AbilitySlot : fail(`${l} must be Q, W, E or R`));
const source = (v: unknown, l: string): "stated" | "revealed" =>
  (v === "stated" || v === "revealed" ? v : fail(`${l} must be stated|revealed`));
const statKey = (v: unknown, l: string): JourneyStatKey =>
  (isJourneyStatKey(v) ? v : fail(`${l} is not a public premise stat: ${JSON.stringify(v)}`));
const engineOf = (v: unknown, l: string): J3Engine =>
  (v === "champion" || v === "matchup" || v === "combat" ? v : fail(`${l} must be champion|matchup|combat`));

function readFormula(v: unknown, l: string): J3Formula {
  const f = shape(v, l, ["ability_name", "champion", "slot", "damage_type", "flat_by_rank", "ratios"]);
  return {
    abilityName: str(f.ability_name, `${l}.ability_name`),
    champion: str(f.champion, `${l}.champion`),
    slot: slot(f.slot, `${l}.slot`),
    damageType: str(f.damage_type, `${l}.damage_type`),
    flatByRank: arr(f.flat_by_rank, `${l}.flat_by_rank`).map((n, i) => num(n, `${l}.flat_by_rank[${i}]`)),
    ratios: arr(f.ratios, `${l}.ratios`).map((r, i) => {
      const x = shape(r, `${l}.ratios[${i}]`, ["stat", "label", "ratio"]);
      return { stat: str(x.stat, "stat"), label: str(x.label, "label"), ratio: num(x.ratio, "ratio") };
    }),
  };
}

function readSideState(v: unknown, l: string, expected: J3Side): J3SideState {
  const o = shape(v, l, ["side", "champion_id", "champion", "level", "abilities", "inventory", "stats"]);
  if (side(o.side, `${l}.side`) !== expected) fail(`${l}.side must be ${expected}`);
  const abilities = arr(o.abilities, `${l}.abilities`).map((a, i) => {
    const x = shape(a, `${l}.abilities[${i}]`, ["slot", "name", "rank", "unlocked"]);
    const rank = int(x.rank, `${l}.abilities[${i}].rank`);
    const unlocked = bool(x.unlocked, `${l}.abilities[${i}].unlocked`);
    if (unlocked !== rank > 0) fail(`${l}.abilities[${i}].unlocked must agree with its rank`);
    return { slot: slot(x.slot, `${l}.abilities[${i}].slot`), name: str(x.name, `${l}.abilities[${i}].name`), rank, unlocked };
  });
  const bySlot = new Map(abilities.map((a) => [a.slot, a] as const));
  if (bySlot.size !== 4 || abilities.length !== 4) fail(`${l}.abilities must be exactly Q, W, E, R`);
  const stats: Partial<Record<JourneyStatKey, J3StatValue>> = {};
  const rawStats = shape(o.stats, `${l}.stats`, Object.keys((o.stats ?? {}) as Rec), []);
  for (const [k, val] of Object.entries(rawStats)) {
    const key = statKey(k, `${l}.stats key`);
    stats[key] = val === "recalled" ? "recalled" : num(val, `${l}.stats.${k}`);
  }
  return {
    side: expected,
    championId: str(o.champion_id, `${l}.champion_id`),
    champion: str(o.champion, `${l}.champion`),
    level: int(o.level, `${l}.level`, 1),
    abilities: ABILITY_SLOTS.map((s) => bySlot.get(s)!),
    inventory: arr(o.inventory, `${l}.inventory`).map((it, i) => {
      const x = shape(it, `${l}.inventory[${i}]`, ["item_id", "name"]);
      return { itemId: str(x.item_id, `${l}.inventory[${i}].item_id`), name: str(x.name, `${l}.inventory[${i}].name`) };
    }),
    stats,
  };
}

function readFocus(v: unknown, l: string): J3Focus | null {
  const o = v as Rec;
  if (!o || typeof o !== "object" || Object.keys(o).length === 0) return null;
  const engine = engineOf(o.engine, `${l}.engine`);
  if (engine === "matchup") {
    const x = shape(o, l, ["engine", "objective", "sides", "slot"]);
    return {
      engine, objective: str(x.objective, `${l}.objective`),
      sides: arr(x.sides, `${l}.sides`).map((s, i) => side(s, `${l}.sides[${i}]`)), slot: slot(x.slot, `${l}.slot`),
    };
  }
  if (engine === "combat") {
    const x = shape(o, l, ["engine", "objective", "side", "slot", "target_side"]);
    const attacker = side(x.side, `${l}.side`);
    const target = side(x.target_side, `${l}.target_side`);
    if (attacker === target) fail(`${l} attacker and target must differ`);
    return { engine, objective: str(x.objective, `${l}.objective`), side: attacker, slot: slot(x.slot, `${l}.slot`), targetSide: target };
  }
  const x = shape(o, l, ["engine", "objective", "side", "slot", "stat"], ["engine", "objective", "side"]);
  return {
    engine, objective: str(x.objective, `${l}.objective`), side: side(x.side, `${l}.side`),
    slot: x.slot === undefined ? null : slot(x.slot, `${l}.slot`),
    stat: x.stat === undefined ? null : statKey(x.stat, `${l}.stat`),
  };
}

function readState(v: unknown, l: string): J3State {
  const o = shape(v, l, ["contract", "state_version", "state_key", "sides", "focus", "withheld"]);
  if (o.contract !== JOURNEY_J3_STATE_CONTRACT) fail(`${l}.contract must be ${JOURNEY_J3_STATE_CONTRACT}`);
  const sides = shape(o.sides, `${l}.sides`, ["player", "opponent"]);
  const state: J3State = {
    contract: JOURNEY_J3_STATE_CONTRACT,
    stateVersion: int(o.state_version, `${l}.state_version`),
    stateKey: str(o.state_key, `${l}.state_key`),
    sides: {
      player: readSideState(sides.player, `${l}.sides.player`, "player"),
      opponent: readSideState(sides.opponent, `${l}.sides.opponent`, "opponent"),
    },
    focus: readFocus(o.focus, `${l}.focus`),
    withheld: arr(o.withheld, `${l}.withheld`).map((w, i) => {
      const wl = `${l}.withheld[${i}]`;
      const x = shape(w, wl, ["side", "field", "reason", "fact", "established_in_child"], ["side", "field", "reason"]);
      const reason = x.reason === "asked" || x.reason === "recalled" ? x.reason : fail(`${wl}.reason must be asked|recalled`);
      const field = str(x.field, `${wl}.field`);
      if (!/^(stats\.[a-z_]+|abilities\.[QWER]\.[a-z_]+)$/.test(field)) fail(`${wl}.field is not a public field name: ${field}`);
      return {
        side: side(x.side, `${wl}.side`), field, reason,
        fact: nstr(x.fact, `${wl}.fact`),
        establishedInChild: x.established_in_child === undefined ? null : int(x.established_in_child, `${wl}.established_in_child`),
      };
    }),
  };
  // A withheld stat must be ABSENT (asked) or read exactly "recalled".
  for (const w of state.withheld) {
    const m = /^stats\.([a-z_]+)$/.exec(w.field);
    if (!m) continue;
    const key = statKey(m[1], `${l}.withheld field`);
    const value = state.sides[w.side].stats[key];
    if (w.reason === "asked" && value !== undefined) fail(`${l} states the ASKED stat ${w.side}.${key}`);
    if (w.reason === "recalled" && value !== "recalled") fail(`${l} recalled stat ${w.side}.${key} must read "recalled"`);
  }
  for (const s of ["player", "opponent"] as const) {
    for (const [key, value] of Object.entries(state.sides[s].stats)) {
      if (value === "recalled" && !state.withheld.some((w) => w.side === s && w.field === `stats.${key}` && w.reason === "recalled")) {
        fail(`${l} ${s}.${key} reads "recalled" but the state names no such recall`);
      }
    }
  }
  return state;
}

function readLearnerValue(v: unknown, l: string): number | string | J3Formula {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return v;
  return readFormula(v, l);
}

function readChild(v: unknown, l: string, reask = false): J3Child {
  const keys = ["index", "child_id", "engine", "domains", "state", "premise", "withheld", "asks", "learner", "reinforces"];
  // A re-ask child is the only child of its block and carries no child id.
  const o = shape(v, l, reask ? keys.filter((k) => k !== "child_id") : keys);
  const a = shape(o.asks, `${l}.asks`, ["engine", "family", "metric", "subject_ref", "subject", "withheld"]);
  // The asked field is NAMED and its value WITHHELD, always.
  if (a.withheld !== true) fail(`${l}.asks must be withheld`);
  const premise = shape(o.premise, `${l}.premise`, ["ability_damage"], []);
  const ln = shape(o.learner, `${l}.learner`, ["established", "relies_on", "states"]);
  return {
    index: int(o.index, `${l}.index`),
    childId: reask ? "reask" : str(o.child_id, `${l}.child_id`),
    engine: engineOf(o.engine, `${l}.engine`),
    domains: arr(o.domains, `${l}.domains`).map((d, i) => str(d, `${l}.domains[${i}]`)),
    state: readState(o.state, `${l}.state`),
    formula: premise.ability_damage === undefined ? null : readFormula(premise.ability_damage, `${l}.premise.ability_damage`),
    recalls: arr(o.withheld, `${l}.withheld`).map((w, i) => {
      const wl = `${l}.withheld[${i}]`;
      const x = shape(w, wl, ["fact", "what", "side", "champion", "slot", "source", "established_in_child"],
        ["fact", "what", "champion", "source", "established_in_child"]);
      return {
        fact: str(x.fact, `${wl}.fact`), what: str(x.what, `${wl}.what`),
        side: x.side === undefined ? null : side(x.side, `${wl}.side`),
        champion: str(x.champion, `${wl}.champion`), slot: x.slot === undefined ? null : slot(x.slot, `${wl}.slot`),
        source: source(x.source, `${wl}.source`), establishedInChild: int(x.established_in_child, `${wl}.established_in_child`),
      };
    }),
    asks: {
      engine: str(a.engine, `${l}.asks.engine`), family: str(a.family, `${l}.asks.family`),
      metric: str(a.metric, `${l}.asks.metric`), subjectRef: str(a.subject_ref, `${l}.asks.subject_ref`),
      subject: Array.isArray(a.subject)
        ? a.subject.map((s, i) => str(s, `${l}.asks.subject[${i}]`)) : str(a.subject, `${l}.asks.subject`),
    },
    learner: {
      established: arr(ln.established, `${l}.learner.established`).map((e, i) => {
        const el = `${l}.learner.established[${i}]`;
        const x = shape(e, el, ["fact", "kind", "label", "source", "value", "child"]);
        return {
          fact: str(x.fact, `${el}.fact`), kind: str(x.kind, `${el}.kind`), label: str(x.label, `${el}.label`),
          source: source(x.source, `${el}.source`), child: int(x.child, `${el}.child`),
          value: readLearnerValue(x.value, `${el}.value`),
        };
      }),
      reliesOn: arr(ln.relies_on, `${l}.learner.relies_on`).map((r, i) => {
        const rl = `${l}.learner.relies_on[${i}]`;
        const x = shape(r, rl, ["fact", "what", "source", "established_in_child"]);
        return {
          fact: str(x.fact, `${rl}.fact`), what: str(x.what, `${rl}.what`),
          source: source(x.source, `${rl}.source`), establishedInChild: int(x.established_in_child, `${rl}.established_in_child`),
        };
      }),
      states: arr(ln.states, `${l}.learner.states`).map((s, i) => {
        const sl = `${l}.learner.states[${i}]`;
        const x = shape(s, sl, ["fact", "kind", "label", "value"]);
        return {
          fact: str(x.fact, `${sl}.fact`), kind: str(x.kind, `${sl}.kind`), label: str(x.label, `${sl}.label`),
          value: readLearnerValue(x.value, `${sl}.value`),
        };
      }),
    },
    reinforces: arr(o.reinforces, `${l}.reinforces`).map((r, i) => int(r, `${l}.reinforces[${i}]`)),
  };
}

function readEvent(v: unknown, l: string): J3Event {
  const type = v && typeof v === "object" ? (v as Rec).type : undefined;
  switch (type) {
    case "level_up": {
      const x = shape(v, l, ["type", "side", "champion", "from", "to"]);
      return { type, side: side(x.side, `${l}.side`), champion: str(x.champion, `${l}.champion`), from: int(x.from, `${l}.from`, 1), to: int(x.to, `${l}.to`, 1) };
    }
    case "ability_rank_up": {
      const x = shape(v, l, ["type", "side", "champion", "slot", "from", "to", "unlocked"]);
      return {
        type, side: side(x.side, `${l}.side`), champion: str(x.champion, `${l}.champion`), slot: slot(x.slot, `${l}.slot`),
        from: int(x.from, `${l}.from`), to: int(x.to, `${l}.to`, 1), unlocked: bool(x.unlocked, `${l}.unlocked`),
      };
    }
    case "item_acquired": {
      const x = shape(v, l, ["type", "side", "champion", "item_id", "name"]);
      return { type, side: side(x.side, `${l}.side`), champion: str(x.champion, `${l}.champion`), itemId: str(x.item_id, `${l}.item_id`), name: str(x.name, `${l}.name`) };
    }
    case "stat_change": {
      const x = shape(v, l, ["type", "side", "champion", "stat", "delta", "source"]);
      const src = x.source === null ? null : shape(x.source, `${l}.source`, ["item_id", "name"]);
      return {
        type, side: side(x.side, `${l}.side`), champion: str(x.champion, `${l}.champion`),
        stat: statKey(x.stat, `${l}.stat`), delta: num(x.delta, `${l}.delta`),
        source: src ? { itemId: str(src.item_id, `${l}.source.item_id`), name: str(src.name, `${l}.source.name`) } : null,
      };
    }
    default:
      return fail(`${l}.type is not a J3 transition event: ${JSON.stringify(type)}`);
  }
}

function readTransition(v: unknown, l: string): J3Transition {
  const o = shape(v, l, ["transition_id", "kind", "presentation", "note", "beat_ms", "before_child", "state_version", "events", "changes"]);
  const kind = o.kind === "level" || o.kind === "purchase" ? o.kind : fail(`${l}.kind must be level|purchase (recall is retired)`);
  // `changes` is J3's lossless legacy record of the same transition. The typed
  // `events` are what the board reads; `changes` is checked for shape (and for
  // the absence of any gold) and otherwise ignored.
  arr(o.changes, `${l}.changes`).forEach((c, i) => {
    const cl = `${l}.changes[${i}]`;
    const x = shape(c, cl, ["side", "champion", "level", "ranks", "items_added"]);
    side(x.side, `${cl}.side`);
    arr(x.items_added, `${cl}.items_added`).forEach((it, j) => shape(it, `${cl}.items_added[${j}]`, ["item_id", "name"]));
  });
  const events = arr(o.events, `${l}.events`).map((e, i) => readEvent(e, `${l}.events[${i}]`));
  if (events.length === 0) fail(`${l}.events must not be empty`);
  return {
    transitionId: str(o.transition_id, `${l}.transition_id`),
    kind,
    presentation: nstr(o.presentation, `${l}.presentation`),
    note: str(o.note, `${l}.note`),
    beatMs: int(o.beat_ms, `${l}.beat_ms`),
    beforeChild: int(o.before_child, `${l}.before_child`),
    stateVersion: int(o.state_version, `${l}.state_version`),
    events,
  };
}

/** Is this raw block J3's (it names the public-state contract)? */
export function isJourneyJ3(raw: unknown): boolean {
  return !!raw && typeof raw === "object" && !Array.isArray(raw)
    && (raw as Rec).public_state_contract === JOURNEY_J3_STATE_CONTRACT;
}

/** A Daily Review re-ask block: its own exact key set, one self-contained child. */
function readReask(json: unknown): JourneyJ3 {
  const o = shape(json, "journey",
    ["journey_version", "reask", "public_state_contract", "children", "transitions", "open_delays_ms"]);
  if (o.journey_version !== JOURNEY_J3_VERSION) fail(`unsupported journey_version ${JSON.stringify(o.journey_version)}`);
  if (o.public_state_contract !== JOURNEY_J3_STATE_CONTRACT) fail(`unsupported public_state_contract ${JSON.stringify(o.public_state_contract)}`);
  const children = arr(o.children, "journey.children").map((c, i) => readChild(c, `journey.children[${i}]`, true));
  if (children.length !== 1 || children[0].index !== 0) fail("a re-ask carries exactly one child, index 0");
  // Self-contained: nothing recalled, no transition, no earlier child to lean on.
  if (children[0].recalls.length || children[0].reinforces.length) fail("a re-ask recalls nothing");
  if (arr(o.transitions, "journey.transitions").length) fail("a re-ask has no transition");
  return {
    version: JOURNEY_J3_VERSION, stateContract: JOURNEY_J3_STATE_CONTRACT, reask: true,
    ledgerPolicy: null, revealPolicy: null, recipeId: null, recipeVersion: null,
    title: null, role: null, arcType: null, plan: "standard", childCount: 1,
    children, transitions: [],
    openDelaysMs: arr(o.open_delays_ms, "open_delays_ms").map((d, i) => int(d, `open_delays_ms[${i}]`)),
  };
}

/** J3 public block → typed. Throws `JourneyContractError` on anything off-contract. */
export function readJourneyJ3(json: unknown): JourneyJ3 {
  if (json && typeof json === "object" && !Array.isArray(json) && "reask" in json) {
    if ((json as Rec).reask !== true) fail("reask must be true when present");
    return readReask(json);
  }
  const o = shape(json, "journey",
    ["journey_version", "public_state_contract", "ledger_policy", "reveal_policy", "recipe_id", "recipe_version",
      "title", "role", "arc_type", "plan", "child_count", "children", "transitions", "open_delays_ms"]);
  if (o.journey_version !== JOURNEY_J3_VERSION) fail(`unsupported journey_version ${JSON.stringify(o.journey_version)}`);
  if (o.public_state_contract !== JOURNEY_J3_STATE_CONTRACT) fail(`unsupported public_state_contract ${JSON.stringify(o.public_state_contract)}`);
  const plan = o.plan === "standard" || o.plan === "survival" ? o.plan : fail("plan must be standard|survival");
  const childCount = int(o.child_count, "child_count", 1);
  const children = arr(o.children, "journey.children").map((c, i) => readChild(c, `journey.children[${i}]`));
  children.forEach((c, i) => { if (c.index !== i) fail("journey.children must be the contiguous reached prefix"); });
  if (children.length > childCount) fail("journey.children exceeds child_count");
  const transitions = arr(o.transitions, "journey.transitions").map((t, i) => readTransition(t, `journey.transitions[${i}]`));
  for (const t of transitions) {
    if (t.beforeChild > children.length || t.beforeChild >= childCount) {
      fail(`transition ${t.transitionId} is past the reached prefix`);
    }
  }
  return {
    version: JOURNEY_J3_VERSION,
    stateContract: JOURNEY_J3_STATE_CONTRACT,
    reask: false,
    ledgerPolicy: str(o.ledger_policy, "ledger_policy"),
    revealPolicy: str(o.reveal_policy, "reveal_policy"),
    recipeId: str(o.recipe_id, "recipe_id"),
    recipeVersion: int(o.recipe_version, "recipe_version", 1),
    title: str(o.title, "title"),
    role: str(o.role, "role"),
    arcType: str(o.arc_type, "arc_type"),
    plan,
    childCount,
    children,
    transitions,
    openDelaysMs: arr(o.open_delays_ms, "open_delays_ms").map((d, i) => int(d, `open_delays_ms[${i}]`)),
  };
}
