/**
 * JP5 — THE CHAMPION PORTRAIT POPUP: what the learner has established about ONE
 * champion's stats, state by state. The board's portrait opens it; the board
 * itself no longer carries retained scalar bubbles (the Reasoning Chain
 * surfaces what the current question needs; the board is current objects).
 *
 * A JOIN OF SERVED THINGS, NOTHING ELSE:
 *
 *   learned   K2's `champion_stat_at_level` facts (`knowledge.ts`): revealed by
 *             an earlier reveal, shown as that reveal displayed them. A stat
 *             "at level N" is the champion's own base at that level — the
 *             backend asks it only where no item touches the stat.
 *   stated    the stats a reached child's premise STATED for this side (the
 *             served public state), with their served `stat_sources` (bonus AD:
 *             items and shards; armor: the level base, then items). The value
 *             was on the learner's screen, so it is established by statement.
 *
 * CHECKPOINTS are the Journey's own authored states: every child carries its
 * node on the state path (`state_version`); a transition names the node it
 * leads into (`note`: "Leona buys Cloth Armor."). A fact belongs to the node of
 * the child that established it — never carried forward into a later node
 * (after Cloth Armor, Leona's level-3 base armor is no longer her armor). Only
 * REACHED children are read, so a later state is never shown, and the open
 * child's asked value is never here (it is withheld, and K2 drops it).
 *
 * No arithmetic: values are displays or served numbers; a stated number is
 * written whole by the board's own `formatStatValue` (as the board drew it).
 */
import type { JourneyJ3, J3Side } from "./j3";
import type { JourneyStatSource } from "./contract";
import { knowledgeKeyFor, type JourneyKnowledge } from "./knowledge";
import { formatStatValue, isJourneyStatKey, JOURNEY_STAT_META, type JourneyStatKey } from "./stats";

/**
 * The sheet's rows, in League's own stat-table order. Fixed, so the sheet reads
 * as a table that fills in — not a list that grows. Only stats the Journey can
 * state or teach (no move speed: nothing serves it).
 */
export const PORTRAIT_POPUP_STATS: readonly JourneyStatKey[] = [
  "health", "armor", "magic_resist", "attack_damage", "bonus_attack_damage", "ability_power", "ability_haste",
];

export interface PortraitPopupEntry {
  stat: JourneyStatKey;
  /** As the learner was shown it: the reveal's display, or the stated number whole. */
  display: string;
  /** `learned` by a reveal, or `stated` by a question's premise. */
  how: "learned" | "stated";
  /** The 1-based step that established it (the latest, when several did). */
  step: number;
  /** The champion's level in this state. */
  level: number;
  /** The served exact number, when served (a stated value; a learned value once the ledger lists it). */
  exact: number | null;
  /** Served provenance (`stat_sources`), empty when none was served. */
  sources: JourneyStatSource[];
}

export interface PortraitPopupCheckpoint {
  /** The node on the Journey's state path (`state_version`). */
  node: number;
  level: number;
  /** The served transition notes that led into this node since the previous reached one; null for the first. */
  note: string | null;
  /** 1-based steps played in this node. */
  firstStep: number;
  lastStep: number;
  entries: Partial<Record<JourneyStatKey, PortraitPopupEntry>>;
}

export interface ChampionPortraitPopup {
  /** K1's champion key (`player:ahri` / `opponent:leona`). */
  key: string;
  championName: string;
  /** Reached checkpoints, oldest first. */
  checkpoints: PortraitPopupCheckpoint[];
  /** The node the board is on (the default the sheet opens at). */
  current: number;
  /** Any champion stat LEARNED by a reveal — the portrait's `!`. */
  learned: boolean;
}

const sideOf = (s: J3Side): "subject" | "opponent" => (s === "player" ? "subject" : "opponent");

/**
 * One champion portrait popup as of the board's step `stepIndex` (0-based child on
 * screen). `null` when the Journey block is not the J3 contract.
 */
export function championPortraitPopup(journey: JourneyJ3 | null | undefined, knowledge: JourneyKnowledge,
  side: J3Side, stepIndex: number): ChampionPortraitPopup | null {
  if (!journey || journey.reask) return null;
  const reached = journey.children.filter((c) => c.index <= stepIndex);
  const onScreen = reached.find((c) => c.index === stepIndex) ?? reached[reached.length - 1];
  if (!onScreen) return null;
  const championId = onScreen.state.sides[side].championId;
  const key = knowledgeKeyFor({ side: sideOf(side), championId });
  const byNode = new Map<number, PortraitPopupCheckpoint>();
  const checkpoint = (node: number, level: number, step: number) => {
    const cp = byNode.get(node) ?? {
      node, level, firstStep: step, lastStep: step, entries: {}, note: null,
    };
    cp.firstStep = Math.min(cp.firstStep, step);
    cp.lastStep = Math.max(cp.lastStep, step);
    byNode.set(node, cp);
    return cp;
  };
  for (const c of reached) {
    const s = c.state.sides[side];
    const cp = checkpoint(c.state.stateVersion, s.level, c.index + 1);
    // STATED: the numbers this child's premise stated for this champion.
    for (const [k, v] of Object.entries(s.stats)) {
      if (typeof v !== "number" || !isJourneyStatKey(k) || !PORTRAIT_POPUP_STATS.includes(k)) continue;
      const served = s.statSources[k] ?? [];
      cp.entries[k] = {
        stat: k, display: formatStatValue(v, k), how: "stated", step: c.index + 1, level: s.level, exact: v,
        sources: served.map((p): JourneyStatSource => (p.kind === "item"
          ? { kind: "item", itemId: Number.isInteger(Number(p.itemId)) ? Number(p.itemId) : null, name: p.name, value: p.value }
          : p.kind === "level" ? { kind: "level", level: p.level, value: p.value }
            : { kind: "stat_mod", row: p.row, shardId: p.id, name: p.name, value: p.value })),
      };
    }
  }
  // LEARNED: K2's revealed champion stats, in the node of the child that taught them.
  const exactOf = new Map<string, number>();
  for (const c of reached) {
    for (const e of c.learner.established) if (typeof e.value === "number") exactOf.set(e.fact, e.value);
  }
  let learned = false;
  for (const f of knowledge.get(key)?.facts ?? []) {
    const stat = f.context.stat;
    if (f.kind !== "champion_stat_at_level" || !stat || !isJourneyStatKey(stat) || !PORTRAIT_POPUP_STATS.includes(stat)) continue;
    const teacher = reached.find((c) => c.index === f.child);
    if (!teacher) continue;
    learned = true;
    const level = f.context.level ?? teacher.state.sides[side].level;
    const cp = checkpoint(teacher.state.stateVersion, teacher.state.sides[side].level, f.child + 1);
    const stated = cp.entries[stat];
    // The reveal's display is what the learner was shown; a statement of the
    // same stat in the same state (the backend's recall rule: same value) keeps
    // its served sources.
    cp.entries[stat] = {
      stat, display: f.display, how: "learned", step: stated ? Math.max(stated.step, f.child + 1) : f.child + 1,
      level, exact: exactOf.get(f.fact) ?? stated?.exact ?? null, sources: stated?.sources ?? [],
    };
  }
  const checkpoints = [...byNode.values()].sort((a, b) => a.node - b.node);
  // A state's note: EVERY served transition since the previous reached state
  // (two transitions can lead into one state, and the node between them is
  // never on screen — e.g. "Both reach level 4." then "Pantheon buys a Long Sword.").
  checkpoints.forEach((cp, i) => {
    const after = i === 0 ? -1 : checkpoints[i - 1].node;
    cp.note = journey.transitions
      .filter((t) => t.stateVersion > after && t.stateVersion <= cp.node && t.beforeChild <= stepIndex)
      .map((t) => t.note).join(" ") || null;
  });
  return {
    key, championName: onScreen.state.sides[side].champion, checkpoints,
    current: onScreen.state.stateVersion, learned,
  };
}

/**
 * How a row says what its value is, compactly: "Lv 2 base", "Lv 3 · Cloth
 * Armor", "Lv 2 · Doran's Blade · 2 shards". Words only; the numbers are one
 * tap away (the row's sources).
 */
export function entryBasis(e: PortraitPopupEntry): string {
  const items = e.sources.flatMap((s) => (s.kind === "item" ? [s.name] : []));
  const shards = e.sources.filter((s) => s.kind === "stat_mod").length;
  if (items.length === 0 && shards === 0) return e.how === "learned" ? `Lv ${e.level} base` : `Lv ${e.level}`;
  return [`Lv ${e.level}`, ...items, ...(shards ? [shards === 1 ? "1 shard" : `${shards} shards`] : [])].join(" · ");
}

/**
 * Does the question on screen (1-based `step`) STATE any of this champion's
 * stats? Those are its inputs (a premise states exactly what the question
 * needs), so the portrait is outlined as where to look.
 */
export function statesInputsAt(popup: ChampionPortraitPopup | null, step: number): boolean {
  const cp = popup?.checkpoints.find((c) => c.node === popup.current);
  return Boolean(cp && Object.values(cp.entries).some((e) => e?.how === "stated" && e.step === step));
}

/** The short name of a champion portrait popup row ("Armor", "Bonus AD"). */
export const portraitPopupLabel = (k: JourneyStatKey) => JOURNEY_STAT_META[k].short;
