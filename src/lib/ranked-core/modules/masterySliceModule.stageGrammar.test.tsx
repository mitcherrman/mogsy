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

// Several tests open Radix popovers (the `!` cards, the exact working, a
// stat's sources) across whole timelines; jsdom makes each open costly, so the
// file takes the repo's usual long-test budget.
vi.setConfig({ testTimeout: 25_000 });

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
    // The state it is read at is the BOARD's — a derived stat reads whole
    // (20.8 → 21). JP4: where 21 comes from is on the anchor itself (its served
    // sources), and the exact value is in that breakdown, "rounded for display".
    const bonus = screen.getByTestId("journey-stat-subject-bonus_attack_damage");
    expect(bonus).toHaveTextContent(/^Bonus AD21$/);
    fireEvent.click(bonus);
    const sources = screen.getByTestId("journey-stat-subject-bonus_attack_damage-pop");
    expect(sources).toHaveTextContent(/Doran's Blade\s*\+10.*Adaptive Force\s*\+5\.4.*Adaptive Force\s*\+5\.4.*Exact\s*20\.8/);
    expect(sources).toHaveTextContent("Shown as 21 · rounded for display");
    expect(sources.textContent).not.toMatch(/rounded up/);
    // The value this step asks is the board's `?` anchor on Zed E.
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveAttribute("data-face", "asked");
    expect(screen.getByTestId("journey-readout-subject-E")).toHaveTextContent(/\?$/);
    expect(screen.getByTestId("journey-level-subject")).toHaveTextContent("2");
    expect(screen.getByTestId("journey-ability-subject-E")).toHaveAttribute("data-rank", "1");
  });

  it("JP4 — the reveal is a Reasoning Chain in the learned formula's own words: 70 + 70% of 21 = 15 = 85", () => {
    show(snap(REF, "child1-reveal"));
    const w = screen.getByTestId("journey-raw-working");
    const node = (k: string) => within(w).getByTestId(`journey-raw-working-${k}`);
    // "Rank 1", never "R1" (which reads as the R ability).
    expect(screen.getByTestId("journey-raw-working-subject")).toHaveTextContent(/^Shadow Slash — Rank 1$/);
    expect(document.body.textContent).not.toMatch(/\bR1\b/);
    expect(node("base")).toHaveTextContent(/^70Base damage$/);
    expect(node("ratio-0")).toHaveTextContent(/^70% of 21 =15Bonus AD damage$/);
    expect(node("final")).toHaveTextContent(/^85Raw damage$/);
    expect(node("final").className).toMatch(/journey-node--final/);
    expect([...w.querySelectorAll(".journey-op")].map((o) => o.getAttribute("data-op"))).toEqual(["+", "="]);
    // Primary math is whole; the exact working is behind the info control.
    expect(w.textContent).not.toMatch(/20\.8|14\.56|84\.56/);
    fireEvent.click(screen.getByTestId("journey-raw-working-exact"));
    const exact = screen.getByTestId("journey-raw-working-exact-pop");
    expect(exact).toHaveTextContent("Exact bonus AD: 20.8");
    expect(exact).toHaveTextContent("70% of 20.8 = 14.56");
    expect(exact).toHaveTextContent("70 + 14.56 = 84.56");
    expect(exact).toHaveTextContent("Shown as 85 · rounded for display");
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Correct · 85");
    // The backend's serialized explanation is not appended under it.
    expect(screen.queryByTestId("journey-reveal-explanation")).toBeNull();
  });
});

describe("Step 3 — Ahri's armor in the same grammar", () => {
  it("asks in words, answers on the grid; after the reveal the armor lives on Ahri", () => {
    show(snap(REF, "child2-live"));
    expect(heading()).toHaveTextContent("At level 2, what is Ahri's Armor?");
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "asked");
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveTextContent(/^Armor\?$/);
    // JP4 — Zed E's raw damage, learned at Step 2, is NOT reprinted: it lives
    // on Zed E's `!` (the notebook), one hover away.
    expect(screen.queryByTestId("journey-readout-subject-E")).toBeNull();
    expect(marks()).toEqual(["subject-E:2"]);
    cleanup();
    show(snap(REF, "child2-reveal"));
    // The reveal MOMENT: the value fills the `?` (Armor ? → Armor 24 !).
    const armor = screen.getByTestId("journey-stat-opponent-armor");
    expect(armor).toHaveAttribute("data-face", "revealed");
    expect(within(armor).getByTestId("journey-stat-opponent-armor-learned")).toHaveTextContent("24");
    expect(marks()).toEqual(["opponent-stat-armor:1", "subject-E:2"]);
    expect(screen.queryByTestId("journey-know-opponent-champion")).toBeNull();
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Ahri · Lv2.*Armor 24.*learned Step 3/);
    // The reveal: [Ahri · Lv 2] → [Armor · 24]; 24.024 only in the exact working.
    const w = screen.getByTestId("journey-stat-working");
    expect(within(w).getByTestId("journey-stat-working-level")).toHaveTextContent(/^Lv 2Ahri$/);
    expect(within(w).getByTestId("journey-stat-working-final")).toHaveTextContent(/^24Armor$/);
    expect(w.textContent).not.toContain("24.024");
    fireEvent.click(screen.getByTestId("journey-stat-working-exact"));
    expect(screen.getByTestId("journey-stat-working-exact-pop")).toHaveTextContent("Exact armor at level 2: 24.024");
  });
});

describe("Step 4 — the culmination reads off the board", () => {
  it("asks the application; no dependency manifest; the prerequisites are the board's `!`", () => {
    show(snap(REF, "child3-live"));
    expect(heading()).toHaveTextContent("How much physical damage does Zed's Rank 1 Shadow Slash deal to Ahri?");
    expect(document.body.textContent).not.toMatch(/Raw damage · recalled|recall · revealed in step|not part of this question's premise/);
    // The chain is on the board, not in a helper line under the question.
    expect(child().textContent).not.toMatch(/builds on|item effects/i);
    // JP4 — settled knowledge is NOT reprinted: Ahri's armor is its anchor and
    // its `!` (the value one hover away); Zed's raw damage is Zed E's `!`.
    const armor = screen.getByTestId("journey-stat-opponent-armor");
    expect(armor).toHaveAttribute("data-face", "learned");
    expect(armor.textContent).not.toMatch(/recall|24/i);
    expect(armor).toHaveTextContent(/^Armor!$/);
    expect(screen.queryByTestId("journey-readout-subject-E")).toBeNull();
    expect(screen.getByTestId("journey-board").textContent).not.toMatch(/\b85\b|\b24\b/);
    // Irrelevant zero modifiers are not board state.
    expect(screen.queryByTestId("journey-stat-subject-lethality")).toBeNull();
    expect(screen.queryByTestId("journey-stat-subject-armor_penetration_percent")).toBeNull();
    // One object accumulates its facts; the canonical taught decimal (92.5) stays.
    expect(popText("journey-know-subject-E")).toMatch(
      /E · Shadow Slash · Rank 1.*Formula 70 \/ 92\.5 \/ 115 \/ 137\.5 \/ 160 \(\+70% bonus AD\).*learned Step 1.*Raw damage 85.*learned Step 2/);
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Armor 24.*learned Step 3/);
  });

  it("JP4 — the reveal is the server's working as a Reasoning Chain: 85 → 24 → 100 / (100 + 24) ≈ 0.806 → 68", () => {
    show(snap(REF, "child3-reveal"));
    const w = screen.getByTestId("journey-combat-working");
    expect(screen.getByTestId("journey-reveal")).toContainElement(w);
    const node = (k: string) => within(w).getByTestId(`journey-combat-working-${k}`);
    // The server's numbers, derived ones whole for display (84.56 → 85,
    // 24.024 → 24); the served multiplier drawn as the armor formula it is.
    expect(node("raw")).toHaveTextContent(/^85Raw damage$/);
    expect(node("armor")).toHaveTextContent(/^24Ahri armor$/);
    expect(within(w).getByTestId("journey-combat-working-multiplier-fraction")).toHaveTextContent("100100 + 24");
    expect(within(w).getByTestId("journey-combat-working-multiplier-value")).toHaveTextContent("≈ 0.806");
    expect(node("final")).toHaveTextContent(/^68Final damage$/);
    expect(node("final").className).toMatch(/journey-node--final/);
    expect([...w.querySelectorAll(".journey-op")].map((o) => o.getAttribute("data-op"))).toEqual(["→", "→", "→"]);
    // The raw damage was established at Step 2 (on the board): no formula re-derived.
    expect(screen.queryByTestId("journey-combat-working-formula")).toBeNull();
    // No derived decimal in the chain; the exact working is one tap away.
    expect(w.textContent).not.toMatch(/84\.56|24\.024|68\.18|0\.8063/);
    fireEvent.click(screen.getByTestId("journey-combat-working-exact"));
    const exact = screen.getByTestId("journey-combat-working-exact-pop");
    expect(exact).toHaveTextContent("Exact raw damage: 84.56");
    expect(exact).toHaveTextContent("Ahri armor: 24.024");
    expect(exact).toHaveTextContent("100 ÷ (100 + 24.024) = 0.8063");
    expect(exact).toHaveTextContent("84.56 × 0.8063 ≈ 68.1804");
    expect(exact).toHaveTextContent("Shown as 68 · rounded for display");
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
    // The reveal moment: the raw value arrives on its anchor, with its `!`…
    expect(at("child1-reveal")).toBe("subject-E:2,subject-readout-E:1");
    // …then settles into Zed E's own `!` (JP4: never reprinted).
    expect(at("child2-live")).toBe("subject-E:2");
    expect(at("child2-reveal")).toBe("opponent-stat-armor:1,subject-E:2");     // + Armor 24 !
    expect(at("finished")).toBe("opponent-stat-armor:1,subject-E:2");
  });

  it("a WRONG answer still establishes the fact by its reveal (steps 1 and 3 answered wrong)", () => {
    const t = timeline(WRONG);
    const at = (label: string) => t.find((x) => x.startsWith(`${label} `))!.slice(label.length + 1);
    expect(at("child0-reveal")).toBe("subject-E:1");
    expect(at("child2-reveal")).toBe("opponent-stat-armor:1,subject-E:2");
    cleanup();
    show(snap(WRONG, "child3-live"));
    expect(screen.getByTestId("journey-stat-opponent-armor")).toHaveAttribute("data-face", "learned");
    expect(popText("journey-know-opponent-stat-armor")).toMatch(/Armor 24.*learned Step 3/);
  });

  it("a TIMEOUT reveal shows in place, says so, and keeps every earlier fact", () => {
    show(snap(TIMEOUT, "child3-timeout-reveal"));
    expect(screen.getByTestId("journey-reveal-verdict")).toHaveTextContent("Time's up · 68");
    expect(marks()).toEqual(["opponent-stat-armor:1", "subject-E:2"]);
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
