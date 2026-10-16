/**
 * PGM2 — board reporting for the Ranked-backed bonus games, Match Grid first.
 *
 * A board module has no multiple-choice question, so the arena used to file
 * an empty report. Its renderer now describes the board (`reportBoard`), and
 * the arena's one publisher carries it with the bonus game's mode id. The
 * answer rule is unchanged: the correct board and its evidence come only from
 * the reveal the server sent this viewer after the lock.
 */
import { describe, expect, it } from "vitest";
import wire from "@/lib/ranked-public/__fixtures__/matchGridP2WireCapture.json";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { arenaReportSnapshot } from "@/lib/ranked-core/reportSnapshot";
import { buildQuestionReportContext } from "@/lib/feedback/report-context";
import { matchBoardReport } from "./matchGridModule";
import { MATCH_HOST } from "@/lib/ranked-public/matchHost";
import {
  MORE_CHALLENGES_ORIGIN_ROUTE, originForHost, readMatchOrigin, resolveMatchOrigin,
} from "@/pages/quiz-ranked/matchOrigin";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const STARTED = "2026-07-18T12:00:00+00:00";

function round(state: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const body = publicRoundV2();
  const payload = body.payload as Record<string, unknown>;
  payload.segment = {
    module_id: "match", module_version: 1, challenge_count: 1, challenge_index: 0,
    segment_number: 1, phase: "challenges", ability_deadline: null,
    challenge_started_at: STARTED, challenge_deadline: "2026-07-18T12:00:45+00:00",
    pressure_applied: false, resolved: false,
  };
  payload.segment_state = state;
  Object.assign(payload, extra);
  return readPublicRound(body);
}

function state(over: Record<string, unknown> = {}, locked: unknown[] | null = null) {
  return {
    active: true, segment_number: 1, module_id: "match", module_version: 1,
    phase: "challenges", challenge_count: 1, ability_deadline: null,
    challenge_started_at: STARTED, challenge_deadline: "2026-07-18T12:00:45+00:00",
    pressure_applied: false,
    own_ability: { selected_ability_id: null, confirmed: false, available_ability_ids: [], unavailable_ability_ids: {} },
    opponent_ability_confirmed: false,
    own_next_challenge_index: locked ? 1 : 0,
    own_submitted_choices: [locked ? { assignments: locked } : null],
    own_challenges_completed: locked ? 1 : 0,
    opponent_challenges_completed: 0, opponent_finished: false, own_finished: locked !== null,
    reveal_window_ms: 3000,
    challenges: clone(wire.segment_state_challenges),
    own_challenge_reveals: [],
    ...over,
  };
}

const BLOCK = wire.segment_state_challenges.challenges[0];
const PROMPT = wire.segment_state_challenges.prompt;
const LABEL = Object.fromEntries(BLOCK.entities.map((e) => [e.entity_id, e.label]));
const GROUP = Object.fromEntries(BLOCK.groups.map((g) => [g.group_id, g.label]));
const line = (rows: { entity_id: string; group_id: string }[]) =>
  rows.map((r) => `${LABEL[r.entity_id]} → ${GROUP[r.group_id]}`).join("; ");

describe("PGM2 — Match Grid board report", () => {
  it("before the lock: the board on screen, and no answer at all", () => {
    const r = matchBoardReport(round(state()))!;
    expect(r.prompt).toContain(PROMPT);
    for (const g of BLOCK.groups) expect(r.prompt).toContain(g.label);
    expect(r.choices).toEqual(BLOCK.entities.map((e) => e.label));
    expect(r.selected).toBeNull();
    expect(r.canonical).toBeNull();
    expect(r.evidence).toBeNull();
  });

  it("locked but not yet revealed: the player's board, still no answer", () => {
    const r = matchBoardReport(round(state({}, wire.submitted_choice.assignments)))!;
    expect(r.selected).toBe(line(wire.submitted_choice.assignments));
    expect(r.canonical).toBeNull();
    expect(r.evidence).toBeNull();
  });

  it("after the server's reveal: the correct board and where it comes from", () => {
    const r = matchBoardReport(round(state({ own_challenge_reveals: [clone(wire.lock_challenge_reveal)] },
      wire.submitted_choice.assignments)))!;
    expect(r.canonical).toBe(line(wire.lock_challenge_reveal.canonical_assignments));
    expect(r.evidence).toMatch(/^Certified rune → tree snapshot/);
  });
});

describe("PGM2 — the arena files a board report under the bonus game's mode", () => {
  const identity = { mode: "Match Grid", category: "Leaguecraft" as const, gameModeId: "match_grid" };

  it("carries the board, the mode id and the round, and the answer only after the reveal", () => {
    const pre = arenaReportSnapshot({ identity, publicRound: round(state()), selection: null, reveal: null })!;
    expect(pre).toMatchObject({ mode: "Match Grid", category: "Leaguecraft", gameModeId: "match_grid",
      moduleType: "match.v1", canonicalAnswer: null, answerEvidence: null });
    expect(pre.prompt).toContain(PROMPT);
    const post = arenaReportSnapshot({ identity, selection: null, reveal: null,
      publicRound: round(state({ own_challenge_reveals: [clone(wire.lock_challenge_reveal)] },
        wire.submitted_choice.assignments)) })!;
    const ctx = buildQuestionReportContext({ snapshot: post, reason: "incorrect_answer", route: "/quiz/ranked" });
    expect(ctx.game_mode_id).toBe("match_grid");
    expect(ctx.canonical_answer).toBe(line(wire.lock_challenge_reveal.canonical_assignments));
    expect(ctx.selected_answer).toBe(line(wire.submitted_choice.assignments));
    expect(ctx.answer_evidence).toMatch(/snapshot/);
  });

  it("an ordinary Ranked report gains no mode id", () => {
    const snap = arenaReportSnapshot({ identity: { mode: "Ranked", category: "Ranked" },
      publicRound: round(state()), selection: null, reveal: null })!;
    expect(snap.gameModeId).toBeNull();
  });

  it("reads the bonus mode id off the match, never an admin preset name", () => {
    const pub = round(state(), { host: "bonus_game", game_mode_id: "match_grid" });
    expect(pub.host).toBe("bonus_game");
    expect(pub.gameModeId).toBe("match_grid");
    expect(round(state()).gameModeId).toBeUndefined();
    expect(round(state(), { game_mode_id: null }).gameModeId).toBeNull();
  });
});

describe("PGM2 — a bonus game returns to More Challenges", () => {
  it("the persisted host implies the origin, so it survives a reload", () => {
    const origin = originForHost(MATCH_HOST.bonusGame)!;
    expect(origin).toMatchObject({ id: "bonus_game", href: MORE_CHALLENGES_ORIGIN_ROUTE,
      returnLabel: "Back to More Challenges", label: "More Challenges" });
    expect(MORE_CHALLENGES_ORIGIN_ROUTE).toBe("/quiz/more-challenges");
    expect(readMatchOrigin({ origin: "bonus_game" })).toEqual(origin);
    expect(resolveMatchOrigin("bonus_game", null)).toEqual(origin);
    // A reported ordinary host still overrules a stale bonus hint.
    expect(resolveMatchOrigin(null, origin)).toBeNull();
  });
});
