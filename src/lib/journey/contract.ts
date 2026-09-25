/**
 * JOURNEY-UI1 — THE PROVISIONAL PUBLIC JOURNEY STATE (`journey.public.v0`).
 *
 * WHAT THIS IS
 * ────────────
 * The canonical, answer-safe state a Journey board draws: two champions (the
 * Journey's SUBJECT and its OPPONENT), each with level, Q/W/E/R ranks, a six-
 * slot inventory and a few premise stats, plus the TRANSITION that led into
 * the current node and which facts the current question is about.
 *
 * It is written against JOURNEY1 (backend `JOURNEY1_HANDOFF.md` §8, §13), which
 * freezes the resolved nodes and transitions PRIVATELY and publishes per child
 * only `{beat, node_label, transition_note}`. A board needs the node's state in
 * public, so this is the smallest public projection of JOURNEY1's own node
 * shape (`sides:[{champion, level, ranks, items}]`) + transitions + ledger
 * `displayed` facts. Divergences are listed in `DAILY_STAGE_RESULT_HANDOFF.md`.
 *
 * WHERE IT LIVES ON THE WIRE — PER VIEWER, NOT PER CHILD
 * ───────────────────────────────────────────────────────
 * `mastery_slice.public_view` publishes EVERY child of a segment at segment
 * open. A Journey reinforces across children (JOURNEY1 arc C: the armor asked
 * by child 1 is the stated premise of child 3), so a state attached to each
 * child would publish child 3's premise — child 1's ANSWER — before child 1 is
 * played. The state is therefore a per-viewer field of the SEGMENT STATE
 * (`segment_state.journey`), advanced by the server with the viewer's own
 * position exactly as `own_next_challenge_index` is. It always describes the
 * viewer's CURRENT child and nothing after it.
 *
 * SAFETY IS A TYPED ALLOWLIST, NOT A BANNED-WORD LIST
 * ────────────────────────────────────────────────────
 * Every object is read against the exact set of keys it may carry; an unknown
 * key anywhere fails the whole read (`JourneyContractError`). Stats come from
 * a closed vocabulary of PREMISE inputs (`stats.ts`) — a cooldown, a damage
 * number or an effective resistance has no key to arrive under. A value the
 * current question asks for is WITHHELD by the server: it arrives as
 * `{key, withheld: true}` with NO `value` key at all, and a withheld stat that
 * carries one is refused rather than hidden. Transition events are cross-
 * checked against the state they lead into, so an event can neither restate a
 * withheld number nor contradict the board.
 *
 * The board never computes anything from this: every number is the server's.
 */
import { isJourneyStatKey, type JourneyStatKey } from "./stats";

export const JOURNEY_PUBLIC_CONTRACT = "journey.public.v0";

export type JourneySideId = "subject" | "opponent";
export type AbilitySlot = "Q" | "W" | "E" | "R";
export const ABILITY_SLOTS: readonly AbilitySlot[] = ["Q", "W", "E", "R"];
export const INVENTORY_SLOTS = 6;

export interface JourneyAbility {
  slot: AbilitySlot;
  /** 0 = not learned (an R before 6 is locked, not missing). */
  rank: number;
  maxRank: number;
  name: string | null;
  /** Public asset path, when the server states one. */
  icon: string | null;
}

export interface JourneyItem {
  /** 0..5 — the slot is the item's place on the board, fixed. */
  slot: number;
  itemId: number;
  name: string;
  icon: string | null;
}

/**
 * `withheld` ⇔ `value === null`. On the WIRE a withheld stat has no `value`
 * key at all (the reader refuses one that does); this in-memory null is the
 * reader's own marker, never a value the server sent.
 */
export interface JourneyStat {
  key: JourneyStatKey;
  withheld: boolean;
  value: number | null;
}

/** Tracked vitals. Absent = the Journey does not track them and nothing is drawn. */
export interface JourneyVitals {
  health: { current: number; max: number | null } | null;
  resource: { kind: string; current: number; max: number | null } | null;
}

export interface JourneySide {
  side: JourneySideId;
  championId: string;
  championName: string;
  icon: string | null;
  level: number;
  /** Always Q, W, E, R, in that order. */
  abilities: JourneyAbility[];
  /** Occupied slots only, ascending by slot. */
  items: JourneyItem[];
  stats: JourneyStat[];
  vitals: JourneyVitals | null;
}

export type JourneyEvent =
  | { kind: "level"; side: JourneySideId; from: number; to: number }
  | { kind: "ability_rank"; side: JourneySideId; slot: AbilitySlot; from: number; to: number }
  | { kind: "ability_unlock"; side: JourneySideId; slot: AbilitySlot }
  | {
    kind: "purchase"; side: JourneySideId;
    /** `recall` groups a back-to-base purchase; `null` is a plain purchase. */
    group: "recall" | null;
    items: { slot: number; itemId: number; name: string; cost: number | null }[];
  }
  | { kind: "item_removed"; side: JourneySideId; itemId: number; name: string }
  | { kind: "stat_delta"; side: JourneySideId; key: JourneyStatKey; from: number; to: number };

export interface JourneyTransition {
  fromNode: string;
  toNode: string;
  /** One line of narration, e.g. "Olaf buys Chain Vest (800g)". */
  label: string | null;
  events: JourneyEvent[];
  /**
   * THE CANONICAL BEAT. `until` is the server instant before which the next
   * question is not answerable (the server starts that child's clock after
   * it); `ms` is the beat's length, for pacing the animation. The client never
   * moves either — it only waits for `until`.
   */
  beat: { ms: number; until: string | null };
}

export type JourneyFocusRef =
  | { side: JourneySideId; kind: "stat"; key: JourneyStatKey }
  | { side: JourneySideId; kind: "ability"; key: AbilitySlot }
  | { side: JourneySideId; kind: "item"; key: number }
  | { side: JourneySideId; kind: "level" };

export interface JourneyFocus {
  /** Premise facts the current question is about. Never an answer option. */
  refs: JourneyFocusRef[];
  /** Combat only: who hits whom. */
  combat: { attacker: JourneySideId; target: JourneySideId } | null;
}

export interface JourneyPublicState {
  contract: typeof JOURNEY_PUBLIC_CONTRACT;
  /** Opaque and stable for the whole Journey — the board's mount key. */
  journeyKey: string;
  plan: "standard" | "survival";
  title: string | null;
  step: { index: number; count: number; nodeId: string; nodeLabel: string | null };
  /** [subject, opponent], always in that order after reading. */
  sides: [JourneySide, JourneySide];
  /** The transition INTO the current node, only on the child right after it. */
  transition: JourneyTransition | null;
  focus: JourneyFocus;
}

// ── the reader ──────────────────────────────────────────────────────────────

export class JourneyContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JourneyContractError";
  }
}

type Rec = Record<string, unknown>;
const fail = (m: string): never => { throw new JourneyContractError(`journey: ${m}`); };

/** An object with EXACTLY these keys allowed; `required` must be present. */
function shape(v: unknown, l: string, allowed: readonly string[], required: readonly string[] = allowed): Rec {
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(`${l} must be an object`);
  const o = v as Rec;
  for (const k of Object.keys(o)) {
    if (!allowed.includes(k)) fail(`${l} carries a field the public contract does not allow: "${k}"`);
  }
  for (const k of required) {
    if (!(k in o)) fail(`${l}.${k} is required`);
  }
  return o;
}
const str = (v: unknown, l: string): string =>
  (typeof v === "string" && v.length > 0 ? v : fail(`${l} must be a non-empty string`));
const optStr = (v: unknown, l: string): string | null =>
  (v === null || v === undefined ? null : str(v, l));
const int = (v: unknown, l: string, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max
    ? v : fail(`${l} must be an integer in ${min}..${max}`));
const num = (v: unknown, l: string): number =>
  (typeof v === "number" && Number.isFinite(v) ? v : fail(`${l} must be a finite number`));
const optNum = (v: unknown, l: string): number | null =>
  (v === null || v === undefined ? null : num(v, l));
const arr = (v: unknown, l: string): unknown[] => (Array.isArray(v) ? v : fail(`${l} must be an array`));
const sideId = (v: unknown, l: string): JourneySideId =>
  (v === "subject" || v === "opponent" ? v : fail(`${l} must be "subject" or "opponent"`));
const slotId = (v: unknown, l: string): AbilitySlot =>
  ((ABILITY_SLOTS as readonly unknown[]).includes(v) ? v as AbilitySlot : fail(`${l} must be Q, W, E or R`));
const statKey = (v: unknown, l: string): JourneyStatKey =>
  (isJourneyStatKey(v) ? v : fail(`${l} is not a public premise stat: ${JSON.stringify(v)}`));

function readAbility(v: unknown, l: string): JourneyAbility {
  const o = shape(v, l, ["slot", "rank", "max_rank", "name", "icon"], ["slot", "rank", "max_rank"]);
  const maxRank = int(o.max_rank, `${l}.max_rank`, 1, 6);
  return {
    slot: slotId(o.slot, `${l}.slot`),
    rank: int(o.rank, `${l}.rank`, 0, maxRank),
    maxRank,
    name: optStr(o.name, `${l}.name`),
    icon: optStr(o.icon, `${l}.icon`),
  };
}

function readItem(v: unknown, l: string): JourneyItem {
  const o = shape(v, l, ["slot", "item_id", "name", "icon"], ["slot", "item_id", "name"]);
  return {
    slot: int(o.slot, `${l}.slot`, 0, INVENTORY_SLOTS - 1),
    itemId: int(o.item_id, `${l}.item_id`, 1),
    name: str(o.name, `${l}.name`),
    icon: optStr(o.icon, `${l}.icon`),
  };
}

function readStat(v: unknown, l: string): JourneyStat {
  const o = shape(v, l, ["key", "value", "withheld"], ["key"]);
  const key = statKey(o.key, `${l}.key`);
  if (o.withheld === true) {
    // The whole point: a withheld value must not EXIST in the public payload.
    // Not null, not zero, not hidden — absent.
    if ("value" in o) fail(`${l} is withheld but carries a value; the server must omit it`);
    return { key, withheld: true, value: null };
  }
  if (o.withheld !== undefined && o.withheld !== false) fail(`${l}.withheld must be a boolean`);
  return { key, withheld: false, value: num(o.value, `${l}.value`) };
}

function readVitals(v: unknown, l: string): JourneyVitals | null {
  if (v === null || v === undefined) return null;
  const o = shape(v, l, ["health", "resource"], []);
  const health = o.health === null || o.health === undefined ? null : (() => {
    const h = shape(o.health, `${l}.health`, ["current", "max"], ["current"]);
    return { current: num(h.current, `${l}.health.current`), max: optNum(h.max, `${l}.health.max`) };
  })();
  const resource = o.resource === null || o.resource === undefined ? null : (() => {
    const r = shape(o.resource, `${l}.resource`, ["kind", "current", "max"], ["kind", "current"]);
    return {
      kind: str(r.kind, `${l}.resource.kind`),
      current: num(r.current, `${l}.resource.current`),
      max: optNum(r.max, `${l}.resource.max`),
    };
  })();
  return health || resource ? { health, resource } : null;
}

function readSide(v: unknown, l: string): JourneySide {
  const o = shape(v, l,
    ["side", "champion_id", "champion_name", "icon", "level", "abilities", "items", "stats", "vitals"],
    ["side", "champion_id", "champion_name", "level", "abilities", "items", "stats"]);
  const abilities = arr(o.abilities, `${l}.abilities`).map((a, i) => readAbility(a, `${l}.abilities[${i}]`));
  const slots = abilities.map((a) => a.slot);
  if (slots.join("") !== "QWER") fail(`${l}.abilities must be exactly Q, W, E, R in order`);
  const items = arr(o.items, `${l}.items`).map((it, i) => readItem(it, `${l}.items[${i}]`));
  if (items.length > INVENTORY_SLOTS) fail(`${l}.items holds at most ${INVENTORY_SLOTS}`);
  if (new Set(items.map((it) => it.slot)).size !== items.length) fail(`${l}.items slots must be unique`);
  const stats = arr(o.stats, `${l}.stats`).map((s, i) => readStat(s, `${l}.stats[${i}]`));
  if (new Set(stats.map((s) => s.key)).size !== stats.length) fail(`${l}.stats keys must be unique`);
  return {
    side: sideId(o.side, `${l}.side`),
    championId: str(o.champion_id, `${l}.champion_id`),
    championName: str(o.champion_name, `${l}.champion_name`),
    icon: optStr(o.icon, `${l}.icon`),
    level: int(o.level, `${l}.level`, 1, 18),
    abilities,
    items: [...items].sort((a, b) => a.slot - b.slot),
    stats,
    vitals: readVitals(o.vitals, `${l}.vitals`),
  };
}

function readEvent(v: unknown, l: string): JourneyEvent {
  const kind = (v && typeof v === "object" ? (v as Rec).kind : undefined);
  switch (kind) {
    case "level": {
      const o = shape(v, l, ["kind", "side", "from", "to"]);
      return { kind, side: sideId(o.side, `${l}.side`), from: int(o.from, `${l}.from`, 1, 18), to: int(o.to, `${l}.to`, 1, 18) };
    }
    case "ability_rank": {
      const o = shape(v, l, ["kind", "side", "slot", "from", "to"]);
      return {
        kind, side: sideId(o.side, `${l}.side`), slot: slotId(o.slot, `${l}.slot`),
        from: int(o.from, `${l}.from`, 0, 6), to: int(o.to, `${l}.to`, 0, 6),
      };
    }
    case "ability_unlock": {
      const o = shape(v, l, ["kind", "side", "slot"]);
      return { kind, side: sideId(o.side, `${l}.side`), slot: slotId(o.slot, `${l}.slot`) };
    }
    case "purchase": {
      const o = shape(v, l, ["kind", "side", "group", "items"], ["kind", "side", "items"]);
      const group = o.group === undefined || o.group === null ? null
        : o.group === "recall" ? "recall" as const : fail(`${l}.group must be "recall" or null`);
      const items = arr(o.items, `${l}.items`).map((it, i) => {
        const p = shape(it, `${l}.items[${i}]`, ["slot", "item_id", "name", "cost"], ["slot", "item_id", "name"]);
        return {
          slot: int(p.slot, `${l}.items[${i}].slot`, 0, INVENTORY_SLOTS - 1),
          itemId: int(p.item_id, `${l}.items[${i}].item_id`, 1),
          name: str(p.name, `${l}.items[${i}].name`),
          cost: p.cost === null || p.cost === undefined ? null : int(p.cost, `${l}.items[${i}].cost`, 0),
        };
      });
      if (items.length === 0) fail(`${l}.items must not be empty`);
      return { kind, side: sideId(o.side, `${l}.side`), group, items };
    }
    case "item_removed": {
      const o = shape(v, l, ["kind", "side", "item_id", "name"]);
      return { kind, side: sideId(o.side, `${l}.side`), itemId: int(o.item_id, `${l}.item_id`, 1), name: str(o.name, `${l}.name`) };
    }
    case "stat_delta": {
      const o = shape(v, l, ["kind", "side", "key", "from", "to"]);
      return {
        kind, side: sideId(o.side, `${l}.side`), key: statKey(o.key, `${l}.key`),
        from: num(o.from, `${l}.from`), to: num(o.to, `${l}.to`),
      };
    }
    default:
      return fail(`${l}.kind is not a Journey event: ${JSON.stringify(kind)}`);
  }
}

function readTransition(v: unknown, l: string): JourneyTransition | null {
  if (v === null || v === undefined) return null;
  const o = shape(v, l, ["from_node", "to_node", "label", "events", "beat"], ["from_node", "to_node", "events", "beat"]);
  const b = shape(o.beat, `${l}.beat`, ["ms", "until"], ["ms"]);
  const until = optStr(b.until, `${l}.beat.until`);
  if (until !== null && Number.isNaN(Date.parse(until))) fail(`${l}.beat.until must be an ISO instant`);
  const events = arr(o.events, `${l}.events`).map((e, i) => readEvent(e, `${l}.events[${i}]`));
  if (events.length === 0) fail(`${l}.events must not be empty`);
  return {
    fromNode: str(o.from_node, `${l}.from_node`),
    toNode: str(o.to_node, `${l}.to_node`),
    label: optStr(o.label, `${l}.label`),
    events,
    beat: { ms: int(b.ms, `${l}.beat.ms`, 0, 10_000), until },
  };
}

function readFocus(v: unknown, l: string): JourneyFocus {
  if (v === null || v === undefined) return { refs: [], combat: null };
  const o = shape(v, l, ["refs", "combat"], []);
  const refs = o.refs === undefined ? [] : arr(o.refs, `${l}.refs`).map((r, i): JourneyFocusRef => {
    const rl = `${l}.refs[${i}]`;
    const kind = (r && typeof r === "object" ? (r as Rec).kind : undefined);
    if (kind === "level") {
      const x = shape(r, rl, ["side", "kind"]);
      return { side: sideId(x.side, `${rl}.side`), kind };
    }
    const x = shape(r, rl, ["side", "kind", "key"]);
    const side = sideId(x.side, `${rl}.side`);
    if (kind === "stat") return { side, kind, key: statKey(x.key, `${rl}.key`) };
    if (kind === "ability") return { side, kind, key: slotId(x.key, `${rl}.key`) };
    if (kind === "item") return { side, kind, key: int(x.key, `${rl}.key`, 0, INVENTORY_SLOTS - 1) };
    return fail(`${rl}.kind must be stat, ability, item or level`);
  });
  const combat = o.combat === null || o.combat === undefined ? null : (() => {
    const c = shape(o.combat, `${l}.combat`, ["attacker", "target"]);
    const attacker = sideId(c.attacker, `${l}.combat.attacker`);
    const target = sideId(c.target, `${l}.combat.target`);
    if (attacker === target) fail(`${l}.combat attacker and target must differ`);
    return { attacker, target };
  })();
  return { refs, combat };
}

/**
 * Transition events and focus refs must describe the state they sit beside.
 * This is what stops an event from restating a withheld number ("armor 44 → 59"
 * on the child that asks for the armor) or pointing at something not there.
 */
function crossCheck(state: JourneyPublicState): void {
  const bySide = (s: JourneySideId) => state.sides[s === "subject" ? 0 : 1];
  for (const e of state.transition?.events ?? []) {
    const side = bySide(e.side);
    const where = `transition event ${e.kind} (${e.side})`;
    if (e.kind === "level" && (e.to !== side.level || e.from >= e.to)) {
      fail(`${where} must rise to the side's level ${side.level}`);
    }
    if (e.kind === "ability_rank") {
      const a = side.abilities.find((x) => x.slot === e.slot)!;
      if (e.to !== a.rank || e.from >= e.to) fail(`${where} ${e.slot} must rise to the board's rank ${a.rank}`);
    }
    if (e.kind === "ability_unlock") {
      const a = side.abilities.find((x) => x.slot === e.slot)!;
      if (a.rank < 1) fail(`${where} ${e.slot} is unlocked but the board shows rank 0`);
    }
    if (e.kind === "purchase") {
      for (const it of e.items) {
        const held = side.items.find((x) => x.slot === it.slot);
        if (!held || held.itemId !== it.itemId) fail(`${where} names ${it.name} in slot ${it.slot}, which the board does not hold`);
      }
    }
    if (e.kind === "item_removed" && side.items.some((x) => x.itemId === e.itemId)) {
      fail(`${where} removes ${e.name}, which the board still holds`);
    }
    if (e.kind === "stat_delta") {
      const s = side.stats.find((x) => x.key === e.key);
      if (!s) return fail(`${where} ${e.key} has no stat on the board`);
      if (s.withheld || s.value === null) return fail(`${where} ${e.key} restates a WITHHELD stat`);
      if (s.value !== e.to) fail(`${where} ${e.key} must end at the board's value`);
    }
  }
  for (const r of state.focus.refs) {
    const side = bySide(r.side);
    if (r.kind === "stat" && !side.stats.some((s) => s.key === r.key)) fail(`focus names stat ${r.key} not on the ${r.side} board`);
    if (r.kind === "item" && !side.items.some((it) => it.slot === r.key)) fail(`focus names empty item slot ${r.key} (${r.side})`);
  }
}

/** Wire (snake_case) → `JourneyPublicState`. Throws `JourneyContractError`. */
export function readJourneyPublicState(json: unknown): JourneyPublicState {
  const o = shape(json, "journey",
    ["contract", "journey_key", "plan", "title", "step", "sides", "transition", "focus"],
    ["contract", "journey_key", "plan", "step", "sides"]);
  if (o.contract !== JOURNEY_PUBLIC_CONTRACT) fail(`unsupported contract ${JSON.stringify(o.contract)}`);
  const plan = o.plan === "standard" || o.plan === "survival" ? o.plan : fail(`plan must be standard or survival`);
  const st = shape(o.step, "journey.step", ["index", "count", "node_id", "node_label"], ["index", "count", "node_id"]);
  const count = int(st.count, "journey.step.count", 1, 12);
  const sides = arr(o.sides, "journey.sides").map((s, i) => readSide(s, `journey.sides[${i}]`));
  const subject = sides.find((s) => s.side === "subject");
  const opponent = sides.find((s) => s.side === "opponent");
  if (sides.length !== 2 || !subject || !opponent) fail("journey.sides must be exactly one subject and one opponent");
  const state: JourneyPublicState = {
    contract: JOURNEY_PUBLIC_CONTRACT,
    journeyKey: str(o.journey_key, "journey.journey_key"),
    plan,
    title: optStr(o.title, "journey.title"),
    step: {
      index: int(st.index, "journey.step.index", 0, count - 1),
      count,
      nodeId: str(st.node_id, "journey.step.node_id"),
      nodeLabel: optStr(st.node_label, "journey.step.node_label"),
    },
    sides: [subject!, opponent!],
    transition: readTransition(o.transition, "journey.transition"),
    focus: readFocus(o.focus, "journey.focus"),
  };
  if (state.transition && state.transition.toNode !== state.step.nodeId) {
    fail("journey.transition must lead INTO the current node");
  }
  crossCheck(state);
  return state;
}

/** Tolerant entry point for a surface: a malformed block draws no board. */
export function tryReadJourneyPublicState(json: unknown): JourneyPublicState | null {
  if (json === null || json === undefined) return null;
  try {
    return readJourneyPublicState(json);
  } catch (e) {
    if (e instanceof JourneyContractError) return null;
    throw e;
  }
}

export function journeySide(state: JourneyPublicState, side: JourneySideId): JourneySide {
  return state.sides[side === "subject" ? 0 : 1];
}
