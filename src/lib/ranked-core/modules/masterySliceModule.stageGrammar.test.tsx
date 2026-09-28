/**
 * JP2 — THE JOURNEY STAGE GRAMMAR, on the REAL Zed/Ahri reference Journey
 * (`lib/journey/__fixtures__/jref`: the admin preset
 * `admin.zed_ahri_reference_journey` on backend fe942a58, through the real
 * HTTP route), through the production parser and `masterySliceModule`.
 *
 *   1. formula (Zed E)  2. raw damage (before armor)  3. Ahri armor
 *   4. Zed E after Ahri's armor
 *
 * jsdom has no layout, so the pixel invariant (board / prompt / answers at one
 * coordinate from Step 1 to the finish, desktop and phone) is certified in a
 * real browser — see `JP2_HANDOFF.md`. What is held here is the STRUCTURE that
 * invariant rests on: one stage path for every child, nothing appended to the
 * flow, and the stylesheet's reserves.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { journeyKnowledge } from "@/lib/journey/knowledge";
import { stackInventory, STACKABLE_ITEM_MAX } from "@/lib/journey/inventory";
import { explicitAdText, ratioStatLabel } from "@/lib/journey/statWording";
import { masterySliceModule } from "./masterySliceModule";

const DIR = resolve(process.cwd(), "src/lib/journey/__fixtures__/jref");
type Wire = Record<string, unknown>;
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(DIR, `${n}.json`), "utf8"));
const answersOf = (n: string): { index: number; correct_answer: string; answer_options: string[] }[] =>
  JSON.parse(readFileSync(join(DIR, "answers", `${n}.answers.json`), "utf8"));
const REF = "zed_ahri.reference";
const WRONG = "zed_ahri.reference.wrong";
const TIMEOUT = "zed_ahri.reference.timeout";
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const seg = (s: CaptureSnapshot) => (s.envelope.payload as { segment_state: Wire | null }).segment_state;
const live = (n: string) => load(n).filter((s) => seg(s) !== null);

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function view(s: CaptureSnapshot, submitChallenge: (i: number, c: unknown) => unknown = () => {}) {
  const round = readPublicRound(s.envelope);
  return (
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: submitChallenge as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>
  );
}
function show(s: CaptureSnapshot, submitChallenge?: (i: number, c: unknown) => unknown) {
  vi.setSystemTime(Date.parse(s.at));
  return render(view(s, submitChallenge));
}
/** Every snapshot in order, the way a client polls (the reveal hold runs as live). */
function play(n: string, visit: (s: CaptureSnapshot) => void) {
  // In capture order by server instant (a reconnect read can precede a late read).
  const all = live(n).map((s, i) => [s, i] as const)
    .sort(([a, i], [b, j]) => Date.parse(a.at) - Date.parse(b.at) || i - j).map(([s]) => s);
  vi.setSystemTime(Date.parse(all[0].at));
  const r = render(view(all[0]));
  visit(all[0]);
  for (let i = 1; i < all.length; i++) {
    act(() => { vi.advanceTimersByTime(Date.parse(all[i].at) - Date.parse(all[i - 1].at)); });
    vi.setSystemTime(Date.parse(all[i].at));
    r.rerender(view(all[i]));
    visit(all[i]);
  }
  return r;
}
const child = () => screen.getByTestId("journey-child");
const heading = () => within(child()).getByRole("heading", { level: 2 });
const tablets = () => [...child().querySelectorAll<HTMLButtonElement>("[data-quiz-choice]")];
const labels = () => tablets().map((b) => b.querySelector("[data-choice-letter]")!.nextElementSibling!.textContent);
const marks = () => [...document.querySelectorAll<HTMLButtonElement>("button.journey-know")]
  .map((b) => `${b.dataset.testid!.replace("journey-know-", "")}:${b.dataset.facts}`).sort();
const popText = (testId: string) => {
  fireEvent.click(screen.getByTestId(testId));
  const t = screen.getByTestId(`${testId}-pop`).textContent ?? "";
  fireEvent.click(screen.getByTestId(testId));
  return t;
};
const CSS = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("one stage grammar for every child", () => {
  it.each([
    ["child0-live", 0, "prose"],
    ["child1-live", 1, "combat"],
    ["child2-live", 2, "recall"],
    ["child3-live", 3, "combat"],
  ])("%s: drawn by the stage question — prompt and answer regions, no lock-in, no Mastery radio list", (label, index, path) => {
    show(snap(REF, label));
    const c = child();
    expect(c).toHaveAttribute("data-render-path", path);
    expect(screen.getByTestId("mastery-slice-challenge-phase")).toHaveAttribute("data-challenge-index", String(index));
    expect(c.querySelector("[data-surface-region='prompt']")).not.toBeNull();
    expect(c.querySelector("[data-surface-region='answers']")).not.toBeNull();
    expect(tablets()).toHaveLength(4);
    expect(c.textContent).not.toMatch(/Lock in|Locking in|Submit answer/);
    expect(screen.queryByTestId("mastery-slice-submit")).toBeNull();
    expect(screen.queryByTestId("mastery-submit-button")).toBeNull();
    expect(c.querySelector("[role='radio']")).toBeNull();
    // The premise panel and the focus plate are gone: the board is the state.
    expect(screen.queryByTestId("journey-combat-premise")).toBeNull();
    expect(screen.queryByTestId("journey-focus-slot")).toBeNull();
  });

  it.each([0, 1, 2, 3])("child %i: ONE tap submits the SERVED option string for that tablet", (index) => {
    const submit = vi.fn(() => Promise.resolve(true));
    show(snap(REF, `child${index}-live`), submit);
    const served = answersOf(REF)[index].answer_options;
    fireEvent.click(tablets()[1]);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(index, { selected: served[1] });
    // Pending: no second submission from a second tap.
    fireEvent.click(tablets()[2]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("a child that has not opened yet sends nothing (the module's gate, unchanged)", () => {
    const submit = vi.fn(() => Promise.resolve(true));
    const s = structuredClone(snap(REF, "child1-live"));
    const state = seg(s)!;
    state.own_card_started_at = new Date(Date.parse(s.at) + 5_000).toISOString();
    show(s, submit);
    fireEvent.click(tablets()[0]);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("Step 1 — formula terminology", () => {
  it("the bare-AD distractor reads 'total AD'; all four options stay distinct; the correct one is untouched", () => {
    show(snap(REF, "child0-live"));
    const served = answersOf(REF)[0].answer_options;
    expect(served).toContain("70 / 92.5 / 115 / 137.5 / 160 (+70% AD)");
    expect(labels()).toEqual([
      "70 / 92.5 / 115 / 137.5 / 160 (+70% bonus AD)",
      "70 / 92.5 / 115 / 137.5 / 160 (+70% total AD)",
      "92.5 / 115 / 137.5 / 160 / 182.5 (+70% bonus AD)",
      "70 / 92.5 / 115 / 137.5 / 160 (+50% bonus AD)",
    ]);
    expect(new Set(labels()).size).toBe(4);
  });

  it("choosing the 'total AD' tablet submits the SERVED distractor string, unchanged", () => {
    const submit = vi.fn(() => Promise.resolve(true));
    show(snap(REF, "child0-live"), submit);
    fireEvent.click(tablets()[1]);
    expect(submit).toHaveBeenCalledWith(0, { selected: "70 / 92.5 / 115 / 137.5 / 160 (+70% AD)" });
  });

  it("the wording rule is generic: only a BARE AD term is rewritten", () => {
    expect(explicitAdText("55 / 80 (+100% AD, +80% AP)")).toBe("55 / 80 (+100% total AD, +80% AP)");
    expect(explicitAdText("70 (+70% bonus AD)")).toBe("70 (+70% bonus AD)");
    expect(explicitAdText("12.5 (+12.5% AD)")).toBe("12.5 (+12.5% total AD)");
    expect(explicitAdText("ADC 40 (+40% ADX)")).toBe("ADC 40 (+40% ADX)");
    expect(ratioStatLabel("attack_damage", "attack damage")).toBe("total AD");
    expect(ratioStatLabel("bonus_attack_damage", "bonus attack damage")).toBe("bonus AD");
    expect(ratioStatLabel("magic_resist", "magic resist")).toBe("magic resist");
  });
});

describe("Step 2 — the question asks; the board states", () => {
  it("asks the semantic question — no serialized state in the prompt", () => {
    show(snap(REF, "child1-live"));
    expect(heading()).toHaveTextContent("How much physical damage does Zed's Rank 1 Shadow Slash deal before armor?");
    expect(child().textContent).not.toMatch(/attacker level|attacker items|@ 2|Doran's Blade|inactive item effects|after armor/);
    // No helper copy: no "Builds on", no internal scenario state.
    expect(child().textContent).not.toMatch(/builds on|item effects/i);
    expect(screen.queryByTestId("scenario-context")).toBeNull();
    // The state it is read at is the BOARD's — JP3: a derived stat reads whole
    // (20.8 → 21), its exact value one hover away, "rounded for display".
    const bonus = screen.getByTestId("journey-stat-subject-bonus_attack_damage");
    expect(bonus).toHaveTextContent(/^Bonus AD21$/);
    expect(bonus.getAttribute("title")).toMatch(/Exact value 20\.8 · shown as 21, rounded for display/);
    expect(bonus.getAttribute("title")).not.toMatch(/rounded up/);
    // JP3 — the value this step asks is the board's `?` readout on Zed E.
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveAttribute("data-face", "withheld");
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveTextContent(/\?$/);
    expect(screen.getByTestId("journey-level-subject")).toHaveTextContent("2");
    expect(screen.getByTestId("journey-ability-subject-E")).toHaveAttribute("data-rank", "1");
  });

  it("the reveal lays out the formula applied as CALCULATION CELLS, from SERVED parts only", () => {
    show(snap(REF, "child1-reveal"));
    const w = screen.getByTestId("journey-raw-working");
    // JP3 — cells, not sentences: [Base · R1 70] + [bonus AD 70% × 21] = [Raw damage 85].
    const cell = (k: string) => within(w).getByTestId(`journey-raw-working-${k}`);
    expect(cell("base")).toHaveTextContent(/^Base · R170$/);
    expect(cell("ratio-0")).toHaveTextContent(/^bonus AD70% × 21$/);
    expect(cell("final")).toHaveTextContent(/^Raw damage85$/);
    expect(cell("final").className).toMatch(/journey-calc__cell--final/);
    expect([...w.querySelectorAll(".journey-calc__op")].map((o) => o.textContent)).toEqual(["+", "="]);
    // No arithmetic: every number drawn is the taught formula's, the premise's
    // (whole, for display) or the answer.
    expect([...w.querySelectorAll(".journey-calc__label")].map((l) => l.textContent))
      .toEqual(["Base · R1", "bonus AD", "Raw damage"]);
    expect([...w.querySelectorAll(".journey-calc__value")].map((v) => v.textContent))
      .toEqual(["70", "70% × 21", "85"]);
    expect(cell("ratio-0").getAttribute("title")).toMatch(/Exact value 20\.8/);
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Correct · 85");
    // The backend's serialized explanation is not appended under it.
    expect(screen.queryByTestId("journey-reveal-explanation")).toBeNull();
  });
});

describe("Step 3 — Ahri's armor in the same grammar", () => {
  it("asks in words, answers on the grid; after the reveal the armor lives on Ahri", () => {
    show(snap(REF, "child2-live"));
    expect(heading()).toHaveTextContent("At level 2, what is Ahri's Armor?");
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "withheld");
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveTextContent(/^Armor\?$/);
    // Zed E's raw damage, learned at Step 2, stays on the board (the notebook).
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveTextContent(/85/);
    expect(marks()).toEqual(["subject-E:2", "subject-readout-E:1"]);
    cleanup();
    show(snap(REF, "child2-reveal"));
    // JP3 — ONE grammar: the learned value FILLS the `?` (Armor ? → Armor 24 !),
    // and its `!` rides on the chip; no separate portrait mark for it.
    const armor = screen.getByTestId("journey-stat-opponent-armor");
    expect(armor).toHaveAttribute("data-face", "learned");
    expect(within(armor).getByTestId("journey-stat-opponent-armor-learned")).toHaveTextContent("24");
    expect(marks()).toEqual(["opponent-stat-armor:1", "subject-E:2", "subject-readout-E:1"]);
    expect(screen.queryByTestId("journey-know-opponent-champion")).toBeNull();
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Ahri · Lv2.*Armor 24.*learned Step 3/);
    // The reveal: "Level 2 → Ahri armor 24", the served prose's 24.024 only on hover.
    const w = screen.getByTestId("journey-stat-working");
    expect(within(w).getByTestId("journey-stat-working-level")).toHaveTextContent(/^AhriLevel 2$/);
    expect(within(w).getByTestId("journey-stat-working-final")).toHaveTextContent(/^Ahri armor24$/);
    expect(w.textContent).not.toContain("24.024");
    expect(within(w).getByTestId("journey-stat-working-final").getAttribute("title")).toMatch(/Exact value 24\.024/);
  });
});

describe("Step 4 — the culmination reads off the board", () => {
  it("asks the application; no dependency manifest; the prerequisites are the board's", () => {
    show(snap(REF, "child3-live"));
    expect(heading()).toHaveTextContent("How much physical damage does Zed's Rank 1 Shadow Slash deal to Ahri?");
    expect(document.body.textContent).not.toMatch(/Raw damage · recalled|recall · revealed in step|not part of this question's premise/);
    // The chain is on the board, not in a helper line under the question.
    expect(child().textContent).not.toMatch(/builds on|item effects/i);
    // JP3 — the recalled armor is the learner's own knowledge, filled in on the
    // board (no special "recall · step 3" pill); the raw damage likewise.
    const armor = screen.getByTestId("journey-stat-opponent-armor");
    expect(armor).toHaveAttribute("data-face", "learned");
    expect(armor.textContent).not.toMatch(/recall/i);
    expect(armor).toHaveTextContent(/^Armor24!$/);
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveAttribute("data-face", "learned");
    expect(screen.getByTestId("journey-readout-subject-E-value")).toHaveTextContent("85");
    // One object accumulates its facts; the canonical taught decimal (92.5) stays.
    expect(popText("journey-know-subject-E")).toMatch(
      /E · Shadow Slash · R1.*Formula 70 \/ 92\.5 \/ 115 \/ 137\.5 \/ 160 \(\+70% bonus AD\).*learned Step 1.*Raw damage 85.*learned Step 2/);
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Armor 24.*learned Step 3/);
  });

  it("the reveal is the server's working as CALCULATION CELLS: raw 85 → armor 24 → ×0.8063 → 68", () => {
    show(snap(REF, "child3-reveal"));
    const w = screen.getByTestId("journey-combat-working");
    expect(screen.getByTestId("journey-reveal")).toContainElement(w);
    const cell = (k: string) => within(w).getByTestId(`journey-combat-working-${k}`);
    // The server's numbers, derived ones whole for display (84.56 → 85,
    // 24.024 → 24), the served coefficient as served, the served answer last.
    expect(cell("raw")).toHaveTextContent(/^Raw damage85$/);
    expect(cell("armor")).toHaveTextContent(/^Ahri armor24$/);
    expect(cell("multiplier")).toHaveTextContent(/^Armor multiplier×0\.8063$/);
    expect(cell("final")).toHaveTextContent(/^Final damage68$/);
    expect(cell("final").className).toMatch(/journey-calc__cell--final/);
    expect([...w.querySelectorAll(".journey-calc__op")].map((o) => o.textContent)).toEqual(["→", "→", "→"]);
    // The raw damage was established at Step 2 (on the board): no formula re-derived.
    expect(screen.queryByTestId("journey-combat-working-formula")).toBeNull();
    // No derived decimal in the reveal's text; the exact values are hover notes.
    expect(w.textContent).not.toMatch(/84\.56|24\.024|68\.18/);
    expect(cell("raw").getAttribute("title")).toMatch(/Exact value 84\.56 · shown as 85, rounded for display/);
    expect(cell("armor").getAttribute("title")).toMatch(/Exact value 24\.024/);
    expect(cell("final").getAttribute("title")).toMatch(/Exact value 68\.1804/);
  });
});

describe("K2 — the board is the memory surface", () => {
  const timeline = (n: string) => {
    const seen: string[] = [];
    play(n, (s) => seen.push(`${s.label} ${marks().join(",")}`));
    return seen;
  };

  it("each step's fact lands on its object AT its reveal — never before — and stays to the end", () => {
    const t = timeline(REF);
    const at = (label: string) => t.find((x) => x.startsWith(`${label} `))!.slice(label.length + 1);
    expect(at("child0-live")).toBe("");
    expect(at("child0-reveal")).toBe("subject-E:1");                            // the formula
    expect(at("child1-live")).toBe("subject-E:1");                              // raw not yet revealed
    // JP3: a learned value's `!` rides on the board value it fills.
    expect(at("child1-reveal")).toBe("subject-E:2,subject-readout-E:1");        // + raw damage (E raw 85 !)
    expect(at("child2-live")).toBe("subject-E:2,subject-readout-E:1");          // armor not yet revealed
    expect(at("child2-reveal")).toBe("opponent-stat-armor:1,subject-E:2,subject-readout-E:1"); // + Armor 24 !
    expect(at("finished")).toBe("opponent-stat-armor:1,subject-E:2,subject-readout-E:1");
  });

  it("a WRONG answer still establishes the fact by its reveal (steps 1 and 3 answered wrong)", () => {
    const t = timeline(WRONG);
    const at = (label: string) => t.find((x) => x.startsWith(`${label} `))!.slice(label.length + 1);
    expect(at("child0-reveal")).toBe("subject-E:1");
    expect(at("child2-reveal")).toBe("opponent-stat-armor:1,subject-E:2,subject-readout-E:1");
    cleanup();
    show(snap(WRONG, "child3-live"));
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "learned");
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Armor 24.*learned Step 3/);
  });

  it("a TIMEOUT reveal shows in place, says so, and keeps every earlier fact", () => {
    show(snap(TIMEOUT, "child3-timeout-reveal"));
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Time's up · 68");
    expect(marks()).toEqual(["opponent-stat-armor:1", "subject-E:2", "subject-readout-E:1"]);
  });

  it("no child's own fact is known while it is asked (leak sweep over every open/live snapshot)", () => {
    // The fact kind each child's reveal establishes — never present while it is open.
    const asked = ["ability_damage_formula", "ability_raw_damage", "champion_stat_at_level", "ability_damage"];
    for (const n of [REF, WRONG, TIMEOUT]) {
      for (const s of live(n).filter((x) => /-(open|live)$/.test(x.label))) {
        const i = Number(/child(\d)/.exec(s.label)![1]);
        const state = readPublicRound(s.envelope).segmentState!;
        const known = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
        const kinds = [...known.values()].flatMap((m) => m.facts.map((f) => f.kind));
        expect(kinds, `${n} ${s.label}`).not.toContain(asked[i]);
      }
    }
    // And the board never prints the open child's answer.
    const answers = answersOf(REF);
    for (const label of ["child1-live", "child2-live", "child3-live"]) {
      const { unmount } = show(snap(REF, label));
      const i = Number(label[5]);
      expect(screen.getByTestId("journey-board").textContent ?? "", label).not.toContain(answers[i].correct_answer);
      unmount();
    }
  });
});

describe("K2 — the asked-field anchor is narrow", () => {
  it("only a raw result anchors: Combat damage after armor and a Matchup's asked cooldown never mark", () => {
    const daily = resolve(process.cwd(), "src/lib/journey/__fixtures__/m1");
    const captures: CaptureSnapshot[][] = [
      load(REF), load(WRONG),
      ...["voli.standard", "pantheon.standard", "ahri.survival"].map(
        (n) => JSON.parse(readFileSync(join(daily, `${n}.json`), "utf8")) as CaptureSnapshot[]),
    ];
    for (const all of captures) {
      for (const s of all.filter((x) => seg(x) !== null)) {
        const state = readPublicRound(s.envelope).segmentState!;
        const known = journeyKnowledge(state.journey, state.ownChallengeReveals, state.ownCardIndex);
        for (const m of known.values()) {
          for (const f of m.facts) {
            expect(f.kind, s.label).not.toBe("ability_damage");
            // A raw result only ever sits on the attacker's asked ability.
            if (f.kind === "ability_raw_damage") expect(m.key, s.label).toBe("player:zed:E");
          }
        }
      }
    }
  });
});

describe("inventory: identical stackable consumables share one slot", () => {
  it("Ahri's two Health Potions are ONE slot with a count of 2; Zed's single items stay single", () => {
    show(snap(REF, "child0-live"));
    const potions = screen.getByTestId("journey-item-opponent-1");
    expect(potions).toHaveAttribute("data-item-id", "2003");
    expect(potions).toHaveAttribute("data-quantity", "2");
    expect(screen.getByTestId("journey-item-qty-opponent-1")).toHaveTextContent("2");
    expect(potions).toHaveAccessibleName("Health Potion, 2");
    expect(screen.getByTestId("journey-item-opponent-2")).toHaveAccessibleName("Empty slot");
    expect(screen.getByTestId("journey-item-subject-0")).toHaveAttribute("data-item-id", "1055");
    expect(screen.getByTestId("journey-item-subject-0")).not.toHaveAttribute("data-quantity");
    expect(screen.getByTestId("journey-item-subject-1")).not.toHaveAttribute("data-quantity");
    // The served units are unchanged: the wire still lists the potion twice.
    const inv = ((seg(snap(REF, "child0-live"))!.challenges as Wire).journey as {
      children: { state: { sides: { opponent: { inventory: { name: string }[] } } } }[] })
      .children[0].state.sides.opponent.inventory.map((x) => x.name);
    expect(inv).toEqual(["Doran's Ring", "Health Potion", "Health Potion"]);
    fireEvent.click(screen.getByTestId("journey-open-state"));
    expect(screen.getByTestId("journey-state-sheet")).toHaveTextContent("Health Potion ×2");
  });

  it("the rule is generic: by canonical id, capped at the game's stack size; everything else stays separate", () => {
    const u = (itemId: string, name: string) => ({ itemId, name });
    const blade = u("1055", "Doran's Blade");
    const pot = u("2003", "Health Potion");
    const ward = u("2055", "Control Ward");
    expect(stackInventory([blade, blade])).toEqual([
      { itemId: "1055", name: "Doran's Blade", quantity: 1 }, { itemId: "1055", name: "Doran's Blade", quantity: 1 }]);
    expect(stackInventory([pot, blade, pot]).map((x) => [x.name, x.quantity])).toEqual([["Health Potion", 2], ["Doran's Blade", 1]]);
    const six = stackInventory([pot, pot, pot, pot, pot, pot]);
    expect(six.map((x) => x.quantity)).toEqual([STACKABLE_ITEM_MAX.get(2003), 1]);
    expect(stackInventory([ward, ward, ward]).map((x) => x.quantity)).toEqual([2, 1]);
    expect(stackInventory([u("abc", "Unknown"), u("abc", "Unknown")]).map((x) => x.quantity)).toEqual([1, 1]);
    const units = [pot, blade, pot, ward, pot];
    expect(stackInventory(units).reduce((n, x) => n + x.quantity, 0)).toBe(units.length);
  });
});

describe("the fixed stage: structure the pixel invariant rests on", () => {
  it("every snapshot of all three captures draws the SAME skeleton: board band + one question box", () => {
    for (const n of [REF, WRONG, TIMEOUT]) {
      play(n, (s) => {
        const stage = screen.queryByTestId("journey-stage");
        if (!stage) return;                                       // the lead-in: no reached child, no board yet
        const kids = [...stage.children].map((e) => e.getAttribute("data-testid") ?? e.className);
        expect(kids[0], `${n} ${s.label}`).toMatch(/journey-band|scenario-hero/);
        expect(kids[1], `${n} ${s.label}`).toBe("journey-question");
        const q = screen.getByTestId("journey-question");
        const filled = q.querySelector("[data-testid='journey-child'], .journey-stage-status");
        expect(filled, `${n} ${s.label}: the question box always holds a child or a status line`).not.toBeNull();
        const ask = q.querySelector("[data-testid='journey-child']");
        if (ask) {
          // The reveal is a LAYER in the ask (never a block after the answers).
          const reveal = ask.querySelector("[data-testid='journey-reveal']");
          const answers = ask.querySelector("[data-surface-region='answers']")!;
          expect(answers.nextElementSibling?.getAttribute("data-testid") ?? null, `${n} ${s.label}`).not.toBe("journey-reveal");
          if (reveal) expect(reveal.parentElement).toBe(ask);
        }
      });
      cleanup();
    }
  });

  it("the stylesheet reserves every region, draws the reveal out of flow and never scrolls the question", () => {
    const block = CSS.slice(CSS.indexOf("JP2 — THE FIXED JOURNEY STAGE."));
    expect(block).toMatch(/\.journey-stage\s*\{[^}]*--jq-prompt-h:[^}]*--jq-answers-h:/);
    expect(block).toMatch(/\.journey-question\s*\{[^}]*--qs-prompt-h:\s*var\(--jq-prompt-h\)[^}]*--qs-answers-h:\s*var\(--jq-answers-h\)/);
    expect(block).toMatch(/\.journey-reveal\s*\{[^}]*position:\s*absolute[^}]*height:\s*var\(--jq-prompt-h\)/);
    expect(block).toMatch(/\.journey-ask\[data-revealing="true"\] \[data-surface-region="prompt"\]\s*\{\s*visibility:\s*hidden/);
    expect(block).toMatch(/\.journey-stage-status\s*\{[^}]*min-height:\s*calc\(var\(--jq-prompt-h\)/);
    // The tablets fill the reserved answer region (no empty parchment beneath).
    expect(block).toMatch(/\[data-testid="answer-grid"\] > \.grid\s*\{[^}]*min-height:\s*var\(--jq-answers-h\)[^}]*grid-auto-rows:\s*1fr/);
    // The reveal mark takes room the tablet always keeps (no re-wrap at reveal).
    expect(block).toMatch(/\[data-quiz-choice\]:not\(:has\(img\)\) > svg\s*\{[^}]*position:\s*absolute/);
    // No inner scroll box in the Journey question any more.
    expect(CSS).not.toMatch(/\.journey-stage > \.journey-question\s*\{[^}]*overflow-y:\s*auto/);
    expect(block).toMatch(/\.journey-question\s*\{[^}]*overflow-x:\s*clip/);
  });
});
