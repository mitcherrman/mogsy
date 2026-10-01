/**
 * JP5 — ONE JOB EACH, in the DOM, on the real JP5-backend captures:
 *
 *   * the BOARD is current objects: no retained scalar bubbles ("Bonus AD 21",
 *     "Raw 85 !", "Armor ?/24 !") on any snapshot; portraits, abilities (and
 *     their own `!`), items and shards stay; the former anchor row keeps its box;
 *   * the PORTRAIT opens the champion portrait popup: established stats only, in
 *     the authored state they belong to, with their served provenance;
 *   * the REASONING CHAIN is unchanged.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { resetKnowledgeCoach } from "@/components/journey/useKnowledgeCoach";
import { readPublicRound } from "@/lib/ranked-public/contracts";
import { NO_INTERACTIONS } from "@/lib/ranked-core/viewTypes";
import type { CaptureSnapshot } from "@/lib/journey/realFixtures";
import { masterySliceModule } from "./masterySliceModule";

const FIX = resolve(process.cwd(), "src/lib/journey/__fixtures__/jp5");
const load = (n: string): CaptureSnapshot[] => JSON.parse(readFileSync(join(FIX, `${n}.json`), "utf8"));
const snap = (n: string, label: string) => {
  const s = load(n).find((x) => x.label === label);
  if (!s) throw new Error(`${n}: ${label}`);
  return s;
};
const REF = "zed_ahri.reference";
const PANTHEON = "pantheon.standard";

const Viewport = masterySliceModule.Viewport;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function show(s: CaptureSnapshot) {
  vi.setSystemTime(Date.parse(s.at));
  const round = readPublicRound(s.envelope);
  return render(
    <QueryClientProvider client={queryClient}>
      <Viewport publicRound={round} segmentState={round.segmentState} selection={null}
        permissions={NO_INTERACTIONS} onSelect={() => {}}
        actions={{ submitChallenge: (() => {}) as never, busy: false, error: null }} skewMs={0} />
    </QueryClientProvider>,
  );
}
const board = () => screen.getByTestId("journey-board");
const portrait = (side: "subject" | "opponent") => screen.getByTestId(`journey-portrait-popup-${side}`);
const openSheet = (side: "subject" | "opponent") => {
  fireEvent.click(portrait(side));
  return screen.getByTestId(`journey-portrait-popup-${side}-sheet`);
};
const row = (side: "subject" | "opponent", stat: string) => screen.getByTestId(`journey-portrait-popup-${side}-row-${stat}`);

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: false }); resetKnowledgeCoach(); });
afterEach(() => { cleanup(); vi.useRealTimers(); resetKnowledgeCoach(); });

describe("the board is current objects: no retained scalar bubbles", () => {
  it("no anchor chip on ANY snapshot of the reference and Pantheon Journeys; the row keeps its box, empty", () => {
    for (const file of [REF, PANTHEON]) {
      for (const s of load(file).filter((x) => (x.envelope.payload as { segment_state: unknown }).segment_state)) {
        show(s);
        if (!screen.queryByTestId("journey-board")) { cleanup(); continue; }
        const b = board();
        expect(b.querySelector(".journey-anchor, [data-testid^='journey-stat-'], [data-testid^='journey-readout-']"),
          `${file} ${s.label}`).toBeNull();
        for (const side of ["subject", "opponent"]) {
          const anchors = screen.getByTestId(`journey-anchors-${side}`);
          expect(anchors.childElementCount, `${file} ${s.label}`).toBe(0);
          expect(anchors).toHaveAttribute("aria-hidden", "true");
        }
        // No learned or stated SCALAR is printed on either champion's half (the
        // header's Journey Path names STEPS, not values).
        // (A transition beat's own "+15 Armor" gain tag on the new item is the
        // live change being played, not a retained value: beat frames excepted.)
        for (const half of b.getAttribute("data-beat") === "active" ? [] : b.querySelectorAll("section.journey-side")) {
          expect(half.textContent, `${file} ${s.label}`).not.toMatch(/Bonus AD|\bRaw\b|Armor\b/);
        }
        cleanup();
      }
    }
  });

  it("what stays: portraits, levels, abilities (their own `!`), items, shards", () => {
    show(snap(REF, "child3-live"));
    const b = board();
    expect(within(b).getByTestId("journey-portrait-subject")).toBeInTheDocument();
    expect(within(b).getByTestId("journey-level-opponent")).toHaveTextContent("Lv2");
    // Zed E's formula and raw damage stay on the ABILITY's own `!` (a game object).
    expect(within(b).getByTestId("journey-know-subject-E")).toBeInTheDocument();
    expect(within(b).getByTestId("journey-shards-subject")).toHaveAttribute("data-count", "3");
    expect(b.querySelectorAll("[data-testid^='journey-item-'], .journey-slot").length).toBeGreaterThan(0);
  });
});

describe("the portrait opens the champion portrait popup", () => {
  it("every portrait is a button; the sheet is a small stat table that starts empty", () => {
    show(snap(REF, "child0-live"));
    expect(portrait("subject").tagName).toBe("BUTTON");
    expect(portrait("subject")).toHaveAccessibleName("Zed stats");
    const sheet = openSheet("opponent");
    expect(within(sheet).getByText("Ahri")).toBeInTheDocument();
    expect(within(sheet).getByText("Current state")).toBeInTheDocument();
    const rows = within(sheet).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-stat"))).toEqual(
      ["health", "armor", "magic_resist", "attack_damage", "bonus_attack_damage", "ability_power", "ability_haste"]);
    expect(rows.every((r) => r.getAttribute("data-known") === "false")).toBe(true);
    // Nothing known yet: every value is the unknown mark.
    expect(within(sheet).getByTestId("journey-portrait-popup-opponent-rows").textContent).not.toMatch(/\d/);
  });

  it("Zed after Step 2: Bonus AD 21, stated, with its served sources one tap away", () => {
    show(snap(REF, "child1-reveal"));
    openSheet("subject");
    const bonus = row("subject", "bonus_attack_damage");
    expect(bonus).toHaveAttribute("data-how", "stated");
    expect(bonus.textContent).toMatch(/^Bonus AD21Lv 2 · Doran's Blade · 2 shards/);
    expect(bonus.textContent).not.toMatch(/stated|learned|Step/);
    fireEvent.click(screen.getByTestId("journey-portrait-popup-subject-row-bonus_attack_damage-toggle"));
    const sources = screen.getByTestId("journey-portrait-popup-subject-row-bonus_attack_damage-sources");
    expect([...sources.querySelectorAll("li")].map((li) => li.getAttribute("aria-label"))).toEqual([
      "Doran's Blade: +10", "Adaptive Force: +5.4", "Adaptive Force: +5.4", "Exact 20.8"]);
    // Zed's other stats were never established.
    expect(row("subject", "armor")).toHaveAttribute("data-known", "false");
    // Owner rule: a popup that holds any established OR stated stat puts the `!`
    // on its portrait — Zed's stated Bonus AD is enough.
    expect(screen.getByTestId("journey-portrait-popup-subject-mark")).toHaveTextContent("!");
    expect(portrait("subject")).toHaveAccessibleName("Zed stats, stats to review");
  });

  it("Ahri's armor: unknown while Step 3 asks it, LEARNED (24, Lv 2) from its reveal, with the `!`", () => {
    show(snap(REF, "child2-live"));
    openSheet("opponent");
    expect(row("opponent", "armor")).toHaveAttribute("data-known", "false");
    expect(screen.queryByTestId("journey-portrait-popup-opponent-mark")).toBeNull();
    cleanup();
    show(snap(REF, "child2-reveal"));
    expect(screen.getByTestId("journey-portrait-popup-opponent-mark")).toHaveTextContent("!");
    expect(portrait("opponent")).toHaveAccessibleName("Ahri stats, stats to review");
    openSheet("opponent");
    const armor = row("opponent", "armor");
    expect(armor).toHaveAttribute("data-how", "learned");
    expect(armor.textContent).toBe("Armor24Lv 2");
  });

  it("the portrait whose stats the question states is outlined (where its inputs are)", () => {
    show(snap(REF, "child1-live"));                                // Step 2 states Zed's bonus AD
    expect(portrait("subject")).toHaveAttribute("data-focus", "true");
    expect(portrait("opponent")).not.toHaveAttribute("data-focus");
    cleanup();
    show(snap(REF, "child2-live"));                                // Step 3 asks Ahri's armor
    expect(portrait("opponent")).toHaveAttribute("data-focus", "true");
  });
});

describe("a MODIFIED stat across authored states (Pantheon / Leona)", () => {
  it("after Cloth Armor: the current state states 65 = Lv 3 base + Cloth Armor; the earlier state keeps 50", () => {
    show(snap(PANTHEON, "child3-live"));
    const sheet = openSheet("opponent");
    expect(within(sheet).getByTestId("journey-portrait-popup-opponent-note")).toHaveTextContent("Leona buys Cloth Armor.");
    const select = within(sheet).getByTestId("journey-portrait-popup-opponent-state") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Steps 1–3 · Lv 3", "Current state"]);
    const armor = row("opponent", "armor");
    expect(armor.textContent).toBe("Armor65Lv 3 · Cloth Armor");
    fireEvent.click(screen.getByTestId("journey-portrait-popup-opponent-row-armor-toggle"));
    expect([...screen.getByTestId("journey-portrait-popup-opponent-row-armor-sources").querySelectorAll("li")]
      .map((li) => li.getAttribute("aria-label"))).toEqual(["Lv 3 base: 50.08", "Cloth Armor: +15", "Exact 65.08"]);
    // The earlier authored state: what Step 1 taught, as taught.
    fireEvent.change(select, { target: { value: "0" } });
    expect(row("opponent", "armor").textContent).toBe("Armor50Lv 3");
  });

  it("the sheet opens at the board's current state, and only reached states are listed", () => {
    show(snap(PANTHEON, "child2-live"));
    const sheet = openSheet("opponent");
    expect(within(sheet).queryByTestId("journey-portrait-popup-opponent-state")).toBeNull();
    expect(within(sheet).getByText("Current state")).toBeInTheDocument();
    expect(row("opponent", "armor").textContent).toMatch(/^Armor50/);
  });
});

describe("the Reasoning Chain is unchanged", () => {
  it("Step 4 live still resurfaces 85 → 24 → ? Final damage; Step 2 live stays clean", () => {
    show(snap(REF, "child3-live"));
    expect(screen.getByTestId("journey-live-chain").textContent).toBe("85Raw damagegives24Ahri armorgives?Final damage");
    cleanup();
    show(snap(REF, "child1-live"));
    expect(screen.queryByTestId("journey-live")).toBeNull();
  });
});
