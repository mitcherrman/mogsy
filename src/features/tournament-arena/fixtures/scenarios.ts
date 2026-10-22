/**
 * SIMULATED scenarios for the DEV harness. Every one is built from the pure
 * advancement engine over the fixture roster, so "QF3 live, Bo3 at 1–1" is a
 * real state of the real state machine, not a hand-written picture of one.
 * None of this is reachable from production (the route is DEV-only).
 */
import { ARENA_EVENT_CONTRACT, type ArenaBestOf, type ArenaEvent, type ArenaEventKind, type ArenaRules } from "../contracts";
import { goLive, lockEvent, nextPlayableNode, recordGame, scriptedResult, startEvent } from "../engine/advance";
import { fixtureEntrants, VIEWER_ID } from "./roster";

export const DEFAULT_RULES: ArenaRules = {
  game_type: "ranked_quiz",
  modules: 10,
  question_seconds: 20,
  ruleset: "standard",
  speed_bonus: true,
  difficulty: "mixed",
  topics: ["champions", "items", "patches"],
};

export interface DraftEventInput {
  event_id: string;
  title: string;
  kind: ArenaEventKind;
  entrants: number;
  best_of: ArenaBestOf;
  rules?: Partial<ArenaRules>;
  visibility?: ArenaEvent["visibility"];
}

export function draftEvent(input: DraftEventInput): ArenaEvent {
  const rules = { ...DEFAULT_RULES, ...input.rules };
  return {
    contract_version: ARENA_EVENT_CONTRACT,
    event_id: input.event_id,
    kind: input.kind,
    status: "open",
    revision: 1,
    title: input.title,
    game_type: rules.game_type,
    rules,
    best_of: input.best_of,
    max_entrants: input.entrants,
    rated: false,
    visibility: input.visibility ?? "private",
    organizer_profile_id: VIEWER_ID,
    viewer_profile_id: VIEWER_ID,
    viewer_role: "organizer",
    join_code: "MOGZY-" + input.event_id.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase().padStart(4, "7"),
    entrants: fixtureEntrants(input.entrants),
    bracket: null,
    champion_profile_id: null,
    server_now: new Date(0).toISOString(),
  };
}

/** Play `games` scripted games from the start of a running event. */
export function playGames(ev: ArenaEvent, games: number): ArenaEvent {
  let cur = ev;
  for (let i = 0; i < games; i++) {
    const node = nextPlayableNode(cur);
    if (!node) break;
    if (node.status === "ready") cur = goLive(cur, node.node_id);
    const live = cur.bracket!.nodes.find((n) => n.node_id === node.node_id)!;
    const seedOf = (id: string | null) => cur.entrants.find((e) => e.profile_id === id)?.seed ?? null;
    cur = recordGame(cur, node.node_id, scriptedResult(node.node_id, live.games.length + 1, seedOf(live.slots[0].profile_id), seedOf(live.slots[1].profile_id)));
  }
  return cur;
}

/** Play every game until the event completes. */
export function playToEnd(ev: ArenaEvent): ArenaEvent {
  let cur = ev;
  for (let guard = 0; guard < 400 && cur.status !== "complete"; guard++) {
    const before = cur.revision;
    cur = playGames(cur, 1);
    if (cur.revision === before) break;
  }
  return cur;
}

export interface Scenario {
  id: string;
  label: string;
  build: () => ArenaEvent;
}

const running = (id: string, title: string, entrants: number, best_of: ArenaBestOf, kind: ArenaEventKind = "tournament") =>
  startEvent(lockEvent(draftEvent({ event_id: id, title, kind, entrants, best_of })));

export const SCENARIOS: readonly Scenario[] = [
  { id: "lobby-8", label: "Lobby · 8 joined, not locked", build: () => draftEvent({ event_id: "aev_lobby8", title: "Friday Night Quiz Cup", kind: "tournament", entrants: 8, best_of: 3 }) },
  { id: "locked-8", label: "8 · bracket locked", build: () => lockEvent(draftEvent({ event_id: "aev_locked8", title: "Friday Night Quiz Cup", kind: "tournament", entrants: 8, best_of: 3 })) },
  { id: "live-4", label: "4 · semifinal live", build: () => playGames(running("aev_four", "Duo Queue Showdown", 4, 1), 1) },
  { id: "mid-8", label: "8 · Bo3 at 1–1, QF3 live", build: () => {
    // QF1 and QF2 decided by script; QF3 live and level at 1–1; QF4 ready.
    let cur = running("aev_eight", "Friday Night Quiz Cup", 8, 3);
    for (let guard = 0; guard < 12; guard++) {
      const node = nextPlayableNode(cur);
      if (!node || node.node_id === "r1n3") break;
      cur = playGames(cur, 1);
    }
    cur = goLive(cur, "r1n3");
    cur = recordGame(cur, "r1n3", { winner: 0, score_a: 23, score_b: 19 });
    cur = recordGame(cur, "r1n3", { winner: 1, score_a: 17, score_b: 21 });
    return cur;
  } },
  { id: "byes-6", label: "6 · byes for the top seeds", build: () => running("aev_six", "Patch 26.21 Open", 6, 1) },
  { id: "final-16", label: "16 · final pending", build: () => {
    const ev = running("aev_sixteen", "Summoner's Rift Invitational", 16, 3);
    let cur = ev;
    for (let guard = 0; guard < 200; guard++) {
      const node = nextPlayableNode(cur);
      if (!node || node.round === cur.bracket!.rounds) break;
      cur = playGames(cur, 1);
    }
    return cur;
  } },
  { id: "champion-16", label: "16 · champion crowned", build: () => playToEnd(running("aev_sixteen_done", "Summoner's Rift Invitational", 16, 3)) },
  { id: "open-32", label: "32 · round of 32 under way", build: () => playGames(running("aev_thirtytwo", "Worlds Watch Party Open", 32, 1), 9) },
  { id: "duel", label: "Custom duel · 1v1", build: () => running("aev_duel", "Grudge Match", 2, 3, "duel") },
];

export function scenarioById(id: string | null | undefined): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[3];
}
