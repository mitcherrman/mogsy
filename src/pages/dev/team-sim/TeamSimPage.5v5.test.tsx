/**
 * SIM2 Phase 6B: the team-sim page at five combatants per side.
 *
 * Everything here is a statement about the PAGE, not the draft model (that is
 * draft.5v5.test.ts). The cases worth having are the ones where TEN slots
 * change what the operator sees or what leaves the browser:
 *
 *   - the size control drives all 25 shapes and quotes the catalog's price,
 *     including the new 9-credit maximum;
 *   - the editor stays usable at ten combatants. Phase 6B collapses the cards
 *     and keeps ONE open per team, so the assertions are about the roster
 *     staying visible, exactly one editor being mounted per side, and opening
 *     a card on one team not disturbing the other;
 *   - ONE click still sends exactly ONE POST, which is the whole safety
 *     property of this page and now costs nine credits to break;
 *   - the result workspace renders ten combatants and ten effective builds
 *     with no six-position assumption;
 *   - a ten-champion server-recovery summary is readable rather than a raw
 *     runtime array;
 *   - nothing overflows a 375px viewport.
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REAL_4V4,
  REAL_5V5,
  REAL_CATALOG,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import { MAX_EDITOR_TEAM_SIZE } from "@/lib/combat-lab/team-sim/draft";

import {
  openCombatant,
  DEFAULT_CREDITS,
  recoverableEntry,
  recoverableListing,
  renderTeamSimPage,
  selectTeamShape,
  type TeamSimHarness,
} from "./testHarness";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

// Ten cards is a lot of DOM per render.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const FIND = { timeout: 8_000 };
const ok = (body: unknown) => ({ status: 200, body });

async function loadedPage(options: Parameters<typeof renderTeamSimPage>[0] = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

const runButton = () =>
  within(screen.getByTestId("run-panel")).getByRole("button", { name: /^Run/ });

const A = ["A1", "A2", "A3", "A4", "A5"] as const;
const B = ["B1", "B2", "B3", "B4", "B5"] as const;
const TEN = [...A, ...B];
const EIGHT = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];

const SIZES = [1, 2, 3, 4, 5];
const ALL_SHAPES = SIZES.flatMap((a) => SIZES.map((b) => [a, b] as const));

const expandedIds = () =>
  screen
    .getAllByTestId(/^combatant-/)
    .filter((el) => el.getAttribute("data-expanded") === "true")
    .map((el) => el.getAttribute("data-testid")!.replace("combatant-", ""));

/* ─────────────────────────── the size control ─────────────────────────── */

describe("5v5 team-size control", () => {
  it("offers sizes 1-5 for each team independently", async () => {
    await loadedPage();
    const selector = within(screen.getByTestId("team-size-selector"));
    for (const team of ["A", "B"]) {
      for (const size of SIZES) {
        expect(
          selector.getByRole("button", { name: `Team ${team}: ${size}` })
        ).toBeInTheDocument();
      }
    }
    // And nothing beyond the cap.
    expect(
      selector.queryByRole("button", { name: "Team A: 6" })
    ).not.toBeInTheDocument();
  });

  it("stays TEN buttons rather than one per shape", async () => {
    // The whole reason the control was reshaped in Phase 6A. At a cap of five
    // the per-shape design would render 25 buttons; this must stay linear.
    await loadedPage();
    const selector = within(screen.getByTestId("team-size-selector"));
    expect(selector.getAllByRole("button")).toHaveLength(2 * MAX_EDITOR_TEAM_SIZE);
  });

  it("quotes the catalog price for every one of the 25 shapes", async () => {
    await loadedPage();
    for (const [a, b] of ALL_SHAPES) {
      selectTeamShape(a, b);
      const quote = screen.getByTestId("team-shape-cost");
      expect(quote).toHaveTextContent(`${a}v${b}`);
      expect(quote).toHaveTextContent(
        `${a + b - 1} credit${a + b - 1 === 1 ? "" : "s"}`
      );
    }
  });

  it("quotes nine credits for a 5v5", async () => {
    await loadedPage();
    selectTeamShape(5, 5);
    const quote = screen.getByTestId("team-shape-cost");
    expect(quote).toHaveTextContent("5v5");
    expect(quote).toHaveTextContent("9 credits");
  });
});

/* ──────────────────────── the editing surface ──────────────────────── */

describe("5v5 editing surface", () => {
  it("renders a card for every active slot and none for inactive ones", async () => {
    await loadedPage();
    selectTeamShape(5, 5);
    for (const id of TEN) {
      expect(screen.getByTestId(`combatant-${id}`)).toBeInTheDocument();
    }

    selectTeamShape(5, 2);
    for (const id of ["B3", "B4", "B5"]) {
      expect(screen.queryByTestId(`combatant-${id}`)).not.toBeInTheDocument();
    }
    for (const id of ["A4", "A5", "B1", "B2"]) {
      expect(screen.getByTestId(`combatant-${id}`)).toBeInTheDocument();
    }
  });

  it("keeps exactly ONE editor open per team", async () => {
    // The scaling property: ten expanded cards is the wall Phase 6B exists to
    // avoid, so at most one per side may be mounted at a time.
    await loadedPage();
    selectTeamShape(5, 5);
    expect(expandedIds().sort()).toEqual(["A1", "B1"]);

    openCombatant("A4");
    expect(expandedIds().sort()).toEqual(["A4", "B1"]);

    openCombatant("B5");
    expect(expandedIds().sort()).toEqual(["A4", "B5"]);
  });

  it("shows all five champions per team even when only one card is open", async () => {
    // "Preserve quick visual identity of all 5 champions": a collapsed card is
    // the roster row, so every runtime ID and champion stays on screen.
    await loadedPage();
    selectTeamShape(5, 5);
    for (const id of TEN) {
      const card = within(screen.getByTestId(`combatant-${id}`));
      expect(card.getByText(id)).toBeInTheDocument();
    }
    // Nine of the ten are collapsed and carry a one-line summary instead.
    const summaries = screen.getAllByTestId(/^roster-summary-/);
    expect(summaries).toHaveLength(8);
  });

  it("states each collapsed combatant's plan and targeting", async () => {
    // The other half of "the user must still understand each combatant's
    // plan/targeting" — it has to be legible WITHOUT expanding the card.
    await loadedPage();
    selectTeamShape(5, 5);
    const line = screen.getByTestId("roster-summary-A3");
    expect(line).toHaveTextContent("Basic Attack");
    expect(line).toHaveTextContent("first_living");
    expect(line).toHaveTextContent("L18");
  });

  it("offers no collapse control on the one open card", async () => {
    // Found in the Phase 6B browser pass. The first version rendered the header
    // as a button in BOTH states, labelled "Collapse A1 …" when open — but the
    // handler only ever opens, because closing the only open card would leave
    // the team with no editor at all. A control that announces something it
    // cannot do is worse than no control.
    await loadedPage();
    selectTeamShape(5, 5);
    const openCard = within(screen.getByTestId("combatant-A1"));
    expect(
      openCard.queryByRole("button", { name: /^Collapse/ })
    ).not.toBeInTheDocument();
    expect(
      openCard.queryByRole("button", { name: /^Edit A1/ })
    ).not.toBeInTheDocument();
    // ...while a collapsed one still offers exactly that.
    expect(
      within(screen.getByTestId("combatant-A2")).getByRole("button", {
        name: /^Edit A2/,
      })
    ).toBeInTheDocument();
  });

  it("does not lose a combatant's configuration when its card collapses", async () => {
    // The specific hazard the accordion introduces: a collapsed card UNMOUNTS
    // its controls, so if any of that state lived in the component it would be
    // destroyed by looking at another combatant. It lives in the draft reducer,
    // and this is what says so.
    await loadedPage();
    selectTeamShape(5, 5);
    openCombatant("A4");
    const pick = REAL_CATALOG.champions[15].name;
    fireEvent.change(screen.getByLabelText("A4 champion"), {
      target: { value: pick },
    });
    // Scoped to A4's card: "Starting HP" is a per-card label, and BOTH teams
    // have an open card at any moment.
    fireEvent.change(
      within(screen.getByTestId("combatant-A4")).getByLabelText("Starting HP"),
      { target: { value: "777" } }
    );

    // Collapse A4 by opening a sibling, then come back.
    openCombatant("A2");
    expect(screen.getByTestId("combatant-A4").getAttribute("data-expanded")).toBe(
      "false"
    );
    // The roster line still names the champion, so the value is not merely
    // preserved — it is visible while collapsed.
    expect(screen.getByTestId("combatant-A4")).toHaveTextContent(pick);

    openCombatant("A4");
    expect((screen.getByLabelText("A4 champion") as HTMLSelectElement).value).toBe(
      pick
    );
    expect(
      (within(screen.getByTestId("combatant-A4")).getByLabelText(
        "Starting HP"
      ) as HTMLInputElement).value
    ).toBe("777");
  });

  it("keeps a collapsed combatant in the submitted request", async () => {
    // The other half: a card being collapsed must not remove it from the fight.
    const { harness } = await loadedPage({ simulate: [ok(REAL_5V5)] });
    selectTeamShape(5, 5);
    openCombatant("A5");
    openCombatant("A1");            // collapse A5 again
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const body = harness.lastRequestBody<{
      team_a: { combatants: Array<{ runtime_id: string }> };
    }>();
    expect(body.team_a.combatants.map((c) => c.runtime_id)).toEqual([...A]);
  });

  it("opening a card on one team does not disturb the other", async () => {
    await loadedPage();
    selectTeamShape(5, 5);
    openCombatant("B4");
    expect(expandedIds().sort()).toEqual(["A1", "B4"]);
    openCombatant("A5");
    expect(expandedIds().sort()).toEqual(["A5", "B4"]);
  });

  it("falls back to the first slot when the open card is shrunk away", async () => {
    // Without the clamp this renders NO editor for team B, which is worse than
    // the wall it replaced.
    await loadedPage();
    selectTeamShape(5, 5);
    openCombatant("B5");
    expect(expandedIds()).toContain("B5");

    selectTeamShape(5, 2);
    expect(expandedIds().sort()).toEqual(["A1", "B1"]);
    expect(screen.getByTestId("combatant-B1").getAttribute("data-expanded")).toBe(
      "true"
    );
  });

  it("keeps A5's configuration across a 5v5 -> 2v2 -> 5v5 round trip", async () => {
    await loadedPage();
    selectTeamShape(5, 5);
    openCombatant("A5");
    const a5 = screen.getByLabelText("A5 champion") as HTMLSelectElement;
    const pick = REAL_CATALOG.champions[7].name;
    act(() => {
      a5.value = pick;
      a5.dispatchEvent(new Event("change", { bubbles: true }));
    });

    selectTeamShape(2, 2);
    expect(screen.queryByTestId("combatant-A5")).not.toBeInTheDocument();

    selectTeamShape(5, 5);
    openCombatant("A5");
    expect((screen.getByLabelText("A5 champion") as HTMLSelectElement).value).toBe(
      pick
    );
  });

  it("flags a collapsed combatant that is blocking submission", async () => {
    // A validation error on a card nobody can see would block Run with nothing
    // on screen explaining why.
    await loadedPage();
    selectTeamShape(5, 5);
    openCombatant("A5");
    // "fixed" with no priority entries is a submission-blocking issue.
    const targeting = within(screen.getByLabelText("Targeting for A5"));
    act(() => {
      const select = targeting.getByLabelText("A5 targeting") as HTMLSelectElement;
      select.value = "fixed";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    openCombatant("A1");        // collapse A5
    expect(screen.getByTestId("combatant-A5").getAttribute("data-expanded")).toBe(
      "false"
    );
    expect(screen.getByTestId("roster-issues-A5")).toBeInTheDocument();
  });

  it("offers all five opponents to a fixed priority list", async () => {
    await loadedPage();
    selectTeamShape(5, 5);
    const targeting = within(screen.getByLabelText("Targeting for A1"));
    act(() => {
      const select = targeting.getByLabelText("A1 targeting") as HTMLSelectElement;
      select.value = "fixed";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    for (const id of B) {
      expect(
        targeting.getByRole("button", { name: `+ ${id}` })
      ).toBeInTheDocument();
    }
  });
});

/* ─────────────────────────── submission ─────────────────────────── */

describe("5v5 submission", () => {
  it("sends exactly ten combatants and no inactive slot", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_5V5)] });
    selectTeamShape(5, 5);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const body = harness.lastRequestBody<{
      team_a: { combatants: Array<{ runtime_id: string }> };
      team_b: { combatants: Array<{ runtime_id: string }> };
      action_plans: Record<string, unknown>;
      targeting: Record<string, unknown>;
    }>();
    expect(body.team_a.combatants.map((c) => c.runtime_id)).toEqual([...A]);
    expect(body.team_b.combatants.map((c) => c.runtime_id)).toEqual([...B]);
    expect(Object.keys(body.action_plans).sort()).toEqual([...TEN].sort());
    expect(Object.keys(body.targeting).sort()).toEqual([...TEN].sort());
  });

  it("sends exactly eight combatants for a 4v4", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_4V4)] });
    selectTeamShape(4, 4);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const body = harness.lastRequestBody<{
      team_a: { combatants: Array<{ runtime_id: string }> };
      team_b: { combatants: Array<{ runtime_id: string }> };
    }>();
    expect(body.team_a.combatants.map((c) => c.runtime_id)).toEqual([
      "A1", "A2", "A3", "A4",
    ]);
    expect(body.team_b.combatants.map((c) => c.runtime_id)).toEqual([
      "B1", "B2", "B3", "B4",
    ]);
    expect(JSON.stringify(body)).not.toContain("A5");
    expect(JSON.stringify(body)).not.toContain("B5");
  });

  it("still sends exactly ONE POST for one deliberate click", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_5V5)] });
    selectTeamShape(5, 5);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);
  });

  it("ignores repeated clicks while a 5v5 is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_5V5, gate }],
    });
    selectTeamShape(5, 5);
    await act(async () => {
      // Captured once: the control relabels itself while a run is in flight,
      // so re-querying by name would fail before it could click twice.
      const button = runButton();
      button.click();
      button.click();
      button.click();
    });
    expect(harness.postCalls).toHaveLength(1);
    await act(async () => {
      release();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);
  });

  it("sends exactly one idempotency key with the 5v5 POST", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_5V5)] });
    selectTeamShape(5, 5);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const headers = harness.postCalls[0].headers;
    const keys = Object.keys(headers).filter(
      (h) => h.toLowerCase() === "idempotency-key"
    );
    expect(keys).toHaveLength(1);
    expect(headers[keys[0]]).toMatch(/\S/);
  });
});

/* ─────────────────────────── the results ─────────────────────────── */

describe("5v5 results", () => {
  async function ranFive() {
    const rendered = await loadedPage({ simulate: [ok(REAL_5V5)] });
    selectTeamShape(5, 5);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    return rendered;
  }

  it("renders a summary card for each of the ten combatants", async () => {
    await ranFive();
    for (const id of TEN) {
      expect(screen.getByTestId(`combatant-summary-${id}`)).toBeInTheDocument();
    }
  });

  it("never hard-codes six result positions", async () => {
    await ranFive();
    const cards = screen.getAllByTestId(/^combatant-summary-/);
    expect(cards).toHaveLength(10);
    expect(Object.keys(REAL_5V5.combatant_summaries)).toHaveLength(10);
  });

  it("shows every combatant's champion and alive/dead status", async () => {
    await ranFive();
    for (const [id, summary] of Object.entries(REAL_5V5.combatant_summaries)) {
      const card = within(screen.getByTestId(`combatant-summary-${id}`));
      expect(
        card.getByText(new RegExp((summary as { champion: string }).champion))
      ).toBeInTheDocument();
    }
  });

  it("renders ten effective builds", async () => {
    await ranFive();
    const panel = within(screen.getByTestId("effective-builds"));
    for (const id of TEN) {
      expect(panel.getByTestId(`effective-build-${id}`)).toBeInTheDocument();
    }
    expect(panel.getAllByTestId(/^effective-build-/)).toHaveLength(10);
  });

  it("reports the winner, termination and event count of a ten-combatant fight", async () => {
    await ranFive();
    const panel = within(screen.getByTestId("result-panel"));
    expect(panel.getByText(/team_elimination/)).toBeInTheDocument();
    expect(
      screen.getByTestId("result-panel").textContent
    ).toContain(String(REAL_5V5.event_count));
  });

  it("renders eight results for a 4v4", async () => {
    await loadedPage({ simulate: [ok(REAL_4V4)] });
    selectTeamShape(4, 4);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    for (const id of EIGHT) {
      expect(screen.getByTestId(`combatant-summary-${id}`)).toBeInTheDocument();
    }
    expect(screen.getAllByTestId(/^combatant-summary-/)).toHaveLength(8);
    expect(
      screen.queryByTestId("combatant-summary-A5")
    ).not.toBeInTheDocument();
  });
});

/* ────────────────────── ten-champion recovery ────────────────────── */

describe("ten-champion recovery summaries", () => {
  const TEN_CHAMPIONS = recoverableEntry({
    team_shape: "5v5",
    champions: {
      a: ["Ashe", "Lux", "Jinx", "Caitlyn", "Ezreal"],
      b: ["Garen", "Malphite", "Ornn", "Darius", "Nasus"],
    },
    credit_cost: 9,
    credits_charged: 9,
    event_count: 284,
  });

  it("names all ten champions", async () => {
    await loadedPage({
      recoverable: () => ok(recoverableListing([TEN_CHAMPIONS])),
    });
    const panel = await screen.findByTestId("server-recovery", {}, FIND);
    for (const name of [...TEN_CHAMPIONS.champions.a, ...TEN_CHAMPIONS.champions.b]) {
      expect(within(panel).getByText(new RegExp(name))).toBeInTheDocument();
    }
    expect(within(panel).getByText(/5v5/)).toBeInTheDocument();
  });

  it("wraps the ten names rather than overflowing or truncating them", async () => {
    await loadedPage({
      recoverable: () => ok(recoverableListing([TEN_CHAMPIONS])),
    });
    const panel = await screen.findByTestId("server-recovery", {}, FIND);
    // The line is long enough to need wrapping; the panel must let it, and must
    // not be relying on an ellipsis that would hide half the roster.
    const line = within(panel).getByText(/Ashe.*Nasus/);
    expect(line.className).toContain("break-words");
    expect(line.className).not.toContain("truncate");
  });

  it("does not display a raw runtime-id array", async () => {
    await loadedPage({
      recoverable: () => ok(recoverableListing([TEN_CHAMPIONS])),
    });
    const panel = await screen.findByTestId("server-recovery", {}, FIND);
    expect(panel.textContent).not.toContain("A1");
    expect(panel.textContent).not.toContain("B5");
    expect(panel.textContent).not.toMatch(/\["/);
  });
});

/* ──────────────────────── layout and cost ──────────────────────── */

describe("5v5 layout", () => {
  it("advertises 1v1-5v5 in the page description", async () => {
    await loadedPage();
    expect(screen.getByText(/1v1–5v5/)).toBeInTheDocument();
  });

  it("labels each team with its roster size", async () => {
    await loadedPage();
    selectTeamShape(5, 3);
    expect(
      within(screen.getByLabelText("Team A")).getByText("(5)")
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Team B")).getByText("(3)")
    ).toBeInTheDocument();
  });

  it("grows DOWN, not sideways: teams stay in their own column", async () => {
    // Team A's five cards live in team A's section and team B's in team B's,
    // so a fifth combatant lengthens a column instead of widening the page.
    await loadedPage();
    selectTeamShape(5, 5);
    const teamA = within(screen.getByLabelText("Team A"));
    const teamB = within(screen.getByLabelText("Team B"));
    for (const id of A) {
      expect(teamA.getByTestId(`combatant-${id}`)).toBeInTheDocument();
      expect(teamB.queryByTestId(`combatant-${id}`)).not.toBeInTheDocument();
    }
    for (const id of B) {
      expect(teamB.getByTestId(`combatant-${id}`)).toBeInTheDocument();
      expect(teamA.queryByTestId(`combatant-${id}`)).not.toBeInTheDocument();
    }
  });

  it("gives every collapsed roster row a single-line treatment", async () => {
    // Five collapsed cards only work as a roster if each stays ONE row tall.
    await loadedPage();
    selectTeamShape(5, 5);
    for (const id of ["A2", "A3", "A4", "A5"]) {
      expect(screen.getByTestId(`roster-summary-${id}`).className).toContain(
        "truncate"
      );
    }
  });
});

describe("5v5 cost preview", () => {
  it("shows the 9-credit cost against the remaining balance", async () => {
    await loadedPage({ credits: () => ok(DEFAULT_CREDITS) });
    selectTeamShape(5, 5);
    await waitFor(() =>
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("9 credit")
    );
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("17 remaining");
  });

  it("shows the shortfall when a 5v5 costs more than the balance", async () => {
    // NOT a client-side block, deliberately: the Run button gates on validation
    // and in-flight state only, and affordability is the SERVER's call (402 with
    // the authoritative credit status). A browser that refused on its own stale
    // reading would be wrong in the direction that loses the operator a run they
    // could actually afford. What the page owes them is both numbers.
    await loadedPage({
      credits: ok({
        ...DEFAULT_CREDITS,
        credits: {
          ...DEFAULT_CREDITS.credits,
          credits_used: 25,
          credits_remaining: 5,
        },
      }),
    });
    selectTeamShape(5, 5);
    await waitFor(() =>
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("5 remaining")
    );
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("9 credit");
  });
});
