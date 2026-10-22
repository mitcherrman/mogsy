/**
 * UX-1 — a SYNTHETIC, deterministic stand-in for the Dynasty simulation.
 *
 * !! NOT the Combat v2 / Event E0 simulator !!  It exists only so the UX flow
 * can be clicked through. It keeps the approved STRUCTURE (seven points per
 * stage = five 1-point lanes + one 2-point team contest; five labelled states;
 * bounded carry-over "advantage"; Early+Mid Winning closeout; Late always
 * decides; event budgets per reached stage) but every number is a placeholder.
 * Randomness is keyed (`seed|node|game|stage|what`) so order never matters and
 * the same seed + same choices reproduce exactly.
 */
import {
  CHAMPS_BY_ROLE, CHAMP_BY_ID, FREE_AGENTS, RARE_TOP_CHAMP, ROLES, SEASON, STAGES,
  type Champion, type Org, type Player, type Role, type Stage, type Tag, PREP_ACTIONS,
} from "./fixtures";
import { OBJECTIVES, objectiveOutcome, type Effect, type ObjectiveKind, type ObjectiveOutcome } from "./objectives";

// ───────────────────────────────────────────────────────────── seeded draws

function hash(str: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0) * 4294967296 + (h1 >>> 0)) / 18446744073709551616;
}
export const draw = (seed: string, key: string): number => hash(`${seed}|${key}`);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// ───────────────────────────────────────────────────────────── types

export type StageLabel = "Losing" | "Kinda losing" | "Even" | "Kinda winning" | "Winning";
export const LEAD_CAP = 4;
export const LABEL_DELTA: Record<StageLabel, number> = { "Losing": -2, "Kinda losing": -1, "Even": 0, "Kinda winning": 1, "Winning": 2 };

/** Placeholder thresholds from the master plan (§7.2), as data. */
export function labelFor(ours: number): StageLabel {
  if (ours <= 1) return "Losing";
  if (ours === 2) return "Kinda losing";
  if (ours <= 4) return "Even";
  if (ours === 5) return "Kinda winning";
  return "Winning";
}

export interface Series {
  nodeIdx: number;
  wins: number;
  losses: number;
  games: { idx: number; won: boolean; endedAt: Stage; reason: string; labels: StageLabel[]; ours: number[] }[];
  used: string[]; // Fearless: our champions already used
  scoutTier: number;
  prepTeam: Record<Stage, number>;
  prepPlayer: Record<string, Record<Stage, number>>;
  gameBonus: Record<Stage, number>;
  prepLog: string[];
  prepUses: Record<string, number>;
}

export interface Run {
  seed: string;
  org: Org;
  starters: Record<Role, Player>;
  bench: Player[];
  cohesion: number; // 0..5
  nodeIdx: number;
  results: ("W" | "L" | null)[];
  alive: boolean;
  finished: boolean;
  series: Series | null;
  signedThisWindow: boolean;
}

export function emptyStageNumbers(): Record<Stage, number> { return { early: 0, mid: 0, late: 0 }; }

export function newRun(seed: string, org: Org, starIds: string[]): Run {
  const starters = {} as Record<Role, Player>;
  const stars = org.starCandidates.filter((p) => starIds.includes(p.id));
  for (const role of ROLES) {
    const star = stars.find((p) => p.role === role);
    starters[role] = clone(star ?? org.academy.find((p) => p.role === role)!);
  }
  return { seed, org, starters, bench: [], cohesion: 2, nodeIdx: 0, results: SEASON.map(() => null), alive: true, finished: false, series: null, signedThisWindow: false };
}

export function startSeries(run: Run): Run {
  const r = clone(run);
  // Baseline recovery between series (Dynasty rule placeholder).
  if (r.nodeIdx > 0) for (const role of ROLES) r.starters[role].fatigue = clamp(r.starters[role].fatigue - 1, 0, 5);
  r.series = {
    nodeIdx: r.nodeIdx, wins: 0, losses: 0, games: [], used: [], scoutTier: 1,
    prepTeam: emptyStageNumbers(), prepPlayer: {}, gameBonus: emptyStageNumbers(), prepLog: [], prepUses: {},
  };
  r.signedThisWindow = false;
  return r;
}

// ───────────────────────────────────────────────────────────── recruitment

export function recruitOffers(run: Run): Player[] {
  const owned = new Set([...ROLES.map((x) => run.starters[x].id), ...run.bench.map((b) => b.id)]);
  const pool = FREE_AGENTS.filter((p) => !owned.has(p.id));
  return pool
    .map((p) => ({ p, k: draw(run.seed, `offer|${run.nodeIdx}|${p.id}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((x) => clone(x.p));
}

export interface SignPreview {
  incoming: Player;
  displaced: Player;
  displacedGoesTo: "bench" | "released";
  cohesionBefore: number;
  cohesionAfter: number;
  honeymoon: boolean;
}
export function previewSigning(run: Run, p: Player): SignPreview {
  const displaced = run.starters[p.role];
  return {
    incoming: p, displaced,
    displacedGoesTo: run.bench.length < 2 ? "bench" : "released",
    cohesionBefore: run.cohesion, cohesionAfter: clamp(run.cohesion - 1, 0, 5), honeymoon: true,
  };
}
export function signPlayer(run: Run, p: Player): Run {
  const r = clone(run);
  const incoming = clone(p);
  incoming.conf = clamp(incoming.conf + 1, 1, 5);
  incoming.traits = [...incoming.traits, "Honeymoon"];
  const displaced = r.starters[p.role];
  r.starters[p.role] = incoming;
  if (r.bench.length < 2) r.bench.push(displaced);
  r.cohesion = clamp(r.cohesion - 1, 0, 5);
  r.signedThisWindow = true;
  return r;
}

// ───────────────────────────────────────────────────────────── preparation

export interface PrepPick { id: string; playerId?: string }
export interface PrepSummary {
  run: Run;
  notes: string[];
  changes: { id: string; name: string; confDelta: number; fatigueDelta: number; phaseNote: string }[];
  cohesionDelta: number;
  scoutDelta: number;
}

export function applyPrep(run: Run, picks: PrepPick[]): PrepSummary {
  const r = clone(run);
  const s = r.series!;
  const before = ROLES.map((role) => ({ id: r.starters[role].id, conf: r.starters[role].conf, fat: r.starters[role].fatigue }));
  const cohBefore = r.cohesion;
  const scoutBefore = s.scoutTier;
  const phaseNote: Record<string, string[]> = {};
  const notes: string[] = [];
  const note = (id: string, t: string) => { (phaseNote[id] ??= []).push(t); };
  const all = ROLES.map((role) => r.starters[role]);
  const find = (id?: string) => all.find((p) => p.id === id);
  const addPlayer = (id: string, stage: Stage, v: number) => { s.prepPlayer[id] ??= emptyStageNumbers(); s.prepPlayer[id][stage] += v; };

  for (const pick of picks) {
    const uses = (s.prepUses[pick.id] = (s.prepUses[pick.id] ?? 0) + 1);
    const k = uses > 1 ? 0.5 : 1; // diminishing returns
    if (uses > 1) notes.push(`${PREP_ACTIONS.find((a) => a.id === pick.id)?.name}: second use, reduced.`);
    const target = find(pick.playerId);
    switch (pick.id) {
      case "solo": if (target) { addPlayer(target.id, "early", 1 * k); target.fatigue = clamp(target.fatigue + 1, 0, 5); note(target.id, `Early +${1 * k}`); } break;
      case "practice": if (target) { for (const st of STAGES) addPlayer(target.id, st, 0.5 * k); note(target.id, `All phases +${0.5 * k}`); } break;
      case "scrims": s.prepTeam.mid += 0.8 * k; r.cohesion = clamp(r.cohesion + 1, 0, 5); all.forEach((p) => { p.fatigue = clamp(p.fatigue + 1, 0, 5); }); break;
      case "vod": s.scoutTier = clamp(s.scoutTier + 1, 1, 3); s.prepTeam.late += 0.5 * k; break;
      case "bond": { r.cohesion = clamp(r.cohesion + 1, 0, 5); const low = [...all].sort((a, b) => a.conf - b.conf)[0]; low.conf = clamp(low.conf + 1, 1, 5); note(low.id, "Confidence +1"); break; }
      case "rest": all.forEach((p) => { p.fatigue = clamp(p.fatigue - 2, 0, 5); }); break;
    }
    s.prepLog.push(pick.id);
  }
  const changes = ROLES.map((role, i) => {
    const p = r.starters[role];
    return { id: p.id, name: p.name, confDelta: p.conf - before[i].conf, fatigueDelta: p.fatigue - before[i].fat, phaseNote: (phaseNote[p.id] ?? []).join(", ") };
  });
  return { run: r, notes, changes, cohesionDelta: r.cohesion - cohBefore, scoutDelta: s.scoutTier - scoutBefore };
}

// ───────────────────────────────────────────────────────────── composition

const COMP_WEIGHTS: Record<Stage, Partial<Record<Tag, number>>> = {
  early: { engage: 0.5, burst: 0.4, frontline: 0.2 },
  mid: { siege: 0.4, sidelane: 0.3, burst: 0.3, engage: 0.2 },
  late: { frontline: 0.4, sustained: 0.5, protection: 0.4 },
};

export function compScore(champs: Champion[], stage: Stage): number {
  let s = 0;
  for (const c of champs) for (const t of c.tags) s += COMP_WEIGHTS[stage][t] ?? 0;
  return s;
}

export interface CompReadout {
  tagLevels: Record<Tag, 0 | 1 | 2>;
  identity: string;
  strengths: { stage: Stage; text: string }[];
  warnings: { stage: Stage | null; text: string }[];
  mix: { physical: number; magic: number };
}

export function readComposition(champIds: string[], oppTags: string[] = []): CompReadout {
  const champs = champIds.map((id) => CHAMP_BY_ID[id]).filter(Boolean);
  const count = {} as Record<Tag, number>;
  (["frontline", "engage", "sustained", "burst", "protection", "sidelane", "siege"] as Tag[]).forEach((t) => (count[t] = 0));
  champs.forEach((c) => c.tags.forEach((t) => count[t]++));
  const tagLevels = Object.fromEntries(Object.entries(count).map(([t, n]) => [t, Math.min(2, n)])) as CompReadout["tagLevels"];
  const scores = STAGES.map((st) => ({ st, v: compScore(champs, st) }));
  const best = [...scores].sort((a, b) => b.v - a.v)[0];
  const worst = [...scores].sort((a, b) => a.v - b.v)[0];
  const identity = champs.length < 3 ? "Draft in progress"
    : best.st === "late" ? "Front-to-back teamfight" : best.st === "early" ? "Early tempo" : "Mid-game pressure";
  const strengths: CompReadout["strengths"] = [];
  const warnings: CompReadout["warnings"] = [];
  if (champs.length >= 3) {
    strengths.push({ stage: best.st, text: best.st === "late" ? "Strong teamfights if the game goes long" : best.st === "early" ? "Fast starts and skirmish control" : "Objective and map pressure around the middle" });
    if (count.frontline >= 1 && count.sustained >= 1 && count.protection >= 1) strengths.push({ stage: "late", text: "Frontline, sustained damage and protection line up" });
    if (worst.v < best.v - 0.5) warnings.push({ stage: worst.st, text: `${worst.st === "early" ? "Early" : worst.st === "mid" ? "Mid" : "Late"} is the soft spot of this draft` });
    if (count.frontline === 0) warnings.push({ stage: "late", text: "No frontline: teamfights get exposed" });
    if (count.engage === 0) warnings.push({ stage: "early", text: "Limited initiation: hard to start fights" });
    const phys = champs.filter((c) => ["Fighter", "Assassin", "Marksman"].includes(c.cls)).length;
    const mag = champs.filter((c) => ["Mage"].includes(c.cls)).length;
    if (champs.length === 5 && (phys === 0 || mag === 0)) warnings.push({ stage: null, text: "Single damage type: easy to itemize against" });
    if (oppTags.some((t) => /early/i.test(t)) && scores[0].v < 1.2) warnings.push({ stage: "early", text: "Scouted: they want an early game and this draft is slow" });
  }
  return { tagLevels, identity, strengths: strengths.slice(0, 2), warnings: warnings.slice(0, 2), mix: { physical: champs.filter((c) => ["Fighter", "Assassin", "Marksman"].includes(c.cls)).length, magic: champs.filter((c) => c.cls === "Mage").length } };
}

// ───────────────────────────────────────────────────────────── opponent

export function oppPicks(run: Run, gameIdx: number): Record<Role, string> {
  const opp = SEASON[run.nodeIdx].opp;
  return Object.fromEntries(ROLES.map((role, i) => [role, CHAMPS_BY_ROLE[role][(opp.offset + gameIdx + i) % 5].id])) as Record<Role, string>;
}

export function revealedOppLanes(tier: number): Role[] {
  return ROLES.slice(0, Math.max(0, (tier - 1) * 2));
}

// ───────────────────────────────────────────────────────────── game

export interface EventInst {
  id: string;
  title: string;
  text: string;
  rare?: boolean;
  effects: Effect[];
}
export interface LedgerItem { stage: Stage; kind: "small" | "major"; title: string; text: string; effects: Effect[]; rare?: boolean; tone?: ObjectiveOutcome["tone"] }
export interface LanePart { label: string; value: number; source: "rules" | "event" }
export interface LaneRes { role: Role; won: boolean; p: number; roll: number; ours: number; theirs: number; ourChamp: string; theirChamp: string; parts: LanePart[] }
export interface StageResult {
  stage: Stage;
  lanes: LaneRes[];
  team: { won: boolean; p: number; roll: number; ours: number; theirs: number };
  ours: number;
  theirs: number;
  label: StageLabel;
  leadBefore: number;
  delta: number;
  leadAfter: number;
}
export interface StagePlan { small: EventInst[]; major: ObjectiveKind | "teamfight" | null; majorTitle?: string }
export interface Game {
  idx: number;
  picks: Record<Role, string>;
  oppPicks: Record<Role, string>;
  stage: Stage;
  lead: number;
  mods: Record<Stage, { lane: Partial<Record<Role, number>>; team: number }>;
  later: Effect[];
  ledger: LedgerItem[];
  stages: StageResult[];
  plans: Partial<Record<Stage, StagePlan>>;
  overconfidentAtStart: string[];
  over: boolean;
  won: boolean | null;
  endedAt: Stage | null;
  reason: string;
}

export function beginGame(run: Run, picks: Record<Role, string>): Game {
  const s = run.series!;
  return {
    idx: s.games.length + 1, picks, oppPicks: oppPicks(run, s.games.length), stage: "early", lead: 0,
    mods: { early: { lane: {}, team: 0 }, mid: { lane: {}, team: 0 }, late: { lane: {}, team: 0 } },
    later: [], ledger: [], stages: [], plans: {},
    overconfidentAtStart: ROLES.filter((r) => run.starters[r].traits.includes("Overconfident")).map((r) => run.starters[r].id),
    over: false, won: null, endedAt: null, reason: "",
  };
}

const gkey = (run: Run, game: Game) => `n${run.nodeIdx}|g${game.idx}`;

function pushEffect(game: Game, stage: Stage, e: Effect) {
  if (e.scope === "stage") {
    if (e.kind === "lane" && e.target) game.mods[stage].lane[e.target as Role] = (game.mods[stage].lane[e.target as Role] ?? 0) + e.amount;
    else if (e.kind === "team") game.mods[stage].team += e.amount;
  } else if (e.scope === "next_stage") {
    if (e.kind === "lead") game.lead = clamp(game.lead + e.amount, -LEAD_CAP, LEAD_CAP);
  } else game.later.push(e);
}

interface EventCtx { run: Run; game: Game; stage: Stage; d: (k: string) => number }
interface EventDef {
  id: string; stage: Stage; weight: number;
  build: (c: EventCtx) => EventInst | null;
}
const pickRole = (c: EventCtx, k: string): Role => ROLES[Math.floor(c.d(k) * 5)];

const EVENT_DEFS: EventDef[] = [
  { id: "early.scuttle", stage: "early", weight: 3, build: () => ({ id: "early.scuttle", title: "Scuttle control", text: "Your jungler wins the river fight and sets up the lanes.", effects: [{ scope: "stage", kind: "lane", target: "jng", amount: 0.8, label: "Jungle lane this stage" }] }) },
  { id: "early.buff_invade", stage: "early", weight: 3, build: (c) => {
    const ok = c.d("invade") < 0.5;
    return ok
      ? { id: "early.buff_invade", title: "Buff invade", text: "A clean invade steals a camp.", effects: [{ scope: "stage", kind: "team", amount: 0.6, label: "Team this stage" }] }
      : { id: "early.buff_invade", title: "Buff invade", text: "They collapse on your invade and trade evenly. You lose tempo.", effects: [{ scope: "stage", kind: "team", amount: -0.6, label: "Team this stage" }] };
  } },
  { id: "early.solo_kill", stage: "early", weight: 3, build: (c) => {
    const role = pickRole(c, "solo");
    const p = c.run.starters[role];
    return { id: "early.solo_kill", title: `Solo kill (${role})`, text: `${p.name} outplays their lane opponent.`, effects: [
      { scope: "stage", kind: "lane", target: role, amount: 1, label: `${role} lane this stage` },
      { scope: "later", kind: "confidence", target: p.id, amount: 1, label: `${p.name} Confidence` },
    ] };
  } },
  { id: "early.plates", stage: "early", weight: 2, build: () => ({ id: "early.plates", title: "Tower plates", text: "Bot lane pressure converts to plates.", effects: [{ scope: "stage", kind: "lane", target: "bot", amount: 0.6, label: "Bot lane this stage" }] }) },
  { id: "mid.turret", stage: "mid", weight: 3, build: () => ({ id: "mid.turret", title: "Turret taken", text: "Map pressure drops an outer turret.", effects: [{ scope: "stage", kind: "team", amount: 0.6, label: "Team this stage" }] }) },
  { id: "mid.catch", stage: "mid", weight: 3, build: (c) => {
    const good = c.d("catch") < 0.5;
    return good
      ? { id: "mid.catch", title: "Pick-off", text: "Vision wins a catch near the river.", effects: [{ scope: "stage", kind: "lane", target: "mid", amount: 0.7, label: "Mid lane this stage" }] }
      : { id: "mid.catch", title: "Caught out", text: "You overextend and are caught. They gain space.", effects: [{ scope: "stage", kind: "team", amount: -0.7, label: "Team this stage" }, { scope: "later", kind: "fatigue", target: "one", amount: 1, label: "Fatigue, one starter" }] };
  } },
  { id: "mid.item_spike", stage: "mid", weight: 2, build: (c) => {
    const role = pickRole(c, "spike");
    return { id: "mid.item_spike", title: `Item spike (${role})`, text: "A completed item shifts the matchup.", effects: [{ scope: "stage", kind: "lane", target: role, amount: 0.8, label: `${role} lane this stage` }] };
  } },
  { id: "late.clutch", stage: "late", weight: 3, build: (c) => {
    const avg = ROLES.reduce((a, r) => a + c.run.starters[r].conf, 0) / 5;
    if (avg < 2.8) return null;
    const role = pickRole(c, "clutch");
    return { id: "late.clutch", title: "Clutch play", text: `Run-earned composure shows: ${c.run.starters[role].name} holds the line.`, effects: [
      { scope: "stage", kind: "lane", target: role, amount: 0.8, label: `${role} lane this stage` },
      { scope: "later", kind: "confidence", target: c.run.starters[role].id, amount: 1, label: "Confidence" },
    ] };
  } },
  { id: "late.sidelane", stage: "late", weight: 3, build: (c) => {
    const n = ROLES.filter((r) => CHAMP_BY_ID[c.game.picks[r]].tags.includes("sidelane")).length;
    if (!n) return null;
    return { id: "late.sidelane", title: "Side-lane pressure", text: "Your split pressure pulls the enemy apart.", effects: [{ scope: "stage", kind: "team", amount: 0.8, label: "Team this stage" }] };
  } },
  { id: "late.overextend", stage: "late", weight: 2, build: () => ({ id: "late.overextend", title: "Overextension", text: "A greedy chase gives up space.", effects: [{ scope: "stage", kind: "team", amount: -0.6, label: "Team this stage" }, { scope: "later", kind: "fatigue", target: "all", amount: 1, label: "Fatigue, all starters" }] }) },
];

function rareMidEvent(c: EventCtx): EventInst | null {
  if (c.game.picks.top !== RARE_TOP_CHAMP) return null;
  const early = c.game.stages.find((s) => s.stage === "early");
  if (!early || !(early.label === "Kinda winning" || early.label === "Winning")) return null;
  if (!early.lanes.find((l) => l.role === "top")?.won) return null;
  if (c.d("rare") > 0.6) return null; // rare, not guaranteed
  const top = c.run.starters.top;
  return { id: "mid.rare_1v2", title: "Rare play: 1v2 turret dive", rare: true,
    text: `${top.name} turns a lead into a 1v2 and takes the turret. Big, and a little reckless.`,
    effects: [
      { scope: "stage", kind: "lane", target: "top", amount: 1.2, label: "Top lane this stage" },
      { scope: "stage", kind: "team", amount: 0.6, label: "Team this stage" },
      { scope: "later", kind: "confidence", target: top.id, amount: 1, label: `${top.name} Confidence` },
      { scope: "later", kind: "trait", target: top.id, amount: 1, label: `${top.name}: Overconfident next game` },
    ] };
}

/** Plan a stage: pick budgeted small events + the major slot. Deterministic. */
export function planStage(run: Run, game: Game, stage: Stage): StagePlan {
  const d = (k: string) => draw(run.seed, `${gkey(run, game)}|${stage}|${k}`);
  const ctx: EventCtx = { run, game, stage, d };
  const want = 1 + (d("count") < 0.5 ? 1 : 0);
  const small: EventInst[] = [];
  if (stage === "mid") {
    const rare = rareMidEvent(ctx);
    if (rare) small.push(rare);
  }
  const defs = EVENT_DEFS.filter((e) => e.stage === stage)
    .map((e) => ({ e, k: d(`pick|${e.id}`) * (1 / e.weight) }))
    .sort((a, b) => a.k - b.k);
  for (const { e } of defs) {
    if (small.length >= want) break;
    const inst = e.build({ ...ctx, d: (k) => d(`${e.id}|${k}`) });
    if (inst) small.push(inst);
  }
  let major: StagePlan["major"] = null;
  let majorTitle: string | undefined;
  if (stage === "early") { major = "dragon"; majorTitle = OBJECTIVES.dragon.title; }
  else if (stage === "late") {
    const tight = Math.abs(game.lead) <= 1;
    major = tight ? "elder" : "teamfight";
    majorTitle = tight ? OBJECTIVES.elder.title : "Decisive teamfight";
  }
  return { small, major, majorTitle };
}

/** Late may carry a second, skill-free major when Elder is on offer (budget 1–2). */
export function lateSecondMajor(game: Game): boolean { return Math.abs(game.lead) <= 1; }

export function applySmallEvents(game: Game, stage: Stage, plan: StagePlan): Game {
  const g = clone(game);
  g.plans[stage] = plan;
  for (const ev of plan.small) {
    ev.effects.forEach((e) => pushEffect(g, stage, e));
    g.ledger.push({ stage, kind: "small", title: ev.title, text: ev.text, effects: ev.effects, rare: ev.rare });
  }
  return g;
}

export function resolveObjective(game: Game, stage: Stage, kind: ObjectiveKind, correct: number, closeoutOffered = false): { game: Game; outcome: ObjectiveOutcome } {
  const g = clone(game);
  const outcome = objectiveOutcome(kind, correct, { closeoutOffered });
  outcome.effects.forEach((e) => pushEffect(g, stage, e));
  g.ledger.push({ stage, kind: "major", title: `${OBJECTIVES[kind].title}: ${outcome.title}`, text: outcome.summary, effects: outcome.effects, tone: outcome.tone });
  if (outcome.closeout) { g.over = true; g.won = true; g.endedAt = stage; g.reason = "Baron 3/3 closeout"; }
  return { game: g, outcome };
}

/** Skill-free decisive teamfight: leaning on the carried advantage. */
export function resolveTeamfight(game: Game, stage: Stage): { game: Game; ledger: LedgerItem } {
  const g = clone(game);
  const amt = g.lead > 0 ? 0.5 : g.lead < 0 ? -0.5 : 0;
  const effects: Effect[] = amt === 0 ? [] : [{ scope: "stage", kind: "team", amount: amt, label: "Team this stage" }];
  effects.forEach((e) => pushEffect(g, stage, e));
  const item: LedgerItem = { stage, kind: "major", title: "Decisive teamfight", text: amt > 0 ? "Your advantage shows up in the fight." : amt < 0 ? "Their advantage shows up in the fight." : "An even teamfight; nothing carries.", effects };
  g.ledger.push(item);
  return { game: g, ledger: item };
}

function lanePowers(run: Run, game: Game, stage: Stage, role: Role) {
  const s = run.series!;
  const p = run.starters[role];
  const champ = CHAMP_BY_ID[game.picks[role]];
  const profIdx = CHAMPS_BY_ROLE[role].findIndex((c) => c.id === champ.id);
  const over = game.overconfidentAtStart.includes(p.id) && stage !== "mid" ? -0.4 : 0;
  const parts: LanePart[] = [
    { label: "Player phase skill", value: p.phase[stage], source: "rules" },
    { label: "Champion phase strength", value: champ.phase[stage], source: "rules" },
    { label: "Champion proficiency", value: 0.5 * (p.prof[profIdx] ?? 0), source: "rules" },
    { label: "Confidence", value: 0.3 * (p.conf - 3), source: "rules" },
    { label: "Fatigue", value: -0.25 * p.fatigue, source: "rules" },
    { label: "Carried advantage", value: 0.4 * game.lead, source: "rules" },
    { label: "Preparation and tactic", value: (s.prepPlayer[p.id]?.[stage] ?? 0) + s.prepTeam[stage] + s.gameBonus[stage], source: "rules" },
    { label: "Events this stage", value: game.mods[stage].lane[role] ?? 0, source: "event" },
    { label: "Overconfident", value: over, source: "event" },
  ];
  const ours = parts.reduce((a, x) => a + x.value, 0);
  const opp = SEASON[run.nodeIdx].opp;
  const theirs = opp.lane[stage] + (draw(run.seed, `${gkey(run, game)}|opplane|${stage}|${role}`) - 0.5) * 1.6 - 0.4 * game.lead;
  return { ours, theirs, champ, parts };
}


export function scoreStage(run: Run, game: Game, stage: Stage): { game: Game; result: StageResult } {
  const g = clone(game);
  const opp = SEASON[run.nodeIdx].opp;
  const lanes: LaneRes[] = ROLES.map((role) => {
    const { ours, theirs, parts } = lanePowers(run, g, stage, role);
    const p = clamp(sigmoid((ours - theirs) / 1.6), 0.08, 0.92);
    const roll = draw(run.seed, `${gkey(run, g)}|${stage}|lane|${role}|roll`);
    return { role, won: roll < p, p, roll, ours, theirs, ourChamp: g.picks[role], theirChamp: g.oppPicks[role], parts };
  });
  const champs = ROLES.map((r) => CHAMP_BY_ID[g.picks[r]]);
  const meanLane = lanes.reduce((a, l) => a + l.ours, 0) / 5;
  const orgBias = run.org.bias[stage] ?? 0;
  const tOurs = 0.5 * meanLane + compScore(champs, stage) + orgBias + 0.3 * (run.cohesion - 2) + g.mods[stage].team + 0.4 * g.lead;
  const tTheirs = opp.team[stage] - 0.4 * g.lead;
  const tp = clamp(sigmoid((tOurs - tTheirs) / 1.6), 0.08, 0.92);
  const troll = draw(run.seed, `${gkey(run, g)}|${stage}|team|roll`);
  const team = { won: troll < tp, p: tp, roll: troll, ours: tOurs, theirs: tTheirs };
  const ours = lanes.filter((l) => l.won).length + (team.won ? 2 : 0);
  const label = labelFor(ours);
  const delta = LABEL_DELTA[label];
  const leadBefore = g.lead;
  const leadAfter = stage === "late" ? g.lead : clamp(g.lead + delta, -LEAD_CAP, LEAD_CAP);
  const result: StageResult = { stage, lanes, team, ours, theirs: 7 - ours, label, leadBefore, delta, leadAfter };
  g.stages.push(result);
  g.lead = leadAfter;
  if (stage === "mid") {
    const early = g.stages.find((s) => s.stage === "early")!;
    if (early.label === "Winning" && label === "Winning") { g.over = true; g.won = true; g.endedAt = "mid"; g.reason = "Closeout: Winning in Early and Mid"; }
    else if (early.label === "Losing" && label === "Losing") { g.over = true; g.won = false; g.endedAt = "mid"; g.reason = "They closed it out: Losing in Early and Mid"; }
  }
  if (stage === "late") {
    g.over = true; g.won = ours >= 4; g.endedAt = "late"; g.reason = `Late decided: ${ours}–${7 - ours}`;
  }
  g.stage = stage === "early" ? "mid" : stage === "mid" ? "late" : "late";
  return { game: g, result };
}

/** Baron is offered only after a Mid that did not close the game and was not a losing one (placeholder qualification). */
export function baronQualified(game: Game): boolean {
  const mid = game.stages.find((s) => s.stage === "mid");
  return !!mid && !game.over && (mid.label === "Even" || mid.label === "Kinda winning" || mid.label === "Winning");
}

// ───────────────────────────────────────────────────────────── post-game

export interface PlayerDelta { id: string; name: string; role: Role; confBefore: number; confAfter: number; fatBefore: number; fatAfter: number; causes: string[]; traitAdded?: string; traitRemoved?: string }
export interface GameSummary { won: boolean; endedAt: Stage; reason: string; deltas: PlayerDelta[]; cohesionBefore: number; cohesionAfter: number; seriesOver: boolean }

export function finishGame(run: Run, game: Game): { run: Run; summary: GameSummary } {
  const r = clone(run);
  const s = r.series!;
  const won = !!game.won;
  const cohesionBefore = r.cohesion;
  const deltas: PlayerDelta[] = ROLES.map((role) => {
    const p = r.starters[role];
    const lw = game.stages.filter((st) => st.lanes.find((l) => l.role === role)?.won).length;
    const ll = game.stages.length - lw;
    const causes: string[] = [];
    let conf = p.conf, fat = p.fatigue;
    if (lw > ll) { conf += 1; causes.push("won their lane"); } else if (ll > lw) { conf -= 1; causes.push("lost their lane"); }
    fat += 1; causes.push("played a game");
    return { id: p.id, name: p.name, role, confBefore: p.conf, confAfter: conf, fatBefore: p.fatigue, fatAfter: fat, causes };
  });
  const byId = (id: string) => deltas.find((d) => d.id === id);
  game.later.forEach((e, i) => {
    const targets = e.target === "all" ? deltas
      : e.target === "one" ? [deltas[Math.floor(draw(r.seed, `${gkey(r, game)}|later|${i}`) * 5)]]
      : [byId(e.target ?? "")].filter(Boolean) as PlayerDelta[];
    for (const d of targets) {
      if (e.kind === "confidence") { d.confAfter += e.amount; d.causes.push(e.label); }
      if (e.kind === "fatigue") { d.fatAfter += e.amount; d.causes.push(e.label); }
      if (e.kind === "trait") d.traitAdded = "Overconfident";
    }
    if (e.kind === "cohesion") r.cohesion = clamp(r.cohesion + e.amount, 0, 5);
  });
  for (const d of deltas) {
    const p = r.starters[d.role];
    p.conf = clamp(d.confAfter, 1, 5); p.fatigue = clamp(d.fatAfter, 0, 5);
    d.confAfter = p.conf; d.fatAfter = p.fatigue;
    if (game.overconfidentAtStart.includes(p.id)) { p.traits = p.traits.filter((t) => t !== "Overconfident"); d.traitRemoved = "Overconfident"; }
    if (d.traitAdded && !p.traits.includes(d.traitAdded)) p.traits.push(d.traitAdded);
    p.traits = p.traits.filter((t) => t !== "Honeymoon");
  }
  r.cohesion = clamp(r.cohesion + (won ? 1 : -1), 0, 5);
  s.games.push({ idx: game.idx, won, endedAt: game.endedAt ?? "late", reason: game.reason, labels: game.stages.map((x) => x.label), ours: game.stages.map((x) => x.ours) });
  if (won) s.wins++; else s.losses++;
  ROLES.forEach((role) => s.used.push(game.picks[role]));
  s.gameBonus = emptyStageNumbers();
  return { run: r, summary: { won, endedAt: game.endedAt ?? "late", reason: game.reason, deltas, cohesionBefore, cohesionAfter: r.cohesion, seriesOver: s.wins >= 3 || s.losses >= 3 } };
}

export interface Tactic { id: string; name: string; chips: string[]; blurb: string }
export const TACTICS: Tactic[] = [
  { id: "reset", name: "Reset the weakest link", chips: ["Lowest Confidence +1"], blurb: "A quiet word with whoever is struggling." },
  { id: "tempo", name: "Press the tempo", chips: ["Early +0.8", "Late −0.4"], blurb: "Play faster next game." },
  { id: "scale", name: "Play for Late", chips: ["Late +0.8", "Early −0.4"], blurb: "Survive and scale next game." },
  { id: "rest", name: "Rest the lanes", chips: ["Fatigue −1 (all)"], blurb: "Take the edge off tired players." },
];
export function applyTactic(run: Run, id: string): Run {
  const r = clone(run);
  const s = r.series!;
  const all = ROLES.map((x) => r.starters[x]);
  if (id === "reset") { const low = [...all].sort((a, b) => a.conf - b.conf)[0]; low.conf = clamp(low.conf + 1, 1, 5); }
  if (id === "tempo") { s.gameBonus.early += 0.8; s.gameBonus.late -= 0.4; }
  if (id === "scale") { s.gameBonus.late += 0.8; s.gameBonus.early -= 0.4; }
  if (id === "rest") all.forEach((p) => { p.fatigue = clamp(p.fatigue - 1, 0, 5); });
  return r;
}

export function finishSeries(run: Run): Run {
  const r = clone(run);
  const s = r.series!;
  const won = s.wins >= 3;
  r.results[r.nodeIdx] = won ? "W" : "L";
  const node = SEASON[r.nodeIdx];
  if (!won && node.kind !== "regular") r.alive = false;
  r.nodeIdx += 1;
  if (r.nodeIdx >= SEASON.length) r.finished = true;
  if (!r.alive) r.finished = true;
  r.series = null;
  return r;
}

export function availableChamps(run: Run, role: Role): Champion[] {
  const used = new Set(run.series?.used ?? []);
  return CHAMPS_BY_ROLE[role].filter((c) => !used.has(c.id));
}

export function autoPicks(run: Run): Record<Role, string> {
  return Object.fromEntries(ROLES.map((role) => {
    const p = run.starters[role];
    const best = [...availableChamps(run, role)].sort((a, b) => {
      const ia = CHAMPS_BY_ROLE[role].findIndex((c) => c.id === a.id), ib = CHAMPS_BY_ROLE[role].findIndex((c) => c.id === b.id);
      return (p.prof[ib] ?? 0) - (p.prof[ia] ?? 0);
    })[0];
    return [role, best.id];
  })) as Record<Role, string>;
}

/**
 * Drives one whole game with scripted objective answers. The UI walks the same
 * primitives step by step; tests and the "quick sim" use this loop.
 */
export function playGameScripted(run: Run, picks: Record<Role, string>, answers: (kind: ObjectiveKind, stage: Stage) => number): Game {
  let g = beginGame(run, picks);
  for (const stage of STAGES) {
    if (g.over) break;
    g.stage = stage;
    const plan = planStage(run, g, stage);
    g = applySmallEvents(g, stage, plan);
    if (plan.major === "dragon" || plan.major === "elder") g = resolveObjective(g, stage, plan.major, answers(plan.major, stage)).game;
    if (plan.major === "teamfight" || (stage === "late" && plan.major === "elder")) g = resolveTeamfight(g, stage).game;
    g = scoreStage(run, g, stage).game;
    if (stage === "mid" && baronQualified(g)) g = resolveObjective(g, "mid", "baron", answers("baron", "mid"), true).game;
  }
  return g;
}
