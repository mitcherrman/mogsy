/**
 * K2 — Journey knowledge marks (`journey_knowledge_object.v1`).
 *
 * Real K1 captures (`lib/journey/__fixtures__/k1`, backend `597a2432`) through
 * the production parser, the pure join and the production `masterySliceModule`
 * viewport. jsdom has no layout; geometry (no resize, no overflow, popover in
 * the viewport) is certified in a real browser — see
 * `JOURNEY_KNOWLEDGE_UI_V1_HANDOFF.md`.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound, type SegmentStateView } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { readJourneyJ3 } from "@/lib/journey/j3";
import {
  journeyKnowledge, knowledgeCard, stepMarker, type JourneyKnowledge,
} from "@/lib/journey/knowledge";
import { masterySliceModule } from "./masterySliceModule";

const K1 = resolve(process.cwd(), "src/lib/journey/__fixtures__/k1");
const J4 = resolve(process.cwd(), "src/lib/journey/__fixtures__/j4");
const cache = new Map<string, CaptureSnapshot[]>();
const loadFrom = (dir: string, n: string): CaptureSnapshot[] => {
  const key = join(dir, `${n}.json`);
  if (!cache.has(key)) cache.set(key, JSON.parse(readFileSync(key, "utf8")));
  return cache.get(key)!;
};
const answersOf = (n: string): { index: number; correct_answer: string }[] =>
  JSON.parse(readFileSync(join(K1, "answers", `${n}.answers.json`), "utf8"));
const snapFrom = (dir: string, n: string, label: string): CaptureSnapshot => {
  const s = loadFrom(dir, n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return JSON.parse(JSON.stringify(s));
};
const snap = (n: string, label: string) => snapFrom(K1, n, label);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wire = (s: CaptureSnapshot): any => (s.envelope.payload as any).segment_state;
const stateOf = (s: CaptureSnapshot): SegmentStateView => readPublicRound(s.envelope).segmentState!;
const marksOf = (s: CaptureSnapshot): JourneyKnowledge => {
  const st = stateOf(s);
  return journeyKnowledge(st.journey, st.ownChallengeReveals, st.ownCardIndex);
};
/** `{objectKey: [[fact, display, step]]}` — a compact view for equality. */
const summary = (k: JourneyKnowledge) => Object.fromEntries([...k.values()].map((m) =>
  [m.key, m.facts.map((f) => [f.fact, f.display, f.child + 1])]));

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  const round = readPublicRound(s.envelope);
  return render(
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: () => {}, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>,
  );
}
/** React's onPointerEnter/Leave ride `pointerover`/`pointerout`; jsdom has no PointerEvent. */
const pointer = (el: Element, type: "pointerover" | "pointerout", pointerType: "mouse" | "touch") => act(() => {
  const e = new MouseEvent(type, { bubbles: true, relatedTarget: type === "pointerover" ? document.body : null });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  el.dispatchEvent(e);
});
const badges = () => screen.queryAllByTestId(/^journey-know-(subject|opponent)-[A-Za-z]+$/);
const popText = (testId: string) => screen.getByTestId(`${testId}-pop`).textContent ?? "";

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("the K1 contract is read (additively, fail-closed)", () => {
  it("every K1 capture parses through the production reader and names the v1 contract", () => {
    for (const n of ["voli.standard", "pantheon.standard", "ahri.survival", "voli.standard.timeout", "voli.survival"]) {
      for (const s of loadFrom(K1, n)) {
        const st = readPublicRound(s.envelope).segmentState;
        if (!st?.journey) continue;
        expect(st.journey.knowledgeContract).toBe("journey_knowledge_object.v1");
      }
    }
  });

  it("asks_fact is value-free: a value (or any extra key) on it fails the read", () => {
    const raw = wire(snap("voli.standard", "child0-live")).challenges.journey;
    expect(() => readJourneyJ3(raw)).not.toThrow();
    const leaked = JSON.parse(JSON.stringify(raw));
    leaked.children[0].learner.asks_fact.value = 12;
    expect(() => readJourneyJ3(leaked)).toThrow(/does not publish: "value"/);
  });

  it("an object key that does not name its own side/champion/slot fails the read", () => {
    const raw = wire(snap("voli.standard", "child0-live")).challenges.journey;
    raw.children[0].learner.asks_fact.object.key = "opponent:volibear:Q";
    expect(() => readJourneyJ3(raw)).toThrow(/object.key/);
  });

  it("a pre-K1 block (J4 capture) reads with no contract and draws no mark", () => {
    const s = snapFrom(J4, "voli.standard", "child2-live");
    const st = stateOf(s);
    expect(st.journey!.knowledgeContract).toBeNull();
    expect(journeyKnowledge(st.journey, st.ownChallengeReveals, st.ownCardIndex).size).toBe(0);
    show(s);
    expect(screen.getByTestId("journey-board")).toBeInTheDocument();
    expect(badges()).toHaveLength(0);
  });
});

describe("a mark exists only once its fact is established", () => {
  it("no mark while the asking child is open (nothing is established yet)", () => {
    for (const label of ["child0-open", "child0-live"]) expect(marksOf(snap("voli.standard", label)).size).toBe(0);
    show(snap("voli.standard", "child0-live"));
    expect(badges()).toHaveLength(0);
  });

  it("correct + reveal → marked with the reveal's value", () => {
    const s = snap("voli.survival", "child0-reveal");
    expect(wire(s).own_challenge_reveals[0].is_correct).toBe(true);
    expect(summary(marksOf(s))).toEqual({ "player:volibear:Q": [["ability_cooldown:volibear:Q:r1", "12", 1]] });
  });

  it("wrong + reveal → marked exactly the same way (a mark is knowledge, not correctness)", () => {
    const s = snap("voli.standard", "child0-reveal");
    expect(wire(s).own_challenge_reveals[0].is_correct).toBe(false);
    expect(summary(marksOf(s))).toEqual({ "player:volibear:Q": [["ability_cooldown:volibear:Q:r1", "12", 1]] });
    show(s);
    const badge = screen.getByTestId("journey-know-subject-Q");
    expect(badge.textContent).toBe("!");
    expect(badge.className).not.toMatch(/correct|wrong|success|error/);
  });

  it("a flipped is_correct changes nothing", () => {
    const s = snap("voli.standard", "child2-reveal");
    const before = summary(marksOf(s));
    for (const r of wire(s).own_challenge_reveals) r.is_correct = !r.is_correct;
    expect(summary(marksOf(s))).toEqual(before);
  });

  it("timeout + reveal → marked (player_answer null), and not before", () => {
    expect(marksOf(snap("voli.standard.timeout", "child0-live")).size).toBe(0);
    const s = snap("voli.standard.timeout", "child0-timeout-reveal");
    const [r] = wire(s).own_challenge_reveals;
    expect(r.player_answer).toBeNull();
    expect(summary(marksOf(s))).toEqual({ "player:volibear:Q": [["ability_cooldown:volibear:Q:r1", "12", 1]] });
  });
});

describe("the displayed value is the reveal's, verbatim", () => {
  it("the haste cooldown shows the reveal's \"11\", never the ledger's 10.909…", () => {
    // Child 3's ledger lists the haste fact with its canonical value.
    const s = snap("voli.standard", "child3-live");
    const est = wire(s).challenges.journey.children[3].learner.established
      .find((f: { fact: string }) => f.fact === "ability_cooldown:volibear:Q:r1:ah10");
    expect(est.value).toBeCloseTo(10.909, 3);
    const q = marksOf(s).get("player:volibear:Q")!;
    expect(q.facts.map((f) => f.display)).toEqual(["12", "11"]);
    show(s);
    fireEvent.click(screen.getByTestId("journey-know-subject-Q"));
    expect(popText("journey-know-subject-Q")).not.toContain("10.9");
  });

  it("correct_answer_display wins over correct_answer, and neither is re-rounded", () => {
    const s = snap("voli.standard", "child2-reveal");
    const reveals = wire(s).own_challenge_reveals;
    reveals[2].correct_answer_display = "10.91";
    reveals[0].correct_answer = "12.000";
    const q = marksOf(s).get("player:volibear:Q")!;
    expect(q.facts.map((f) => f.display)).toEqual(["12.000", "10.91"]);
  });

  it("a revealed fact whose reveal is absent is not marked (nothing inferred from the ledger)", () => {
    const s = snap("voli.standard", "child2-live");
    wire(s).own_challenge_reveals = [];
    expect(marksOf(s).size).toBe(0);
  });
});

describe("grouping, objects and sides", () => {
  it("two facts on one ability group under ONE mark: E-style card with both steps", () => {
    const s = snap("voli.standard", "child2-reveal");
    const q = marksOf(s).get("player:volibear:Q")!;
    const card = knowledgeCard(q);
    expect(card.title).toBe("Q · R1");
    expect(card.lines.map((l) => [l.icon, l.value, l.tail, stepMarker(l.step)])).toEqual([
      ["cooldown", "12s", null, "①"],
      ["haste", "11s", "10 AH", "③"],
    ]);
    show(s);
    expect(screen.getAllByTestId("journey-know-subject-Q")).toHaveLength(1);
    expect(screen.getByTestId("journey-know-subject-Q")).toHaveAttribute("data-facts", "2");
  });

  it("object: null facts (Combat damage) and the stated formula draw no mark", () => {
    const s = snap("voli.standard", "child4-live");
    const facts = [...marksOf(s).values()].flatMap((m) => m.facts.map((f) => f.kind));
    expect(facts).not.toContain("ability_damage");
    expect(facts).not.toContain("ability_damage_formula");
    expect(facts).not.toContain("ability_cooldown_compare");
    // A v1 kind whose object is null is still no mark.
    const t = snap("voli.survival", "child0-reveal");
    wire(t).challenges.journey.children[0].learner.asks_fact.object = null;
    expect(marksOf(t).size).toBe(0);
  });

  it("an opponent champion fact marks the OPPONENT portrait by its K1 key", () => {
    const s = snap("pantheon.standard", "child0-reveal");
    expect(summary(marksOf(s))).toEqual({ "opponent:leona": [["champion_stat:leona:armor:L3", "50", 1]] });
    show(s);
    expect(screen.getByTestId("journey-know-opponent-champion")).toBeInTheDocument();
    expect(screen.queryByTestId("journey-know-subject-champion")).toBeNull();
    const card = knowledgeCard(marksOf(s).get("opponent:leona")!);
    expect(card.title).toBe("Lv3");
    expect(card.lines.map((l) => l.value)).toEqual(["Armor 50"]);
  });

  it("a mark whose champion is not on that side draws nothing (keys are side + champion)", () => {
    const s = snap("pantheon.standard", "child0-reveal");
    const asks = wire(s).challenges.journey.children[0].learner.asks_fact;
    asks.object = { ...asks.object, side: "player", key: "player:leona" };
    show(s);
    expect(badges()).toHaveLength(0);
  });

  it("no item ever carries a mark", () => {
    show(snap("voli.standard", "finished"));
    for (const side of ["subject", "opponent"]) {
      expect(within(screen.getByTestId(`journey-items-${side}`)).queryAllByRole("button")).toHaveLength(0);
    }
  });
});

describe("the final child and reconnects", () => {
  it("the final child's fact (Ahri R @ 10 AH, answered wrong) is marked in the final reveal, from asks_fact + its reveal", () => {
    // While the final child is live, R carries only the earlier rank-1 fact.
    expect(summary(marksOf(snap("ahri.survival", "child2-live")))).toEqual({
      "player:ahri:Q": [["ability_cooldown:ahri:Q:flat", "7", 1]],
      "player:ahri:R": [["ability_cooldown:ahri:R:r1", "140", 2]],
    });
    const s = snap("ahri.survival", "child2-reveal");
    const st = wire(s);
    expect(st.own_finished).toBe(true);
    expect(st.own_card_index).toBeNull();
    expect(st.own_challenge_reveals[2].is_correct).toBe(false);
    // The final fact is in NO child's `established` (there is no later child).
    const established = st.challenges.journey.children.flatMap((c: { learner: { established: { fact: string }[] } }) =>
      c.learner.established.map((f) => f.fact));
    expect(established).not.toContain("ability_cooldown:ahri:R:r1:ah10");
    expect(summary(marksOf(s))["player:ahri:R"]).toEqual([
      ["ability_cooldown:ahri:R:r1", "140", 2],
      ["ability_cooldown:ahri:R:r1:ah10", "127", 3],
    ]);
    show(s);
    fireEvent.click(screen.getByTestId("journey-know-subject-R"));
    expect(popText("journey-know-subject-R")).toMatch(/R · R1.*140s.*②.*127s.*10 AH.*③/);
  });

  it("a flat cooldown (rank null) titles the card by slot alone", () => {
    const card = knowledgeCard(marksOf(snap("ahri.survival", "child2-reveal")).get("player:ahri:Q")!);
    expect(card.title).toBe("Q");
    expect(card.lines.map((l) => [l.value, l.lead])).toEqual([["7s", null]]);
  });

  it("the finished state keeps every mark", () => {
    expect(summary(marksOf(snap("ahri.survival", "finished"))))
      .toEqual(summary(marksOf(snap("ahri.survival", "child2-reveal"))));
  });

  it.each([
    ["ahri.survival", "child2-reveal", "final-reconnect"],
    ["voli.standard.timeout", "child0-timeout-reveal", "child0-timeout-reconnect"],
    ["voli.standard", "child2-reveal", "child2-reveal-late"],
  ])("%s: a reconnect (%s → %s) shows the same marks", (n, a, b) => {
    expect(summary(marksOf(snap(n, b)))).toEqual(summary(marksOf(snap(n, a))));
    expect(marksOf(snap(n, b)).size).toBeGreaterThan(0);
    show(snap(n, b));
    expect(badges().length).toBe(marksOf(snap(n, b)).size);
  });
});

describe("the current question's target is never marked", () => {
  it("across every snapshot: the OPEN child's asked fact is never a mark, and every mark has its reveal", () => {
    for (const n of ["voli.standard", "pantheon.standard", "ahri.survival", "voli.standard.timeout", "voli.survival"]) {
      for (const s of loadFrom(K1, n)) {
        const st = readPublicRound(s.envelope).segmentState;
        if (!st?.journey) continue;
        const k = journeyKnowledge(st.journey, st.ownChallengeReveals, st.ownCardIndex);
        const settled = new Set(st.ownChallengeReveals.map((r) => r.challengeIndex));
        const open = st.journey.children.find((c) => c.index === st.ownCardIndex);
        for (const m of k.values()) {
          for (const f of m.facts) {
            expect(settled.has(f.child)).toBe(true);
            expect(f.fact).not.toBe(open?.learner.asksFact?.fact);
          }
        }
      }
    }
  });

  it("the live child's answer appears in no popover (every mark opened)", () => {
    const n = "voli.survival";
    const s = snap(n, "child1-live");       // asks Q r1 @ 10 AH; Q r1 is known
    const answer = answersOf(n)[1].correct_answer;
    show(s);
    const badge = screen.getByTestId("journey-know-subject-Q");
    fireEvent.click(badge);
    const text = popText("journey-know-subject-Q");
    expect(text).toContain("12s");
    expect(text).not.toContain(`${answer}s`);
    expect(text).not.toMatch(/AH/);
  });
});

describe("interaction", () => {
  const open = () => screen.queryByTestId("journey-know-subject-Q-pop");

  it("mouse hover opens and leaving closes", () => {
    show(snap("voli.standard", "child2-reveal"));
    const b = screen.getByTestId("journey-know-subject-Q");
    expect(b).toHaveAccessibleName("Known facts: Volibear Q");
    pointer(b, "pointerover", "mouse");
    expect(open()).not.toBeNull();
    expect(popText("journey-know-subject-Q")).toMatch(/Q · R1.*12s.*①.*11s.*10 AH.*③/);
    pointer(b, "pointerout", "mouse");
    expect(open()).toBeNull();
  });

  it("click pins (leave does not close); a second click closes", () => {
    show(snap("voli.standard", "child2-reveal"));
    const b = screen.getByTestId("journey-know-subject-Q");
    pointer(b, "pointerover", "mouse");
    fireEvent.click(b);
    pointer(b, "pointerout", "mouse");
    expect(open()).not.toBeNull();
    fireEvent.click(b);
    expect(open()).toBeNull();
  });

  it("tap opens, second tap closes; Escape closes", () => {
    show(snap("voli.standard", "child2-reveal"));
    const b = screen.getByTestId("journey-know-subject-Q");
    pointer(b, "pointerover", "touch");
    expect(open()).toBeNull();                   // no hover on touch
    fireEvent.click(b);
    expect(open()).not.toBeNull();
    fireEvent.click(b);
    expect(open()).toBeNull();
    fireEvent.click(b);
    act(() => { fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" }); });
    expect(open()).toBeNull();
  });
});

describe("JP1 layout is intact", () => {
  it("every portrait and ability sits in a same-size host whether marked or not; testids unchanged", () => {
    show(snap("voli.standard", "child2-reveal"));
    for (const side of ["subject", "opponent"]) {
      const portrait = screen.getByTestId(`journey-portrait-${side}`);
      expect(portrait.parentElement).toHaveClass("journey-know-host", "journey-know-host--portrait");
      for (const slot of ["Q", "W", "E", "R"]) {
        const ability = screen.getByTestId(`journey-ability-${side}-${slot}`);
        expect(ability.parentElement).toHaveClass("journey-know-host", "journey-know-host--ability");
        expect(ability).toHaveAttribute("role", "img");
        // The badge is a SIBLING of the icon's img, never inside it.
        expect(within(ability).queryAllByRole("button")).toHaveLength(0);
      }
    }
    // Splash underlays, motif host and role header are still rendered.
    expect(screen.getByTestId("journey-seam")).toBeInTheDocument();
  });

  it("the stylesheet places the portrait host in the compact grid, and the badge lays out nothing", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    expect(css).toMatch(/\.journey-side__id > \.journey-know-host--portrait \{ grid-area: portrait; \}/);
    expect(css).toMatch(/\.journey-know \{[^}]*position: absolute;/);
    expect(css).toMatch(/\.journey-question\s+\.question-motif-host\s*\{[^}]*overflow:\s*clip/);
  });
});
