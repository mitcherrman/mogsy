/**
 * SIM2 Phase 6A: the team-sim page at three combatants per side.
 *
 * Everything here is a statement about the PAGE, not the draft model (that is
 * draft.3v3.test.ts). The cases worth having are the ones where six slots
 * change what the operator sees or what leaves the browser:
 *
 *   - six editors render, and only the active ones do;
 *   - the size control drives all nine shapes and quotes the catalog's price;
 *   - ONE click still sends exactly ONE POST at 5 credits, which is the whole
 *     safety property of this page and now costs five times as much to break;
 *   - the result workspace renders six combatants and six effective builds
 *     without any four-position assumption;
 *   - a six-champion server-recovery summary is readable rather than
 *     overflowing its card.
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REAL_3V3,
  REAL_CATALOG,
} from "@/lib/combat-lab/team-sim/__fixtures__";

import {
  openCombatant,
  DEFAULT_CREDITS,
  recoverableEntry,
  recoverableListing,
  renderTeamSimPage,
  selectTeamShape,
  type TeamSimHarness,
} from "./testHarness";
import { MAX_EDITOR_TEAM_SIZE } from "@/lib/combat-lab/team-sim/draft";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

// Six editors is a lot of DOM per render.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const FIND = { timeout: 8_000 };

const ok = (body: unknown) => ({ status: 200, body });

async function loadedPage(options: Parameters<typeof renderTeamSimPage>[0] = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

const runButton = () =>
  within(screen.getByTestId("run-panel")).getByRole("button", { name: /^Run/ });

const SIX = ["A1", "A2", "A3", "B1", "B2", "B3"] as const;

/* ─────────────────────────── the editor ─────────────────────────── */

describe("3v3 editing surface", () => {
  it("renders six combatant editors, one per active slot", async () => {
    await loadedPage();
    selectTeamShape(3, 3);
    for (const id of SIX) {
      expect(screen.getByTestId(`combatant-${id}`)).toBeInTheDocument();
    }
  });

  it("renders only the active slots at smaller shapes", async () => {
    await loadedPage();
    selectTeamShape(3, 1);
    for (const id of ["A1", "A2", "A3", "B1"]) {
      expect(screen.getByTestId(`combatant-${id}`)).toBeInTheDocument();
    }
    for (const id of ["B2", "B3"]) {
      expect(screen.queryByTestId(`combatant-${id}`)).not.toBeInTheDocument();
    }
  });

  it("offers sizes 1-3 for each team independently", async () => {
    await loadedPage();
    const selector = within(screen.getByTestId("team-size-selector"));
    for (const team of ["A", "B"]) {
      for (const size of [1, 2, 3]) {
        expect(
          selector.getByRole("button", { name: `Team ${team}: ${size}` })
        ).toBeInTheDocument();
      }
    }
  });

  it("quotes the catalog price for every one of the nine shapes", async () => {
    await loadedPage();
    for (const a of [1, 2, 3]) {
      for (const b of [1, 2, 3]) {
        selectTeamShape(a, b);
        const expected = a + b - 1;
        expect(screen.getByTestId("team-shape-cost")).toHaveTextContent(
          `${a}v${b}`
        );
        expect(screen.getByTestId("cost-preview")).toHaveTextContent(
          `${expected} credit${expected === 1 ? "" : "s"}`
        );
      }
    }
  });

  it("keeps the third slots configurable and independent", async () => {
    await loadedPage();
    selectTeamShape(3, 3);

    // Phase 6B: one card open per team, so each slot is opened before it is
    // read or edited. A1's value is captured while A1 is the open card.
    openCombatant("A1");
    const before = (screen.getByLabelText("A1 champion") as HTMLSelectElement).value;
    openCombatant("A3");
    const a3 = screen.getByLabelText("A3 champion") as HTMLSelectElement;

    const other = REAL_CATALOG.champions.find((c) => c.name !== a3.value)!.name;
    act(() => {
      a3.value = other;
      a3.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect((screen.getByLabelText("A3 champion") as HTMLSelectElement).value).toBe(
      other
    );
    // A1 is untouched -- which is the point of the test, and is now also a
    // check that opening A3 did not disturb A1's stored configuration.
    openCombatant("A1");
    expect((screen.getByLabelText("A1 champion") as HTMLSelectElement).value).toBe(
      before
    );
  });

  it("restores A3/B3 configuration across a 3v3 -> 2v2 -> 3v3 round trip", async () => {
    await loadedPage();
    selectTeamShape(3, 3);

    const pick = REAL_CATALOG.champions[4].name;
    openCombatant("A3");
    const a3 = screen.getByLabelText("A3 champion") as HTMLSelectElement;
    act(() => {
      a3.value = pick;
      a3.dispatchEvent(new Event("change", { bubbles: true }));
    });

    selectTeamShape(2, 2);
    expect(screen.queryByTestId("combatant-A3")).not.toBeInTheDocument();

    selectTeamShape(3, 3);
    openCombatant("A3");
    expect(
      (screen.getByLabelText("A3 champion") as HTMLSelectElement).value
    ).toBe(pick);
  });
});

/* ─────────────────────────── submission ─────────────────────────── */

describe("3v3 submission", () => {
  it("sends exactly six combatants and no inactive slot", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_3V3)] });
    selectTeamShape(3, 3);
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

    expect(body.team_a.combatants.map((c) => c.runtime_id)).toEqual([
      "A1", "A2", "A3",
    ]);
    expect(body.team_b.combatants.map((c) => c.runtime_id)).toEqual([
      "B1", "B2", "B3",
    ]);
    expect(Object.keys(body.action_plans).sort()).toEqual([...SIX]);
    expect(Object.keys(body.targeting).sort()).toEqual([...SIX]);
  });

  it("still sends exactly ONE POST for one deliberate click", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_3V3)] });
    selectTeamShape(3, 3);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);
  });

  it("ignores repeated clicks while a 3v3 is in flight", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_3V3)] });
    selectTeamShape(3, 3);
    await act(async () => {
      const button = runButton();
      button.click();
      button.click();
      button.click();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);
  });

  it("sends exactly one idempotency key with the 3v3 POST", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_3V3)] });
    selectTeamShape(3, 3);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const headers = harness.postCalls[0]?.headers ?? {};
    const key = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === "idempotency-key"
    );
    expect(key?.[1]).toBeTruthy();
  });

  it("omits an inactive third slot from a 2v2 request built after a 3v3", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_3V3)] });
    selectTeamShape(3, 3);
    selectTeamShape(2, 2);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const serialized = JSON.stringify(harness.lastRequestBody());
    expect(serialized).not.toContain("A3");
    expect(serialized).not.toContain("B3");
  });
});

/* ─────────────────────────── the results ─────────────────────────── */

describe("3v3 results", () => {
  async function withResult() {
    const rendered = await loadedPage({ simulate: [ok(REAL_3V3)] });
    selectTeamShape(3, 3);
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    return rendered;
  }

  it("renders a summary card for each of the six combatants", async () => {
    await withResult();
    for (const id of SIX) {
      expect(
        screen.getByTestId(`combatant-summary-${id}`)
      ).toBeInTheDocument();
    }
  });

  it("shows each combatant's champion, alive/dead status and HP", async () => {
    await withResult();
    for (const id of SIX) {
      const card = within(screen.getByTestId(`combatant-summary-${id}`));
      const summary = REAL_3V3.combatant_summaries[id];
      expect(
        screen.getByTestId(`combatant-summary-${id}`)
      ).toHaveTextContent(summary.champion as string);
      expect(
        screen.getByTestId(`combatant-summary-${id}`)
      ).toHaveTextContent(summary.alive ? "alive" : "dead");
      expect(card.getByText("Final HP")).toBeInTheDocument();
      expect(card.getByText("Death time")).toBeInTheDocument();
      expect(card.getByText("Final target")).toBeInTheDocument();
    }
  });

  it("reports the winner and the eliminated team", async () => {
    await withResult();
    expect(screen.getByTestId("result-termination")).toHaveTextContent(
      REAL_3V3.termination.reason
    );
    // Team B lost every member, so its card carries the eliminated marker.
    expect(screen.getByTestId("result-panel")).toHaveTextContent(/eliminated/i);
    expect(screen.getByTestId("result-outcome")).toBeInTheDocument();
  });

  it("renders six effective builds", async () => {
    await withResult();
    const builds = screen.getByTestId("effective-builds");
    for (const id of SIX) {
      expect(builds).toHaveTextContent(id);
    }
  });

  it("renders the event trace without dropping attribution", async () => {
    await withResult();
    const trace = screen.getByTestId("event-trace");
    // The fixture's actors all appear somewhere in the rendered trace head.
    expect(trace).toHaveTextContent("A1");
    expect(trace).toHaveTextContent("B1");
  });

  it("never hard-codes four result positions", async () => {
    await withResult();
    const cards = screen
      .getAllByTestId(/^combatant-summary-/)
      .map((el) => el.getAttribute("data-testid"));
    expect(cards).toHaveLength(6);
  });
});

/* ────────────────────── recovery summaries ────────────────────── */

describe("3v3 server recovery summaries", () => {
  it("shows all six champion names without overflowing the card", async () => {
    const entry = recoverableEntry({
      team_shape: "3v3",
      champions: {
        a: ["Ashe", "Lux", "Jinx"],
        b: ["Garen", "Malphite", "Ornn"],
      },
      credits_charged: 5,
      status: "completed",
    });
    await loadedPage({ recoverable: () => ok(recoverableListing([entry])) });

    const row = await screen.findByTestId("server-recoverable-entry", {}, FIND);
    for (const champion of ["Ashe", "Lux", "Jinx", "Garen", "Malphite", "Ornn"]) {
      expect(row).toHaveTextContent(champion);
    }
    expect(row).toHaveTextContent("3v3");

    // Overflow safety is structural: the description is in a min-w-0 flex
    // child with break-words, so six names wrap instead of forcing the card
    // (and with it the page) wider than a 375px viewport.
    const description = row.querySelector("p");
    expect(description?.className).toContain("min-w-0");
    expect(description?.className).toContain("break-words");
  });

  it("reports the 3v3 credit cost on the recovery entry", async () => {
    const entry = recoverableEntry({
      team_shape: "3v3",
      champions: { a: ["Ashe", "Lux", "Jinx"], b: ["Garen", "Malphite", "Ornn"] },
      credits_charged: 5,
      status: "completed",
    });
    await loadedPage({ recoverable: () => ok(recoverableListing([entry])) });
    const row = await screen.findByTestId("server-recoverable-entry", {}, FIND);
    expect(row).toHaveTextContent("5");
  });
});

/* ────────────────────────── layout ────────────────────────── */

describe("3v3 layout", () => {
  it("keeps every column overflow-safe with three cards in it", async () => {
    // The layout grows VERTICALLY with team size — Team A's section stacks its
    // 1-3 cards, Team B's does the same, and the scenario controls sit between
    // them. Nothing is squeezed horizontally by a third combatant, which is
    // why no redesign was needed; `min-w-0` remains what stops a long build
    // name widening the page below the lg breakpoint.
    await loadedPage();
    selectTeamShape(3, 3);
    for (const label of ["Team A", "Team B", "Scenario controls"]) {
      expect(screen.getByLabelText(label).className).toContain("min-w-0");
    }
  });

  it("puts each team's three cards inside that team's own section", async () => {
    await loadedPage();
    selectTeamShape(3, 3);
    const teamA = within(screen.getByLabelText("Team A"));
    const teamB = within(screen.getByLabelText("Team B"));
    for (const id of ["A1", "A2", "A3"]) {
      expect(teamA.getByTestId(`combatant-${id}`)).toBeInTheDocument();
    }
    for (const id of ["B1", "B2", "B3"]) {
      expect(teamB.getByTestId(`combatant-${id}`)).toBeInTheDocument();
    }
    // No cross-contamination: Team A's section holds no B cards.
    expect(teamA.queryByTestId("combatant-B3")).not.toBeInTheDocument();
  });

  it("advertises the current cap in the page description", async () => {
    // Phase 6B: the page says 1v1-5v5 now. Derived from MAX_EDITOR_TEAM_SIZE so
    // the description and the editor's actual reach cannot drift apart again.
    await loadedPage();
    expect(
      screen.getByText(
        new RegExp(`1v1–${MAX_EDITOR_TEAM_SIZE}v${MAX_EDITOR_TEAM_SIZE}`)
      )
    ).toBeInTheDocument();
  });
});

/* ────────────────────── credits and blocking ────────────────────── */

describe("3v3 cost preview", () => {
  it("shows the 5-credit cost against the remaining balance", async () => {
    await loadedPage({ credits: ok(DEFAULT_CREDITS) });
    selectTeamShape(3, 3);
    await waitFor(() =>
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("5 credits")
    );
  });
});
