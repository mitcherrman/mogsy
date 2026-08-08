/**
 * Deterministic UI characterization for every supported team shape.
 *
 * Each case drives the real editor, captures the request the page actually
 * POSTs, and compares it against the REQUEST that produced the corresponding
 * captured backend response — so the editor is proven able to express the
 * exact scenario the engine ran, not merely something plausible.
 */
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REAL_1V1,
  REAL_1V2,
  REAL_2V1,
  REAL_2V2,
  REAL_REQUESTS,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import type { TeamSimulationRequest } from "@/lib/combat-lab/team-sim/contract";

import {
  openCombatant,
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

// Each case drives dozens of real edits through four heavy editors.
vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

const FIND = { timeout: 8_000 };

/* ───────────────────────── UI driving helpers ───────────────────────── */

/**
 * One combatant's card, OPENED.
 *
 * Phase 6B collapses cards and keeps one open per team, so a combatant's
 * controls are not mounted until it is opened. Every id-scoped helper below
 * goes through `openCombatant` for that reason. The signatures and the
 * resulting request bytes are unchanged — these are the PINNED 1v1–2v2
 * characterizations, and they must keep expressing the same intent.
 */
const card = (id: string) => {
  openCombatant(id);
  return within(screen.getByTestId(`combatant-${id}`));
};

function setShape(shape: string) {
  // Phase 6A: the control is two size rows rather than one button per shape,
  // so "2v2" is now two clicks. The signature is unchanged on purpose — these
  // are the PINNED 1v1–2v2 characterizations, and they must keep expressing
  // the same intent and producing the same expected request bytes.
  const [a, b] = shape.split("v").map(Number);
  selectTeamShape(a, b);
}

function setChampion(id: string, champion: string) {
  openCombatant(id);
  fireEvent.change(screen.getByLabelText(`${id} champion`), { target: { value: champion } });
}

function setLevel(id: string, level: number) {
  openCombatant(id);
  fireEvent.change(screen.getByLabelText(`${id} level`), { target: { value: String(level) } });
}

function setCritMode(id: string, mode: string) {
  fireEvent.change(card(id).getByLabelText("Crit mode"), { target: { value: mode } });
}

function setStartingHp(id: string, hp: number) {
  fireEvent.change(card(id).getByLabelText("Starting HP"), { target: { value: String(hp) } });
}

function setRank(id: string, slot: string, rank: number) {
  fireEvent.change(card(id).getByLabelText(new RegExp(`^${slot} \\(`)), {
    target: { value: String(rank) },
  });
}

function pick(kind: "items" | "runes", id: string, name: string) {
  openCombatant(id);
  const picker = within(screen.getByTestId(`${kind}-${id}`));
  fireEvent.change(picker.getByLabelText(kind === "items" ? "Search Items" : "Search Runes"), {
    target: { value: name },
  });
  fireEvent.click(picker.getByRole("button", { name: new RegExp(`^${escapeRe(name)}`) }));
}

function plan(id: string) {
  openCombatant(id);
  return within(screen.getByLabelText(`Action plan for ${id}`));
}

function addStep(id: string) {
  fireEvent.click(plan(id).getByRole("button", { name: "Add step" }));
}

function setStepAction(id: string, position: number, value: string) {
  openCombatant(id);
  fireEvent.change(screen.getByLabelText(`${id} step ${position} action`), {
    target: { value },
  });
}

function setStepNotBefore(id: string, position: number, seconds: number) {
  openCombatant(id);
  fireEvent.change(screen.getByLabelText(`${id} step ${position} not before (seconds)`), {
    target: { value: String(seconds) },
  });
}

function targeting(id: string) {
  openCombatant(id);
  return within(screen.getByLabelText(`Targeting for ${id}`));
}

function setTargeting(id: string, policy: string) {
  fireEvent.change(targeting(id).getByLabelText(`${id} targeting`), {
    target: { value: policy },
  });
}

function addPriority(id: string, target: string) {
  fireEvent.click(targeting(id).getByRole("button", { name: `+ ${target}` }));
}

function setLimits(maxDuration: number, maxEvents: number, maxTrace: number) {
  fireEvent.change(screen.getByLabelText(/^Max duration/), {
    target: { value: String(maxDuration) },
  });
  fireEvent.change(screen.getByLabelText(/^Max events/), {
    target: { value: String(maxEvents) },
  });
  fireEvent.change(screen.getByLabelText(/^Max trace events/), {
    target: { value: String(maxTrace) },
  });
}

async function run(harness: TeamSimHarness) {
  await act(async () => {
    screen.getByTestId("run-simulation").click();
  });
  await screen.findByTestId("result-panel", {}, FIND);
  return harness.lastRequestBody<TeamSimulationRequest>();
}

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The contract accepts a bare policy string OR an object; the captured
 * requests use the string form for simple policies while the adapter always
 * sends the object form (one code path, and `priority` is never present where
 * it would be illegal). Normalize before comparing.
 */
function normalizeTargeting(
  targetingMap: Record<string, unknown>
): Record<string, { policy: string; priority?: string[] }> {
  return Object.fromEntries(
    Object.entries(targetingMap).map(([id, value]) => [
      id,
      typeof value === "string"
        ? { policy: value }
        : (value as { policy: string; priority?: string[] }),
    ])
  );
}

async function load(response: unknown) {
  const rendered = renderTeamSimPage({ simulate: [{ status: 200, body: response }] });
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

/* ───────────────────────────── 1v1 ───────────────────────────── */

describe("characterization: 1v1", () => {
  it(
    "configures, submits and renders the captured 1v1 scenario",
    async () => {
      const { harness } = await load(REAL_1V1);
      const expected = REAL_REQUESTS["1v1"] as unknown as TeamSimulationRequest;

      setChampion("A1", "Ashe");
      setLevel("A1", 11);
      pick("items", "A1", "Infinity Edge");
      setStartingHp("A1", 900);
      setChampion("B1", "Garen");
      setLevel("B1", 11);
      setStartingHp("B1", 400);
      setLimits(30, 200, 200);

      expect(screen.getByTestId("cost-preview")).toHaveTextContent("1 credit");

      const body = await run(harness);
      expect(harness.postCalls).toHaveLength(1);
      expect(body.team_a.combatants).toMatchObject(expected.team_a.combatants);
      expect(body.team_b.combatants).toMatchObject(expected.team_b.combatants);
      // toMatchObject, not toEqual: the adapter states the backend's own
      // defaults explicitly (not_before: 0, on_failure: "skip") where the
      // captured request relied on them. Same scenario, fuller payload.
      expect(body.action_plans).toMatchObject(expected.action_plans);
      expect(body.action_plans.A1.on_failure).toBe("skip");
      expect(body.limits).toEqual(expected.limits);
      expect(Object.keys(body.targeting)).toEqual(["A1", "B1"]);

      expect(screen.getByTestId("result-outcome")).toHaveTextContent("Team A wins");
      expect(screen.getByTestId("effective-build-A1")).toHaveTextContent("Ashe");
      expect(screen.getByTestId("event-trace")).toBeInTheDocument();
    }
  );
});

/* ───────────────────────────── 1v2 ───────────────────────────── */

describe("characterization: 1v2", () => {
  it(
    "configures a solo attacker against two defenders",
    async () => {
      const { harness } = await load(REAL_1V2);
      const expected = REAL_REQUESTS["1v2"] as unknown as TeamSimulationRequest;

      setShape("1v2");
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("2 credits");

      setChampion("A1", "Darius");
      setLevel("A1", 14);
      pick("items", "A1", "Trinity Force");
      setStartingHp("A1", 2200);
      setTargeting("A1", "lowest_hp");

      setChampion("B1", "Lux");
      setLevel("B1", 11);
      setStartingHp("B1", 350);
      setChampion("B2", "Ashe");
      setLevel("B2", 11);
      setStartingHp("B2", 350);
      setLimits(40, 300, 300);

      const body = await run(harness);
      expect(harness.postCalls).toHaveLength(1);
      expect(body.team_a.combatants).toMatchObject(expected.team_a.combatants);
      expect(body.team_b.combatants).toMatchObject(expected.team_b.combatants);
      expect(body.targeting.A1).toEqual({ policy: "lowest_hp" });
      expect(Object.keys(body.action_plans).sort()).toEqual(["A1", "B1", "B2"]);

      expect(screen.getByTestId("combatant-summary-B2")).toBeInTheDocument();
      expect(screen.getByTestId("result-cost")).toHaveTextContent("2 credits");
    }
  );
});

/* ───────────────────────────── 2v1 ───────────────────────────── */

describe("characterization: 2v1", () => {
  it(
    "configures two attackers with a fixed-priority defender",
    async () => {
      const { harness } = await load(REAL_2V1);
      const expected = REAL_REQUESTS["2v1"] as unknown as TeamSimulationRequest;

      setShape("2v1");
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("2 credits");

      setChampion("A1", "Ashe");
      setLevel("A1", 11);
      setStartingHp("A1", 800);
      setChampion("A2", "Lux");
      setLevel("A2", 11);
      setStartingHp("A2", 800);
      // A2 casts Q then auto-attacks, on repeat.
      setStepAction("A2", 1, "slot:Q");
      addStep("A2");
      setChampion("B1", "Garen");
      setLevel("B1", 16);
      setStartingHp("B1", 700);
      setTargeting("B1", "fixed");
      addPriority("B1", "A2");
      addPriority("B1", "A1");
      setLimits(40, 300, 300);

      const body = await run(harness);
      expect(harness.postCalls).toHaveLength(1);
      expect(body.team_a.combatants).toMatchObject(expected.team_a.combatants);
      expect(body.action_plans.A2).toMatchObject(expected.action_plans.A2);
      expect(body.targeting.B1).toEqual({ policy: "fixed", priority: ["A2", "A1"] });

      expect(screen.getByTestId("result-outcome")).toHaveTextContent("Team A wins");
      expect(screen.getByTestId("death-order")).toHaveTextContent("B1");
    }
  );
});

/* ───────────────────────────── 2v2 ───────────────────────────── */

describe("characterization: 2v2 (required)", () => {
  it(
    "configures four independent combatants, submits once, and explains the fight",
    async () => {
      const { harness } = await load(REAL_2V2);
      const expected = REAL_REQUESTS["2v2"] as unknown as TeamSimulationRequest;

      setShape("2v2");

      // ── Team A: two independently configured champions, different builds.
      setChampion("A1", "Ashe");
      setLevel("A1", 13);
      pick("items", "A1", "Infinity Edge");
      pick("items", "A1", "Berserker's Greaves");
      pick("runes", "A1", "Press the Attack");
      setRank("A1", "W", 4);
      setRank("A1", "E", 3);
      setRank("A1", "R", 2);
      setCritMode("A1", "force");
      setStartingHp("A1", 1200);

      setChampion("A2", "Lux");
      setLevel("A2", 13);
      pick("items", "A2", "Luden's Companion");
      pick("runes", "A2", "Electrocute");
      setRank("A2", "W", 3);
      setRank("A2", "R", 2);
      setCritMode("A2", "none");
      setStartingHp("A2", 1000);

      // ── Team B.
      setChampion("B1", "Garen");
      setLevel("B1", 13);
      pick("items", "B1", "Sunfire Aegis");
      setStartingHp("B1", 600);

      setChampion("B2", "Soraka");
      setLevel("B2", 13);
      pick("items", "B2", "Rylai's Crystal Scepter");
      setCritMode("B2", "none");
      setStartingHp("B2", 450);

      // ── Explicit plans: A2 casts Q, attacks, then casts E from t=3s.
      setStepAction("A2", 1, "slot:Q");
      addStep("A2");
      addStep("A2");
      setStepAction("A2", 3, "slot:E");
      setStepNotBefore("A2", 3, 3);

      // ── Four different targeting choices, one per combatant.
      setTargeting("A1", "fixed");
      addPriority("A1", "B2");
      addPriority("A1", "B1");
      setTargeting("A2", "lowest_hp_pct");
      setTargeting("B2", "lowest_hp");
      setLimits(60, 500, 500);

      // ── Cost preview before submission.
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("3 credits");

      const body = await run(harness);

      // Exactly one billable POST for the whole session.
      expect(harness.postCalls).toHaveLength(1);

      // The editor expressed the captured scenario exactly.
      expect(body.team_a.combatants).toMatchObject(expected.team_a.combatants);
      expect(body.team_b.combatants).toMatchObject(expected.team_b.combatants);
      expect(body.action_plans).toMatchObject(expected.action_plans);
      expect(normalizeTargeting(body.targeting)).toEqual(
        normalizeTargeting(expected.targeting as unknown as Record<string, unknown>)
      );
      expect(body.limits).toEqual(expected.limits);

      // Independent builds really are independent.
      expect(body.team_a.combatants[0].items).toEqual([
        "Infinity Edge",
        "Berserker's Greaves",
      ]);
      expect(body.team_a.combatants[1].items).toEqual(["Luden's Companion"]);
      expect(body.team_a.combatants[0].crit_mode).toBe("force");
      expect(body.team_a.combatants[1].crit_mode).toBe("none");

      // ── Result: winner, termination, deaths, retargets, builds, trace.
      expect(screen.getByTestId("result-outcome")).toHaveTextContent("Team A wins");
      expect(screen.getByTestId("result-termination")).toHaveTextContent("team_elimination");
      expect(screen.getByTestId("result-cost")).toHaveTextContent("3 credits");

      const deaths = screen.getByTestId("death-order");
      expect(deaths).toHaveTextContent("B2 died (killed by A2)");
      expect(deaths).toHaveTextContent("B1 died (killed by A2)");
      expect(screen.getByTestId("combatant-summary-B2")).toHaveTextContent("dead");
      expect(screen.getByTestId("combatant-summary-A1")).toHaveTextContent("alive");

      for (const id of ["A1", "A2", "B1", "B2"]) {
        expect(screen.getByTestId(`effective-build-${id}`)).toBeInTheDocument();
      }
      expect(screen.getByTestId("effective-build-A1")).toHaveTextContent("Press the Attack");
      expect(screen.getByTestId("digest-match")).toBeInTheDocument();

      // Attributed trace, including a retarget after the first kill.
      fireEvent.click(screen.getByRole("button", { name: "Targeting" }));
      const trace = screen.getByTestId("event-trace");
      expect(trace).toHaveTextContent("target_changed");
      expect(trace).toHaveTextContent("retargeted B2 → B1");

      // Still one POST after inspecting the result.
      expect(harness.postCalls).toHaveLength(1);
    }
  );
});
