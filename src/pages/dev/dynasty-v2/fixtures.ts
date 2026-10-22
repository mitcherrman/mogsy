/**
 * UX-1 — SYNTHETIC fixtures for the Worlds Dynasty clickable prototype.
 *
 * Everything here is invented: no real players, teams, champions' pro stats or
 * historical results. Champions are `SynChamp-NN`. The prototype is NOT
 * connected to the Combat v2 / Event E0 simulator; see `engine.ts`.
 */

export const ROLES = ["top", "jng", "mid", "bot", "sup"] as const;
export type Role = (typeof ROLES)[number];
export const STAGES = ["early", "mid", "late"] as const;
export type Stage = (typeof STAGES)[number];
export const TAGS = ["frontline", "engage", "sustained", "burst", "protection", "sidelane", "siege"] as const;
export type Tag = (typeof TAGS)[number];

export const ROLE_LABEL: Record<Role, string> = { top: "Top", jng: "Jungle", mid: "Mid", bot: "Bot", sup: "Support" };
export const STAGE_LABEL: Record<Stage, string> = { early: "Early", mid: "Mid", late: "Late" };
export const TAG_LABEL: Record<Tag, string> = {
  frontline: "Frontline", engage: "Engage", sustained: "Sustained damage", burst: "Burst damage",
  protection: "Protection", sidelane: "Side-lane", siege: "Siege",
};

export interface Champion {
  id: string;
  name: string;
  role: Role;
  cls: "Tank" | "Fighter" | "Assassin" | "Marksman" | "Mage" | "Enchanter";
  tags: Tag[];
  phase: Record<Stage, number>;
}

type ChampRow = [role: Role, cls: Champion["cls"], tags: Tag[], e: number, m: number, l: number];
const CHAMP_ROWS: ChampRow[] = [
  ["top", "Tank", ["frontline", "engage"], 2, 3, 4], ["top", "Fighter", ["sidelane", "sustained"], 3, 4, 3],
  ["top", "Fighter", ["frontline", "sustained"], 4, 3, 2], ["top", "Tank", ["frontline", "protection"], 2, 3, 5],
  ["top", "Assassin", ["burst", "sidelane"], 4, 3, 2],
  ["jng", "Fighter", ["engage", "frontline"], 4, 3, 2], ["jng", "Assassin", ["burst", "engage"], 4, 4, 2],
  ["jng", "Tank", ["frontline", "engage", "protection"], 2, 3, 4], ["jng", "Fighter", ["sustained", "sidelane"], 3, 3, 4],
  ["jng", "Mage", ["siege", "burst"], 3, 4, 3],
  ["mid", "Mage", ["siege", "burst"], 3, 4, 3], ["mid", "Assassin", ["burst"], 4, 3, 2],
  ["mid", "Mage", ["sustained", "siege"], 2, 3, 5], ["mid", "Fighter", ["sidelane", "engage"], 3, 3, 3],
  ["mid", "Mage", ["burst", "engage"], 3, 4, 3],
  ["bot", "Marksman", ["sustained"], 2, 3, 5], ["bot", "Marksman", ["burst", "siege"], 3, 4, 3],
  ["bot", "Marksman", ["sustained", "sidelane"], 3, 3, 4], ["bot", "Mage", ["burst"], 4, 3, 2],
  ["bot", "Marksman", ["sustained", "siege"], 2, 4, 4],
  ["sup", "Enchanter", ["protection"], 2, 3, 4], ["sup", "Tank", ["engage", "frontline"], 4, 3, 3],
  ["sup", "Mage", ["siege", "burst"], 3, 3, 3], ["sup", "Enchanter", ["protection", "sustained"], 2, 3, 5],
  ["sup", "Tank", ["engage", "protection"], 4, 4, 2],
];

export const CHAMPIONS: Champion[] = CHAMP_ROWS.map(([role, cls, tags, e, m, l], i) => ({
  id: `SynChamp-${String(i + 1).padStart(2, "0")}`,
  name: `SynChamp-${String(i + 1).padStart(2, "0")}`,
  role, cls, tags, phase: { early: e, mid: m, late: l },
}));
export const CHAMP_BY_ID: Record<string, Champion> = Object.fromEntries(CHAMPIONS.map((c) => [c.id, c]));
export const CHAMPS_BY_ROLE: Record<Role, Champion[]> = Object.fromEntries(
  ROLES.map((r) => [r, CHAMPIONS.filter((c) => c.role === r)]),
) as Record<Role, Champion[]>;
/** The synthetic stand-in for a "rare conditional champion" event (Camille-style). */
export const RARE_TOP_CHAMP = "SynChamp-02";

export interface Player {
  id: string;
  name: string;
  role: Role;
  kind: "star" | "academy" | "signed";
  phase: Record<Stage, number>;
  /** Proficiency per champion of the role, in `CHAMPS_BY_ROLE` order: 0 off, 1 fine, 2 great. */
  prof: number[];
  conf: number; // 1..5
  fatigue: number; // 0..5
  traits: string[];
  note?: string;
}

function mk(id: string, name: string, role: Role, kind: Player["kind"], e: number, m: number, l: number, prof: number[], note?: string): Player {
  return { id, name, role, kind, phase: { early: e, mid: m, late: l }, prof, conf: kind === "academy" ? 2 : 3, fatigue: 0, traits: [], note };
}

export interface Org {
  id: string;
  name: string;
  region: string;
  trait: string;
  strengths: string[];
  weakness: string;
  /** Dynasty-rules construct: a small team-contest bonus in one stage. */
  bias: Partial<Record<Stage, number>>;
  starCandidates: Player[];
  academy: Player[]; // one per role
}

const ACADEMY_NAMES = ["Pell", "Quill", "Rook", "Sable", "Tarn", "Umber", "Vale", "Wren", "Yarrow", "Zephyr", "Ash", "Birch", "Cobb", "Dunn", "Eld"];
function academyFor(prefix: string, offset: number): Player[] {
  return ROLES.map((role, i) => mk(`${prefix}-ac-${role}`, `SYN-${ACADEMY_NAMES[(offset + i) % ACADEMY_NAMES.length]}`, role, "academy",
    2 + ((i + offset) % 2), 2 + ((i + offset + 1) % 2), 2, [1, 1, 0, 0, 0], "Academy stand-in"));
}

export const ORGS: Org[] = [
  {
    id: "ember", name: "SYN Ember Wing", region: "SYN-A", trait: "Front-to-back teamfighting",
    strengths: ["Late", "Frontline"], weakness: "Early", bias: { late: 0.6, early: -0.3 },
    starCandidates: [
      mk("ember-mid", "SYN-Aurel Voss", "mid", "star", 3, 4, 5, [2, 1, 2, 1, 0]),
      mk("ember-bot", "SYN-Dara Quenn", "bot", "star", 2, 4, 5, [2, 1, 1, 0, 1]),
      mk("ember-top", "SYN-Hale Brandt", "top", "star", 3, 4, 4, [1, 2, 1, 2, 0]),
    ],
    academy: academyFor("ember", 0),
  },
  {
    id: "tide", name: "SYN Tidal Forge", region: "SYN-B", trait: "Early tempo and skirmish",
    strengths: ["Early", "Engage"], weakness: "Late", bias: { early: 0.6, late: -0.3 },
    starCandidates: [
      mk("tide-jng", "SYN-Kei Marrow", "jng", "star", 5, 4, 3, [2, 2, 1, 0, 1]),
      mk("tide-top", "SYN-Orin Fell", "top", "star", 4, 4, 3, [1, 2, 2, 0, 1]),
      mk("tide-sup", "SYN-Lio Vance", "sup", "star", 4, 3, 3, [1, 2, 0, 2, 1]),
    ],
    academy: academyFor("tide", 3),
  },
  {
    id: "gale", name: "SYN Gale Court", region: "SYN-C", trait: "Flexible pick compositions",
    strengths: ["Mid", "Burst damage"], weakness: "Protection", bias: { mid: 0.6 },
    starCandidates: [
      mk("gale-mid", "SYN-Nia Ostrow", "mid", "star", 4, 5, 3, [1, 2, 0, 1, 2]),
      mk("gale-jng", "SYN-Teo Garrick", "jng", "star", 3, 5, 3, [2, 1, 2, 0, 1]),
      mk("gale-bot", "SYN-Mara Ilsen", "bot", "star", 3, 4, 4, [1, 1, 2, 2, 0]),
    ],
    academy: academyFor("gale", 6),
  },
];

export const FREE_AGENTS: Player[] = [
  mk("fa-top", "SYN-Brann Ostle", "top", "signed", 3, 4, 4, [2, 1, 1, 1, 0], "Veteran"),
  mk("fa-jng", "SYN-Cael Thorne", "jng", "signed", 4, 4, 3, [1, 2, 1, 1, 0], "Rising"),
  mk("fa-mid", "SYN-Iva Lorne", "mid", "signed", 3, 4, 4, [2, 1, 1, 1, 1], "Flexible"),
  mk("fa-bot", "SYN-Rex Dunmore", "bot", "signed", 4, 3, 4, [1, 2, 1, 1, 1], "Laner"),
  mk("fa-sup", "SYN-Sol Verrin", "sup", "signed", 3, 4, 4, [2, 1, 1, 1, 0], "Shot-caller"),
  mk("fa-sup2", "SYN-Pax Hollis", "sup", "signed", 4, 3, 3, [1, 1, 2, 0, 2], "Aggressive"),
];

export interface Opponent {
  id: string;
  name: string;
  region: string;
  tags: string[]; // scouting tier 1 identity
  warning: string; // tier 2
  /** Base lane power per stage (synthetic), team power per stage. */
  lane: Record<Stage, number>;
  team: Record<Stage, number>;
  offset: number;
}

export type NodeKind = "regular" | "playoff" | "worlds";
export interface SeasonNode {
  label: string;
  kind: NodeKind;
  window?: "transfer";
  opp: Opponent;
}

const opp = (id: string, name: string, tags: string[], warning: string, e: number, m: number, l: number, off: number): Opponent => ({
  id, name: `SYN ${name}`, region: "SYN-" + "ABC"[off % 3], tags, warning,
  lane: { early: e, mid: m, late: l }, team: { early: e * 0.9, mid: m * 0.9, late: l * 0.9 }, offset: off,
});

/** Eight illustrative nodes. Counts, order and elimination rules are owner decisions (O-3). */
export const SEASON: SeasonNode[] = [
  { label: "Regular 1", kind: "regular", window: "transfer", opp: opp("o1", "Moss Lantern", ["Early tempo"], "Light frontline", 5.0, 5.0, 5.0, 0) },
  { label: "Regular 2", kind: "regular", opp: opp("o2", "Pale Anvil", ["Front-to-back"], "Weak early", 4.6, 5.2, 5.8, 1) },
  { label: "Regular 3", kind: "regular", opp: opp("o3", "Copper Sage", ["Pick and burst"], "Low protection", 5.2, 5.4, 5.0, 2) },
  { label: "Regular 4", kind: "regular", opp: opp("o4", "Dune Choir", ["Siege"], "Few engage tools", 5.0, 5.8, 5.4, 3) },
  { label: "Playoffs R1", kind: "playoff", window: "transfer", opp: opp("o5", "Iron Meadow", ["Side-lane pressure"], "Splits thin", 5.6, 5.6, 5.6, 4) },
  { label: "Playoffs Final", kind: "playoff", opp: opp("o6", "Gilt Harbor", ["Early tempo", "Engage"], "Falls off Late", 6.2, 5.8, 5.2, 0) },
  { label: "Worlds Semi", kind: "worlds", opp: opp("o7", "Opal Vanguard", ["Front-to-back", "Protect the carry"], "Slow start", 5.4, 6.0, 6.4, 1) },
  { label: "Worlds Final", kind: "worlds", opp: opp("o8", "Crown of Ash", ["All-round"], "None obvious", 6.0, 6.2, 6.2, 2) },
];

export interface PrepAction {
  id: string;
  name: string;
  target: "player" | "team";
  helps: Stage[];
  cost: string;
  knowledge?: boolean;
  blurb: string;
}
export const PREP_ACTIONS: PrepAction[] = [
  { id: "solo", name: "Solo Queue", target: "player", helps: ["early"], cost: "Fatigue +1", blurb: "One player sharpens their laning." },
  { id: "scrims", name: "Scrims", target: "team", helps: ["mid"], cost: "Cohesion +1, Fatigue +1 (all)", blurb: "Team execution; diminishing if repeated." },
  { id: "vod", name: "VOD Review", target: "team", helps: ["late"], cost: "Knowledge: reveals 1 scouting tier", knowledge: true, blurb: "Scout the opponent and steady Late play." },
  { id: "bond", name: "Team Bonding", target: "team", helps: [], cost: "Cohesion +1, lowest Confidence +1", blurb: "Resilience over raw prep." },
  { id: "rest", name: "Rest", target: "team", helps: [], cost: "Fatigue −2 (all)", blurb: "Recover before a hard series." },
  { id: "practice", name: "Champion Practice", target: "player", helps: ["early", "mid", "late"], cost: "Narrow: one player only", blurb: "A little of everything for one player." },
];

/** Placeholder questions about the prototype's own rules (not Mogzy graded content). */
export interface SynQuestion { id: string; prompt: string; options: string[]; correct: number }
export const SYN_QUESTIONS: SynQuestion[] = [
  { id: "q1", prompt: "How many points does the team contest award in a stage?", options: ["1", "2", "3"], correct: 1 },
  { id: "q2", prompt: "How many points does one stage have in total?", options: ["5", "7", "9"], correct: 1 },
  { id: "q3", prompt: "In a BO5, how many game wins decide the series?", options: ["2", "3", "5"], correct: 1 },
  { id: "q4", prompt: "Which two stage results in a row close a game at Mid?", options: ["Winning + Winning", "Even + Even", "Kinda winning + Winning"], correct: 0 },
  { id: "q5", prompt: "Can a Late stage end in an Even tie?", options: ["Yes", "No, 7 points never tie", "Only in game 5"], correct: 1 },
  { id: "q6", prompt: "A higher rating in this prototype…", options: ["Guarantees the lane", "Raises the odds only", "Has no effect"], correct: 1 },
  { id: "q7", prompt: "Fearless Draft here means a champion used earlier in the series is…", options: ["Banned for you", "Free to reuse", "Doubled in power"], correct: 0 },
  { id: "q8", prompt: "Is this prototype connected to the authoritative simulator?", options: ["Yes", "No, it is synthetic", "Only on Fridays"], correct: 1 },
  { id: "q9", prompt: "What is carried from one stage into the next?", options: ["Extra points", "Advantage (momentum)", "Nothing"], correct: 1 },
];
