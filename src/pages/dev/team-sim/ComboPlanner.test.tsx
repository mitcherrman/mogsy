/**
 * CS2 — Combo Planner behaviour, asserted through the real page.
 *
 * These are page tests rather than isolated component tests on purpose. The
 * planner's whole value is that it edits the EXISTING draft and submits
 * through the EXISTING request builder, so the assertions that matter are
 * about the wire: the palette can only offer catalog vocabulary, and the combo
 * the user clicks together is exactly what `action_plans` carries.
 */
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REAL_CATALOG_PHASE7A,
  REAL_CATALOG_PHASE7A_ETAG,
  REAL_1V1,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import { championActions, indexCatalog } from "@/lib/combat-lab/team-sim/catalog";
import type { TeamSimulationRequest } from "@/lib/combat-lab/team-sim/contract";

import { renderTeamSimPage, type TeamSimHarness } from "./testHarness";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
const FIND = { timeout: 8_000 };

/**
 * The captured Phase 7A catalog predates the `calculation` trace level (its
 * `allowed` is summary/standard/full), so it is extended HERE rather than
 * re-captured. Only the published vocabulary is widened — no combat data is
 * invented — and the un-widened fixture is used below to prove the planner
 * degrades instead of sending a level the deployment would reject.
 */
const CALC_CATALOG_BODY = {
  ...REAL_CATALOG_PHASE7A,
  trace_options: {
    ...REAL_CATALOG_PHASE7A.trace_options!,
    allowed: [
      ...REAL_CATALOG_PHASE7A.trace_options!.allowed,
      "calculation" as const,
    ],
  },
};

const CALC_CATALOG = {
  status: 200,
  body: CALC_CATALOG_BODY,
  headers: { etag: `${REAL_CATALOG_PHASE7A_ETAG}-calc` },
};

const PHASE7A_CATALOG = {
  status: 200,
  body: REAL_CATALOG_PHASE7A,
  headers: { etag: REAL_CATALOG_PHASE7A_ETAG },
};

async function load(catalog = CALC_CATALOG) {
  const rendered = renderTeamSimPage({
    catalog,
    simulate: [{ status: 200, body: REAL_1V1 }],
  });
  await screen.findByTestId("combo-planner", {}, FIND);
  return rendered;
}

function lane(id: string) {
  return screen.getByTestId(`combo-lane-${id}`);
}

function championOf(id: string): string {
  // The lane names the champion it is planning for; nothing is assumed about
  // which champion the draft happens to default a slot to.
  const label = lane(id).getAttribute("aria-label") ?? "";
  return /\(([^)]+)\)/.exec(label)?.[1] ?? "";
}

function sequence(id: string): string[] {
  const list = screen.queryByTestId(`combo-sequence-${id}`);
  if (!list) return [];
  return within(list)
    .getAllByRole("listitem")
    .map((li) => li.getAttribute("data-step-label") ?? "");
}

function add(id: string, key: string) {
  fireEvent.click(screen.getByTestId(`combo-add-${id}-${key}`));
}

async function runScenario() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("combo-planner-run"));
  });
}

describe("Combo Planner — action palette", () => {
  it("offers only vocabulary the catalog publishes for that champion", async () => {
    await load();
    const index = indexCatalog(CALC_CATALOG_BODY as never);
    const champion = championOf("A1");

    const palette = within(screen.getByTestId("combo-palette-A1")).getAllByRole(
      "button"
    );
    const offered = palette.map((b) => b.getAttribute("data-testid"));

    // Basic attack + every generic slot the catalog lists.
    expect(offered).toContain("combo-add-A1-basic_attack");
    for (const slot of index.genericSlots) {
      expect(offered).toContain(`combo-add-A1-slot:${slot}`);
    }
    // Every champion-specific active, and nothing beyond them.
    const actions = championActions(index, champion);
    for (const action of actions) {
      expect(offered).toContain(`combo-add-A1-action:${action.active_name}`);
    }
    expect(offered).toHaveLength(1 + index.genericSlots.length + actions.length);
  });

  it("cannot offer an action belonging to another champion", async () => {
    await load();
    const index = indexCatalog(CALC_CATALOG_BODY as never);
    const own = new Set(
      championActions(index, championOf("A1")).map((a) => a.active_name)
    );
    // Any modelled active from any OTHER champion in the roster. This is the
    // whole point of reading the catalog per champion rather than showing one
    // global action list.
    const foreign = CALC_CATALOG_BODY.champions
      .filter((c) => c.name !== championOf("A1"))
      .flatMap((c) => c.actions)
      .filter((a) => !own.has(a.active_name));
    expect(foreign.length).toBeGreaterThan(0);

    for (const action of foreign.slice(0, 25)) {
      expect(
        screen.queryByTestId(`combo-add-A1-action:${action.active_name}`)
      ).toBeNull();
    }
  });
});

describe("Combo Planner — editing", () => {
  it("adds, removes, reorders and clears a combo", async () => {
    await load();
    // The draft seeds one basic attack; clear so the sequence is authored here.
    fireEvent.click(within(lane("A1")).getByRole("button", { name: "Clear combo" }));
    expect(sequence("A1")).toEqual([]);
    expect(screen.getByTestId("combo-empty-A1")).toBeInTheDocument();

    add("A1", "slot:Q");
    add("A1", "basic_attack");
    add("A1", "slot:W");
    expect(sequence("A1")).toEqual(["Q", "Auto", "W"]);

    // Reorder: pull the W one position earlier.
    fireEvent.click(screen.getByLabelText("Move A1 action 3 earlier"));
    expect(sequence("A1")).toEqual(["Q", "W", "Auto"]);

    // Remove the middle entry.
    fireEvent.click(screen.getByLabelText("Remove A1 action 2"));
    expect(sequence("A1")).toEqual(["Q", "Auto"]);

    fireEvent.click(within(lane("A1")).getByRole("button", { name: "Clear combo" }));
    expect(sequence("A1")).toEqual([]);
  });

  it("disables reorder at the ends and the palette at the plan limit", async () => {
    await load();
    const index = indexCatalog(CALC_CATALOG_BODY as never);
    fireEvent.click(within(lane("A1")).getByRole("button", { name: "Clear combo" }));
    add("A1", "slot:Q");
    add("A1", "slot:W");

    expect(screen.getByLabelText("Move A1 action 1 earlier")).toBeDisabled();
    expect(screen.getByLabelText("Move A1 action 2 later")).toBeDisabled();

    for (let i = sequence("A1").length; i < index.maxPlanSteps; i += 1) {
      add("A1", "basic_attack");
    }
    expect(sequence("A1")).toHaveLength(index.maxPlanSteps);
    expect(screen.getByTestId("combo-add-A1-basic_attack")).toBeDisabled();
  });
});

describe("Combo Planner — run", () => {
  it("serializes both combos into the existing team-sim contract", async () => {
    const { harness } = await load();

    fireEvent.click(within(lane("A1")).getByRole("button", { name: "Clear combo" }));
    add("A1", "slot:Q");
    add("A1", "basic_attack");
    add("A1", "slot:R");

    fireEvent.click(within(lane("B1")).getByRole("button", { name: "Clear combo" }));
    add("B1", "slot:E");
    add("B1", "basic_attack");

    await runScenario();

    expect(harness.postCalls).toHaveLength(1);
    const body = harness.lastRequestBody<TeamSimulationRequest>();

    expect(body.action_plans.A1.steps).toEqual([
      { type: "active", slot: "Q", not_before: 0 },
      { type: "basic_attack", not_before: 0 },
      { type: "active", slot: "R", not_before: 0 },
    ]);
    expect(body.action_plans.B1.steps).toEqual([
      { type: "active", slot: "E", not_before: 0 },
      { type: "basic_attack", not_before: 0 },
    ]);
    // The planner adds no local ids and no timing of its own to the wire.
    for (const step of [...body.action_plans.A1.steps, ...body.action_plans.B1.steps]) {
      expect(step).not.toHaveProperty("id");
    }
  });

  it("sends a champion-specific active by its catalog active_name", async () => {
    const { harness } = await load();
    const index = indexCatalog(CALC_CATALOG_BODY as never);
    const action = championActions(index, championOf("A1"))[0];
    expect(action).toBeDefined();

    fireEvent.click(within(lane("A1")).getByRole("button", { name: "Clear combo" }));
    add("A1", `action:${action.active_name}`);
    await runScenario();

    expect(harness.lastRequestBody<TeamSimulationRequest>().action_plans.A1.steps).toEqual([
      { type: "active", active_name: action.active_name, not_before: 0 },
    ]);
  });

  it("requests trace_detail=calculation so the calculator has its evidence", async () => {
    const { harness } = await load();
    await runScenario();
    const body = harness.lastRequestBody<TeamSimulationRequest>();
    expect(body.limits.trace_detail).toBe("calculation");
  });

  it("falls back to the catalog's own level when calculation is not published", async () => {
    const { harness } = await load(PHASE7A_CATALOG);
    await runScenario();
    const body = harness.lastRequestBody<TeamSimulationRequest>();
    // Never a level this deployment would 422 on.
    expect(REAL_CATALOG_PHASE7A.trace_options!.allowed).toContain(
      body.limits.trace_detail
    );
    expect(body.limits.trace_detail).not.toBe("calculation");
  });

  it("one click on Run Scenario is at most one billable POST", async () => {
    const { harness } = await load();
    await runScenario();
    expect(harness.postCalls).toHaveLength(1);
    // The button re-arms only for a NEW deliberate click; nothing here resubmits.
    expect(harness.postCalls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("feeds the response into the existing playback and calculator", async () => {
    await load();
    await runScenario();
    await screen.findByTestId("result-workspace", {}, FIND);
    // The planner renders no timeline of its own — the existing component does.
    expect(screen.getByTestId("team-combat-playback")).toBeInTheDocument();
    expect(screen.getByTestId("combo-planner")).toBeInTheDocument();
  });
});

describe("Combo Planner — validation", () => {
  it("blocks the run and says why when the draft cannot be submitted", async () => {
    await load();
    // Empty plan + Repeat on is the one combination the backend rejects, and
    // the draft seeds Repeat on. Clearing A1 therefore blocks submission.
    fireEvent.click(within(lane("A1")).getByRole("button", { name: "Clear combo" }));

    const blocked = await screen.findByTestId("combo-planner-blocked", {}, FIND);
    expect(blocked).toHaveTextContent(/repeat/i);
    expect(screen.getByTestId("combo-planner-run")).toBeDisabled();
  });
});

describe("Combo Planner — one primary run action", () => {
  it("is the primary control; the editor's run is demoted, not duplicated", async () => {
    await load();
    // Both exist and both submit through the SAME path, so the difference has
    // to be legible: the planner's is primary, the editor's names the trace
    // level it is for and says which one the normal flow uses.
    expect(screen.getByTestId("combo-planner-run")).toHaveTextContent(
      "Run scenario"
    );
    const advanced = screen.getByTestId("run-simulation");
    expect(advanced).toHaveTextContent(/trace detail/i);
    expect(advanced).not.toHaveTextContent(/^Run simulation$/);
  });
});

describe("Combo Planner — repeat and failure semantics", () => {
  it("reports each combatant's repeat state and on_failure policy", async () => {
    await load();
    const mode = screen.getByTestId("combo-plan-mode-A1");
    // The seeded draft repeats and skips; both are READ from the draft.
    expect(mode).toHaveTextContent("Repeats");
    expect(mode).toHaveTextContent("on failure: skip");
  });

  it("explains that repeat + skip cycles past unavailable actions", async () => {
    await load();
    const note = screen.getByTestId("combo-planner-semantics");
    expect(note).toHaveTextContent(/skipped/i);
    expect(note).toHaveTextContent(/next cycle/i);
    // It must NOT claim the planner waits for cooldowns — nothing here models
    // readiness, and saying so would be the frontend inventing engine truth.
    expect(note.textContent ?? "").not.toMatch(/wait|cooldown timer|retry/i);
  });
});

