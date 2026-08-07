/**
 * Team-sim page behaviour, with the emphasis where the money is: one
 * deliberate click produces at most one billable POST, nothing retries, and
 * the UI never claims a charge outcome the response does not carry.
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  REAL_1V1,
  REAL_2V2,
  REAL_2V2_TRUNCATED,
  REAL_ACTION_FAILED,
  REAL_CATALOG,
  REAL_ERRORS,
} from "@/lib/combat-lab/team-sim/__fixtures__";

import { DEFAULT_CREDITS, renderTeamSimPage } from "./testHarness";

vi.mock("@/lib/backend-auth", () => ({
  getBackendAuthHeaders: async () => ({ Authorization: "Bearer test-token" }),
  ensureBackendAuthToken: async () => "test-token",
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ok = (body: unknown) => ({ status: 200, body });

/**
 * Four full combatant editors over a 172-champion / 197-item catalog is a
 * genuinely large tree to render in jsdom, and the catalog query retries once
 * by design, which costs a real second on the failure paths. Both are
 * properties of the production code, so the tests get headroom rather than
 * being weakened — and the headroom has to survive the whole suite running
 * these files in parallel with everything else.
 */
vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

const FIND = { timeout: 8_000 };

async function loadedPage(options = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

function runButton() {
  return screen.getByTestId("run-simulation");
}

/** Two clicks inside one act() — before React can disable the button. */
async function doubleClickRun() {
  const button = runButton();
  await act(async () => {
    button.click();
    button.click();
  });
}

describe("catalog states", () => {
  it("shows a loading state, then builds the editor from the catalog", async () => {
    renderTeamSimPage({ simulate: [ok(REAL_1V1)] });
    expect(screen.getByRole("status")).toHaveTextContent(/Loading the simulation catalog/i);

    await screen.findByTestId("run-panel");
    expect(screen.getByTestId("combatant-A1")).toBeInTheDocument();
    expect(screen.getByTestId("combatant-B1")).toBeInTheDocument();
    expect(screen.queryByTestId("combatant-A2")).not.toBeInTheDocument();
    expect(screen.getByTestId("catalog-digest")).toHaveTextContent(
      REAL_CATALOG.catalog_digest
    );
  });

  it("builds champion options from the catalog, not /api/meta", async () => {
    const { harness } = await loadedPage();
    const select = screen.getByLabelText("A1 champion") as HTMLSelectElement;
    expect(select.options.length).toBe(REAL_CATALOG.champions.length);
    for (const call of harness.calls) {
      expect(call.url).not.toContain("/api/meta/items");
      expect(call.url).not.toContain("/api/meta/runes");
      expect(call.url).not.toContain("/api/meta/champions");
    }
  });

  it("offers supported items and disables known-unsupported ones", async () => {
    await loadedPage();
    const picker = within(screen.getByTestId("items-A1"));
    fireEvent.change(picker.getByLabelText("Search Items"), {
      target: { value: "Infinity Edge" },
    });
    const supported = picker.getByRole("button", { name: /Infinity Edge/ });
    expect(supported).not.toBeDisabled();

    fireEvent.click(picker.getByLabelText(/Show known-but-unsupported/i));
    fireEvent.change(picker.getByLabelText("Search Items"), {
      target: { value: REAL_CATALOG.items.known_unsupported[0].name.slice(0, 20) },
    });
    const unsupportedRow = picker
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("no_simulator_stat_or_effect_rows"));
    expect(unsupportedRow).toBeDisabled();
  });

  it("truncates long catalog names instead of widening the card", async () => {
    // Some `known_unsupported` item names are CMS boilerplate hundreds of
    // characters long ("<rarityLegendary>…"). Verified in a real 375px
    // viewport: without min-w-0 the flex row's min-content width is the whole
    // string, and the combatant card overflowed the screen.
    await loadedPage();
    const picker = within(screen.getByTestId("items-B1"));
    fireEvent.click(picker.getByLabelText(/Show known-but-unsupported/i));
    fireEvent.change(picker.getByLabelText("Search Items"), {
      target: { value: "Daughter" },
    });
    const row = picker
      .getAllByRole("button")
      .find((b) => b.textContent?.includes("rarityLegendary"));
    expect(row).toBeDefined();
    const label = row!.querySelector("span");
    expect(label?.className).toContain("min-w-0");
    expect(label?.className).toContain("truncate");
    // Rendered as text, never as markup.
    expect(label?.querySelector("br")).toBeNull();
    expect(label?.textContent).toContain("<rarityLegendary>");
  });

  it("renders the four inert runes disabled with the backend's reason", async () => {
    await loadedPage();
    const picker = within(screen.getByTestId("runes-A1"));
    fireEvent.click(picker.getByLabelText(/Show known-but-unsupported/i));
    fireEvent.change(picker.getByLabelText("Search Runes"), {
      target: { value: "Phase Rush" },
    });
    const row = picker.getByRole("button", { name: /Phase Rush/ });
    expect(row).toBeDisabled();
    expect(row).toHaveTextContent("described_but_inert");
  });

  it("hides all controls when the catalog is unavailable", async () => {
    renderTeamSimPage({
      catalog: { status: 503, body: { code: "catalog_unavailable", message: "OperationalError" } },
    });
    const alert = await screen.findByRole("alert", {}, FIND);
    expect(alert).toHaveTextContent(/catalog is unavailable/i);
    expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
  });

  it("hides all controls when the catalog is malformed", async () => {
    renderTeamSimPage({
      catalog: { status: 200, body: { ...REAL_CATALOG, champions: [] } },
    });
    const alert = await screen.findByRole("alert", {}, FIND);
    expect(alert).toHaveTextContent(/malformed/i);
    expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
  });
});

describe("team composition and cost preview", () => {
  it("prices every shape from the catalog matrix", async () => {
    await loadedPage();
    const shapes = within(screen.getByTestId("team-size-selector"));
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("1 credit");

    fireEvent.click(shapes.getByRole("button", { name: /^1v2/ }));
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("2 credits");

    fireEvent.click(shapes.getByRole("button", { name: /^2v1/ }));
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("2 credits");

    fireEvent.click(shapes.getByRole("button", { name: /^2v2/ }));
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("3 credits");
    expect(screen.getByTestId("combatant-A2")).toBeInTheDocument();
    expect(screen.getByTestId("combatant-B2")).toBeInTheDocument();
  });

  it("shows the server's remaining balance next to the cost", async () => {
    await loadedPage();
    await waitFor(() =>
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("17 remaining")
    );
  });

  it("keeps a shrunk team's configuration and omits it from the request", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    const shapes = within(screen.getByTestId("team-size-selector"));
    fireEvent.click(shapes.getByRole("button", { name: /^2v2/ }));
    fireEvent.change(screen.getByLabelText("A2 champion"), { target: { value: "Ashe" } });

    fireEvent.click(shapes.getByRole("button", { name: /^1v1/ }));
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    const body = harness.lastRequestBody<{ team_a: { combatants: Array<{ runtime_id: string }> } }>();
    expect(body.team_a.combatants.map((c) => c.runtime_id)).toEqual(["A1"]);
    expect(JSON.stringify(body)).not.toContain("A2");

    // Restoring 2v2 brings A2's champion back unchanged.
    fireEvent.click(shapes.getByRole("button", { name: /^2v2/ }));
    expect((screen.getByLabelText("A2 champion") as HTMLSelectElement).value).toBe("Ashe");
  });
});

describe("submission safety", () => {
  it("one click sends exactly one POST", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel");
    expect(harness.postCalls).toHaveLength(1);
  });

  it("a double click cannot produce two POSTs", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    await doubleClickRun();
    await screen.findByTestId("result-panel");
    expect(harness.postCalls).toHaveLength(1);
  });

  it("disables the button while a request is pending and keeps the editor open", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_1V1, gate }],
    });

    await act(async () => {
      runButton().click();
    });
    expect(runButton()).toBeDisabled();
    expect(screen.getByTestId("combatant-A1")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/second request cannot be sent/i);

    // A click on the disabled control cannot reach the handler either.
    await act(async () => {
      runButton().click();
    });
    expect(harness.postCalls).toHaveLength(1);

    await act(async () => {
      release();
      await Promise.resolve();
    });
    await screen.findByTestId("result-panel", {}, FIND);
    expect(harness.postCalls).toHaveLength(1);
  });

  it("editing controls never submits", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    fireEvent.change(screen.getByLabelText("A1 champion"), { target: { value: "Ashe" } });
    fireEvent.change(screen.getByLabelText("A1 level"), { target: { value: "7" } });
    fireEvent.click(
      within(screen.getByTestId("team-size-selector")).getByRole("button", { name: /^2v2/ })
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(harness.postCalls).toHaveLength(0);
  });

  it("refreshing the catalog never submits", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    fireEvent.click(screen.getAllByRole("button", { name: /Refresh catalog/i })[0]);
    await waitFor(() => expect(harness.catalogCalls.length).toBeGreaterThan(1));
    expect(harness.postCalls).toHaveLength(0);
  });

  it("does not retry after a 500, despite a retrying mutation default", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: 500, body: REAL_ERRORS[500] }],
    });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("failure-notice");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(harness.postCalls).toHaveLength(1);
  });

  it("does not retry after a lost connection", async () => {
    const { harness } = await loadedPage({
      simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }],
    });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("failure-notice");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(harness.postCalls).toHaveLength(1);
  });

  it("a FAILED catalog refetch never unmounts the editor or drops a paid result", async () => {
    // react-query reports `isError` for a failed REFETCH while keeping good
    // data (verified against query-core 5.83). Treating that as fatal used to
    // swap in the "catalog unavailable" card, discard an already-charged
    // result, and hand back a fresh, re-armed submit button.
    let catalogHits = 0;
    const { harness } = await loadedPage({
      simulate: [ok(REAL_1V1)],
      catalog: undefined,
    });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel", {}, FIND);

    // Make every later catalog GET fail.
    const original = globalThis.fetch as typeof fetch;
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("/team-simulate/catalog/v1")) {
        catalogHits += 1;
        throw new TypeError("Failed to fetch");
      }
      return original(url as never, init as never);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /Refresh catalog/i })[0]);
    await waitFor(() => expect(catalogHits).toBeGreaterThan(0), { timeout: 8_000 });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
    });

    // Editor still there, result still there, no extra POST.
    expect(screen.getByTestId("run-panel")).toBeInTheDocument();
    expect(screen.getByTestId("result-panel")).toBeInTheDocument();
    expect(screen.getByTestId("catalog-refresh-error")).toHaveTextContent(/refresh failed/i);
    expect(harness.postCalls).toHaveLength(1);
  });

  it("cannot refresh the catalog while a run is in flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { harness } = await loadedPage({
      simulate: [{ status: 200, body: REAL_1V1, gate }],
    });
    const before = harness.catalogCalls.length;
    await act(async () => {
      runButton().click();
    });
    expect(screen.getAllByRole("button", { name: /Refresh catalog/i })[0]).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: /Refresh catalog/i })[0]);
    expect(harness.catalogCalls).toHaveLength(before);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await screen.findByTestId("result-panel", {}, FIND);
  });

  it("an explicit second click DOES create a second request", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel");
    await act(async () => {
      runButton().click();
    });
    await waitFor(() => expect(harness.postCalls).toHaveLength(2));
  });

  it("offers no cancel control (aborting would not stop the charge)", async () => {
    await loadedPage({ simulate: [ok(REAL_1V1)] });
    expect(screen.queryByRole("button", { name: /^cancel/i })).not.toBeInTheDocument();
  });

  it("blocks a repeating plan with no steps, which the backend rejects", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    fireEvent.click(
      within(screen.getByLabelText("Action plan for A1")).getByRole("button", {
        name: /Clear plan/i,
      })
    );
    expect(runButton()).toBeDisabled();
    expect(screen.getByTestId("draft-issues")).toHaveTextContent(/repeating plan needs/i);
    expect(harness.postCalls).toHaveLength(0);

    // Turning Repeat off makes the same empty plan legal.
    fireEvent.click(within(screen.getByTestId("combatant-A1")).getByLabelText(/Repeat plan/i));
    expect(runButton()).not.toBeDisabled();
  });

  it("blocks submission while the draft has an issue", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    const targeting = within(screen.getByLabelText("Targeting for A1"));
    fireEvent.change(targeting.getByLabelText("A1 targeting"), {
      target: { value: "fixed" },
    });
    expect(runButton()).toBeDisabled();
    expect(screen.getByTestId("draft-issues")).toHaveTextContent(/fixed targeting needs/i);
    expect(harness.postCalls).toHaveLength(0);
  });
});

describe("credits", () => {
  it("revalidates the balance from the server after a successful run", async () => {
    const { harness } = await loadedPage({ simulate: [ok(REAL_1V1)] });
    const before = harness.creditCalls.length;
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel");
    await waitFor(() => expect(harness.creditCalls.length).toBeGreaterThan(before));
  });

  it("never decrements the balance locally after a failure", async () => {
    await loadedPage({ simulate: [{ status: 500, body: REAL_ERRORS[500] }] });
    await waitFor(() =>
      expect(screen.getByTestId("cost-preview")).toHaveTextContent("17 remaining")
    );
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("failure-notice");
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("17 remaining");
    expect(DEFAULT_CREDITS.credits.credits_remaining).toBe(17);
  });

  it("renders a 402 with the server's own credit block", async () => {
    await loadedPage({ simulate: [{ status: 402, body: REAL_ERRORS[402] }] });
    await act(async () => {
      runButton().click();
    });
    const notice = await screen.findByTestId("failure-notice");
    expect(notice).toHaveTextContent(/Out of Combat Lab credits/i);
    expect(screen.getByTestId("failure-credits")).toHaveTextContent("999 used of 30");
    expect(screen.queryByTestId("uncertain-warning")).not.toBeInTheDocument();
  });
});

describe("error surfaces", () => {
  it.each([
    [401, REAL_ERRORS[401], /Sign-in required/i],
    [403, REAL_ERRORS[403], /Account required/i],
    [413, REAL_ERRORS[413], /Scenario too large/i],
    [422, REAL_ERRORS["422_item"], /Scenario rejected/i],
    [429, REAL_ERRORS[429], /Rate limited/i],
  ])("renders a real %i distinctly and calls it a rejection", async (status, body, title) => {
    await loadedPage({ simulate: [{ status: status as number, body }] });
    await act(async () => {
      runButton().click();
    });
    const notice = await screen.findByTestId("failure-notice");
    expect(notice).toHaveTextContent(title);
    expect(notice).toHaveTextContent(`HTTP ${status}`);
    expect(screen.getByTestId("rejected-note")).toBeInTheDocument();
    expect(screen.queryByTestId("uncertain-warning")).not.toBeInTheDocument();
  });

  it("warns that the outcome is UNCERTAIN on a network failure", async () => {
    await loadedPage({ simulate: [{ status: 0, throws: new TypeError("Failed to fetch") }] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("failure-notice");
    expect(screen.getByTestId("uncertain-warning")).toHaveTextContent(
      "The request status is uncertain. Do not retry automatically; retrying may use additional credits."
    );
    expect(screen.queryByTestId("rejected-note")).not.toBeInTheDocument();
  });

  it("treats a 500 as uncertain rather than asserting nothing was charged", async () => {
    await loadedPage({ simulate: [{ status: 500, body: REAL_ERRORS[500] }] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("failure-notice");
    expect(screen.getByTestId("uncertain-warning")).toBeInTheDocument();
  });

  it("shows the backend's stable code and hides the raw body behind a toggle", async () => {
    await loadedPage({ simulate: [{ status: 422, body: REAL_ERRORS["422_item"] }] });
    await act(async () => {
      runButton().click();
    });
    const notice = await screen.findByTestId("failure-notice");
    expect(notice).toHaveTextContent("unknown_item");
    expect(notice.querySelector("pre")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show operator detail/i }));
    expect(notice.querySelector("pre")).not.toBeNull();
  });
});

describe("results", () => {
  it("renders the outcome, termination, counts and combatant metrics", async () => {
    await loadedPage({ simulate: [ok(REAL_2V2)] });
    fireEvent.click(
      within(screen.getByTestId("team-size-selector")).getByRole("button", { name: /^2v2/ })
    );
    await act(async () => {
      runButton().click();
    });

    await screen.findByTestId("result-panel");
    expect(screen.getByTestId("result-outcome")).toHaveTextContent("Team A wins");
    expect(screen.getByTestId("result-termination")).toHaveTextContent("team_elimination");
    expect(screen.getByTestId("result-cost")).toHaveTextContent("3 credits");
    expect(screen.getByTestId("combatant-summary-B2")).toHaveTextContent("dead");
    expect(screen.getByTestId("combatant-summary-A1")).toHaveTextContent("alive");
    expect(screen.getByTestId("death-order")).toHaveTextContent("B2");
  });

  it("shows effective builds and a matching catalog digest", async () => {
    await loadedPage({ simulate: [ok(REAL_1V1)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("effective-builds", {}, FIND);
    const build = screen.getByTestId("effective-build-A1");
    // Reported straight from the response — the request set starting_hp, so
    // the engine says "explicit" rather than the champion's computed max HP.
    expect(build).toHaveTextContent("Infinity Edge (3031)");
    expect(build).toHaveTextContent("explicit");
    expect(build).toHaveTextContent("Q5 W5 E5 R3");
    expect(build).toHaveTextContent(REAL_CATALOG.catalog_digest);
    expect(screen.getByTestId("digest-match")).toBeInTheDocument();
    expect(screen.queryByTestId("digest-mismatch")).not.toBeInTheDocument();
  });

  it("warns on a digest mismatch, keeps the result, and does not re-run", async () => {
    const drifted = {
      ...REAL_1V1,
      effective_builds: {
        ...REAL_1V1.effective_builds,
        A1: {
          ...REAL_1V1.effective_builds.A1,
          data_version: { patch: null, catalog_digest: "different-digest" },
        },
      },
    };
    const { harness } = await loadedPage({ simulate: [ok(drifted)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("digest-mismatch");
    expect(screen.getByTestId("result-panel")).toBeInTheDocument();
    expect(screen.getByTestId("digest-mismatch")).toHaveTextContent("different-digest");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(harness.postCalls).toHaveLength(1);
  });

  it("renders the attributed trace and never hides action_failed", async () => {
    await loadedPage({ simulate: [ok(REAL_ACTION_FAILED)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("event-trace");
    expect(screen.getAllByTestId("trace-action-failed").length).toBeGreaterThan(0);

    // Still visible under an unrelated filter.
    fireEvent.click(screen.getByRole("button", { name: "Targeting" }));
    expect(screen.getAllByTestId("trace-action-failed").length).toBeGreaterThan(0);
    expect(screen.getByTestId("event-trace")).toHaveTextContent("Unsupported active_name");
  });

  it("makes truncation visible with both counts", async () => {
    await loadedPage({ simulate: [ok(REAL_2V2_TRUNCATED)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("event-trace");
    expect(screen.getByTestId("trace-counts")).toHaveTextContent("Truncated");
    expect(screen.getByTestId("trace-counts")).toHaveTextContent(
      `${REAL_2V2_TRUNCATED.trace.returned_event_count} of ${REAL_2V2_TRUNCATED.trace.simulated_event_count}`
    );
  });

  it("keeps the previous result while editing and marks it stale", async () => {
    await loadedPage({ simulate: [ok(REAL_1V1)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel");
    expect(screen.queryByTestId("stale-result-banner")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("A1 level"), { target: { value: "5" } });
    expect(screen.getByTestId("result-panel")).toBeInTheDocument();
    expect(screen.getByTestId("stale-result-banner")).toHaveTextContent(
      /previous configuration/i
    );
  });

  it("keeps the previous result when a later run fails", async () => {
    await loadedPage({
      simulate: [ok(REAL_1V1), { status: 500, body: REAL_ERRORS[500] }],
    });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel");
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("failure-notice");
    expect(screen.getByTestId("result-panel")).toBeInTheDocument();
  });

  it("clears the result only when the operator asks", async () => {
    await loadedPage({ simulate: [ok(REAL_1V1)] });
    await act(async () => {
      runButton().click();
    });
    await screen.findByTestId("result-panel");
    fireEvent.click(screen.getByRole("button", { name: /Clear result/i }));
    expect(screen.queryByTestId("result-panel")).not.toBeInTheDocument();
  });
});

describe("assumptions", () => {
  it("keeps the sequential-resolution limitation visible without expanding", async () => {
    await loadedPage();
    expect(screen.getByTestId("sequential-assumption")).toHaveTextContent(/sequentially/i);
    expect(screen.getByTestId("assumptions")).toHaveTextContent(/no combat AI/i);
    expect(screen.getByTestId("assumptions")).toHaveTextContent(/no client-retry idempotency/i);
  });

  it("lists the backend's unsupported mechanics when expanded", async () => {
    await loadedPage();
    fireEvent.click(screen.getByRole("button", { name: /Show full assumptions/i }));
    const panel = screen.getByTestId("assumptions");
    expect(panel).toHaveTextContent(/movement, positioning, or range checks/i);
    expect(panel).toHaveTextContent(/skillshot geometry/i);
  });
});

describe("editing aids", () => {
  it("undoes the last draft edit", async () => {
    await loadedPage();
    const select = screen.getByLabelText("A1 champion") as HTMLSelectElement;
    const original = select.value;
    fireEvent.change(select, { target: { value: "Ashe" } });
    expect((screen.getByLabelText("A1 champion") as HTMLSelectElement).value).toBe("Ashe");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect((screen.getByLabelText("A1 champion") as HTMLSelectElement).value).toBe(original)
    );
  });

  it("resets the whole scenario", async () => {
    await loadedPage();
    fireEvent.click(
      within(screen.getByTestId("team-size-selector")).getByRole("button", { name: /^2v2/ })
    );
    fireEvent.click(screen.getByRole("button", { name: /Reset scenario/i }));
    expect(screen.queryByTestId("combatant-A2")).not.toBeInTheDocument();
    expect(screen.getByTestId("cost-preview")).toHaveTextContent("1 credit");
  });
});
