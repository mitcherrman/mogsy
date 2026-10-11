// MG-P3 — the production `match` module against the REAL P2 wire capture
// (`docs/MATCH_GRID_P2_WIRE_CAPTURE.json` in the backend, copied verbatim to
// `ranked-public/__fixtures__/matchGridP2WireCapture.json`).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import wire from "@/lib/ranked-public/__fixtures__/matchGridP2WireCapture.json";
import type { SegmentChoice } from "@/lib/ranked-public/client";
import {
  readMatchReview, readOwnChallengeReveal, readPublicRound, readSegmentReveal,
  RankedPublicParseError, type SegmentStateView,
} from "@/lib/ranked-public/contracts";
import { publicRoundV2 } from "@/lib/ranked-public/fixtures";
import { INLINE_LOCK_REVEAL_MODULES, withInlineOrderForgeReveal } from "@/lib/ranked-core/orderForgeLockReveal";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import { SegmentTranscript, segmentTitle } from "@/components/ranked-arena/SegmentTranscript";
import { getModuleRenderer, registeredModuleIds, rendererForSegment } from "./registry";
import {
  matchGridModule, toMatchChoice, toMatchPublic, toMatchReveal,
} from "./matchGridModule";
import type { ModuleSegmentActions } from "./types";

// ---------------------------------------------------------------- compile-time: SegmentChoice
type Assert<T extends true> = T;
type MatchChoice = { assignments: { entity_id: string; group_id: string }[] };
export type _MatchChoiceIsSegmentChoice = Assert<MatchChoice extends SegmentChoice ? true : false>;
// The existing branches are untouched.
export type _PlacementStillSegmentChoice = Assert<{ placement: string[] } extends SegmentChoice ? true : false>;
export type _OrderStillSegmentChoice = Assert<{ order: string[] } extends SegmentChoice ? true : false>;
export type _SelectedStillSegmentChoice = Assert<{ selected: string } extends SegmentChoice ? true : false>;
// Names / keys / correctness cannot ride the match branch.
export type _NoNameIdentity = Assert<{ assignments: { entity: string; group: string }[] } extends SegmentChoice ? false : true>;

// ---------------------------------------------------------------- fixtures
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const PUBLIC = wire.segment_state_challenges;
const LOCK_REVEAL = wire.lock_challenge_reveal;
const STARTED = "2026-07-18T12:00:00+00:00";

function segmentMeta() {
  return {
    module_id: "match", module_version: 1, challenge_count: 1, challenge_index: 0,
    segment_number: 1, phase: "challenges", ability_deadline: null,
    challenge_started_at: STARTED, challenge_deadline: "2026-07-18T12:00:45+00:00",
    pressure_applied: false, resolved: false,
  };
}

function rawState(over: Record<string, unknown> = {}, locked: unknown[] | null = null) {
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
    challenges: clone(PUBLIC),
    own_challenge_reveals: [],
    ...over,
  };
}

function parse(state: unknown) {
  const body = publicRoundV2();
  (body.payload as Record<string, unknown>).segment = segmentMeta();
  (body.payload as Record<string, unknown>).segment_state = state;
  return readPublicRound(body);
}

function actions(over: Partial<ModuleSegmentActions> = {}): ModuleSegmentActions {
  return { submitChallenge: vi.fn(), busy: false, error: null, ...over };
}

function view(state: SegmentStateView | null, acts: ModuleSegmentActions) {
  return (
    <matchGridModule.Viewport publicRound={readPublicRound(publicRoundV2())}
      selection={null} permissions={NO_INTERACTIONS} onSelect={vi.fn()}
      segmentState={state} actions={acts} skewMs={0} />
  );
}

const sigil = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label}\\.`) });
const seal = (label: string) => screen.getByRole("button", { name: new RegExp(`^${label},`) });
const lockButton = () => screen.getByRole("button", { name: /lock in|locked in|resolved/i });

beforeAll(() => {
  if (typeof window.PointerEvent === "undefined") {
    class PointerEventShim extends MouseEvent {
      pointerId: number; pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init); this.pointerId = init.pointerId ?? 1; this.pointerType = init.pointerType ?? "mouse";
      }
    }
    (window as unknown as { PointerEvent: typeof PointerEvent }).PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
  }
  if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = () => {};
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

afterEach(() => {
  document.documentElement.classList.remove("reduce-motion");
  vi.useRealTimers();
});

/** The player's board from the capture (e0 under g1 = wrong; rest right), by labels → seals. */
const LABEL = Object.fromEntries(PUBLIC.challenges[0].entities.map((e) => [e.entity_id, e.label]));
const GROUP = Object.fromEntries(PUBLIC.challenges[0].groups.map((g) => [g.group_id, g.label]));
const GROUP_INDEX = Object.fromEntries(PUBLIC.challenges[0].groups.map((g, i) => [g.group_id, i + 1]));

const pointer = (type: string, el: Element, x: number, y: number, pointerType = "mouse") =>
  fireEvent(el, new window.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType }));
const tap = (el: Element) => { pointer("pointerdown", el, 10, 10); pointer("pointerup", el, 10, 10); };
/** jsdom has no layout: the primitive falls back to a 960px board, three 320px columns. */
function drag(el: Element, to: [number, number]) {
  pointer("pointerdown", el, 40, 400);
  pointer("pointermove", el, 46, 406);
  pointer("pointermove", el, to[0], to[1]);
  pointer("pointerup", el, to[0], to[1]);
}

function seatByKeyboard(entityId: string, groupId: string) {
  fireEvent.keyDown(sigil(LABEL[entityId]), { key: String(GROUP_INDEX[groupId]) });
}

// ---------------------------------------------------------------- 1–4: contract
describe("match contract — public block", () => {
  it("parses P2's pre-lock block with opaque tokens preserved exactly", () => {
    const st = parse(rawState()).segmentState!;
    expect(st.block?.contract).toBe("match");
    if (st.block?.contract !== "match") return;
    expect(st.block.entities.map((e) => e.entityId)).toEqual(["e0", "e1", "e2", "e3", "e4", "e5", "e6"]);
    expect(st.block.groups.map((g) => g.groupId)).toEqual(["g0", "g1", "g2"]);
    expect(st.block.groups.map((g) => g.glyph)).toEqual(["precision", "domination", "sorcery"]);
    expect(st.block.prompt).toBe("Seat each rune under its tree");
    expect(st.block.membership).toBe("one");
    expect(st.ownSubmittedAssignments).toEqual([null]);
  });

  it.each([
    ["membership many", (s: ReturnType<typeof rawState>) => { s.challenges.challenges[0].membership = "many"; }],
    ["no entities", (s: ReturnType<typeof rawState>) => { s.challenges.challenges[0].entities = []; }],
    ["duplicate entity", (s: ReturnType<typeof rawState>) => {
      s.challenges.challenges[0].entities.push(clone(s.challenges.challenges[0].entities[0]));
    }],
    ["duplicate group", (s: ReturnType<typeof rawState>) => {
      s.challenges.challenges[0].groups.push(clone(s.challenges.challenges[0].groups[0]));
    }],
    ["entity without id", (s: ReturnType<typeof rawState>) => {
      delete (s.challenges.challenges[0].entities[0] as Record<string, unknown>).entity_id;
    }],
    ["groups not a list", (s: ReturnType<typeof rawState>) => {
      (s.challenges.challenges[0] as Record<string, unknown>).groups = { g0: "Precision" };
    }],
    ["two challenges", (s: ReturnType<typeof rawState>) => {
      s.challenges.challenges.push(clone(s.challenges.challenges[0]));
    }],
  ])("fails closed on a malformed board: %s", (_name, mutate) => {
    const s = rawState();
    mutate(s);
    expect(() => parse(s)).toThrow(RankedPublicParseError);
  });

  it.each([
    "canonical", "canonical_assignments", "settled", "settled_assignments", "answers",
    "entity_correct", "correct_group", "entity_facts", "rune_key", "tree_key", "is_keystone",
    "rune_type", "tree_label",
  ])("rejects the reveal-only key %s anywhere pre-lock", (key) => {
    const s = rawState();
    (s.challenges.challenges[0].entities[0] as Record<string, unknown>)[key] = "x";
    expect(() => parse(s)).toThrow(/leaked a hidden field/);
    const s2 = rawState();
    (s2.challenges as Record<string, unknown>)[key] = "x";
    expect(() => parse(s2)).toThrow(/leaked a hidden field/);
  });

  it("reads the lock echo after a refresh", () => {
    const st = parse(rawState({}, wire.submitted_choice.assignments)).segmentState!;
    expect(st.ownSubmittedAssignments?.[0]?.map((a) => [a.entityId, a.groupId]))
      .toEqual(wire.submitted_choice.assignments.map((a) => [a.entity_id, a.group_id]));
    expect(st.ownSubmittedChoices).toEqual([null]);
  });
});

describe("match contract — reveal, settlement, review", () => {
  it("reads the own lock reveal exactly as P2 sent it", () => {
    const r = readOwnChallengeReveal(clone(LOCK_REVEAL), 1, "match").match!;
    expect(r.isCorrect).toBe(false);
    expect(r.matched).toBe(6);
    expect(r.required).toBe(7);
    expect(r.entityCorrect).toEqual({ e0: false, e1: true, e2: true, e3: true, e4: true, e5: true, e6: true });
    expect(r.canonicalAssignments.find((a) => a.entityId === "e0")?.groupId).toBe("g0");
    expect(r.entityFacts.e0).toEqual({ label: "Conqueror", treeLabel: "Precision", runeType: "keystone" });
  });

  it("refuses a reveal for a challenge the viewer may still answer", () => {
    expect(() => readOwnChallengeReveal(clone(LOCK_REVEAL), 0, "match")).toThrow(/discloses/);
  });

  it("fails closed on a malformed reveal", () => {
    const bad = clone(LOCK_REVEAL) as Record<string, unknown>;
    bad.entity_correct = { e0: false };
    expect(() => readOwnChallengeReveal(bad, 1, "match")).toThrow(RankedPublicParseError);
  });

  it("reads the settlement without inventing scores", () => {
    const rv = readSegmentReveal({ segment_reveal: clone(wire.settlement_segment_reveal) })!;
    expect(rv.moduleId).toBe("match");
    expect(rv.challenges).toEqual([]);
    expect(rv.match?.matched["human-1"]).toBe(6);
    expect(rv.match?.required).toBe(7);
    expect(rv.players["human-1"].segmentResult).toBe("loss");
  });

  const reviewEnvelope = (round: Record<string, unknown>) => ({
    projection_type: "match_review",
    schema_version: "ranked_duel.match_review.v1",
    server_time: STARTED,
    payload: { match_id: "m1", final_round_number: 1, round_count: 1, rounds: [round] },
  });
  const reviewRound = (revealed: boolean) => ({
    round_number: 1, kind: "match", module_id: "match", category: null,
    canonical_question_ref: null, revealed, icon_hint: { kind: "generic", key: null, icon: null },
    topic: null, question: null,
    family: "rune_tree", prompt: PUBLIC.prompt, membership: "one",
    entities: clone(PUBLIC.challenges[0].entities), groups: clone(PUBLIC.challenges[0].groups),
    viewer_assignments: clone(wire.submitted_choice.assignments),
    canonical_assignments: revealed ? clone(LOCK_REVEAL.canonical_assignments) : null,
    entity_correct: revealed ? clone(LOCK_REVEAL.entity_correct) : null,
    entity_facts: revealed ? clone(LOCK_REVEAL.entity_facts) : null,
    source: revealed ? clone(LOCK_REVEAL.source) : null,
    matched: revealed ? 6 : null, outcome: revealed ? "incorrect" : null,
    is_correct: revealed ? false : null,
    viewer_submission: { answer_index: null, is_correct: revealed ? false : null,
      correct_count: revealed ? 0 : null, answered_count: 1, challenge_count: 1 },
  });

  it("reads a frozen review round", () => {
    const rv = readMatchReview(reviewEnvelope(reviewRound(true))).rounds[0];
    expect(rv.kind).toBe("match");
    expect(rv.match?.viewerAssignments?.[0]).toEqual({ entityId: "e0", groupId: "g1" });
    expect(rv.match?.entityCorrect?.e0).toBe(false);
    expect(rv.match?.entityFacts?.e0.treeLabel).toBe("Precision");
  });

  it("an unrevealed review round must not carry the canonical board", () => {
    const leaky = { ...reviewRound(false), canonical_assignments: clone(LOCK_REVEAL.canonical_assignments) };
    expect(() => readMatchReview(reviewEnvelope(leaky))).toThrow(/not revealed/);
    expect(readMatchReview(reviewEnvelope(reviewRound(false))).rounds[0].match?.canonicalAssignments).toBeNull();
  });
});

describe("match settlement transcript", () => {
  it("states relationships from the server's own counts, never points", () => {
    const rv = readSegmentReveal({ segment_reveal: clone(wire.settlement_segment_reveal) })!;
    expect(segmentTitle(rv)).toBe("Match Grid");
    const bot = Object.keys(wire.settlement_segment_reveal.players).find((k) => k.startsWith("bot"))!;
    render(<SegmentTranscript reveal={rv} viewerUserId="human-1" opponentUserId={bot} />);
    expect(screen.getByTestId("mg-transcript-you")).toHaveTextContent("6 of 7 relationships correct");
    expect(screen.getByTestId("mg-transcript-them")).toHaveTextContent("7 of 7 relationships correct");
    expect(screen.getByTestId("match-grid-transcript").textContent).not.toMatch(/point/i);
  });
});

// ---------------------------------------------------------------- registry / host seams
describe("match module — registration", () => {
  it("registers `match` v1 exactly as P2 names it; a future version fails closed", () => {
    expect(registeredModuleIds()).toContain("match");
    expect(getModuleRenderer("match", 1)).toBe(matchGridModule);
    expect(getModuleRenderer("match", 2)).toBeNull();
    expect(rendererForSegment(parse(rawState()).segment)).toBe(matchGridModule);
    expect(matchGridModule.ownsSubmission).toBe(true);
    expect(matchGridModule.projectQuestion(readPublicRound(publicRoundV2()))).toBeNull();
  });

  it("takes the inline lock reveal only when it carries a match block", () => {
    expect(INLINE_LOCK_REVEAL_MODULES.has("match")).toBe(true);
    const st = parse(rawState({}, wire.submitted_choice.assignments)).segmentState!;
    const reveal = readOwnChallengeReveal(clone(LOCK_REVEAL), 1, "match");
    const withIt = withInlineOrderForgeReveal(st, { matchId: "m", segmentNumber: 1, reveal }, "m")!;
    expect(withIt.ownChallengeReveals).toHaveLength(1);
    expect(matchGridModule.ownsResultReveal!(withIt)).toBe(true);
    expect(matchGridModule.ownsResultReveal!(st)).toBe(false);
  });
});

// ---------------------------------------------------------------- 5–13: the wrapper
describe("match module — open board, assignment, Lock", () => {
  it("renders exactly the frozen entities and groups, with no correctness on screen", () => {
    const { container } = render(view(parse(rawState()).segmentState, actions()));
    for (const e of PUBLIC.challenges[0].entities) expect(sigil(e.label)).toBeInTheDocument();
    for (const g of PUBLIC.challenges[0].groups) expect(seal(g.label)).toBeInTheDocument();
    expect(container.querySelector("[data-mark]")).toBeNull();
    expect(container.textContent).not.toMatch(/Keystone|Minor rune|correct/i);
    expect(lockButton()).toBeDisabled();
  });

  it("keyboard + tap-then-tap + reassignment, then Lock emits one complete opaque-id choice", () => {
    const submit = vi.fn(() => Promise.resolve(true));
    render(view(parse(rawState()).segmentState, actions({ submitChallenge: submit })));
    // keyboard: everything as the capture's player did, but e0 first under g2.
    seatByKeyboard("e0", "g2");
    // tap-then-tap reassignment: e0 → g1.
    tap(sigil(LABEL.e0));
    expect(sigil(LABEL.e0)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(seal(GROUP.g1));
    expect(sigil(LABEL.e0)).toHaveAccessibleName(new RegExp(`In ${GROUP.g1}`));
    for (const a of wire.submitted_choice.assignments.slice(1)) seatByKeyboard(a.entity_id, a.group_id);
    expect(lockButton()).toBeEnabled();
    fireEvent.click(lockButton());
    expect(submit).toHaveBeenCalledTimes(1);
    const [index, choice] = submit.mock.calls[0] as unknown as [number, SegmentChoice];
    expect(index).toBe(0);
    expect(choice).toEqual(wire.submitted_choice);
    // Only ids; no labels, keys or correctness.
    const text = JSON.stringify(choice);
    for (const word of ["Conqueror", "Precision", "rune_key", "tree_key", "correct"]) expect(text).not.toContain(word);
  });

  it("a direct drag seats a rune under the nearest seal in one action", () => {
    render(view(parse(rawState()).segmentState, actions()));
    drag(sigil(LABEL.e3), [320 * 1.5, 80]);
    expect(sigil(LABEL.e3)).toHaveAccessibleName(new RegExp(`In ${GROUP.g1}`));
  });

  it("assignment order does not matter to the payload's content (one row per entity)", () => {
    const resp = { assignments: [{ entity: "e1", group: "g2" }, { entity: "e0", group: "g0" }] };
    expect(toMatchChoice(resp)).toEqual({
      assignments: [{ entity_id: "e1", group_id: "g2" }, { entity_id: "e0", group_id: "g0" }] });
  });

  it("a refused lock reopens the board", async () => {
    const submit = vi.fn(() => Promise.resolve(false));
    render(view(parse(rawState()).segmentState, actions({ submitChallenge: submit })));
    for (const a of wire.submitted_choice.assignments) seatByKeyboard(a.entity_id, a.group_id);
    fireEvent.click(lockButton());
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId("match-grid-phase").getAttribute("data-phase")).toBe("open");
  });

  it("after a refresh past Lock, the server's echo is the locked board", () => {
    render(view(parse(rawState({}, wire.submitted_choice.assignments)).segmentState, actions()));
    expect(screen.getByTestId("match-grid-phase").getAttribute("data-phase")).toBe("locked");
    expect(sigil(LABEL.e0)).toHaveAccessibleName(new RegExp(`In ${GROUP.g1}`));
  });
});

// ---------------------------------------------------------------- 14–17: reveal
describe("match module — authoritative reveal", () => {
  it("maps the server reveal 1:1 (no comparison, no derivation)", () => {
    const served = readOwnChallengeReveal(clone(LOCK_REVEAL), 1, "match").match!;
    const r = toMatchReveal(served);
    expect(r.entityCorrect).toEqual(served.entityCorrect);
    expect(r.canonical.e0).toEqual(["g0"]);
    expect(r.assignments.e0).toBe("g1");
    expect(r.isCorrect).toBe(false);
    expect(r.facts?.e0).toEqual([{ label: "Slot", value: "Keystone" }]);
    expect(r.facts?.e1).toEqual([{ label: "Slot", value: "Minor rune" }]);
  });

  it("a partially wrong board resolves to the canonical arrangement (reduced motion)", () => {
    document.documentElement.classList.add("reduce-motion");
    const st = parse(rawState({ own_challenge_reveals: [clone(LOCK_REVEAL)] },
      wire.submitted_choice.assignments)).segmentState!;
    const { container } = render(view(st, actions()));
    expect(screen.getByTestId("match-grid-phase").getAttribute("data-phase")).toBe("revealed");
    expect(container.querySelector(`button[data-mark="corrected"]`)).not.toBeNull();
    expect(container.querySelectorAll('button[data-mark="stable"]').length).toBe(6);
    // Settled board: e0 now sits under its canonical seal (g0 = Precision).
    expect(sigil(LABEL.e0)).toHaveAccessibleName(new RegExp(`In ${GROUP.g0}`));
    expect(container.textContent).toMatch(/Keystone/);
  });

  it("an all-correct board settles in place", () => {
    document.documentElement.classList.add("reduce-motion");
    const right = clone(LOCK_REVEAL);
    right.assignments = clone(right.canonical_assignments);
    right.entity_correct = right.entity_correct.map((e) => ({ ...e, correct: true }));
    right.is_correct = true;
    right.matched = 7;
    const st = parse(rawState({ own_challenge_reveals: [right] }, right.assignments)).segmentState!;
    const { container } = render(view(st, actions()));
    expect(container.querySelectorAll('button[data-mark="stable"]').length).toBe(7);
    expect(container.querySelector('button[data-mark="corrected"], button[data-mark="fractured"]')).toBeNull();
    for (const a of right.canonical_assignments) {
      expect(sigil(LABEL[a.entity_id])).toHaveAccessibleName(new RegExp(`In ${GROUP[a.group_id]}`));
    }
  });
});

// ---------------------------------------------------------------- 12–13: no inference, no grading
describe("match module — authority boundary (source contract)", () => {
  const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
  const production = [
    "./matchGridModule.tsx",
    "../../../components/match-grid/MatchGrid.tsx",
    "../../match-grid/board.ts",
    "../../match-grid/contract.ts",
    "../../match-grid/layout.ts",
    "../../match-grid/reveal.ts",
  ];

  it.each(production)("%s reads no rune data, Data Dragon or lab adapter", (p) => {
    const s = src(p);
    expect(s).not.toMatch(/runeData|labRuneRounds|runeAuthority|gradeRuneRound|RUNE_PERKS|ddragon|Data Dragon/i);
  });

  it("the module wrapper never compares an assignment to a canonical group", () => {
    const s = src("./matchGridModule.tsx");
    // No equality between a player's group and a canonical one, anywhere.
    expect(s).not.toMatch(/groupId\s*===|===\s*\w+\.groupId|canonical\w*\[[^\]]+\]\s*===/);
    // Identity is the server's token; labels are never used as a key.
    expect(s).not.toMatch(/token:\s*\w+\.label/);
  });
});
