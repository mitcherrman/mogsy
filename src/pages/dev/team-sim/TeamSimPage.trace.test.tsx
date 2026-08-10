/**
 * SIM2 Phase 7A page behaviour: the trace-detail selector and the compacted
 * trace it produces.
 *
 * The rule this suite exists to enforce, above everything else:
 *
 *     CHANGING THE LEVEL MUST NEVER FETCH.
 *
 * The level is part of the request the backend digests and bills, so a page
 * that re-submitted when the selector moved would silently spend a credit on
 * every idle click. The selector therefore sits with the other settings for the
 * NEXT run, and the result on screen keeps the level it was fetched at until
 * the operator deliberately runs again.
 */
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REAL_CATALOG,
  REAL_CATALOG_PHASE7A,
  REAL_CATALOG_PHASE7A_ETAG,
  REAL_TRACE_LEVELS,
} from "@/lib/combat-lab/team-sim/__fixtures__";
import type {
  TeamSimulationRequest,
  TeamSimulationResponse,
  TraceDetail,
} from "@/lib/combat-lab/team-sim/contract";

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

const PHASE7A_CATALOG = {
  status: 200,
  body: REAL_CATALOG_PHASE7A,
  headers: { etag: REAL_CATALOG_PHASE7A_ETAG },
};

async function load(
  responses: TeamSimulationResponse[],
  catalog = PHASE7A_CATALOG
) {
  const rendered = renderTeamSimPage({
    catalog,
    simulate: responses.map((body) => ({ status: 200, body })),
  });
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

function selector() {
  return screen.getByLabelText(/^Trace detail/) as HTMLSelectElement;
}

function chooseLevel(level: TraceDetail) {
  fireEvent.change(selector(), { target: { value: level } });
}

async function run(harness: TeamSimHarness) {
  await act(async () => {
    screen.getByTestId("run-simulation").click();
  });
  await screen.findByTestId("result-panel", {}, FIND);
  return harness.lastRequestBody<TeamSimulationRequest>();
}

/* ─────────────────────────────── selector ─────────────────────────────── */

describe("the trace-detail selector", () => {
  it("offers exactly the catalog's levels and defaults to its default", async () => {
    await load([REAL_TRACE_LEVELS.standard]);
    const control = selector();
    expect(control.value).toBe("standard");
    expect(
      [...control.options].map((option) => option.value)
    ).toEqual(["summary", "standard", "full"]);
  });

  it("is not rendered at all against a pre-Phase-7A catalog", async () => {
    // No trace_options published means the backend does not accept the field.
    // Offering a choice there would produce a 422 on a paid submission.
    await load([REAL_TRACE_LEVELS.full], {
      status: 200,
      body: REAL_CATALOG,
      headers: { etag: "legacy" },
    });
    expect(screen.queryByLabelText(/^Trace detail/)).toBeNull();
  });

  it("explains that it applies to the NEXT run and costs a credit", async () => {
    await load([REAL_TRACE_LEVELS.standard]);
    const hint = screen.getByLabelText(/^Trace detail/).closest("div")
      ?.parentElement;
    expect(hint?.textContent).toMatch(/Applies to the next run/i);
    expect(hint?.textContent).toMatch(/costs a credit/i);
  });
});

/* ───────────────────────── the no-auto-fetch rule ───────────────────────── */

describe("changing the level never fetches", () => {
  it("makes no request when the selector moves, before any run", async () => {
    const { harness } = await load([REAL_TRACE_LEVELS.standard]);
    expect(harness.postCalls).toHaveLength(0);

    chooseLevel("full");
    chooseLevel("summary");
    chooseLevel("standard");

    expect(harness.postCalls).toHaveLength(0);
  });

  it("leaves an existing result untouched when the selector moves", async () => {
    const { harness } = await load([
      REAL_TRACE_LEVELS.standard,
      REAL_TRACE_LEVELS.full,
    ]);
    await run(harness);
    expect(harness.postCalls).toHaveLength(1);
    const before = screen.getByTestId("event-trace").textContent;

    chooseLevel("full");
    await act(async () => {});

    // No second POST, and the rendered trace still shows what was FETCHED —
    // not what the selector now says.
    expect(harness.postCalls).toHaveLength(1);
    expect(screen.getByTestId("event-trace").textContent).toBe(before);
    expect(screen.getByTestId("trace-detail-badge")).toHaveTextContent("Standard");
    // ...and the operator is TOLD the displayed result no longer matches the
    // editor. This falls out of the level living in the draft: the existing
    // staleness check deep-compares the draft, so it covers trace_detail with
    // no new mechanism — which is exactly why the level belongs there.
    expect(screen.getByTestId("stale-result-banner")).toBeTruthy();
  });

  it("sends the chosen level only when the operator runs again", async () => {
    const { harness } = await load([
      REAL_TRACE_LEVELS.standard,
      REAL_TRACE_LEVELS.full,
    ]);
    const first = await run(harness);
    expect(first.limits.trace_detail).toBe("standard");

    chooseLevel("full");
    const second = await run(harness);
    expect(harness.postCalls).toHaveLength(2);
    expect(second.limits.trace_detail).toBe("full");
  });

  it("uses a fresh idempotency key for the re-run at another level", async () => {
    const { harness } = await load([
      REAL_TRACE_LEVELS.standard,
      REAL_TRACE_LEVELS.full,
    ]);
    await run(harness);
    chooseLevel("full");
    await run(harness);

    const keys = harness.postCalls.map(
      (call) => call.headers["idempotency-key"] ?? call.headers["Idempotency-Key"]
    );
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBeTruthy();
    // Same key with a different level is a 409 by design; the page must never
    // ask for that.
    expect(keys[0]).not.toBe(keys[1]);
  });
});

/* ───────────────────────────── rendering ───────────────────────────── */

describe("rendering a trace at each level", () => {
  it("renders every level and labels which one it is", async () => {
    for (const level of ["summary", "standard", "full"] as TraceDetail[]) {
      const { harness, view } = await load([REAL_TRACE_LEVELS[level]]);
      await run(harness);
      const panel = within(screen.getByTestId("event-trace"));
      expect(screen.getByTestId("trace-detail-badge").textContent?.toLowerCase())
        .toContain(level);
      expect(panel.getAllByRole("row").length).toBeGreaterThan(1);
      view.unmount();
    }
  });

  it("states compaction as a separate fact from truncation", async () => {
    const { harness } = await load([REAL_TRACE_LEVELS.standard]);
    await run(harness);
    const counts = screen.getByTestId("trace-counts");
    expect(counts.textContent).toMatch(/compacted/i);
    expect(counts.textContent).toMatch(/folded into repeat rows/i);
    // A compacted-but-complete trace is NOT reported as truncated.
    expect(counts.textContent).not.toMatch(/Truncated/i);
    expect(counts.textContent).toMatch(/Summaries cover the full run/i);
  });

  it("says all events were returned at full", async () => {
    const { harness } = await load([REAL_TRACE_LEVELS.full]);
    await run(harness);
    const counts = screen.getByTestId("trace-counts").textContent ?? "";
    expect(counts).toMatch(/All \d+ simulated events returned/);
    expect(counts).not.toMatch(/compacted/i);
  });

  it("badges a grouped row with its repeat count", async () => {
    const { harness } = await load([REAL_TRACE_LEVELS.standard]);
    await run(harness);
    const badges = screen.getAllByTestId("trace-repeat-badge");
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0].textContent).toMatch(/^×\d+$/);
    // The row also says it in words, so the information is not colour-only.
    expect(screen.getByTestId("event-trace").textContent).toMatch(/through .*s \(#\d+–\d+\)/);
  });

  it("explains an empty kernel filter at summary instead of saying nothing happened", async () => {
    const { harness } = await load([REAL_TRACE_LEVELS.summary]);
    await run(harness);
    fireEvent.click(screen.getByRole("button", { name: "Kernel / combat" }));
    const panel = screen.getByTestId("event-trace");
    expect(panel.textContent).toMatch(/Summary detail level does not return kernel events/i);
    expect(panel.textContent).not.toMatch(/No events match this filter/i);
  });

  it("still shows deaths at every level", async () => {
    for (const level of ["summary", "standard", "full"] as TraceDetail[]) {
      const { harness, view } = await load([REAL_TRACE_LEVELS[level]]);
      await run(harness);
      // The casualty list comes from the summaries, so it must be identical.
      expect(screen.getByTestId("result-panel").textContent).toMatch(/died|B1/);
      expect(
        screen.getByTestId("event-trace").textContent
      ).toMatch(/died/);
      view.unmount();
    }
  });
});

/* ─────────────────────── large-trace rendering bound ─────────────────────── */

describe("large traces stay bounded", () => {
  /** N synthetic rows in the real event shape, with a failure near the end. */
  function withEvents(count: number): TeamSimulationResponse {
    const base = REAL_TRACE_LEVELS.full;
    const template = base.events.find((e) => e.source === "kernel") ?? base.events[0];
    const events = Array.from({ length: count }, (_, i) => ({
      ...template,
      seq: i + 1,
      time: i * 0.01,
      // One failure deep past the render cap: it must survive the bound.
      ...(i === count - 5
        ? {
            source: "scheduler",
            type: "action_failed",
            meta: { ok: false, error: "deep failure" },
          }
        : {}),
    }));
    return {
      ...base,
      events,
      trace: {
        ...base.trace,
        simulated_event_count: count,
        returned_event_count: count,
      },
    } as TeamSimulationResponse;
  }

  it.each([500, 1000, 2000])(
    "renders a %i-event trace without mounting every row",
    async (count) => {
      const { harness, view } = await load([withEvents(count)]);
      await run(harness);

      const rows = within(screen.getByTestId("event-trace")).getAllByRole("row");
      // Header + at most the render cap + the failures kept beyond it.
      expect(rows.length).toBeLessThan(450);
      expect(rows.length).toBeGreaterThan(1);
      // The bound is DECLARED, never silent.
      expect(screen.getByText(/Showing \d+ of \d+ matching rows/)).toBeTruthy();
      // ...and the failure past the cap is still on screen.
      expect(screen.getAllByTestId("trace-action-failed").length).toBe(1);
      view.unmount();
    }
  );

  it("renders everything on demand", async () => {
    const { harness } = await load([withEvents(1000)]);
    await run(harness);
    await act(async () => {
      screen.getByText(/Showing \d+ of \d+ matching rows/).click();
    });
    const rows = within(screen.getByTestId("event-trace")).getAllByRole("row");
    expect(rows.length).toBe(1001);
  });
});

/* ──────────────────────────── mobile ──────────────────────────── */

describe("mobile", () => {
  it("keeps the trace scrollable inside its own container", async () => {
    const { harness } = await load([REAL_TRACE_LEVELS.standard]);
    await run(harness);
    const table = screen.getByTestId("event-trace").querySelector("table");
    const scroller = table?.parentElement;
    // The table has a min-width, so the SCROLLER must own the overflow rather
    // than the page — otherwise a narrow viewport scrolls the whole document.
    expect(scroller?.className).toMatch(/overflow-auto/);
    expect(table?.className).toMatch(/min-w-/);
  });

  it("keeps the selector usable at a narrow width", async () => {
    await load([REAL_TRACE_LEVELS.standard]);
    const control = selector();
    expect(control.tagName).toBe("SELECT");
    expect(control).toBeVisible();
  });
});
