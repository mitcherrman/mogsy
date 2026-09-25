/**
 * JOURNEY-UI2 — THE REAL JOURNEY WIRE (backend JOURNEY2 `journey2/core` @ 52e9d929).
 *
 * A Mastery Journey segment's public view carries, beside its prefix-only
 * `challenges`, the Journey's public block (`mastery_slice.PAYLOAD_JOURNEY`,
 * built by `mastery.setup_state.journey.journey_blocks` and shown a REACHED
 * PREFIX at a time by `journey_visible`):
 *
 *   segment_state.challenges = {
 *     prompt, challenge_count,           // challenge_count is the WHOLE module
 *     challenges: [ …reached children only… ],
 *     journey: {
 *       journey_version: "mastery_journey.v1", recipe_id, recipe_version,
 *       title, role, arc_type, plan, child_count,
 *       children:    [ …reached only: {index, child_id, engine, domains,
 *                       state:{player,opponent}, premise, withheld, asks,
 *                       reinforces} ],
 *       transitions: [ …reached only, incl. one during its beat… ],
 *       open_delays_ms: [ …through the reached prefix… ] } }
 *
 * THIS FILE IS THE ONLY PLACE THAT KNOWS J2's SPELLINGS. It reads them with a
 * typed ALLOWLIST (every object against its exact key set; an unknown key fails
 * the read), which is also why the generic pre-reveal walk can hand this one
 * block over (`ranked-public/contracts.ts`): J2 narrates an item's gold as
 * `items_added[].cost`, a key the walk bans everywhere because it is an
 * item-cost-duel ANSWER. Here `cost` is legal at exactly that path and nowhere
 * else. A J3 contract gets its own reader beside this one; the board reads the
 * adapter's output (`adapter.ts`), never this.
 */
import { JourneyContractError } from "./contract";

export const JOURNEY_J2_VERSION = "mastery_journey.v1";

export type J2Side = "player" | "opponent";

export interface J2SideState {
  champion: string;
  level: number;
  /** Slot → rank, as the accepted skill path gives them. 0 = not learned. */
  ranks: Record<string, number>;
  /** Item NAMES, in purchase order. */
  items: string[];
}

export interface J2Formula {
  abilityName: string;
  champion: string;
  slot: string;
  damageType: string;
  flatByRank: number[];
  ratios: { stat: string; label: string; ratio: number }[];
}

export interface J2Withheld {
  fact: string;
  what: string;
  slot: string;
  champion: string;
  /** The EARLIER child that stated this fact (the learner-ledger teacher). */
  establishedInChild: number;
}

export interface J2Asks {
  engine: string;
  family: string;
  metric: string;
  subjectRef: string;
  /** One champion, or both for a Matchup. */
  subject: string | string[];
}

export interface J2Child {
  index: number;
  childId: string;
  engine: "champion" | "matchup" | "combat";
  domains: string[];
  state: Record<J2Side, J2SideState>;
  /** A formula this child STATES (Combat, `formula: state`), else null. */
  formula: J2Formula | null;
  withheld: J2Withheld[];
  asks: J2Asks;
  reinforces: number[];
}

export interface J2Change {
  side: J2Side;
  champion: string;
  level: [number, number] | null;
  ranks: Record<string, [number, number]>;
  itemsAdded: { itemId: string; name: string; cost: number | null }[];
}

export interface J2Transition {
  transitionId: string;
  kind: "level" | "purchase" | "recall";
  note: string;
  beatMs: number;
  beforeChild: number;
  changes: J2Change[];
}

export interface JourneyJ2 {
  version: typeof JOURNEY_J2_VERSION;
  recipeId: string;
  recipeVersion: number;
  title: string;
  role: string;
  arcType: string;
  plan: string;
  childCount: number;
  children: J2Child[];
  transitions: J2Transition[];
  openDelaysMs: number[];
}

type Rec = Record<string, unknown>;
const fail = (m: string): never => { throw new JourneyContractError(`journey(j2): ${m}`); };
function shape(v: unknown, l: string, allowed: readonly string[], required: readonly string[] = allowed): Rec {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${l} must be an object`);
  const o = v as Rec;
  for (const k of Object.keys(o)) if (!allowed.includes(k)) fail(`${l} carries a field J2 does not publish: "${k}"`);
  for (const k of required) if (!(k in o)) fail(`${l}.${k} is required`);
  return o;
}
const str = (v: unknown, l: string): string => (typeof v === "string" ? v : fail(`${l} must be a string`));
const int = (v: unknown, l: string, min = 0): number =>
  (typeof v === "number" && Number.isInteger(v) && v >= min ? v : fail(`${l} must be an integer ≥ ${min}`));
const num = (v: unknown, l: string): number =>
  (typeof v === "number" && Number.isFinite(v) ? v : fail(`${l} must be a finite number`));
const arr = (v: unknown, l: string): unknown[] => (Array.isArray(v) ? v : fail(`${l} must be an array`));
const side = (v: unknown, l: string): J2Side => (v === "player" || v === "opponent" ? v : fail(`${l} must be player|opponent`));
const slot = (v: unknown, l: string): string =>
  (typeof v === "string" && /^[A-Z]$/.test(v) ? v : fail(`${l} must be one ability slot letter`));

function readSideState(v: unknown, l: string): J2SideState {
  const o = shape(v, l, ["champion", "level", "ranks", "items"]);
  const ranks: Record<string, number> = {};
  for (const [k, r] of Object.entries(shape(o.ranks, `${l}.ranks`, Object.keys(o.ranks as Rec ?? {}), []))) {
    ranks[slot(k, `${l}.ranks key`)] = int(r, `${l}.ranks.${k}`);
  }
  return {
    champion: str(o.champion, `${l}.champion`),
    level: int(o.level, `${l}.level`, 1),
    ranks,
    items: arr(o.items, `${l}.items`).map((it, i) => str(it, `${l}.items[${i}]`)),
  };
}

function readFormula(v: unknown, l: string): J2Formula | null {
  const o = shape(v, l, ["ability_damage"], []);
  if (o.ability_damage === undefined) return null;
  const f = shape(o.ability_damage, `${l}.ability_damage`,
    ["ability_name", "champion", "slot", "damage_type", "flat_by_rank", "ratios"]);
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

function readChild(v: unknown, l: string): J2Child {
  const o = shape(v, l, ["index", "child_id", "engine", "domains", "state", "premise", "withheld", "asks", "reinforces"]);
  const engine = o.engine === "champion" || o.engine === "matchup" || o.engine === "combat"
    ? o.engine : fail(`${l}.engine must be champion|matchup|combat`);
  const st = shape(o.state, `${l}.state`, ["player", "opponent"]);
  const a = shape(o.asks, `${l}.asks`, ["engine", "family", "metric", "subject_ref", "subject", "withheld"]);
  // The asked field is NAMED and its value WITHHELD, always.
  if (a.withheld !== true) fail(`${l}.asks must be withheld`);
  const subject = Array.isArray(a.subject)
    ? a.subject.map((s, i) => str(s, `${l}.asks.subject[${i}]`)) : str(a.subject, `${l}.asks.subject`);
  return {
    index: int(o.index, `${l}.index`),
    childId: str(o.child_id, `${l}.child_id`),
    engine,
    domains: arr(o.domains, `${l}.domains`).map((d, i) => str(d, `${l}.domains[${i}]`)),
    state: { player: readSideState(st.player, `${l}.state.player`), opponent: readSideState(st.opponent, `${l}.state.opponent`) },
    formula: readFormula(o.premise, `${l}.premise`),
    withheld: arr(o.withheld, `${l}.withheld`).map((w, i) => {
      const x = shape(w, `${l}.withheld[${i}]`, ["fact", "what", "slot", "champion", "established_in_child"]);
      return {
        fact: str(x.fact, "fact"), what: str(x.what, "what"), slot: slot(x.slot, "slot"),
        champion: str(x.champion, "champion"), establishedInChild: int(x.established_in_child, "established_in_child"),
      };
    }),
    asks: {
      engine: str(a.engine, `${l}.asks.engine`), family: str(a.family, `${l}.asks.family`),
      metric: str(a.metric, `${l}.asks.metric`), subjectRef: str(a.subject_ref, `${l}.asks.subject_ref`), subject,
    },
    reinforces: arr(o.reinforces, `${l}.reinforces`).map((r, i) => int(r, `${l}.reinforces[${i}]`)),
  };
}

function readTransition(v: unknown, l: string): J2Transition {
  const o = shape(v, l, ["transition_id", "kind", "note", "beat_ms", "before_child", "changes"]);
  const kind = o.kind === "level" || o.kind === "purchase" || o.kind === "recall"
    ? o.kind : fail(`${l}.kind must be level|purchase|recall`);
  return {
    transitionId: str(o.transition_id, `${l}.transition_id`),
    kind,
    note: str(o.note, `${l}.note`),
    beatMs: int(o.beat_ms, `${l}.beat_ms`),
    beforeChild: int(o.before_child, `${l}.before_child`),
    changes: arr(o.changes, `${l}.changes`).map((c, i) => {
      const cl = `${l}.changes[${i}]`;
      const x = shape(c, cl, ["side", "champion", "level", "ranks", "items_added"]);
      const level = x.level === null ? null : (() => {
        const p = arr(x.level, `${cl}.level`);
        if (p.length !== 2) fail(`${cl}.level must be [from, to]`);
        return [int(p[0], `${cl}.level[0]`, 1), int(p[1], `${cl}.level[1]`, 1)] as [number, number];
      })();
      const ranks: Record<string, [number, number]> = {};
      for (const [k, pair] of Object.entries(shape(x.ranks, `${cl}.ranks`, Object.keys(x.ranks as Rec ?? {}), []))) {
        const p = arr(pair, `${cl}.ranks.${k}`);
        if (p.length !== 2) fail(`${cl}.ranks.${k} must be [from, to]`);
        ranks[slot(k, `${cl}.ranks key`)] = [int(p[0], "from"), int(p[1], "to")];
      }
      return {
        side: side(x.side, `${cl}.side`),
        champion: str(x.champion, `${cl}.champion`),
        level,
        ranks,
        // `cost` is gold NARRATION (item_canonical.total_cost), legal ONLY here.
        itemsAdded: arr(x.items_added, `${cl}.items_added`).map((it, j) => {
          const y = shape(it, `${cl}.items_added[${j}]`, ["item_id", "name", "cost"], ["item_id", "name"]);
          return {
            itemId: str(y.item_id, "item_id"), name: str(y.name, "name"),
            cost: y.cost === undefined || y.cost === null ? null : int(y.cost, "cost"),
          };
        }),
      };
    }),
  };
}

/** J2 public block → typed. Throws `JourneyContractError` on anything off-contract. */
export function readJourneyJ2(json: unknown): JourneyJ2 {
  const o = shape(json, "journey",
    ["journey_version", "recipe_id", "recipe_version", "title", "role", "arc_type", "plan",
      "child_count", "children", "transitions", "open_delays_ms"]);
  if (o.journey_version !== JOURNEY_J2_VERSION) fail(`unsupported journey_version ${JSON.stringify(o.journey_version)}`);
  const children = arr(o.children, "journey.children").map((c, i) => readChild(c, `journey.children[${i}]`));
  children.forEach((c, i) => { if (c.index !== i) fail("journey.children must be the contiguous reached prefix"); });
  return {
    version: JOURNEY_J2_VERSION,
    recipeId: str(o.recipe_id, "recipe_id"),
    recipeVersion: int(o.recipe_version, "recipe_version", 1),
    title: str(o.title, "title"),
    role: str(o.role, "role"),
    arcType: str(o.arc_type, "arc_type"),
    plan: str(o.plan, "plan"),
    childCount: int(o.child_count, "child_count", 1),
    children,
    transitions: arr(o.transitions, "journey.transitions").map((t, i) => readTransition(t, `journey.transitions[${i}]`)),
    openDelaysMs: arr(o.open_delays_ms, "open_delays_ms").map((d, i) => int(d, `open_delays_ms[${i}]`)),
  };
}
