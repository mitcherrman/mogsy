/**
 * TEST FIXTURES in the exact shape the LCS backend serves (`arena/projection.py`
 * after B3/B4: `viewer_can_manage`, node `ready_profile_ids` / `attention`).
 * Used only by tests; nothing renders them in the product.
 */
import type { ArenaEvent, ArenaNode } from "../contracts";

export const SERVER_NOW = "2026-10-22T12:00:00.000000+00:00";

export function serverNode(over: Partial<ArenaNode> = {}): ArenaNode {
  return {
    node_id: "r1n1",
    round: 1,
    position: 0,
    section: "main",
    best_of: 1,
    status: "ready",
    slots: [
      { source: { kind: "seed", seed: 1 }, profile_id: "prof-a", wins: 0 },
      { source: { kind: "seed", seed: 2 }, profile_id: "prof-b", wins: 0 },
    ],
    winner_profile_id: null,
    current_match_id: null,
    ready_deadline: "2026-10-22T12:10:00.000000+00:00",
    ready_profile_ids: [],
    attention: null,
    games: [],
    ...over,
  };
}

export function serverEvent(over: Partial<ArenaEvent> = {}, node: Partial<ArenaNode> = {}): ArenaEvent {
  return {
    contract_version: "arena_event.v1",
    event_id: "aev_0123456789abcdef01234567",
    kind: "duel",
    status: "running",
    revision: 4,
    title: "Owner duel",
    game_type: "ranked_quiz",
    rules: { game_type: "ranked_quiz", modules: 3, question_seconds: null, ruleset: "standard", speed_bonus: true, difficulty: "mixed", topics: [] },
    best_of: 1,
    max_entrants: 2,
    rated: false,
    visibility: "private",
    organizer_profile_id: "prof-a",
    viewer_profile_id: "prof-a",
    viewer_role: "organizer",
    viewer_can_manage: false,
    entrants: [
      { profile_id: "prof-a", display_name: "Aurelia", seed: 1, status: "checked_in", role: "organizer", role_emblem: null, tier: null },
      { profile_id: "prof-b", display_name: "Brakk", seed: 2, status: "checked_in", role: "player", role_emblem: null, tier: null },
    ],
    bracket: { type: "single_elimination", rounds: 1, nodes: [serverNode(node)] },
    champion_profile_id: null,
    server_now: SERVER_NOW,
    ...over,
  };
}
