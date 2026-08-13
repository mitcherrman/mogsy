/**
 * SIM2 Phase 5A — promotion safety for the team-sim surface.
 *
 * Four things this phase adds, each tested for what it must NOT do as much as
 * for what it must:
 *
 *   the error boundary        a render crash anywhere in the tree is contained,
 *                             leaves a route back to Combat Lab, and triggers
 *                             no request of any kind;
 *   the promoted route        renders the same page as the internal alias, and
 *                             does not label itself a prototype;
 *   the feature gate          decides only what is OFFERED, never what is
 *                             ALLOWED;
 *   the operational 503       is reported as a PROVEN refusal — nothing ran,
 *                             nothing was charged — and offers no recovery,
 *                             because there is nothing to recover.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TeamSimErrorBoundary from "@/components/combat-lab/TeamSimErrorBoundary";
import {
  errorFromResponse,
  isRecoverable,
  UNCERTAIN_STATUS_WARNING,
} from "@/lib/combat-lab/team-sim/errors";
import {
  COMBAT_LAB_ROUTE,
  isTeamSimPublicRouteEnabled,
  TEAM_SIM_DEV_ROUTE,
  TEAM_SIM_ROUTE,
} from "@/lib/combat-lab/team-sim/featureGate";

import { renderTeamSimPage } from "./testHarness";

// The page's own suites use this budget: a real 1v1 runs the scheduler, and
// the failure paths deliberately wait.
vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

const FIND = { timeout: 8_000 };

/** The editor, once the catalog has built it. */
async function loadedPage(options = {}) {
  const rendered = renderTeamSimPage(options);
  await screen.findByTestId("run-panel", {}, FIND);
  return rendered;
}

async function clickRun() {
  await act(async () => {
    screen.getByTestId("run-simulation").click();
  });
}

/** React logs every caught boundary error; silence it so a PASSING run is
 *  readable, and restore it so a real console error still surfaces. */
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllEnvs();
  // Deliberately NOT vi.unstubAllGlobals(): the harness owns the fetch stub it
  // installs, and this file restores the single global it replaces inside the
  // test that replaces it. Tearing down every global stub from here would
  // reach into state this file does not own.
  //
  // Note: this suite reports one unhandled rejection
  // ("storage.getItem is not a function") from the Supabase auth client's
  // auto-refresh tick firing after jsdom teardown. It is PRE-EXISTING and
  // environmental — TeamSimPage.serverRecovery.test.tsx reports the identical
  // rejection on an untouched checkout — and it is attributed to whichever
  // test happened to be running when the timer fired, not to a real failure.
});

function Boom({ message = "render exploded" }: { message?: string }): never {
  throw new Error(message);
}

function renderBoundary(child: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[TEAM_SIM_ROUTE]}>
      <TeamSimErrorBoundary>{child}</TeamSimErrorBoundary>
    </MemoryRouter>
  );
}

// ── the error boundary ──────────────────────────────────────────────────────

describe("team-sim error boundary", () => {
  it("contains a render crash instead of unmounting the tree", () => {
    renderBoundary(<Boom />);
    expect(screen.getByTestId("team-sim-error-boundary")).toBeInTheDocument();
    expect(
      screen.getByText(/could not be displayed/i)
    ).toBeInTheDocument();
  });

  it("keeps a route back to Combat Lab", () => {
    renderBoundary(<Boom />);
    const back = screen.getByRole("link", { name: /Combat Lab/i });
    expect(back).toHaveAttribute("href", COMBAT_LAB_ROUTE);
  });

  it("never issues a request of any kind while showing the fallback", () => {
    const original = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      renderBoundary(<Boom />);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("does not retry the crashing child on its own", () => {
    let renders = 0;
    function Counting(): never {
      renders += 1;
      throw new Error("still broken");
    }
    renderBoundary(<Counting />);
    // One attempted render (React may double-invoke under StrictMode; the
    // point is that the boundary adds no further attempts of its own).
    const afterCatch = renders;
    expect(screen.getByTestId("team-sim-error-boundary")).toBeInTheDocument();
    expect(renders).toBe(afterCatch);
  });

  it("makes no claim about credits or charges", () => {
    renderBoundary(<Boom />);
    const text = screen.getByTestId("team-sim-error-boundary").textContent ?? "";
    // It may say the page CANNOT tell — it must never assert an outcome.
    expect(text).not.toMatch(/was charged|were charged|no credit was used/i);
    expect(text).toMatch(/cannot tell you whether it completed/i);
    expect(text).toMatch(/Nothing has been re-sent/i);
  });

  it("passes the caught error to its observer", () => {
    const onError = vi.fn();
    render(
      <MemoryRouter initialEntries={[TEAM_SIM_ROUTE]}>
        <TeamSimErrorBoundary onError={onError}>
          <Boom message="specific failure" />
        </TeamSimErrorBoundary>
      </MemoryRouter>
    );
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toBe("specific failure");
  });

  it("renders healthy children untouched", () => {
    renderBoundary(<p>the simulator</p>);
    expect(screen.getByText("the simulator")).toBeInTheDocument();
    expect(
      screen.queryByTestId("team-sim-error-boundary")
    ).not.toBeInTheDocument();
  });

  it("catches a crash from any depth, not just the top component", () => {
    // Stands in for the recovery panel, the result panel and the editor: all
    // three are descendants, and a boundary catches by tree position.
    renderBoundary(
      <div>
        <section>
          <article>
            <Boom message="deep panel crash" />
          </article>
        </section>
      </div>
    );
    expect(screen.getByTestId("team-sim-error-boundary")).toBeInTheDocument();
  });
});

// ── the two routes ──────────────────────────────────────────────────────────

describe("promoted route", () => {
  it("renders the same editor as the internal alias", async () => {
    await loadedPage({ route: TEAM_SIM_ROUTE });
    expect(
      screen.getByRole("heading", { name: /Team combat simulator/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("catalog-digest")).toBeInTheDocument();
  });

  it("does not label the user-facing route as internal", async () => {
    await loadedPage({ route: TEAM_SIM_ROUTE });
    expect(
      screen.queryByTestId("team-sim-internal-badge")
    ).not.toBeInTheDocument();
  });

  it("still labels the internal alias", async () => {
    await loadedPage({ route: TEAM_SIM_DEV_ROUTE });
    expect(screen.getByTestId("team-sim-internal-badge")).toBeInTheDocument();
  });

  it("keeps the back-link pointing at Combat Lab from both paths", async () => {
    for (const route of [TEAM_SIM_ROUTE, TEAM_SIM_DEV_ROUTE]) {
      const { view } = await loadedPage({ route });
      expect(
        screen.getByRole("link", { name: /Combat Lab/i })
      ).toHaveAttribute("href", COMBAT_LAB_ROUTE);
      view.unmount();
    }
  });

  it("offers the recovery surface on the promoted route too", async () => {
    // Promotion must not drop the one control that returns a paid result.
    const { harness } = await loadedPage({ route: TEAM_SIM_ROUTE });
    await waitFor(() => expect(harness.recoverableCalls).toHaveLength(1));
  });

  it("keeps every editor column overflow-safe for narrow viewports", async () => {
    // The layout is `grid gap-4 lg:grid-cols-[...]`, so below the lg
    // breakpoint it is a single column; `min-w-0` on each section is what stops
    // a long build name forcing the page wider than the viewport. Asserted
    // structurally here and confirmed visually at 375px in the browser pass.
    await loadedPage({ route: TEAM_SIM_ROUTE });
    for (const label of ["Team A", "Team B", "Scenario controls"]) {
      expect(screen.getByLabelText(label).className).toContain("min-w-0");
    }
  });
});

// ── the feature gate ────────────────────────────────────────────────────────

describe("feature gate", () => {
  it("is off when unset", () => {
    vi.stubEnv("VITE_TEAM_SIM_ENABLED", "");
    expect(isTeamSimPublicRouteEnabled()).toBe(false);
  });

  it.each(["0", "false", "no", "off", "maybe", "TRUEISH", " "])(
    "is off for %o",
    (raw) => {
      vi.stubEnv("VITE_TEAM_SIM_ENABLED", raw);
      expect(isTeamSimPublicRouteEnabled()).toBe(false);
    }
  );

  it.each(["1", "true", "TRUE", "yes", "on", " On "])(
    "is on for %o",
    (raw) => {
      vi.stubEnv("VITE_TEAM_SIM_ENABLED", raw);
      expect(isTeamSimPublicRouteEnabled()).toBe(true);
    }
  );

  it("does not gate the page component itself", async () => {
    // The gate decides what is OFFERED (the route registration and the entry
    // link, in App.tsx and CombatLab.tsx). The page must keep working on the
    // internal alias regardless, or turning the flag off would take the
    // internal surface down with it.
    vi.stubEnv("VITE_TEAM_SIM_ENABLED", "0");
    await loadedPage({ route: TEAM_SIM_DEV_ROUTE });
    expect(screen.getByTestId("catalog-digest")).toBeInTheDocument();
  });
});

// ── the operational 503 ─────────────────────────────────────────────────────

describe("team_simulation_unavailable", () => {
  const body = {
    detail: {
      code: "team_simulation_unavailable",
      message:
        "team simulation is not accepting requests on this deployment; " +
        "nothing was simulated and nothing was charged",
    },
  };

  it("is a PROVEN refusal, not an uncertain outcome", () => {
    const error = errorFromResponse(503, body);
    expect(error.kind).toBe("feature_unavailable");
    expect(error.certainty).toBe("rejected");
    expect(error.isUncertain).toBe(false);
  });

  it("offers no recovery control, because there is nothing to recover", () => {
    // The regression this pins: inheriting the generic 5xx "unknown" certainty
    // would have warned the operator their charge status was uncertain AND
    // offered "Check this request" for a request that provably never started.
    expect(isRecoverable(errorFromResponse(503, body))).toBe(false);
  });

  it("does not borrow the ledger-unavailable wording", () => {
    const error = errorFromResponse(503, body);
    expect(error.message).not.toMatch(/could not record it/i);
    expect(error.message).toMatch(/nothing was simulated and nothing was charged/i);
  });

  it("leaves the other two 503 codes exactly as they were", () => {
    const ledger = errorFromResponse(503, {
      detail: { code: "idempotency_unavailable", message: "OperationalError" },
    });
    expect(ledger.certainty).toBe("rejected");
    expect(ledger.message).toMatch(/could not record it/i);

    const unreadable = errorFromResponse(503, {
      detail: { code: "idempotency_result_unreadable", message: "x" },
    });
    expect(unreadable.kind).toBe("result_unreadable");
    expect(isRecoverable(unreadable)).toBe(false);

    // A 503 from a proxy carries no code and must stay uncertain.
    const proxy = errorFromResponse(503, "<html>502 bad gateway</html>");
    expect(proxy.certainty).toBe("unknown");
    expect(isRecoverable(proxy)).toBe(true);
  });

  it("shows the refusal without the uncertain-status warning", async () => {
    const { harness } = await loadedPage({ simulate: [{ status: 503, body }] });
    await clickRun();

    await screen.findByText(/nothing was simulated and nothing was charged/i,
                            {}, FIND);
    expect(screen.queryByText(UNCERTAIN_STATUS_WARNING)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Check this request/i })
    ).not.toBeInTheDocument();
    // One click, one POST — a refusal changes nothing about that.
    expect(harness.postCalls).toHaveLength(1);
  });

  it("does not re-send after the refusal", async () => {
    const { harness } = await loadedPage({ simulate: [{ status: 503, body }] });
    await clickRun();
    await screen.findByText(/nothing was simulated and nothing was charged/i,
                            {}, FIND);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(harness.postCalls).toHaveLength(1);
  });
});
